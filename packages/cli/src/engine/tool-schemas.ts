/**
 * Tool schemas for classic and compact protocol modes.
 * These define the inputSchema returned by MCP list_tools.
 */

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// ── Compact mode schema ──

export const compactProposeChangeSchema: ToolSchema = {
  name: 'propose_change',
  description:
    'Propose tracked changes to a document target (file path, file:// URI, or word:// session). Each change uses at (LINE:HASH coordinate) and op (edit operation). ' +
    'For word:// only, compact+hashline and classic families are accepted when unambiguous; files still follow project protocol mode. ' +
    'For multiple changes, pass a changes array — all applied atomically against the pre-change state.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: { type: 'string', description: 'Path, file:// URI, or active Word session URI (word://sess-...). Use resources/list to discover Word sessions.' },
      author: { type: 'string', description: 'Author identity (e.g., ai:claude-opus-4.6, human:alice). Required when project has author enforcement.' },
      at: { type: 'string', description: 'Target coordinate from read_tracked_file. Single line: "LINE:HASH". Range: "LINE:HASH-LINE:HASH".' },
      op: { type: 'string', description: 'Edit operation. Substitute: {~~old~>new~~}. Insert: {++text++}. Delete: {--text--}. Range replace: {~~~>new~~}; recoverable range replace: {~~~\\nold opening\\n...\\nold closing\\n~>\\nnew\\n~~}. Highlight: {==text==}. Comment: {>>reason. Append {>> to annotate any op.' },
      old_text: { type: 'string', description: 'word:// classic fallback only: text to replace. File-backed compact targets reject old_text; use at/op for files in compact mode.' },
      new_text: { type: 'string', description: 'word:// classic fallback only: replacement text. File-backed compact targets reject new_text; use at/op for files in compact mode.' },
      insert_after: { type: 'string', description: 'word:// classic fallback only: insertion anchor text when old_text is empty.' },
      reason: { type: 'string', description: 'Annotation for the change. In compact mode, a reason may also be appended to op with {>>reason.' },
      changes: {
        type: 'array',
        description: 'Multiple changes applied atomically with grouped IDs. All coordinates reference the pre-change state.',
        items: {
          type: 'object',
          properties: {
            at: { type: 'string', description: 'LINE:HASH or LINE:HASH-LINE:HASH coordinate.' },
            op: { type: 'string', description: '{~~old~>new~~} | {++text++} | {--text--} | {==text==}. Append {>> to annotate.' },
          },
          required: ['at', 'op'],
        },
      },
      raw: { type: 'boolean', description: 'When true, bypasses CriticMarkup wrapping (policy-gated). Denied in strict mode.' },
    },
    required: ['file'],
  },
};

// ── Classic mode schema ──

export const classicProposeChangeSchema: ToolSchema = {
  name: 'propose_change',
  description:
    'Propose tracked changes to a document target (file path, file:// URI, or word:// session). Each change uses old_text/new_text for text matching. ' +
    'For word:// only, compact+hashline and classic families are accepted when unambiguous; files still follow project protocol mode. ' +
    'For multiple changes, pass a changes array — all applied atomically against the pre-change state.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: { type: 'string', description: 'Path, file:// URI, or active Word session URI (word://sess-...). Use resources/list to discover Word sessions.' },
      author: { type: 'string', description: 'Author identity (e.g., ai:claude-opus-4.6, human:alice). Required when project has author enforcement.' },
      old_text: { type: 'string', description: 'Text to replace. Empty string for pure insertion. Must match file content exactly.' },
      new_text: { type: 'string', description: 'Replacement text. Empty string for pure deletion.' },
      reason: { type: 'string', description: 'Annotation for the change (adds a discussion comment to the change thread).' },
      insert_after: { type: 'string', description: 'For insertions: insert new text after this anchor text.' },
      at: { type: 'string', description: 'word:// compact+hashline fallback only: target coordinate from read_tracked_file, such as "LINE:HASH". File-backed classic targets reject at/op; use old_text/new_text for files in classic mode.' },
      op: { type: 'string', description: 'word:// compact+hashline fallback only: edit operation such as {~~old~>new~~}, {++text++}, or {--text--}.' },
      changes: {
        type: 'array',
        description: 'Multiple changes applied atomically with grouped IDs.',
        items: {
          type: 'object',
          properties: {
            old_text: { type: 'string', description: 'Text to replace.' },
            new_text: { type: 'string', description: 'Replacement text.' },
            reason: { type: 'string', description: 'Annotation for this change.' },
            insert_after: { type: 'string', description: 'Insertion anchor text.' },
          },
          required: ['old_text', 'new_text'],
        },
      },
      raw: { type: 'boolean', description: 'When true, bypasses CriticMarkup wrapping (policy-gated). Denied in strict mode.' },
    },
    required: ['file'],
  },
};
