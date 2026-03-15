/**
 * Binary search for a hidden range containing the given offset.
 * Ranges must be sorted by start and non-overlapping.
 * Uses half-open interval semantics: [start, end).
 *
 * A cursor at `range.start` IS inside (hidden opening delimiter).
 * A cursor at `range.end` is NOT inside (first visible char after range).
 */
export function findContainingHiddenRange(
    ranges: ReadonlyArray<{start: number; end: number}>,
    offset: number
): {start: number; end: number} | undefined {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const r = ranges[mid];
        if (offset < r.start) {
            hi = mid - 1;
        } else if (offset >= r.end) {
            lo = mid + 1;
        } else {
            return r; // offset >= r.start && offset < r.end
        }
    }
    return undefined;
}
