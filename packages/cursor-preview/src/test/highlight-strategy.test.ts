import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightStrategy } from '../highlight-strategy.js';
import { buildPositionMap } from '../position-map.js';
import { scanCriticMarkup } from '../scanner.js';
import type { TextNodeEntry } from '../types.js';

// Mock CSS Custom Highlight API (happy-dom lacks CSS.highlights and Highlight class)
class MockHighlight {
  ranges: Range[] = [];
  constructor(...ranges: Range[]) {
    this.ranges = [...ranges];
  }
  add(range: Range) { this.ranges.push(range); }
  clear() { this.ranges = []; }
}

const mockHighlightsMap = new Map<string, MockHighlight>();

beforeEach(() => {
  mockHighlightsMap.clear();
  (globalThis as any).Highlight = MockHighlight;
  (globalThis as any).CSS = {
    highlights: {
      set: (name: string, hl: MockHighlight) => mockHighlightsMap.set(name, hl),
      delete: (name: string) => mockHighlightsMap.delete(name),
      clear: () => mockHighlightsMap.clear(),
    },
  };
});

describe('HighlightStrategy', () => {
  it('implements RenderStrategy interface', () => {
    const strategy = new HighlightStrategy();
    expect(strategy.name).toBe('css-highlight-api');
    expect(typeof strategy.apply).toBe('function');
    expect(typeof strategy.clear).toBe('function');
  });

  it('reports availability based on CSS.highlights presence', () => {
    const strategy = new HighlightStrategy();
    expect(strategy.isAvailable()).toBe(true);
  });

  it('reports unavailable when CSS.highlights is missing', () => {
    (globalThis as any).CSS = {};
    const strategy = new HighlightStrategy();
    expect(strategy.isAvailable()).toBe(false);
  });

  it('creates highlight entries for insertion content and delimiters', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello {++world++}!';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Hello {++world++}!');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-ins-content')).toBe(true);
    expect(mockHighlightsMap.has('ct-ins-delim')).toBe(true);
    expect(mockHighlightsMap.get('ct-ins-content')!.ranges).toHaveLength(1);
    // Two delimiter ranges: {++ and ++}
    expect(mockHighlightsMap.get('ct-ins-delim')!.ranges).toHaveLength(2);
  });

  it('creates highlight entries for deletion', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello {--world--}!';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Hello {--world--}!');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-del-content')).toBe(true);
    expect(mockHighlightsMap.has('ct-del-delim')).toBe(true);
    expect(mockHighlightsMap.get('ct-del-content')!.ranges).toHaveLength(1);
    expect(mockHighlightsMap.get('ct-del-delim')!.ranges).toHaveLength(2);
  });

  it('creates highlight entries for substitution (old + new + separator)', () => {
    const container = document.createElement('div');
    container.textContent = '{~~old~>new~~}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{~~old~>new~~}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-sub-old')).toBe(true);
    expect(mockHighlightsMap.has('ct-sub-new')).toBe(true);
    expect(mockHighlightsMap.has('ct-sub-delim')).toBe(true);
    // old-content: 1 range
    expect(mockHighlightsMap.get('ct-sub-old')!.ranges).toHaveLength(1);
    // new-content: 1 range
    expect(mockHighlightsMap.get('ct-sub-new')!.ranges).toHaveLength(1);
    // delimiters: open {~~, separator ~>, close ~~} = 3 ranges
    expect(mockHighlightsMap.get('ct-sub-delim')!.ranges).toHaveLength(3);
  });

  it('creates highlight entries for highlight markup', () => {
    const container = document.createElement('div');
    container.textContent = 'Some {==important==} text';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Some {==important==} text');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-hl-content')).toBe(true);
    expect(mockHighlightsMap.has('ct-hl-delim')).toBe(true);
  });

  it('creates highlight entries for comment markup', () => {
    const container = document.createElement('div');
    container.textContent = 'Text {>>note<<}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Text {>>note<<}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-cmt-content')).toBe(true);
    expect(mockHighlightsMap.has('ct-cmt-delim')).toBe(true);
  });

  it('creates highlight entry for footnote reference', () => {
    const container = document.createElement('div');
    container.textContent = 'Changed text[^ct-1]';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Changed text[^ct-1]');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    expect(mockHighlightsMap.has('ct-fnref')).toBe(true);
    expect(mockHighlightsMap.get('ct-fnref')!.ranges).toHaveLength(1);
  });

  it('clears previous highlights on clear()', () => {
    const container = document.createElement('div');
    container.textContent = '{++a++}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{++a++}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);
    expect(mockHighlightsMap.size).toBeGreaterThan(0);

    strategy.clear();
    expect(mockHighlightsMap.size).toBe(0);
  });

  it('handles empty matches gracefully', () => {
    const container = document.createElement('div');
    container.textContent = 'No markup here';
    const map = buildPositionMap(container);

    const strategy = new HighlightStrategy();
    strategy.apply(container, [], map);

    // No highlight entries created for empty matches
    expect(mockHighlightsMap.size).toBe(0);
  });

  it('handles empty position map gracefully', () => {
    const container = document.createElement('div');
    container.textContent = '{++a++}';
    const matches = scanCriticMarkup('{++a++}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, []);

    // No highlights created when position map is empty
    expect(mockHighlightsMap.size).toBe(0);
  });

  it('accumulates ranges from multiple matches of the same type', () => {
    const container = document.createElement('div');
    container.textContent = '{++first++} and {++second++}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{++first++} and {++second++}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);

    // Two insertion content ranges
    expect(mockHighlightsMap.get('ct-ins-content')!.ranges).toHaveLength(2);
    // Four delimiter ranges (2 per insertion: open + close)
    expect(mockHighlightsMap.get('ct-ins-delim')!.ranges).toHaveLength(4);
  });

  it('clears old highlights before re-applying', () => {
    const container = document.createElement('div');
    container.textContent = '{++a++}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{++a++}');

    const strategy = new HighlightStrategy();
    strategy.apply(container, matches, map);
    expect(mockHighlightsMap.get('ct-ins-content')!.ranges).toHaveLength(1);

    // Re-apply with new content
    const container2 = document.createElement('div');
    container2.textContent = '{++x++} {++y++}';
    const map2 = buildPositionMap(container2);
    const matches2 = scanCriticMarkup('{++x++} {++y++}');

    strategy.apply(container2, matches2, map2);
    // Should have 2 content ranges, not 3 (old one cleared)
    expect(mockHighlightsMap.get('ct-ins-content')!.ranges).toHaveLength(2);
  });
});
