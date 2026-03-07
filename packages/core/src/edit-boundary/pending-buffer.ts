/**
 * Edit Boundary State Machine — Pending Buffer Operations
 *
 * Pure functions that transform PendingBuffer values.
 * No mutation, no side effects — every function returns a new buffer (or null).
 */

import type { PendingBuffer } from './types.js';

// ── Query ───────────────────────────────────────────────────────────────

/** True when the buffer has no content in either field. */
export function isEmpty(buf: PendingBuffer): boolean {
  return buf.currentText.length === 0 && buf.originalText.length === 0;
}

/** End offset of the buffer in document coordinates. */
export function bufferEnd(buf: PendingBuffer): number {
  return buf.anchorOffset + buf.currentText.length;
}

/** Check whether a document offset falls within [anchorOffset, anchorOffset + currentText.length). */
export function containsOffset(buf: PendingBuffer, offset: number): boolean {
  return offset >= buf.anchorOffset && offset < bufferEnd(buf);
}

/**
 * Check whether a document offset is at or within the buffer range,
 * inclusive of the end position (for cursor placement after last char).
 */
export function containsOffsetInclusive(buf: PendingBuffer, offset: number): boolean {
  return offset >= buf.anchorOffset && offset <= bufferEnd(buf);
}

// ── Extend (insertion at region end) ─────────────────────────────────

/**
 * Append text at the end of the buffer (typing at the cursor, which is at the end).
 *
 * Precondition: insertion is at `anchorOffset + currentText.length` (i.e. at buffer end).
 */
export function extend(buf: PendingBuffer, insertedText: string, now: number): PendingBuffer {
  return {
    ...buf,
    currentText: buf.currentText + insertedText,
    cursorOffset: buf.cursorOffset + insertedText.length,
    lastEditTime: now,
  };
}

// ── Extend Original (deletion adjacent to region) ────────────────────

/**
 * Prepend deleted text to originalText and shift anchor backward.
 * Used for backspace adjacent before the editing region.
 */
export function prependOriginal(buf: PendingBuffer, text: string, now: number): PendingBuffer {
  return {
    ...buf,
    anchorOffset: buf.anchorOffset - text.length,
    originalText: text + buf.originalText,
    lastEditTime: now,
  };
}

/**
 * Append deleted text to originalText (forward delete at region end).
 * Anchor doesn't move because the deleted text was after currentText.
 */
export function appendOriginal(buf: PendingBuffer, text: string, now: number): PendingBuffer {
  return {
    ...buf,
    originalText: buf.originalText + text,
    lastEditTime: now,
  };
}

// ── Splice (Insert) ────────────────────────────────────────────────────

/**
 * Insert text at an arbitrary position within the buffer.
 *
 * @param docOffset - Absolute document offset where the insertion occurs.
 *   Must be within [anchorOffset, anchorOffset + currentText.length).
 */
export function spliceInsert(
  buf: PendingBuffer,
  docOffset: number,
  insertedText: string,
  now: number,
): PendingBuffer {
  const relOffset = docOffset - buf.anchorOffset;
  if (relOffset < 0 || relOffset > buf.currentText.length) {
    throw new RangeError(`spliceInsert out of bounds: relOffset=${relOffset}, buffer length=${buf.currentText.length}`);
  }
  const before = buf.currentText.slice(0, relOffset);
  const after = buf.currentText.slice(relOffset);
  return {
    ...buf,
    currentText: before + insertedText + after,
    cursorOffset: relOffset + insertedText.length,
    lastEditTime: now,
  };
}

// ── Splice (Delete) ────────────────────────────────────────────────────

/**
 * Delete characters within the buffer's currentText.
 *
 * @param docOffset - Absolute document offset where deletion starts.
 *   Must be within [anchorOffset, anchorOffset + currentText.length).
 * @param deleteLength - Number of characters to delete.
 *
 * Returns null if both currentText and originalText become empty after deletion.
 * Returns buffer with empty currentText if originalText still has content.
 */
export function spliceDelete(
  buf: PendingBuffer,
  docOffset: number,
  deleteLength: number,
  now: number,
): PendingBuffer | null {
  const relOffset = docOffset - buf.anchorOffset;
  const relEnd = relOffset + deleteLength;
  if (relOffset < 0 || relEnd > buf.currentText.length) {
    throw new RangeError(`spliceDelete out of bounds: rel=[${relOffset}, ${relEnd}), buffer length=${buf.currentText.length}`);
  }
  const before = buf.currentText.slice(0, relOffset);
  const after = buf.currentText.slice(relEnd);
  const newCurrentText = before + after;

  if (newCurrentText.length === 0 && buf.originalText.length === 0) {
    return null;
  }

  return {
    ...buf,
    currentText: newCurrentText,
    cursorOffset: relOffset,
    lastEditTime: now,
  };
}

// ── Create ──────────────────────────────────────────────────────────────

/**
 * Create a new PendingBuffer for a fresh edit.
 */
export function createBuffer(
  anchorOffset: number,
  currentText: string,
  originalText: string,
  now: number,
  scId?: string,
): PendingBuffer {
  return {
    anchorOffset,
    currentText,
    originalText,
    cursorOffset: currentText.length,
    startTime: now,
    lastEditTime: now,
    scId,
  };
}
