import type { PendingEdit } from '../pending.js';

export interface ParsedPatchResult {
  edits: PendingEdit[];
  warnings: string[];
}

interface ParsedHunk {
  lines: string[];
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return raw;

  const lines = trimmed.split('\n');
  if (lines.length < 3) return raw;
  if (!lines[0].startsWith('```')) return raw;
  if (lines[lines.length - 1].trim() !== '```') return raw;

  return lines.slice(1, -1).join('\n');
}

function parseHunks(patchText: string): ParsedHunk[] {
  const hunks: ParsedHunk[] = [];
  const lines = patchText.split('\n');
  let current: ParsedHunk | null = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { lines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    if (line === '\\ No newline at end of file') continue;
    if (line.startsWith(' ') || line.startsWith('-') || line.startsWith('+')) {
      current.lines.push(line);
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

function trimTrailingNewline(value: string): string {
  if (!value.endsWith('\n')) return value;
  return value.slice(0, -1);
}

function fromHunk(filePath: string, hunk: ParsedHunk, timestamp: string, sessionId: string): PendingEdit | null {
  const firstChange = hunk.lines.findIndex((line) => line.startsWith('-') || line.startsWith('+'));
  if (firstChange < 0) return null;

  let lastChange = -1;
  for (let i = hunk.lines.length - 1; i >= 0; i--) {
    if (hunk.lines[i].startsWith('-') || hunk.lines[i].startsWith('+')) {
      lastChange = i;
      break;
    }
  }
  if (lastChange < firstChange) return null;

  const removed: string[] = [];
  const added: string[] = [];
  for (const line of hunk.lines) {
    if (line.startsWith('-')) removed.push(line.slice(1));
    if (line.startsWith('+')) added.push(line.slice(1));
  }

  const contextBeforeLines = hunk.lines
    .slice(0, firstChange)
    .filter((line) => line.startsWith(' '))
    .map((line) => line.slice(1))
    .slice(-3);
  const contextAfterLines = hunk.lines
    .slice(lastChange + 1)
    .filter((line) => line.startsWith(' '))
    .map((line) => line.slice(1))
    .slice(0, 3);

  const oldText = trimTrailingNewline(removed.join('\n'));
  const newText = trimTrailingNewline(added.join('\n'));

  if (!oldText && !newText) return null;

  const contextBefore = contextBeforeLines.length > 0 ? contextBeforeLines.join('\n') : undefined;
  const contextAfter = contextAfterLines.length > 0 ? contextAfterLines.join('\n') : undefined;

  return {
    file: filePath,
    old_text: oldText,
    new_text: newText,
    timestamp,
    session_id: sessionId,
    context_before: contextBefore,
    context_after: contextAfter,
  };
}

export function parseUnifiedPatchToPendingEdits(
  filePath: string,
  rawPatchText: string,
  sessionId: string,
): ParsedPatchResult {
  const warnings: string[] = [];
  const normalized = stripCodeFence(rawPatchText).trim();
  if (!normalized) {
    return { edits: [], warnings: ['Patch text was empty.'] };
  }

  const hunks = parseHunks(normalized);
  if (hunks.length === 0) {
    return { edits: [], warnings: ['No @@ hunks found in patch text.'] };
  }

  const timestamp = new Date().toISOString();
  const edits: PendingEdit[] = [];
  for (const hunk of hunks) {
    const edit = fromHunk(filePath, hunk, timestamp, sessionId);
    if (!edit) {
      warnings.push('Skipped an empty or unsupported hunk.');
      continue;
    }
    edits.push(edit);
  }

  if (edits.length === 0 && warnings.length === 0) {
    warnings.push('No pending edits could be derived from the patch hunks.');
  }

  return { edits, warnings };
}
