export interface HookInput {
    hook_event_name: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    session_id?: string;
    conversation_id?: string;
    cwd?: string;
    workspace_roots?: string[];
    stop_hook_active?: boolean;
    file_path?: string;
    content?: string;
    edits?: Array<{
        old_string: string;
        new_string: string;
    }>;
    status?: string;
}
/**
 * Read and parse JSON from stdin.
 * Both Claude Code and Cursor send JSON on stdin.
 */
export declare function readStdin(): Promise<HookInput>;
/**
 * Write JSON to stdout.
 * Both platforms read JSON from stdout.
 */
export declare function writeStdout(data: Record<string, unknown>): void;
/**
 * Derive the project directory from hook input.
 * Claude Code: uses `cwd` field.
 * Cursor: uses `workspace_roots[0]` (no cwd available).
 */
export declare function deriveProjectDir(input: HookInput): string;
/**
 * Derive session identifier from hook input.
 * Claude Code: uses `session_id`.
 * Cursor: uses `conversation_id` (no session_id available).
 */
export declare function deriveSessionId(input: HookInput): string;
