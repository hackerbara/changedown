import { describe, it, expect, beforeEach } from 'vitest';
import { DomMutationStrategy } from '../dom-strategy.js';
import { buildPositionMap } from '../position-map.js';
import { scanCriticMarkup } from '../scanner.js';

describe('DomMutationStrategy', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('wraps insertion content in a span.cn-ins', () => {
    container.textContent = 'Hello {++world++}!';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Hello {++world++}!');
    const strategy = new DomMutationStrategy();
    strategy.apply(container, matches, map);
    const span = container.querySelector('.cn-ins');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('world');
  });

  it('wraps deletion content in a span.cn-del', () => {
    container.textContent = 'Hello {--world--}!';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Hello {--world--}!');
    const strategy = new DomMutationStrategy();
    strategy.apply(container, matches, map);
    const span = container.querySelector('.cn-del');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('world');
  });

  it('hides delimiters', () => {
    container.textContent = 'Hello {++world++}!';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('Hello {++world++}!');
    const strategy = new DomMutationStrategy();
    strategy.apply(container, matches, map);
    const delims = container.querySelectorAll('.cn-delim');
    expect(delims.length).toBe(2);
    for (const d of delims) {
      expect(d.textContent).toMatch(/\{\+\+|\+\+\}/);
    }
  });

  it('handles substitution with old and new spans', () => {
    container.textContent = '{~~old~>new~~}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{~~old~>new~~}');
    const strategy = new DomMutationStrategy();
    strategy.apply(container, matches, map);
    expect(container.querySelector('.cn-sub-old')).not.toBeNull();
    expect(container.querySelector('.cn-sub-new')).not.toBeNull();
    expect(container.querySelector('.cn-sub-old')!.textContent).toBe('old');
    expect(container.querySelector('.cn-sub-new')!.textContent).toBe('new');
  });

  it('clears previous mutations on re-apply', () => {
    container.textContent = '{++a++}';
    const map = buildPositionMap(container);
    const matches = scanCriticMarkup('{++a++}');
    const strategy = new DomMutationStrategy();
    strategy.apply(container, matches, map);
    expect(container.querySelector('.cn-ins')).not.toBeNull();
    strategy.clear();
    expect(container.querySelector('.cn-ins')).toBeNull();
  });
});
