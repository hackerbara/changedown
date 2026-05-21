import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

const wordSessionProperty = {
  type: 'string',
  description: 'Active Word session URI (word://sess-...). Remote relay tools do not accept local filesystem targets.',
  pattern: '^word://',
} as const;

const authorProperty = {
  type: 'string',
  description: 'Author identity (e.g., ai:codex, human:alice). If omitted for remote write calls, the relay synthesizes ai:<client-name> from MCP clientInfo.',
} as const;

const idempotencyKeyProperty = {
  type: 'string',
  minLength: 1,
  description: 'Required for remote mutating calls. The HTTP facade treats Idempotency-Key/X-Idempotency-Key headers as authoritative and injects this argument before MCP callTool.',
} as const;

export const REMOTE_WORD_TOOL_NAMES = [
  'read_tracked_file',
  'list_changes',
  'propose_change',
  'review_changes',
  'amend_change',
  'supersede_change',
  'resolve_thread',
] as const;

export type RemoteWordToolName = typeof REMOTE_WORD_TOOL_NAMES[number];
export type RemoteProtocolMode = 'classic' | 'compact';

export const MUTATING_REMOTE_TOOL_NAMES = [
  'propose_change',
  'review_changes',
  'amend_change',
  'supersede_change',
  'resolve_thread',
] as const satisfies readonly RemoteWordToolName[];

const REMOTE_TOOL_ANNOTATIONS: Record<RemoteWordToolName, ToolAnnotations> = {
  read_tracked_file: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_changes: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  propose_change: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  review_changes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  amend_change: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  supersede_change: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  resolve_thread: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const readTrackedFileSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    view: { type: 'string', enum: ['working', 'simple', 'decided', 'original', 'raw'], description: 'Remote read view.' },
    offset: { type: 'number', description: 'Line number to start reading from (1-indexed, default: 1).' },
    limit: { type: 'number', description: 'Maximum number of lines to return.' },
    include_guide: { type: 'boolean', description: 'Include the editing guide even if already shown this session.' },
    include_meta: { type: 'boolean', description: 'Include metadata such as change levels and expanded tips.' },
  },
  required: ['file'],
};

const listChangesSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    change_id: { type: 'string', description: 'Single change ID to fetch details for (e.g., cn-7).' },
    change_ids: { type: 'array', items: { type: 'string' }, description: 'Batch of change IDs to fetch details for.' },
    status: { type: 'string', enum: ['proposed', 'accepted', 'rejected'], description: 'Filter changes by status.' },
    detail: { type: 'string', enum: ['summary', 'context', 'full'], description: 'Detail level to return.' },
    context_lines: { type: 'number', description: 'Number of surrounding lines for context/full detail.' },
  },
  required: ['file'],
};

const classicProposeProperties = {
  file: wordSessionProperty,
  author: authorProperty,
  old_text: { type: 'string', description: 'Text to replace. Empty string for pure insertion.' },
  new_text: { type: 'string', description: 'Replacement text. Empty string for pure deletion.' },
  insert_after: { type: 'string', description: 'Insertion anchor text when old_text is empty.' },
  reason: { type: 'string', description: 'Annotation for the change.' },
  at: { type: 'string', description: 'Remote compact fallback coordinate from read_tracked_file, such as LINE:HASH.' },
  op: { type: 'string', description: 'Remote compact fallback edit operation such as {~~old~>new~~}, {++text++}, or {--text--}.' },
  raw: { type: 'boolean', description: 'When true, bypasses CriticMarkup wrapping if policy permits.' },
  idempotency_key: idempotencyKeyProperty,
};

const compactProposeProperties = {
  file: wordSessionProperty,
  author: authorProperty,
  old_text: { type: 'string', description: 'Text to replace. Empty string for pure insertion.' },
  new_text: { type: 'string', description: 'Replacement text. Empty string for pure deletion.' },
  insert_after: { type: 'string', description: 'Insertion anchor text when old_text is empty.' },
  at: { type: 'string', description: 'Remote coordinate from read_tracked_file, such as LINE:HASH or LINE:HASH-LINE:HASH.' },
  op: { type: 'string', description: 'Edit operation such as {~~old~>new~~}, {++text++}, {--text--}, or {==text==}. Append {>>reason<<} to annotate.' },
  reason: { type: 'string', description: 'Annotation for the change.' },
  raw: { type: 'boolean', description: 'When true, bypasses CriticMarkup wrapping if policy permits.' },
  idempotency_key: idempotencyKeyProperty,
};

function proposeChangeSchema(mode: RemoteProtocolMode): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: mode === 'compact' ? compactProposeProperties : classicProposeProperties,
    required: ['file', 'idempotency_key'],
  };
}

const reviewChangesSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    author: authorProperty,
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          change_id: { type: 'string' },
          decision: { type: 'string', enum: ['approve', 'reject', 'request_changes', 'withdraw'] },
          reason: { type: 'string' },
          label: { type: 'string' },
          blocking: { type: 'boolean' },
        },
        required: ['change_id', 'decision', 'reason'],
      },
    },
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          change_id: { type: 'string' },
          response: { type: 'string' },
          label: { type: 'string', enum: ['suggestion', 'issue', 'question', 'praise', 'todo', 'thought', 'nitpick'] },
        },
        required: ['change_id', 'response'],
      },
    },
    idempotency_key: idempotencyKeyProperty,
  },
  required: ['file', 'idempotency_key'],
};

const amendChangeSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    change_id: { type: 'string', description: 'Change ID to amend.' },
    new_text: { type: 'string', description: 'Replacement text for the proposed change.' },
    old_text: { type: 'string', description: 'Optional expanded old-side match containing the original old text.' },
    reason: { type: 'string', description: 'Why this amendment is being made.' },
    author: authorProperty,
    idempotency_key: idempotencyKeyProperty,
  },
  required: ['file', 'change_id', 'idempotency_key'],
};

const supersedeChangeSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    change_id: { type: 'string', description: 'Proposed change ID to supersede.' },
    old_text: { type: 'string', description: 'Text to replace after the old proposal is rejected. Empty for insertion-style supersede.' },
    new_text: { type: 'string', description: 'Replacement text for the new proposed change.' },
    insert_after: { type: 'string', description: 'Insertion anchor text when old_text is empty.' },
    reason: { type: 'string', description: 'Why this change supersedes the old one.' },
    author: authorProperty,
    idempotency_key: idempotencyKeyProperty,
  },
  required: ['file', 'change_id', 'old_text', 'new_text', 'idempotency_key'],
};

const resolveThreadSchema = {
  type: 'object' as const,
  properties: {
    file: wordSessionProperty,
    change_id: { type: 'string', description: 'Change thread ID to resolve or unresolve.' },
    action: { type: 'string', enum: ['resolve', 'unresolve'], description: 'Whether to resolve or reopen the thread.' },
    author: authorProperty,
    idempotency_key: idempotencyKeyProperty,
  },
  required: ['file', 'change_id', 'idempotency_key'],
};

const REMOTE_WORD_TOOL_DESCRIPTIONS: Record<RemoteWordToolName, string> = {
  read_tracked_file: 'Read a tracked remote Word session and return ChangeDown coordinates.',
  list_changes: 'List tracked changes in a remote Word session.',
  propose_change: 'Propose tracked ChangeDown edits in a remote Word session.',
  review_changes: 'Approve, reject, request changes, or respond to threads in a remote Word session.',
  amend_change: 'Revise an existing proposed change in a remote Word session.',
  supersede_change: 'Reject a proposed change and propose a replacement in one remote Word operation.',
  resolve_thread: 'Resolve or reopen a ChangeDown discussion thread in a remote Word session.',
};

function inputSchemaFor(name: RemoteWordToolName, mode: RemoteProtocolMode): Tool['inputSchema'] {
  switch (name) {
    case 'read_tracked_file': return readTrackedFileSchema;
    case 'list_changes': return listChangesSchema;
    case 'propose_change': return proposeChangeSchema(mode);
    case 'review_changes': return reviewChangesSchema;
    case 'amend_change': return amendChangeSchema;
    case 'supersede_change': return supersedeChangeSchema;
    case 'resolve_thread': return resolveThreadSchema;
  }
}

/**
 * Worker-safe remote Word MCP tools. This is the canonical schema surface for
 * the remote relay and is intentionally data-only: it must not import the
 * local CLI engine graph, because that graph contains Node-only file APIs.
 */
export function getRemoteWordTools(mode: RemoteProtocolMode = 'classic'): Tool[] {
  return REMOTE_WORD_TOOL_NAMES.map((name) => ({
    name,
    description: REMOTE_WORD_TOOL_DESCRIPTIONS[name],
    inputSchema: inputSchemaFor(name, mode),
    annotations: REMOTE_TOOL_ANNOTATIONS[name],
  } satisfies Tool));
}
