import * as assert from 'assert';
import { findContainingHiddenRange } from '../../hidden-range-search';

/**
 * NavigationManager unit tests.
 *
 * The manager's methods largely depend on VS Code APIs (TextEditor, Selection, etc.)
 * which are unavailable in the unit test context. These tests cover the pure logic
 * that can be tested without VS Code: the snap direction algorithm, wrap-around
 * navigation logic, and hidden range search.
 */

suite('NavigationManager', () => {
    // ── Snap cursor logic (pure functions) ────────────────────────────────

    suite('snapCursorPastHiddenRanges (snap logic)', () => {
        /**
         * Simulates the snap algorithm from NavigationManager.snapCursorPastHiddenRanges:
         * given a cursor offset, previous offset (direction), and hidden ranges,
         * compute the snapped target offset.
         */
        function computeSnapTarget(
            cursorOffset: number,
            prevOffset: number,
            hiddenRanges: ReadonlyArray<{ start: number; end: number }>
        ): number {
            const forward = cursorOffset >= prevOffset;
            let target = cursorOffset;
            for (let i = 0; i < 10; i++) {
                const range = findContainingHiddenRange(hiddenRanges, target);
                if (!range) break;
                target = forward || range.start === 0 ? range.end : range.start - 1;
            }
            return target;
        }

        test('cursor outside hidden ranges is not snapped', () => {
            const ranges = [{ start: 10, end: 20 }, { start: 30, end: 40 }];
            assert.strictEqual(computeSnapTarget(5, 3, ranges), 5);
            assert.strictEqual(computeSnapTarget(25, 20, ranges), 25);
            assert.strictEqual(computeSnapTarget(50, 45, ranges), 50);
        });

        test('forward movement snaps to end of hidden range', () => {
            const ranges = [{ start: 10, end: 20 }];
            // Moving forward from offset 5 to offset 12 (inside hidden range)
            assert.strictEqual(computeSnapTarget(12, 5, ranges), 20);
        });

        test('backward movement snaps to start - 1 of hidden range', () => {
            const ranges = [{ start: 10, end: 20 }];
            // Moving backward from offset 25 to offset 15 (inside hidden range)
            assert.strictEqual(computeSnapTarget(15, 25, ranges), 9);
        });

        test('backward movement at offset 0 snaps forward', () => {
            const ranges = [{ start: 0, end: 10 }];
            // Range starts at 0, so backward snap would go to -1 — snap forward instead
            assert.strictEqual(computeSnapTarget(5, 10, ranges), 10);
        });

        test('adjacent hidden ranges: forward chains through multiple ranges', () => {
            // Two adjacent hidden ranges: [10,20) and [20,30)
            const ranges = [{ start: 10, end: 20 }, { start: 20, end: 30 }];
            // Moving forward into first range — snaps to 20, which is in second range, snaps to 30
            assert.strictEqual(computeSnapTarget(15, 5, ranges), 30);
        });

        test('no hidden ranges returns cursor unchanged', () => {
            assert.strictEqual(computeSnapTarget(42, 30, []), 42);
        });

        test('cursor at exclusive end of range is not inside (half-open)', () => {
            const ranges = [{ start: 10, end: 20 }];
            // offset 20 is NOT inside [10, 20)
            assert.strictEqual(computeSnapTarget(20, 15, ranges), 20);
        });

        test('cursor at start of range IS inside (half-open)', () => {
            const ranges = [{ start: 10, end: 20 }];
            // offset 10 IS inside [10, 20)
            assert.strictEqual(computeSnapTarget(10, 5, ranges), 20);
        });
    });

    // ── Navigation wrap-around logic ──────────────────────────────────────

    suite('nextChange wrap-around logic', () => {
        /**
         * Simulates the findNext logic from NavigationManager.nextChange:
         * find first change with range.start > cursorOffset, or wrap to first.
         */
        function findNextTarget(
            changes: Array<{ start: number }>,
            cursorOffset: number
        ): { index: number; wrapped: boolean } {
            const idx = changes.findIndex(c => c.start > cursorOffset);
            if (idx >= 0) return { index: idx, wrapped: false };
            return { index: 0, wrapped: true };
        }

        test('finds next change after cursor', () => {
            const changes = [{ start: 0 }, { start: 20 }, { start: 40 }];
            const result = findNextTarget(changes, 10);
            assert.strictEqual(result.index, 1);
            assert.strictEqual(result.wrapped, false);
        });

        test('wraps to first when cursor is past last change', () => {
            const changes = [{ start: 0 }, { start: 20 }, { start: 40 }];
            const result = findNextTarget(changes, 50);
            assert.strictEqual(result.index, 0);
            assert.strictEqual(result.wrapped, true);
        });

        test('cursor exactly at change start finds next change', () => {
            const changes = [{ start: 0 }, { start: 20 }, { start: 40 }];
            // cursor at 20, next is 40 (range.start > 20)
            const result = findNextTarget(changes, 20);
            assert.strictEqual(result.index, 2);
            assert.strictEqual(result.wrapped, false);
        });
    });

    suite('previousChange wrap-around logic', () => {
        /**
         * Simulates the findPrevious logic from NavigationManager.previousChange:
         * find last change with range.start < cursorOffset, or wrap to last.
         */
        function findPreviousTarget(
            changes: Array<{ start: number }>,
            cursorOffset: number
        ): { index: number; wrapped: boolean } {
            for (let i = changes.length - 1; i >= 0; i--) {
                if (changes[i].start < cursorOffset) {
                    return { index: i, wrapped: false };
                }
            }
            return { index: changes.length - 1, wrapped: true };
        }

        test('finds previous change before cursor', () => {
            const changes = [{ start: 0 }, { start: 20 }, { start: 40 }];
            const result = findPreviousTarget(changes, 30);
            assert.strictEqual(result.index, 1);
            assert.strictEqual(result.wrapped, false);
        });

        test('wraps to last when cursor is before first change', () => {
            const changes = [{ start: 10 }, { start: 20 }, { start: 40 }];
            const result = findPreviousTarget(changes, 5);
            assert.strictEqual(result.index, 2);
            assert.strictEqual(result.wrapped, true);
        });

        test('cursor exactly at change start finds earlier change', () => {
            const changes = [{ start: 0 }, { start: 20 }, { start: 40 }];
            // cursor at 20, previous is 0 (range.start < 20)
            const result = findPreviousTarget(changes, 20);
            assert.strictEqual(result.index, 0);
            assert.strictEqual(result.wrapped, false);
        });
    });

    // ── jumpToFootnoteInEditor pattern matching ───────────────────────────

    suite('footnote pattern matching', () => {
        test('finds footnote definition by changeId', () => {
            const text = 'Some text\n\n[^cn-1]: type=insertion; author=Alice; date=2026-03-23\n';
            const pattern = `[^cn-1]:`;
            const idx = text.indexOf(pattern);
            assert.ok(idx >= 0, 'should find footnote pattern');
            assert.strictEqual(idx, 11); // after 'Some text\n\n'
        });

        test('returns -1 when footnote not found', () => {
            const text = 'Some text with no footnotes';
            const pattern = `[^cn-99]:`;
            const idx = text.indexOf(pattern);
            assert.strictEqual(idx, -1);
        });
    });
});
