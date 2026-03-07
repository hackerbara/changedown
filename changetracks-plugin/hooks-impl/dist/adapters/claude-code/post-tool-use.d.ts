import type { HookInput } from '../shared.js';
export interface PostToolUseResult {
}
/**
 * Core logic for the PostToolUse handler.
 * Logs the edit to `.changetracks/pending.json` for later batch processing
 * by the Stop hook. Does NOT modify the edited file itself.
 *
 * Returns `{ logged: true }` when an edit was recorded, `{ logged: false }` otherwise.
 * (The actual hook output is always `{}`; the return value is for testing.)
 */
export declare function handlePostToolUse(input: HookInput): Promise<{
    logged: boolean;
}>;
