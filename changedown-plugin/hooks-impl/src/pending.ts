import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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
 *   - changedown-plugin/hooks-impl/src/pending.ts     (this file)
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

function pendingPath(projectDir: string): string {
  return path.join(projectDir, '.changedown', 'pending.json');
}

/**
 * Writes JSON data atomically using write-to-temp + rename.
 * Rename is atomic on POSIX, so readers never see a partially-written file.
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp.' + process.pid;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Reads all pending edits from `.changedown/pending.json`.
 * Returns an empty array if the file does not exist or contains invalid JSON.
 */
export async function readPendingEdits(projectDir: string): Promise<PendingEdit[]> {
  try {
    const raw = await fs.readFile(pendingPath(projectDir), 'utf-8');
    return JSON.parse(raw) as PendingEdit[];
  } catch {
    return [];
  }
}

/**
 * Appends a single edit to `.changedown/pending.json`.
 * Creates the `.changedown/` directory and file if they do not exist.
 */
export async function appendPendingEdit(projectDir: string, edit: PendingEdit): Promise<void> {
  const filePath = pendingPath(projectDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const existing = await readPendingEdits(projectDir);
  existing.push(edit);
  await atomicWriteJson(filePath, existing);
}

/**
 * Removes the pending.json file, clearing all pending edits.
 */
export async function clearPendingEdits(projectDir: string): Promise<void> {
  try {
    await fs.unlink(pendingPath(projectDir));
  } catch {
    // File already absent — nothing to do
  }
}

/**
 * Removes only the specified session's edits from pending.json.
 * If no edits remain after filtering, deletes the file entirely.
 * This prevents one session's Stop hook from wiping another session's pending edits.
 */
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
    await atomicWriteJson(filePath, remaining);
  }
}
