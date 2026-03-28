/**
 * View-surface mapping for view-aware matching.
 *
 * When agents read a view (settled, committed, review), they see text
 * without certain tokens (footnote refs, resolved CriticMarkup, etc.).
 * When they send old_text, we need to match against what they saw,
 * then map back to raw file positions.
 *
 * This module strips "invisible tokens" from raw text and builds a
 * position map from stripped offsets to raw offsets.
 */

export interface ViewSurfaceMap {
  /** The text with invisible tokens stripped */
  surface: string;
  /** Position map: surface index -> raw index. Length = surface.length + 1 (end sentinel) */
  toRaw: number[];
}

/**
 * Builds a view surface map by stripping footnote references.
 * Returns the stripped text and a position map from stripped indices to raw indices.
 *
 * The position map follows the same pattern as buildWhitespaceCollapseMap
 * in text-normalizer.ts -- each entry maps a stripped-text
 * offset to its corresponding raw-text offset.
 */
export function buildViewSurfaceMap(raw: string): ViewSurfaceMap {
  const toRaw: number[] = [];
  let surface = '';
  let i = 0;

  while (i < raw.length) {
    // Check for footnote ref at current position
    const slice = raw.slice(i);
    const refMatch = slice.match(/^\[\^cn-\d+(?:\.\d+)?\]/);
    if (refMatch) {
      i += refMatch[0].length; // Skip entire ref, emit nothing
      continue;
    }

    // Plain character: 1:1 mapping
    toRaw.push(i);
    surface += raw[i];
    i++;
  }
  toRaw.push(i); // End sentinel

  return { surface, toRaw };
}

export interface ViewAwareMatch {
  /** Start index in RAW text */
  index: number;
  /** Length in RAW text (includes any footnote refs within the span) */
  length: number;
  /** The actual raw text at the match position */
  rawText: string;
}

/**
 * Finds a unique match for `target` in `raw` text, transparently
 * skipping footnote references. Returns raw-space coordinates.
 *
 * Returns null if:
 * - Target not found in stripped text
 * - Target matches multiple locations (ambiguous)
 */
export function viewAwareFind(raw: string, target: string): ViewAwareMatch | null {
  const { surface, toRaw } = buildViewSurfaceMap(raw);

  // Also strip refs from target (agent may have included them from view output)
  const cleanTarget = target.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, '');
  const searchTarget = cleanTarget || target; // fallback if stripping empties it

  // Find target in stripped surface
  const firstIdx = surface.indexOf(searchTarget);
  if (firstIdx === -1) return null;

  // Check uniqueness
  const secondIdx = surface.indexOf(searchTarget, firstIdx + 1);
  if (secondIdx !== -1) return null; // Ambiguous

  // Map back to raw coordinates
  const rawStart = toRaw[firstIdx]!;
  const rawEnd = toRaw[firstIdx + searchTarget.length]!;
  const rawLength = rawEnd - rawStart;

  return {
    index: rawStart,
    length: rawLength,
    rawText: raw.slice(rawStart, rawEnd),
  };
}
