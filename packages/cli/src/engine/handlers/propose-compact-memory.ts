import {
  initHashline,
  parseOp,
  ChangeStatus,
  ChangeType,
  parseForFormat,
  computeSupersedeResult,
  computeReplyEdit,
  type ParsedOp,
  type ChangeNode,
} from '@changedown/core';
import type { ChangeDownConfig } from '../config.js';
import type { SessionState } from '../state.js';
import { resolveAuthor } from '../author.js';
import { resolveAndApply, resolveCoordinates, type ApplyResult, type NormalizedCompactOp } from './resolve-and-apply.js';
import { computeAffectedLines, type AffectedLineEntry } from './propose-utils.js';

export interface ProposeChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface PrepareCompactProposeInput {
  args: Record<string, unknown>;
  filePath: string;
  relativePath: string;
  fileContent: string;
  config: ChangeDownConfig;
  state: SessionState;
}

export interface PreparedCompactPropose {
  ok: true;
  changeId: string;
  author: string;
  reasoning?: string;
  oldL2: string;
  newL2: string;
  responseData: Record<string, unknown>;
  toolResult: ProposeChangeResult;
  normalizedOp: NormalizedCompactOp;
  applyResult: ApplyResult;
  threadReply?: {
    changeId: string;
    text: string;
    author: string;
  };
}

export type PrepareCompactProposeResult =
  | PreparedCompactPropose
  | { ok: false; toolResult: ProposeChangeResult };

function fail(message: string, code = 'VALIDATION_ERROR', details?: Record<string, unknown>): PrepareCompactProposeResult {
  const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: message }];
  content.push({ type: 'text', text: JSON.stringify({ error: { message, code, ...(details ?? {}) } }) });
  return { ok: false, toolResult: { content, isError: true } };
}

function checkReasoningRequired(
  reasoning: string | undefined,
  config: ChangeDownConfig,
): ProposeChangeResult | null {
  if (config.protocol.reasoning !== 'required') return null;
  if (reasoning) return null;
  return {
    content: [{
      type: 'text',
      text: 'This project requires reasoning on proposals. Append {>>reason to your op string, or include a reason parameter in your propose_change call.',
    }],
    isError: true,
  };
}

function documentState(modifiedText: string): Record<string, unknown> {
  const footnoteCount = (modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
  const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
  const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
  const authorMatches = modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
  const uniqueAuthors = new Set(
    authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean),
  );
  return {
    total_changes: footnoteCount,
    proposed: proposedCount,
    accepted: acceptedCount,
    authors: uniqueAuthors.size,
  };
}

function effectiveStatus(change: ChangeNode): ChangeStatus | string {
  return change.metadata?.status ?? change.inlineMetadata?.status ?? change.status;
}

function authorMatches(a: string | undefined, b: string): boolean {
  if (!a) return false;
  return a.replace(/^@/, '') === b.replace(/^@/, '');
}

function replaceUnique(haystack: string, needle: string, replacement: string): string | undefined {
  if (needle === '') return undefined;
  const first = haystack.indexOf(needle);
  if (first < 0) return undefined;
  if (haystack.indexOf(needle, first + needle.length) !== -1) return undefined;
  return haystack.slice(0, first) + replacement + haystack.slice(first + needle.length);
}

function isBlockInsertion(text: string): boolean {
  const firstLine = text.trimStart().split(/\r?\n/, 1)[0] ?? '';
  return /^(?:\|.*\||#{1,6}\s|[-*+]\s|\d+\.\s|```|~~~|>)/.test(firstLine);
}

function separatorBeforeInsertedPayload(previous: string, inserted: string): string {
  if (previous === '' || previous.endsWith('\n')) return '';
  return isBlockInsertion(inserted) ? '\n\n' : '\n';
}

function revisedInsertionPayloadAfterLine(input: {
  fileContent: string;
  containing: ChangeNode;
  resolvedEndOffset: number;
  insertedText: string;
}): string | undefined {
  const payload = input.containing.modifiedText ?? '';
  const contentStart = input.containing.contentRange.start;
  const contentEnd = input.containing.contentRange.end;
  const payloadOffset = Math.min(Math.max(input.resolvedEndOffset, contentStart), contentEnd) - contentStart;
  if (payloadOffset < 0 || payloadOffset > payload.length) return undefined;

  const before = payload.slice(0, payloadOffset);
  const after = payload.slice(payloadOffset);
  const separator = separatorBeforeInsertedPayload(before, input.insertedText);
  return `${before}${separator}${input.insertedText}${after}`;
}

async function trySupersedeContainingInsertion(input: {
  fileContent: string;
  op: NormalizedCompactOp;
  changeId: string;
  author: string;
  state?: SessionState;
  filePath?: string;
  config?: ChangeDownConfig;
}): Promise<ApplyResult | undefined> {
  if (input.op.type === 'ins') {
    if (!input.state || !input.filePath || !input.config) return undefined;

    const fileLines = input.fileContent.split('\n');
    let resolved;
    try {
      resolved = resolveCoordinates(
        input.op,
        input.fileContent,
        fileLines,
        input.state,
        input.filePath,
        input.config,
      );
    } catch {
      return undefined;
    }

    const doc = parseForFormat(input.fileContent, { skipCodeBlocks: false });
    const containing = doc.getChanges().find((change) => {
      if (change.type !== ChangeType.Insertion) return false;
      if (effectiveStatus(change) !== ChangeStatus.Proposed && effectiveStatus(change) !== 'proposed') return false;
      if (!authorMatches(change.metadata?.author ?? change.inlineMetadata?.author, input.author)) return false;
      return change.range.start <= resolved.endOffset && change.range.end >= resolved.startOffset;
    });
    if (!containing) return undefined;

    const revised = revisedInsertionPayloadAfterLine({
      fileContent: input.fileContent,
      containing,
      resolvedEndOffset: resolved.endOffset,
      insertedText: input.op.newText,
    });
    if (revised === undefined) return undefined;

    const supersede = await computeSupersedeResult(input.fileContent, containing.id, {
      newText: revised,
      reason: input.op.reasoning ?? `Append to ${containing.id} instead of nesting inside it`,
      author: input.author,
    });
    if (supersede.isError) return undefined;

    return {
      modifiedText: supersede.text,
      changeType: 'ins',
      supersededIds: [containing.id],
      affectedStartLine: resolved.rawStartLine,
      affectedEndLine: resolved.rawEndLine,
      relocations: resolved.relocations,
      remaps: resolved.remaps,
      viewResolved: resolved.viewResolved,
      settled: false,
    };
  }

  if (input.op.type !== 'sub' && input.op.type !== 'del') return undefined;

  const doc = parseForFormat(input.fileContent, { skipCodeBlocks: false });
  const containing = doc.getChanges().find((change) => {
    if (change.type !== ChangeType.Insertion) return false;
    if (effectiveStatus(change) !== ChangeStatus.Proposed && effectiveStatus(change) !== 'proposed') return false;
    if (!authorMatches(change.metadata?.author ?? change.inlineMetadata?.author, input.author)) return false;
    const payload = change.modifiedText ?? '';
    return payload.includes(input.op.oldText);
  });
  if (!containing) return undefined;

  const previous = containing.modifiedText ?? '';
  const revised =
    input.op.type === 'sub'
      ? replaceUnique(previous, input.op.oldText, input.op.newText)
      : replaceUnique(previous, input.op.oldText, '');
  if (revised === undefined) return undefined;

  const supersede = await computeSupersedeResult(input.fileContent, containing.id, {
    newText: revised,
    reason: input.op.reasoning ?? `Revise ${containing.id} instead of nesting inside it`,
    author: input.author,
  });
  if (supersede.isError) return undefined;

  return {
    modifiedText: supersede.text,
    changeType: 'ins',
    supersededIds: [containing.id],
    affectedStartLine: 1,
    affectedEndLine: input.fileContent.split('\n').length,
    relocations: [],
    remaps: [],
    settled: false,
  };
}

async function tryCommentOnContainingInsertion(input: {
  fileContent: string;
  op: NormalizedCompactOp;
  author: string;
  state: SessionState;
  filePath: string;
  config: ChangeDownConfig;
}): Promise<{ applyResult: ApplyResult; targetChangeId: string; text: string } | undefined> {
  if (input.op.type !== 'comment') return undefined;
  const text = input.op.reasoning?.trim();
  if (!text) return undefined;

  const fileLines = input.fileContent.split('\n');
  let resolved;
  try {
    resolved = resolveCoordinates(
      input.op,
      input.fileContent,
      fileLines,
      input.state,
      input.filePath,
      input.config,
    );
  } catch {
    return undefined;
  }

  const doc = parseForFormat(input.fileContent, { skipCodeBlocks: false });
  const containing = doc.getChanges().find((change) => {
    if (change.type !== ChangeType.Insertion) return false;
    if (effectiveStatus(change) !== ChangeStatus.Proposed && effectiveStatus(change) !== 'proposed') return false;
    return change.range.start <= resolved.endOffset && change.range.end >= resolved.startOffset;
  });
  if (!containing) return undefined;

  const reply = computeReplyEdit(input.fileContent, containing.id, {
    text,
    author: input.author,
  });
  if (reply.isError) return undefined;

  return {
    targetChangeId: containing.id,
    text,
    applyResult: {
      modifiedText: reply.text,
      changeType: 'comment',
      supersededIds: [],
      affectedStartLine: resolved.rawStartLine,
      affectedEndLine: resolved.rawEndLine,
      relocations: resolved.relocations,
      remaps: resolved.remaps,
      viewResolved: resolved.viewResolved,
      settled: false,
    },
  };
}

/**
 * Run the compact propose pipeline against an in-memory ChangeDown L2 document.
 * This is the diskless equivalent of handleCompactProposeChange(): it resolves
 * the agent's normal `{at, op}` against `fileContent` and returns the complete
 * next L2 document. It deliberately knows nothing about Word or any remote
 * backend's native application strategy.
 */
export async function prepareCompactProposeChange(
  input: PrepareCompactProposeInput,
): Promise<PrepareCompactProposeResult> {
  const { args, filePath, relativePath, fileContent, config, state } = input;

  if (args.start_line || args.end_line || args.after_line) {
    return fail('Use at parameter for line addressing. start_line/end_line/after_line are not supported in compact mode.', 'DEPRECATED_PARAMS');
  }

  const at = args.at as string | undefined;
  const opText = args.op as string | undefined;
  if (!at || !opText) {
    return fail('Compact mode requires both "at" and "op" parameters.', 'MISSING_ARGUMENT');
  }

  let parsed: ParsedOp;
  try {
    parsed = parseOp(opText);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  await initHashline();

  const { author, error: authorError } = resolveAuthor(args.author as string | undefined, config, 'propose_change');
  if (authorError || !author) {
    return fail(authorError?.message ?? 'Author resolution failed', 'AUTHOR_RESOLUTION_FAILED');
  }

  const reasoning = parsed.reasoning ?? (args.reason as string | undefined);
  const reasoningError = checkReasoningRequired(reasoning, config);
  if (reasoningError) return { ok: false, toolResult: reasoningError };

  const compactOp: NormalizedCompactOp = {
    at,
    type: parsed.type,
    oldText: parsed.oldText,
    newText: parsed.newText,
    reasoning,
  };

  const threadComment = await tryCommentOnContainingInsertion({
    fileContent,
    op: compactOp,
    author,
    state,
    filePath,
    config,
  });
  if (threadComment) {
    const responseData: Record<string, unknown> = {
      change_id: threadComment.targetChangeId,
      file: relativePath,
      type: 'comment',
      comment_added: true,
      threaded_on: threadComment.targetChangeId,
      document_state: documentState(threadComment.applyResult.modifiedText),
    };
    const ds = responseData.document_state as { total_changes: number; proposed: number; accepted: number; authors: number };
    responseData.state_summary = `📋 ${ds.total_changes} tracked change(s) | ${ds.proposed} proposed, ${ds.accepted} accepted | ${ds.authors} author(s)`;

    return {
      ok: true,
      changeId: threadComment.targetChangeId,
      author,
      reasoning,
      oldL2: fileContent,
      newL2: threadComment.applyResult.modifiedText,
      responseData,
      toolResult: { content: [{ type: 'text', text: JSON.stringify(responseData) }] },
      normalizedOp: compactOp,
      applyResult: threadComment.applyResult,
      threadReply: {
        changeId: threadComment.targetChangeId,
        text: threadComment.text,
        author,
      },
    };
  }

  const changeId = state.getNextId(filePath, fileContent);
  let applyResult: ApplyResult;
  const proactiveSupersede = await trySupersedeContainingInsertion({
    fileContent,
    op: compactOp,
    changeId,
    author,
    state,
    filePath,
    config,
  });
  if (proactiveSupersede) {
    applyResult = proactiveSupersede;
  } else {
    try {
      applyResult = resolveAndApply(
        compactOp,
        fileContent,
        fileContent.split('\n'),
        state,
        filePath,
        config,
        changeId,
        author,
      );
    } catch (err) {
      const supersedeResult = await trySupersedeContainingInsertion({
        fileContent,
        op: compactOp,
        changeId,
        author,
      });
      if (supersedeResult) {
        applyResult = supersedeResult;
      } else {
        return fail(err instanceof Error ? err.message : String(err), 'HASHLINE_REFERENCE_UNRESOLVED', {
          file: relativePath,
          quick_fix: { action: 're_read', file: filePath },
        });
      }
    }
  }

  let affectedLines: AffectedLineEntry[] = [];
  try {
    affectedLines = computeAffectedLines(applyResult.modifiedText, applyResult.affectedStartLine, applyResult.affectedEndLine, {
      hashlineEnabled: config.hashline.enabled,
    });
  } catch {
    affectedLines = [];
  }

  const responseData: Record<string, unknown> = {
    change_id: changeId,
    file: relativePath,
    type: applyResult.changeType,
    ...(applyResult.relocations.length > 0 ? { relocated: applyResult.relocations } : {}),
    ...(applyResult.remaps.length > 0 ? { remaps: applyResult.remaps } : {}),
    ...(applyResult.supersededIds.length > 0 ? { superseded: applyResult.supersededIds } : {}),
    document_state: documentState(applyResult.modifiedText),
  };
  if (affectedLines.length > 0 && config.response?.affected_lines) {
    responseData.affected_lines = affectedLines;
  }
  const ds = responseData.document_state as { total_changes: number; proposed: number; accepted: number; authors: number };
  responseData.state_summary = `📋 ${ds.total_changes} tracked change(s) | ${ds.proposed} proposed, ${ds.accepted} accepted | ${ds.authors} author(s)`;

  return {
    ok: true,
    changeId,
    author,
    reasoning,
    oldL2: fileContent,
    newL2: applyResult.modifiedText,
    responseData,
    toolResult: { content: [{ type: 'text', text: JSON.stringify(responseData) }] },
    normalizedOp: compactOp,
    applyResult,
  };
}
