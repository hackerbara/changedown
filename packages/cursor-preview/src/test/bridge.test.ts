import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectStrategy, scanAndRender } from '../bridge.js';
import { HighlightStrategy } from '../highlight-strategy.js';
import { DomMutationStrategy } from '../dom-strategy.js';

beforeEach(() => {
  (globalThis as any).Highlight = class { ranges: Range[] = []; add(r: Range) { this.ranges.push(r); } clear() { this.ranges = []; } };
  (globalThis as any).CSS = {
    highlights: { set: vi.fn(), delete: vi.fn(), clear: vi.fn() },
  };
});

afterEach(() => {
  delete (globalThis as any).Highlight;
  delete (globalThis as any).CSS;
});

describe('selectStrategy', () => {
  it('returns HighlightStrategy when CSS.highlights is available', () => {
    const strategy = selectStrategy();
    expect(strategy.name).toBe('css-highlight-api');
  });

  it('returns DomMutationStrategy when CSS.highlights is missing', () => {
    delete (globalThis as any).CSS;
    const strategy = selectStrategy();
    expect(strategy.name).toBe('dom-mutation');
  });
});

describe('scanAndRender', () => {
  it('scans container text and applies strategy', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello {++world++}!';

    const mockStrategy = {
      name: 'mock',
      apply: vi.fn(),
      clear: vi.fn(),
    };

    scanAndRender(container, mockStrategy);

    expect(mockStrategy.apply).toHaveBeenCalledOnce();
    const [el, matches, map] = mockStrategy.apply.mock.calls[0];
    expect(el).toBe(container);
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('insertion');
  });

  it('does nothing for containers with no CriticMarkup', () => {
    const container = document.createElement('div');
    container.textContent = 'Plain text';

    const mockStrategy = {
      name: 'mock',
      apply: vi.fn(),
      clear: vi.fn(),
    };

    scanAndRender(container, mockStrategy);

    expect(mockStrategy.apply).toHaveBeenCalledWith(container, [], expect.any(Array));
  });
});
