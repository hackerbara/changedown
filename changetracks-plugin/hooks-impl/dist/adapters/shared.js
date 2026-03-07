// adapters/shared.ts — Platform-specific I/O helpers
/**
 * Read and parse JSON from stdin.
 * Both Claude Code and Cursor send JSON on stdin.
 */
export async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (!raw.trim())
        return { hook_event_name: 'unknown' };
    return JSON.parse(raw);
}
/**
 * Write JSON to stdout.
 * Both platforms read JSON from stdout.
 */
export function writeStdout(data) {
    process.stdout.write(JSON.stringify(data));
}
/**
 * Derive the project directory from hook input.
 * Claude Code: uses `cwd` field.
 * Cursor: uses `workspace_roots[0]` (no cwd available).
 */
export function deriveProjectDir(input) {
    if (input.cwd)
        return input.cwd;
    if (input.workspace_roots?.length)
        return input.workspace_roots[0];
    return process.cwd();
}
/**
 * Derive session identifier from hook input.
 * Claude Code: uses `session_id`.
 * Cursor: uses `conversation_id` (no session_id available).
 */
export function deriveSessionId(input) {
    return input.session_id ?? input.conversation_id ?? 'unknown';
}
//# sourceMappingURL=shared.js.map