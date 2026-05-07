import type { ChangeDownConfig } from '@changedown/cli/engine/browser';
import type { ChangeOp, ChangeResult, DocumentBackend } from '@changedown/core/backend';
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
  config: ChangeDownConfig;
  state: unknown;
}

export type PreparedWordPropose =
  | ((Extract<PrepareClassicProposeResult, { ok: true }> | Extract<PrepareCompactProposeResult, { ok: true }>) & { family: WordProposalFamily })
  | ({ ok: false; toolResult: { content: Array<{ type: 'text'; text: string }>; isError?: boolean }; family?: WordProposalFamily });

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

  if (compact) {
    const prepared = await prepareCompactProposeChange({
      args: input.args,
      filePath: input.uri,
      relativePath: input.uri,
      fileContent: input.snapshotText,
      config: input.config,
      state: input.state as never,
    });
    return prepared.ok ? { ...prepared, family: 'compact' } : { ...prepared, family: 'compact' };
  }

  const prepared = await prepareClassicProposeChange({
    args: input.args,
    filePath: input.uri,
    relativePath: input.uri,
    fileContent: input.snapshotText,
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
): Promise<ChangeResult> {
  const threadReply = (prepared as {
    threadReply?: { changeId: string; text: string; author: string };
  }).threadReply;

  const op: ChangeOp = threadReply
    ? {
        kind: 'respond',
        args: {
          cnId: threadReply.changeId,
          text: threadReply.text,
          author: threadReply.author,
        },
      }
    : {
        kind: 'propose',
        args: {
          oldL2: prepared.oldL2,
          newL2: prepared.newL2,
        },
      };
  return backend.applyChange({ uri }, op);
}
