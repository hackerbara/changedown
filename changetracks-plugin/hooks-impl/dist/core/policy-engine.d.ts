import type { PolicyDecision } from './types.js';
import type { ChangeTracksConfig } from '../config.js';
export interface RawEditOptions {
    /** When true, check if the file exists on disk. Non-existent files with
     *  creation_tracking enabled are allowed through for PostToolUse wrapping. */
    checkFileExists?: boolean;
}
/**
 * Evaluate whether a raw Edit/Write to a file should be allowed.
 * Used by: Claude Code PreToolUse, Cursor afterFileEdit (for classification)
 *
 * Pass `{ checkFileExists: true }` when the caller knows this is a Write
 * operation and wants creation tracking bypass for non-existent files.
 */
export declare function evaluateRawEdit(filePath: string, config: ChangeTracksConfig, projectDir: string, options?: RawEditOptions): PolicyDecision;
/**
 * Evaluate whether a raw file read should be allowed.
 * Used by: Cursor beforeReadFile (Claude Code doesn't intercept reads)
 *
 * Only blocks in strict mode — redirects to read_tracked_file.
 * Safety-net mode allows reads (the edit path handles wrapping).
 */
export declare function evaluateRawRead(filePath: string, config: ChangeTracksConfig, projectDir: string): PolicyDecision;
/**
 * Evaluate whether an MCP tool call should proceed.
 * Used by: Cursor beforeMCPExecution (Claude Code validates server-side)
 *
 * Read-only tools always allowed. Write tools validated for:
 * - Author presence (when enforcement = "required")
 */
export declare function evaluateMcpCall(toolName: string, toolInput: Record<string, unknown>, config: ChangeTracksConfig): PolicyDecision;
