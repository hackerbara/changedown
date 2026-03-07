import type { HookInput } from '../shared.js';
export interface StopResult {
    /** Warning message shown to the user (Stop hooks do NOT support hookSpecificOutput). */
    systemMessage?: string;
}
/**
 * Core logic for the Stop hook handler.
 *
 * Loads config, checks policy mode, and delegates to the platform-neutral
 * batch-wrapper engine. Non-safety-net modes clear pending edits without
 * wrapping. Returns a StopResult with a summary message, or empty if no
 * edits were pending.
 */
export declare function handleStop(input: HookInput): Promise<StopResult>;
