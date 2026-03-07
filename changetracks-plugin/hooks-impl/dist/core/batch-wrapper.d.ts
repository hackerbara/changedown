import type { BatchResult, CreationTracking } from './types.js';
/**
 * Core batch-wrapping engine. Reads all pending edits for a session,
 * groups them by file, allocates SC-IDs, applies CriticMarkup wrapping
 * and appends footnotes. Clears the session's edits when done.
 *
 * This function is platform-neutral: it does filesystem I/O directly
 * and does not depend on any hook protocol format. Platform adapters
 * (Claude Code Stop hook, Cursor hook, etc.) call this function and
 * translate the BatchResult into their specific output format.
 */
export declare function applyPendingEdits(projectDir: string, sessionId: string, config: {
    author: {
        default: string;
    };
    policy: {
        mode: string;
        creation_tracking: CreationTracking;
    };
}): Promise<BatchResult>;
