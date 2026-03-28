/**
 * Shared test utilities for @fast step definitions.
 */

import { CriticMarkupParser } from '@changedown/core';
import type { ChangeNode, TextEdit } from '@changedown/core';

/** Apply a single TextEdit to a string. */
export function applyEdit(text: string, edit: TextEdit): string {
    return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

/** Apply multiple TextEdits in reverse offset order (safe for overlapping ranges). */
export function applyEditsReverse(text: string, edits: TextEdit[]): string {
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    let result = text;
    for (const edit of sorted) {
        result = applyEdit(result, edit);
    }
    return result;
}

/**
 * Extract the status field from a footnote header line.
 * Footnote format: `[^cn-N]: @author | date | type | status`
 * Returns the status string (e.g., "proposed", "accepted", "rejected").
 */
export function extractFootnoteStatus(text: string, changeId?: string): string {
    const lines = text.split('\n');
    const pattern = changeId
        ? new RegExp(`^\\[\\^${changeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:`)
        : /^\[\^cn-\d+\]:/;
    const headerLine = lines.find(l => pattern.test(l.trim()));
    if (!headerLine) {
        throw new Error(`No footnote header line found${changeId ? ` for ${changeId}` : ''}.\nText:\n${text}`);
    }
    const fields = headerLine.split('|').map(f => f.trim());
    if (fields.length < 4) {
        throw new Error(`Footnote header has ${fields.length} fields, expected at least 4.\nLine: ${headerLine}`);
    }
    return fields[fields.length - 1];
}

/** Fixed test date for deterministic assertions across all @fast step files. */
export const TEST_DATE = '2026-03-09';

/** Find a ChangeNode by its cn-ID in parsed document text. */
export function findChangeById(text: string, changeId: string): ChangeNode | null {
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(text);
    const changes = vdoc.getChanges();
    return changes.find(c => c.id === changeId) ?? null;
}

/**
 * Extract the footnote block text for a specific change ID.
 * Returns the header line + all indented body lines as a single string.
 */
export function extractFootnoteBlock(text: string, changeId: string): string | null {
    const lines = text.split('\n');
    const escapedId = changeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerPattern = new RegExp(`^\\[\\^${escapedId}\\]:`);
    const headerIdx = lines.findIndex(l => headerPattern.test(l.trim()));
    if (headerIdx < 0) return null;

    const blockLines: string[] = [lines[headerIdx]];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        if (/^[\t ]/.test(lines[i])) {
            blockLines.push(lines[i]);
        } else if (lines[i].trim() === '') {
            blockLines.push(lines[i]);
        } else {
            break;
        }
    }
    return blockLines.join('\n');
}
