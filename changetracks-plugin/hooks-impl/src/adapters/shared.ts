// adapters/shared.ts — Platform-specific I/O helpers

export interface HookInput {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  session_id?: string;
  conversation_id?: string;
  cwd?: string;
  workspace_roots?: string[];
  stop_hook_active?: boolean;
  // Cursor-specific fields
  file_path?: string;
  content?: string;
  edits?: Array<{ old_string: string; new_string: string }>;
  status?: string;
}

/**
 * Read and parse JSON from stdin.
 * Both Claude Code and Cursor send JSON on stdin.
 */
export async function readStdin(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks as Uint8Array[]).toString('utf-8');
  if (!raw.trim()) return { hook_event_name: 'unknown' };
  return JSON.parse(raw) as HookInput;
}

/**
 * Write JSON to stdout.
 * Both platforms read JSON from stdout.
 */
export function writeStdout(data: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(data));
}

/**
 * Derive the project directory from hook input.
 * Claude Code: uses `cwd` field.
 * Cursor: uses `workspace_roots[0]` (no cwd available).
 */
export function deriveProjectDir(input: HookInput): string {
  if (input.cwd) return input.cwd;
  if (input.workspace_roots?.length) return input.workspace_roots[0];
  return process.cwd();
}

/**
 * Derive session identifier from hook input.
 * Claude Code: uses `session_id`.
 * Cursor: uses `conversation_id` (no session_id available).
 */
export function deriveSessionId(input: HookInput): string {
  return input.session_id ?? input.conversation_id ?? 'unknown';
}
