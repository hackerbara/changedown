// core/types.ts — Platform-neutral types for hook logic

/**
 * Result of a policy evaluation. Platform adapters translate
 * this into their specific output format.
 */
export interface PolicyDecision {
  action: 'allow' | 'deny' | 'warn';
  reason: string;
  agentHint?: string;
  userMessage?: string;
}

/**
 * Information about a file edit, normalized across platforms.
 * Claude Code: from tool_input (old_string/new_string or content)
 * Cursor: from edits[].old_string/new_string
 */
export interface EditInfo {
  filePath: string;
  oldText: string;
  newText: string;
  toolName?: string;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * Result of batch-wrapping pending edits in CriticMarkup.
 */
export interface BatchResult {
  editsApplied: number;
  changeIds: string[];
  message: string;
}

export type EditClass = 'creation' | 'insertion' | 'deletion' | 'substitution';

// Re-export from shared config (backward compat for internal imports)
export type { PolicyMode, CreationTracking } from 'changetracks/config';
