import type { RenderStrategy, ScanMatch, TextNodeEntry, MatchRegion } from './types.js';
import { resolvePosition } from './position-map.js';

/**
 * Maps highlight key names to the match types and region roles they cover.
 * Each key becomes a CSS Custom Highlight registered via CSS.highlights.set().
 * Stylesheet targets these with ::highlight(cn-ins-content), etc.
 */
const HIGHLIGHT_NAMES: Record<string, { types: string[]; roles: string[] }> = {
  'cn-ins-content': { types: ['insertion'], roles: ['content'] },
  'cn-ins-delim':   { types: ['insertion'], roles: ['open-delim', 'close-delim'] },
  'cn-del-content': { types: ['deletion'], roles: ['content'] },
  'cn-del-delim':   { types: ['deletion'], roles: ['open-delim', 'close-delim'] },
  'cn-sub-old':     { types: ['substitution'], roles: ['old-content'] },
  'cn-sub-new':     { types: ['substitution'], roles: ['new-content'] },
  'cn-sub-delim':   { types: ['substitution'], roles: ['open-delim', 'close-delim', 'separator'] },
  'cn-hl-content':  { types: ['highlight'], roles: ['content'] },
  'cn-hl-delim':    { types: ['highlight'], roles: ['open-delim', 'close-delim'] },
  'cn-cmt-content': { types: ['comment'], roles: ['content'] },
  'cn-cmt-delim':   { types: ['comment'], roles: ['open-delim', 'close-delim'] },
  'cn-fnref':       { types: ['footnote-ref'], roles: ['content'] },
};

const ALL_HIGHLIGHT_KEYS = Object.keys(HIGHLIGHT_NAMES);

/**
 * Rendering strategy using the CSS Custom Highlight API.
 *
 * Creates named highlights (cn-ins-content, cn-del-delim, etc.) and registers
 * them via CSS.highlights. A companion stylesheet targets these names with
 * ::highlight() pseudo-elements to apply colors and text-decoration.
 *
 * This is the preferred strategy in browsers that support CSS.highlights (Chrome 105+).
 * Falls back to DOM mutation strategy when unavailable.
 */
export class HighlightStrategy implements RenderStrategy {
  readonly name = 'css-highlight-api';

  /** Check whether the CSS Custom Highlight API is available in this environment. */
  isAvailable(): boolean {
    return typeof CSS !== 'undefined' && 'highlights' in CSS;
  }

  apply(container: Element, matches: ScanMatch[], positionMap: TextNodeEntry[]): void {
    this.clear();
    if (matches.length === 0 || positionMap.length === 0) return;

    // Accumulate ranges grouped by highlight key
    const rangesMap = new Map<string, Range[]>();
    for (const key of ALL_HIGHLIGHT_KEYS) {
      rangesMap.set(key, []);
    }

    for (const match of matches) {
      for (const region of match.regions) {
        const highlightKey = resolveHighlightKey(match.type, region.role);
        if (!highlightKey) continue;
        const range = createRange(region, positionMap);
        if (range) {
          rangesMap.get(highlightKey)!.push(range);
        }
      }
    }

    // Register non-empty highlights
    for (const [key, ranges] of rangesMap) {
      if (ranges.length > 0) {
        const hl = new Highlight(...ranges);
        CSS.highlights.set(key, hl);
      }
    }
  }

  clear(): void {
    for (const key of ALL_HIGHLIGHT_KEYS) {
      CSS.highlights.delete(key);
    }
  }
}

/** Resolve a match type + region role to the correct highlight key name. */
function resolveHighlightKey(matchType: string, regionRole: string): string | undefined {
  for (const [key, spec] of Object.entries(HIGHLIGHT_NAMES)) {
    if (spec.types.includes(matchType) && spec.roles.includes(regionRole)) {
      return key;
    }
  }
  return undefined;
}

/** Create a DOM Range spanning a MatchRegion, using the position map. */
function createRange(region: MatchRegion, positionMap: TextNodeEntry[]): Range | null {
  try {
    const start = resolvePosition(region.start, positionMap);
    const end = resolvePosition(region.end, positionMap);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return null;
  }
}
