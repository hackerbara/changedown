import type { EditClass } from './core/types.js';
export type { EditClass };
/**
 * --- Fork divergence from opencode-plugin PendingEdit ---
 *
 * A sibling PendingEdit implementation exists at:
 *   `packages/opencode-plugin/src/pending.ts`
 *
 * This version has additional fields that the opencode version does NOT have:
 *   - `tool_name` — Claude Code's hook protocol provides the originating tool name
 *   - `edit_class` — derived from `core/types.ts` EditClass for edit classification
 *
 * The opencode plugin receives edits through OpenCode's simpler hook API, which
 * does not provide tool classification metadata, so those fields are absent there.
 *
 * Function naming also differs:
 *   - This file: `clearPendingEdits(projectDir)` — clears all edits
 *   - opencode: `clearAllEdits(projectDir)` — same behavior, different name
 *   - Both files: `clearSessionEdits(projectDir, sessionId)` — identical
 *
 * If you modify the core read/write/append logic, check both files:
 *   - changetracks-plugin/hooks-impl/src/pending.ts     (this file)
 *   - packages/opencode-plugin/src/pending.ts            (opencode fork)
 */
export interface PendingEdit {
    file: string;
    old_text: string;
    new_text: string;
    timestamp: string;
    session_id: string;
    /** ~50 chars of file content immediately before the edit location */
    context_before?: string;
    /** ~50 chars of file content immediately after the edit location */
    context_after?: string;
    /** The Claude Code tool that produced this edit */
    tool_name?: string;
    /** Derived classification of the edit */
    edit_class?: EditClass;
}
/**
 * Reads all pending edits from `.changetracks/pending.json`.
 * Returns an empty array if the file does not exist or contains invalid JSON.
 */
export declare function readPendingEdits(projectDir: string): Promise<PendingEdit[]>;
/**
 * Appends a single edit to `.changetracks/pending.json`.
 * Creates the `.changetracks/` directory and file if they do not exist.
 */
export declare function appendPendingEdit(projectDir: string, edit: PendingEdit): Promise<void>;
/**
 * Removes the pending.json file, clearing all pending edits.
 */
export declare function clearPendingEdits(projectDir: string): Promise<void>;
/**
 * Removes only the specified session's edits from pending.json.
 * If no edits remain after filtering, deletes the file entirely.
 * This prevents one session's Stop hook from wiping another session's pending edits.
 */
export declare function clearSessionEdits(projectDir: string, sessionId: string): Promise<void>;
