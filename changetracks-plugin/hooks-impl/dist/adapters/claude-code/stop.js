// adapters/claude-code/stop.ts — Claude Code Stop handler
//
// Contains the handler logic for Claude Code's Stop hook event.
// Loads config, checks policy mode, delegates to batch-wrapper engine.
// The root-level stop.ts remains the entrypoint (main + stdin/stdout).
import { loadConfig } from '../../config.js';
import { applyPendingEdits } from '../../core/batch-wrapper.js';
import { clearSessionEdits } from '../../pending.js';
/**
 * Core logic for the Stop hook handler.
 *
 * Loads config, checks policy mode, and delegates to the platform-neutral
 * batch-wrapper engine. Non-safety-net modes clear pending edits without
 * wrapping. Returns a StopResult with a summary message, or empty if no
 * edits were pending.
 */
export async function handleStop(input) {
    const projectDir = input.cwd ?? process.cwd();
    const config = await loadConfig(projectDir);
    const sessionId = input.session_id ?? 'unknown';
    // Only safety-net mode batch-wraps edits
    if (config.policy.mode !== 'safety-net') {
        // Clear pending edits for this session (they won't be wrapped)
        await clearSessionEdits(projectDir, sessionId);
        return {};
    }
    const result = await applyPendingEdits(projectDir, sessionId, config);
    if (result.editsApplied === 0)
        return {};
    return { systemMessage: result.message };
}
//# sourceMappingURL=stop.js.map