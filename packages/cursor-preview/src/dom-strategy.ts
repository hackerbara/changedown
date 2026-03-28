import type { RenderStrategy, ScanMatch, TextNodeEntry, MatchRegion } from './types.js';
import { resolvePosition } from './position-map.js';

/**
 * Maps match type + region role to the CSS class applied to the wrapping span.
 * Delimiter regions get 'cn-delim' across all types (hidden via CSS).
 */
const ROLE_TO_CLASS: Record<string, Record<string, string>> = {
  insertion:      { content: 'cn-ins', 'open-delim': 'cn-delim', 'close-delim': 'cn-delim' },
  deletion:       { content: 'cn-del', 'open-delim': 'cn-delim', 'close-delim': 'cn-delim' },
  substitution:   { 'old-content': 'cn-sub-old', 'new-content': 'cn-sub-new', 'open-delim': 'cn-delim', 'close-delim': 'cn-delim', separator: 'cn-delim' },
  highlight:      { content: 'cn-hl', 'open-delim': 'cn-delim', 'close-delim': 'cn-delim' },
  comment:        { content: 'cn-cmt', 'open-delim': 'cn-delim', 'close-delim': 'cn-delim' },
  'footnote-ref': { content: 'cn-fnref' },
};

/**
 * Fallback rendering strategy that wraps CriticMarkup regions in <span> elements
 * with CSS classes. Used when the CSS Custom Highlight API is unavailable.
 *
 * Regions are processed in reverse document order so that DOM mutations (text node
 * splitting) don't invalidate offsets for regions that appear earlier in the text.
 */
export class DomMutationStrategy implements RenderStrategy {
  readonly name = 'dom-mutation';
  private originalHTML: string = '';
  private container: Element | null = null;

  apply(container: Element, matches: ScanMatch[], positionMap: TextNodeEntry[]): void {
    this.container = container;
    this.originalHTML = container.innerHTML;
    if (matches.length === 0 || positionMap.length === 0) return;

    // Collect all regions with their class names, sorted reverse by start offset
    const allRegions: Array<{ matchType: string; region: MatchRegion }> = [];
    for (const match of matches) {
      for (const region of match.regions) {
        allRegions.push({ matchType: match.type, region });
      }
    }
    allRegions.sort((a, b) => b.region.start - a.region.start);

    for (const { matchType, region } of allRegions) {
      const className = ROLE_TO_CLASS[matchType]?.[region.role];
      if (!className) continue;
      try {
        const startPos = resolvePosition(region.start, positionMap);
        const endPos = resolvePosition(region.end, positionMap);
        if (startPos.node === endPos.node) {
          this.wrapTextRange(startPos.node, startPos.offset, endPos.offset, className);
        }
      } catch {
        // Skip regions that can't be resolved (e.g., stale position map)
      }
    }
  }

  clear(): void {
    if (this.container && this.originalHTML) {
      this.container.innerHTML = this.originalHTML;
      this.originalHTML = '';
    }
  }

  /**
   * Wrap a range within a single text node in a <span> with the given class.
   * Uses Range.surroundContents() which splits the text node as needed.
   */
  private wrapTextRange(textNode: Text, startOffset: number, endOffset: number, className: string): void {
    const text = textNode.textContent ?? '';
    if (startOffset >= text.length || endOffset > text.length) return;
    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);
    const span = document.createElement('span');
    span.className = className;
    range.surroundContents(span);
  }
}
