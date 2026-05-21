import type { DocumentBackend, DocumentSnapshot } from '@changedown/core/backend';
import { assertProtocolReviewCapability, assertProtocolReviewPostcondition, hasCurrentThreadActionPlan, isWordPublicationNotReady, requireProtocolSurface } from './word-protocol-surface.js';

export interface WordReviewOperation {
  kind: 'review';
  changeId: string;
  decision: 'approve' | 'reject' | 'request_changes' | 'withdraw';
  reason?: string;
  blocking?: boolean;
  label?: string;
}

export interface WordThreadResponseOperation {
  kind: 'respond';
  changeId: string;
  response: string;
  label?: string;
}

export interface PreparedWordReviewChanges {
  ok: true;
  operations: Array<WordReviewOperation | WordThreadResponseOperation>;
}

export interface WordReviewValidationError {
  ok: false;
  message: string;
}

const VALID_DECISIONS = new Set(['approve', 'reject', 'request_changes', 'withdraw']);

function parseMaybeJsonArray(value: unknown, name: string): unknown[] | WordReviewValidationError | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') {
    return { ok: false, message: `Word review_changes expected "${name}" to be an array.` };
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: `Word review_changes "${name}" JSON parsed to ${typeof parsed}, not an array.` };
    }
    return parsed;
  } catch {
    return { ok: false, message: `Word review_changes "${name}" was a string but not valid JSON.` };
  }
}

export function prepareWordReviewChanges(args: Record<string, unknown>): PreparedWordReviewChanges | WordReviewValidationError {
  const responses = parseMaybeJsonArray(args.responses, 'responses');
  if (responses && 'ok' in responses) return responses;
  if (responses && responses.length > 0) {
    const reviews = parseMaybeJsonArray(args.reviews, 'reviews');
    if (reviews && !('ok' in reviews) && reviews.length > 0) {
      return { ok: false, message: 'Word review_changes for word:// accepts either reviews or responses, not both.' };
    }
    if (responses.length !== 1) {
      return { ok: false, message: `Word review_changes response path supports exactly one response item, got ${responses.length}.` };
    }
    const item = responses[0];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: 'Word review_changes response item #0 must be an object.' };
    }
    const response = item as Record<string, unknown>;
    const changeId = typeof response.change_id === 'string' ? response.change_id : undefined;
    const text = typeof response.response === 'string' ? response.response : undefined;
    if (!changeId || !text) {
      return { ok: false, message: 'Word review_changes response item #0 requires change_id and response.' };
    }
    if (!/^cn-\d+$/u.test(changeId)) {
      return { ok: false, message: `Word review_changes accepts only final cn-* MCP change ids after pane settlement, got "${changeId}".` };
    }
    return {
      ok: true,
      operations: [{
        kind: 'respond',
        changeId,
        response: text,
        label: typeof response.label === 'string' ? response.label : undefined,
      }],
    };
  }
  if (args.settle === true || args.settle === 'true') {
    return { ok: false, message: 'Word review_changes does not support settle yet; approve/reject mutates native Word tracked changes directly.' };
  }

  const reviews = parseMaybeJsonArray(args.reviews, 'reviews');
  if (!reviews || ('ok' in reviews)) {
    return reviews && 'ok' in reviews ? reviews : { ok: false, message: 'Word review_changes requires exactly one review item.' };
  }
  if (reviews.length !== 1) {
    return { ok: false, message: `Word review_changes basic path supports exactly one review item, got ${reviews.length}.` };
  }

  const operations: WordReviewOperation[] = [];
  for (let idx = 0; idx < reviews.length; idx++) {
    const item = reviews[idx];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: `Word review_changes review item #${idx} must be an object.` };
    }
    const review = item as Record<string, unknown>;
    const changeId = typeof review.change_id === 'string' ? review.change_id : undefined;
    const decision = typeof review.decision === 'string' ? review.decision : undefined;
    const reason = typeof review.reason === 'string' ? review.reason : undefined;
    if (!changeId || !decision || !reason) {
      return { ok: false, message: `Word review_changes review item #${idx} requires change_id, decision, and reason.` };
    }
    if (!/^cn-\d+$/u.test(changeId)) {
      return { ok: false, message: `Word review_changes accepts only final cn-* MCP change ids after pane settlement, got "${changeId}".` };
    }
    if (!VALID_DECISIONS.has(decision)) {
      return { ok: false, message: `Word review_changes review item #${idx} has invalid decision "${decision}".` };
    }
    if (decision !== 'approve' && decision !== 'reject') {
      return { ok: false, message: `Word review_changes basic path supports approve/reject only, got "${decision}".` };
    }
    operations.push({
      kind: 'review',
      changeId,
      decision: decision as WordReviewOperation['decision'],
      reason,
      blocking: review.blocking === true ? true : undefined,
      label: typeof review.label === 'string' ? review.label : undefined,
    });
  }

  return { ok: true, operations };
}

export async function applyWordReviewChanges(args: Record<string, unknown>, backend: DocumentBackend, uri: string): Promise<Record<string, unknown>> {
  const prepared = prepareWordReviewChanges(args);
  if (!prepared.ok) throw new Error(prepared.message);

  const author = typeof args.author === 'string' ? args.author : undefined;
  const results: Array<{ change_id: string; decision: string; status_updated: boolean; reason?: string }> = [];

  const snapshot = await backend.read({ uri });
  let latestSnapshot = snapshot;

  for (const op of prepared.operations) {
    if (op.kind === 'respond') {
      assertWordThreadCapability(latestSnapshot, op.changeId, 'respond');
      const result = await backend.applyChange({ uri }, {
        kind: 'respond',
        args: {
          cnId: op.changeId,
          text: op.response,
          author,
          label: op.label,
        },
      });
      if (result.applied === false) {
        throw new Error(sanitizeReviewError(result.text ?? `Word review_changes did not apply response for ${op.changeId}`, op.changeId));
      }
      results.push({
        change_id: op.changeId,
        decision: 'respond',
        status_updated: false,
      });
      continue;
    }
    assertWordReviewCapability(latestSnapshot, op.changeId);
    if (op.decision !== 'approve' && op.decision !== 'reject') {
      throw new Error(`WordReviewCapabilityUnavailable: ${op.changeId} supports approve/reject only, got ${op.decision}`);
    }
    const reviewDecision = op.decision;
    let result;
    try {
      result = await backend.applyChange({ uri }, {
        kind: 'review',
        args: {
          cnId: op.changeId,
          decision: reviewDecision,
          reason: op.reason,
          author,
          blocking: op.blocking,
          label: op.label,
        },
      });
    } catch (err) {
      throw new Error(sanitizeReviewError(err instanceof Error ? err.message : String(err), op.changeId));
    }
    if (result.applied === false) {
      throw new Error(sanitizeReviewError(result.text ?? `Word review_changes did not apply ${op.changeId}`, op.changeId));
    }
    const postSnapshot = await backend.read({ uri });
    assertProtocolReviewPostcondition(postSnapshot, op.changeId, reviewDecision);
    latestSnapshot = postSnapshot;
    results.push({
      change_id: op.changeId,
      decision: reviewDecision,
      status_updated: true,
    });
  }

  const remaining = requireProtocolSurface(latestSnapshot).entries.filter((entry) => entry.status.toLowerCase() === 'proposed').length;
  return {
    file: uri,
    results,
    document_state: {
      remaining_proposed: remaining,
      all_resolved: remaining === 0,
    },
    ...(remaining === 0 ? { note: 'All changes in this Word session are now resolved. No proposed changes remain.' } : {}),
  };
}

export function assertWordReviewCapability(snapshot: DocumentSnapshot | undefined, changeId: string): void {
  if (isWordPublicationNotReady(snapshot)) {
    throw new Error('WordReviewCapabilityUnavailable: Word universe is not ready');
  }
  assertProtocolReviewCapability(snapshot, changeId);
}

function sanitizeReviewError(message: string, publicChangeId: string): string {
  return message.includes(publicChangeId) ? message : `${message} (${publicChangeId})`;
}

export function assertWordThreadCapability(
  snapshot: DocumentSnapshot | undefined,
  changeId: string,
  action: string,
): void {
  if (isWordPublicationNotReady(snapshot)) {
    throw new Error('WordThreadCapabilityUnavailable: Word universe is not ready');
  }
  if (!snapshot) {
    throw new Error(`WordThreadCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  if (!snapshot.protocolSurface) {
    throw new Error(`WordThreadCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  const surface = requireProtocolSurface(snapshot);
  const entry = surface.entries.find((candidate) => candidate.id === changeId);
  if (!entry) {
    throw new Error(`WordThreadCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  const threadLike = entry.kind === 'comment' || entry.kind === 'thread' || entry.representation === 'comment-thread';
  if (!threadLike || entry.actionability.state !== 'thread-ready') {
    throw new Error(
      `WordThreadCapabilityUnavailable: ${changeId} lacks protocol thread actionability for ${action}; state=${entry.actionability.state}${entry.actionability.reason ? ` reason=${entry.actionability.reason}` : ''}`,
    );
  }
  if (!hasCurrentThreadActionPlan(snapshot, changeId)) {
    throw new Error(`WordThreadCapabilityUnavailable: ${changeId} has thread-ready label but no current dereferenceable thread action plan`);
  }
}

export function assertWordSourceMutationCapability(
  snapshot: DocumentSnapshot | undefined,
  changeId: string,
  operationName: string,
): void {
  if (!snapshot) {
    throw new Error(`WordWriteCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  if (!snapshot.protocolSurface) {
    throw new Error(`WordWriteCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  const surface = requireProtocolSurface(snapshot);
  const entry = surface.entries.find((candidate) => candidate.id === changeId);
  if (!entry) {
    throw new Error(`WordWriteCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  throw new Error(
    `WordWriteCapabilityUnavailable: ${changeId} cannot use ${operationName} because the Word protocol surface has no public source-mutation action class; state=${entry.actionability.state}${entry.actionability.reason ? ` reason=${entry.actionability.reason}` : ''}`,
  );
}
