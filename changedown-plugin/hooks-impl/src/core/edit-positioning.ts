// core/edit-positioning.ts — Pure functions for locating edit positions in file content
import { normalizedIndexOf, defaultNormalizer } from '@changedown/core';

/**
 * Minimal interface for the context fields needed by findDeletionInsertionPoint.
 * Structurally compatible with PendingEdit — any object with these optional
 * fields satisfies the constraint.
 */
export interface EditContext {
  context_before?: string;
  context_after?: string;
}

/**
 * Finds the position of `targetText` in `fileContent` using context fields
 * for disambiguation when `targetText` appears multiple times.
 *
 * Strategy cascade:
 * 1. contextBefore + targetText + contextAfter (most specific)
 * 2. contextBefore + targetText
 * 3. targetText + contextAfter
 * 4. indexOf(targetText) (last resort)
 *
 * Returns `{ start, end }` — the character range of `targetText` in `fileContent`,
 * or `{ start: -1, end: -1 }` if not found.
 */
export function findEditPosition(
  fileContent: string,
  targetText: string,
  contextBefore?: string,
  contextAfter?: string,
): { start: number; end: number } {
  const notFound = { start: -1, end: -1 };

  if (!targetText) return notFound;

  // Strategy 1: contextBefore + targetText + contextAfter
  if (contextBefore && contextAfter) {
    const combined = contextBefore + targetText + contextAfter;
    let idx = fileContent.indexOf(combined);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx >= 0) {
      const start = idx + contextBefore.length;
      return { start, end: start + targetText.length };
    }
  }

  // Strategy 2: contextBefore + targetText
  if (contextBefore) {
    const combined = contextBefore + targetText;
    let idx = fileContent.indexOf(combined);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx >= 0) {
      const start = idx + contextBefore.length;
      return { start, end: start + targetText.length };
    }
  }

  // Strategy 3: targetText + contextAfter
  if (contextAfter) {
    const combined = targetText + contextAfter;
    let idx = fileContent.indexOf(combined);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx >= 0) {
      return { start: idx, end: idx + targetText.length };
    }
  }

  // Strategy 4: bare indexOf (last resort)
  let idx = fileContent.indexOf(targetText);
  if (idx === -1) {
    idx = normalizedIndexOf(fileContent, targetText, defaultNormalizer);
  }
  if (idx >= 0) {
    return { start: idx, end: idx + targetText.length };
  }

  return notFound;
}

/**
 * Finds where to insert deletion markup in the post-edit file.
 * Uses context_before and context_after to locate the deletion point.
 * Returns the character index where the deletion markup should be inserted,
 * or -1 if the position cannot be determined.
 */
export function findDeletionInsertionPoint(
  fileContent: string,
  edit: EditContext,
): number {
  // Strategy 1: use both context_before and context_after
  if (edit.context_before && edit.context_after) {
    const combined = edit.context_before + edit.context_after;
    let idx = fileContent.indexOf(combined);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx + edit.context_before.length;
    }
  }

  // Strategy 2: use context_before only
  if (edit.context_before) {
    let idx = fileContent.indexOf(edit.context_before);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, edit.context_before, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx + edit.context_before.length;
    }
  }

  // Strategy 3: use context_after only
  if (edit.context_after) {
    let idx = fileContent.indexOf(edit.context_after);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, edit.context_after, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx;
    }
  }

  return -1;
}
