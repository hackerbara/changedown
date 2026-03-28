import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * --- Fork divergence from hooks-impl PendingEdit ---
 *
 * A sibling PendingEdit implementation exists at:
 *   `changedown-plugin/hooks-impl/src/pending.ts`
 *
 * The hooks-impl version has additional fields that this version does NOT need:
 *   - `tool_name?: string`  — the Claude Code tool that produced the edit
 *   - `edit_class?: EditClass` — derived edit classification (from hooks-impl's
 *     `core/types.ts`: insertion, deletion, substitution, etc.)
 *
 * These fields exist because the hooks-impl serves Claude Code's hook protocol,
 * which provides tool name metadata and supports richer edit classification.
 * The opencode plugin receives edits through OpenCode's simpler hook API, which
 * does not provide tool classification metadata.
 *
 * The function signatures also differ:
 *   - This file: `clearAllEdits(projectDir)` — clears everything (appropriate
 *     because OpenCode does not provide session IDs, see P1-22)
 *   - hooks-impl: `clearPendingEdits(projectDir)` — same behavior, different name
 *   - Both files: `clearSessionEdits(projectDir, sessionId)` — identical
 *
 * If you modify the core read/write/append logic, check both files:
 *   - packages/opencode-plugin/src/pending.ts          (this file)
 *   - changedown-plugin/hooks-impl/src/pending.ts     (Claude Code hooks)
 */
export interface PendingEdit {
  file: string;
  old_text: string;
  new_text: string;
  timestamp: string;
  session_id: string;
  context_before?: string;
  context_after?: string;
}

function pendingPath(projectDir: string): string {
  return path.join(projectDir, '.changedown', 'pending.json');
}

export async function readPendingEdits(projectDir: string): Promise<PendingEdit[]> {
  try {
    const raw = await fs.readFile(pendingPath(projectDir), 'utf-8');
    return JSON.parse(raw) as PendingEdit[];
  } catch {
    return [];
  }
}

export async function appendPendingEdit(projectDir: string, edit: PendingEdit): Promise<void> {
  const filePath = pendingPath(projectDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const existing = await readPendingEdits(projectDir);
  existing.push(edit);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
}

export async function clearSessionEdits(projectDir: string, sessionId: string): Promise<void> {
  const filePath = pendingPath(projectDir);
  const all = await readPendingEdits(projectDir);
  const remaining = all.filter((e) => e.session_id !== sessionId);
  if (remaining.length === 0) {
    try {
      await fs.unlink(filePath);
    } catch {
      // File already absent — nothing to do
    }
  } else {
    await fs.writeFile(filePath, JSON.stringify(remaining, null, 2), 'utf-8');
  }
}

export async function clearAllEdits(projectDir: string): Promise<void> {
  try {
    await fs.unlink(pendingPath(projectDir));
  } catch {
    // File already absent — nothing to do
  }
}
