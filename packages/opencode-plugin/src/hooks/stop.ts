import type { HookContext } from '../types/opencode-plugin.js';
import { loadConfig } from '../config.js';
import { readPendingEdits, clearAllEdits } from '../pending.js';
import { findUniqueMatch, appendFootnote } from '../file-ops.js';
import { SessionState } from '../state.js';
import { defaultNormalizer, nowTimestamp } from '@changedown/core';
import { wrapInsertion, wrapDeletion, wrapSubstitution, TextEdit } from '@changedown/core';
import { generateFootnoteDefinition } from '@changedown/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface StopInput {
  // No specific input for stop hook
}

interface StopOutput {
  // Can add messages to output
}

interface MatchResult {
  originalText: string;
  index: number;
  length: number;
}

function findAllIndexes(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

function pickContextualMatch(
  content: string,
  oldText: string,
  contextBefore?: string,
  contextAfter?: string,
): MatchResult | null {
  if (!contextBefore && !contextAfter) return null;
  const indices = findAllIndexes(content, oldText);
  if (indices.length === 0) return null;
  if (indices.length === 1) {
    return { originalText: oldText, index: indices[0], length: oldText.length };
  }

  const scored = indices
    .map((index) => {
      const beforeWindow = content.slice(Math.max(0, index - 1000), index);
      const afterWindow = content.slice(index + oldText.length, Math.min(content.length, index + oldText.length + 1000));
      let score = 0;
      if (contextBefore && beforeWindow.includes(contextBefore)) score += 2;
      if (contextAfter && afterWindow.includes(contextAfter)) score += 2;
      return { index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return { originalText: oldText, index: scored[0].index, length: oldText.length };
}

function findMatchWithContext(
  content: string,
  oldText: string,
  contextBefore?: string,
  contextAfter?: string,
): MatchResult {
  try {
    return findUniqueMatch(content, oldText, defaultNormalizer);
  } catch (err) {
    const contextual = pickContextualMatch(content, oldText, contextBefore, contextAfter);
    if (contextual) return contextual;
    throw err;
  }
}

export async function stopHook(
  input: StopInput,
  output: StopOutput,
  ctx: HookContext
): Promise<void> {
  const projectDir = ctx.directory;

  // P1-22: OpenCode runtime does not populate sessionId, so all edits are recorded
  // with session_id = ''. Process ALL pending edits rather than filtering by session,
  // since session isolation is not functional without runtime-provided session IDs.
  const allEdits = await readPendingEdits(projectDir);

  if (allEdits.length === 0) {
    return;
  }

  console.log(`[ChangeDown] Processing ${allEdits.length} pending edits for batch CriticMarkup application`);

  const config = await loadConfig(projectDir);
  const sessionState = new SessionState();

  // Group edits by file
  const editsByFile = new Map<string, typeof allEdits>();
  for (const edit of allEdits) {
    const fileEdits = editsByFile.get(edit.file) ?? [];
    fileEdits.push(edit);
    editsByFile.set(edit.file, fileEdits);
  }

  // Process each file
  for (const [filePath, edits] of editsByFile) {
    try {
      await processFileEdits(filePath, edits, projectDir, sessionState, config);
    } catch (error) {
      console.error(`[ChangeDown] Error processing edits for ${filePath}:`, error);
    }
  }

  // Clear all pending edits (no session isolation without runtime session IDs)
  await clearAllEdits(projectDir);

  console.log(`[ChangeDown] Batch CriticMarkup application complete`);
}

async function processFileEdits(
  filePath: string,
  edits: Awaited<ReturnType<typeof readPendingEdits>>,
  projectDir: string,
  sessionState: SessionState,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(projectDir, filePath);

  // Read current file content
  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    console.error(`[ChangeDown] Cannot read file ${filePath}:`, error);
    return;
  }

  // Process edits in reverse order to preserve positions
  const sortedEdits = [...edits].sort((a, b) => {
    // Sort by timestamp descending (newest first)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const textEdits: TextEdit[] = [];
  const footnoteIds: string[] = [];

  for (const edit of sortedEdits) {
    try {
      const scId = sessionState.getNextId(filePath, content);
      footnoteIds.push(scId);

      let textEdit: TextEdit;

      if (edit.old_text && edit.new_text) {
        // Substitution
        const match = findMatchWithContext(
          content,
          edit.old_text,
          edit.context_before,
          edit.context_after,
        );
        textEdit = wrapSubstitution(
          match.originalText,
          edit.new_text,
          match.index,
          scId
        );
      } else if (edit.old_text && !edit.new_text) {
        // Deletion
        const match = findMatchWithContext(
          content,
          edit.old_text,
          edit.context_before,
          edit.context_after,
        );
        textEdit = wrapDeletion(match.originalText, match.index, scId);
      } else if (!edit.old_text && edit.new_text) {
        // Insertion - need to determine position
        // Use context if available, otherwise append to end
        let insertPosition = content.length;
        if (edit.context_before) {
          const match = findUniqueMatch(content, edit.context_before, defaultNormalizer);
          insertPosition = match.index + match.length;
        }
        textEdit = wrapInsertion(edit.new_text, insertPosition, scId);
      } else {
        // No-op edit
        continue;
      }

      textEdits.push(textEdit);
    } catch (error) {
      console.error(`[ChangeDown] Error processing edit for ${filePath}:`, error);
    }
  }

  // Apply edits in reverse order (so positions remain valid)
  textEdits.sort((a, b) => b.offset - a.offset);
  
  let modifiedContent = content;
  for (const edit of textEdits) {
    modifiedContent = 
      modifiedContent.slice(0, edit.offset) + 
      edit.newText + 
      modifiedContent.slice(edit.offset + edit.length);
  }

  // Generate and append footnotes
  if (footnoteIds.length > 0) {
    let footnoteBlock = '';
    for (const scId of footnoteIds) {
      footnoteBlock += generateFootnoteDefinition(
        scId,
        'edit',
        config.author.default || undefined,
        nowTimestamp().date
      );
    }
    modifiedContent = appendFootnote(modifiedContent, footnoteBlock);
  }

  // Write modified content back
  await fs.writeFile(absolutePath, modifiedContent, 'utf-8');
  console.log(`[ChangeDown] Applied ${footnoteIds.length} CriticMarkup changes to ${filePath}`);
}
