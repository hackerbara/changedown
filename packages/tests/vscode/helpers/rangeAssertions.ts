import * as assert from 'assert';
import { RecordedDecoration } from './SpyEditor';

/**
 * Assert that a decoration list contains at least one range matching the given coordinates.
 * Coordinates: (startLine, startChar, endLine, endChar)
 */
export function assertHasRange(
    decorations: RecordedDecoration[],
    startLine: number, startChar: number,
    endLine: number, endChar: number,
    message?: string
): void {
    const match = decorations.find(d =>
        d.range.start.line === startLine &&
        d.range.start.character === startChar &&
        d.range.end.line === endLine &&
        d.range.end.character === endChar
    );

    if (!match) {
        const actual = decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ');
        assert.fail(
            `${message || 'Range not found'}: expected (${startLine}:${startChar})-(${endLine}:${endChar}) in [${actual}]`
        );
    }
}

/**
 * Assert that a decoration list has exactly N entries.
 */
export function assertCount(
    decorations: RecordedDecoration[],
    expected: number,
    label: string
): void {
    assert.strictEqual(
        decorations.length,
        expected,
        `${label}: expected ${expected} decorations, got ${decorations.length}. ` +
        `Ranges: ${decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ')}`
    );
}

/**
 * Assert that a decoration list is empty.
 */
export function assertEmpty(decorations: RecordedDecoration[], label: string): void {
    assertCount(decorations, 0, label);
}

/**
 * Assert a zero-width range (used for icon positions).
 */
export function assertPointRange(
    decorations: RecordedDecoration[],
    line: number, char: number,
    message?: string
): void {
    assertHasRange(decorations, line, char, line, char, message);
}

/**
 * Assert a decoration has a hover message containing the given text.
 */
export function assertHoverContains(
    decorations: RecordedDecoration[],
    index: number,
    expectedText: string,
    message?: string
): void {
    const dec = decorations[index];
    assert.ok(dec, `${message || 'Decoration'} at index ${index} does not exist`);
    assert.ok(dec.hoverMessage, `${message || 'Decoration'} at index ${index} has no hoverMessage`);
    assert.ok(
        dec.hoverMessage!.value.includes(expectedText),
        `${message || 'Hover message'} does not contain "${expectedText}". Actual: "${dec.hoverMessage!.value}"`
    );
}
