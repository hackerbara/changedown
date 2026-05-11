import type { ChangeDownConfig } from '@changedown/cli/engine/browser';
import type { ChangeOp, ChangeResult, DocumentBackend } from '@changedown/core/backend';
import { convertL3ToL2, isL3Format } from '@changedown/core';
import {
  prepareClassicProposeChange,
  prepareCompactProposeChange,
  type PrepareClassicProposeResult,
  type PrepareCompactProposeResult,
} from '@changedown/cli/engine/browser';

export type WordProposalFamily = 'classic' | 'compact';

export interface PrepareWordProposeInput {
  args: Record<string, unknown>;
  uri: string;
  snapshotText: string;
  snapshotFormat?: 'L2' | 'L3';
  config: ChangeDownConfig;
  state: unknown;
}

export type PreparedWordPropose =
  | ((Extract<PrepareClassicProposeResult, { ok: true }> | Extract<PrepareCompactProposeResult, { ok: true }>) & { family: WordProposalFamily })
  | ({ ok: false; toolResult: { content: Array<{ type: 'text'; text: string }>; isError?: boolean }; family?: WordProposalFamily });

export function labPrepCategoryForPrepared(prepared: PreparedWordPropose): string {
  if (prepared.ok) return prepared.family === 'classic' ? 'MCP_PREP_CLASSIC_OK' : 'MCP_PREP_COMPACT_OK';
  const text = prepared.toolResult.content.map((part) => part.text).join('\n');
  if (text.includes('WORD_MULTI_CHANGE_UNSUPPORTED')) return 'MCP_PREP_MULTI_CHANGE_UNSUPPORTED';
  if (text.includes('MIXED_PROPOSAL_FAMILY')) return 'MCP_PREP_MIXED_FAMILY';
  if (text.includes('MISSING_ARGUMENT')) return 'MCP_PREP_MISSING_ARGUMENT';
  if (
    text.includes('SETTLE_ON_DEMAND_UNSUPPORTED') ||
    text.includes('CLASSIC_PROPOSE_FAILED') ||
    text.includes('word:// classic preparation')
  ) return 'MCP_PREP_FALLBACK_FAILED';
  return 'MCP_PREP_FAILED';
}

function fail(message: string, code = 'VALIDATION_ERROR'): PreparedWordPropose {
  return {
    ok: false,
    toolResult: {
      isError: true,
      content: [
        { type: 'text', text: message },
        { type: 'text', text: JSON.stringify({ error: { message, code } }) },
      ],
    },
  };
}

function hasCompactArgs(args: Record<string, unknown>): boolean {
  if (typeof args.at === 'string' || typeof args.op === 'string') return true;
  const changes = args.changes;
  return Array.isArray(changes) && changes.some((change) => {
    const c = change as Record<string, unknown>;
    return typeof c.at === 'string' || typeof c.op === 'string';
  });
}

function hasClassicArgs(args: Record<string, unknown>): boolean {
  if (typeof args.old_text === 'string' || typeof args.oldText === 'string') return true;
  if (typeof args.new_text === 'string' || typeof args.newText === 'string') return true;
  if (typeof args.insert_after === 'string' || typeof args.insertAfter === 'string') return true;
  const changes = args.changes;
  return Array.isArray(changes) && changes.some((change) => {
    const c = change as Record<string, unknown>;
    return typeof c.old_text === 'string' || typeof c.new_text === 'string' || typeof c.insert_after === 'string';
  });
}

function changeCount(args: Record<string, unknown>): number {
  return Array.isArray(args.changes) ? args.changes.length : 1;
}

export async function prepareWordProposeChange(input: PrepareWordProposeInput): Promise<PreparedWordPropose> {
  if (changeCount(input.args) > 1) {
    return fail('word:// currently accepts one proposal per call; split multi-change arrays into separate calls.', 'WORD_MULTI_CHANGE_UNSUPPORTED');
  }

  const compact = hasCompactArgs(input.args);
  const classic = hasClassicArgs(input.args);
  if (compact && classic) {
    return fail('Mixed proposal families are not supported for word://: use either compact at/op or classic old_text/new_text, not both.', 'MIXED_PROPOSAL_FAMILY');
  }
  if (!compact && !classic) {
    return fail('propose_change for word:// requires compact at/op or classic old_text/new_text arguments.', 'MISSING_ARGUMENT');
  }

  const sourceText =
    input.snapshotFormat === 'L3' || isL3Format(input.snapshotText)
      ? await convertL3ToL2(input.snapshotText)
      : input.snapshotText;

  if (compact) {
    const prepared = await prepareCompactProposeChange({
      args: input.args,
      filePath: input.uri,
      relativePath: input.uri,
      fileContent: sourceText,
      config: input.config,
      state: input.state as never,
    });
    return prepared.ok ? { ...prepared, family: 'compact' } : { ...prepared, family: 'compact' };
  }

  const prepared = await prepareClassicProposeChange({
    args: input.args,
    filePath: input.uri,
    relativePath: input.uri,
    fileContent: sourceText,
    config: input.config,
    state: input.state as never,
    allowSettleOnDemand: false,
  });
  return prepared.ok ? { ...prepared, family: 'classic' } : { ...prepared, family: 'classic' };
}

export async function applyPreparedWordProposeChange(
  backend: Pick<DocumentBackend, 'applyChange'>,
  uri: string,
  prepared: Extract<PreparedWordPropose, { ok: true }>,
  options: { applyDiagnosticId?: string } = {},
): Promise<ChangeResult> {
  const threadReply = (prepared as {
    threadReply?: { changeId: string; text: string; author: string };
  }).threadReply;

  const attachLabApplyDiagnosticId = (args: Record<string, unknown>): Record<string, unknown> => {
    if (!options.applyDiagnosticId) return args;
    return {
      ...args,
      __labApplyDiagnosticId: options.applyDiagnosticId,
    };
  };

  const op: ChangeOp = threadReply
    ? {
        kind: 'respond',
        args: attachLabApplyDiagnosticId({
          cnId: threadReply.changeId,
          text: threadReply.text,
          author: threadReply.author,
        }),
      }
    : {
        kind: 'propose',
        args: attachLabApplyDiagnosticId({
          oldL2: prepared.oldL2,
          newL2: prepared.newL2,
        }),
      };
  return backend.applyChange({ uri }, op);
}
