import { describe, it, expect, beforeEach } from 'vitest';
import { buildPositionMap, resolvePosition, collectText } from '../position-map.js';
import type { TextNodeEntry, TextNodePosition } from '../types.js';

describe('buildPositionMap', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('maps a single text node', () => {
    container.textContent = 'Hello world';
    const map = buildPositionMap(container);
    expect(map).toHaveLength(1);
    expect(map[0].globalStart).toBe(0);
    expect(map[0].globalEnd).toBe(11);
  });

  it('maps multiple text nodes across elements', () => {
    container.innerHTML = '<span>Hello </span><span>world</span>';
    const map = buildPositionMap(container);
    expect(map).toHaveLength(2);
    expect(map[0].globalStart).toBe(0);
    expect(map[0].globalEnd).toBe(6);
    expect(map[1].globalStart).toBe(6);
    expect(map[1].globalEnd).toBe(11);
  });

  it('handles nested elements', () => {
    container.innerHTML = '<p><strong>Bold</strong> text</p>';
    const map = buildPositionMap(container);
    expect(map).toHaveLength(2);
    expect(collectText(map)).toBe('Bold text');
  });

  it('skips empty text nodes', () => {
    container.innerHTML = '<span>A</span><span></span><span>B</span>';
    const map = buildPositionMap(container);
    const nonEmpty = map.filter(e => e.globalEnd > e.globalStart);
    expect(collectText(nonEmpty)).toBe('AB');
  });
});

describe('resolvePosition', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('resolves offset within a single text node', () => {
    container.textContent = 'Hello world';
    const map = buildPositionMap(container);
    const pos = resolvePosition(5, map);
    expect(pos.node).toBe(container.firstChild);
    expect(pos.offset).toBe(5);
  });

  it('resolves offset that crosses into second text node', () => {
    container.innerHTML = '<span>Hello </span><span>world</span>';
    const map = buildPositionMap(container);
    const pos = resolvePosition(8, map);
    expect(pos.node).toBe(container.querySelector('span:nth-child(2)')!.firstChild);
    expect(pos.offset).toBe(2);
  });

  it('resolves offset at exact node boundary', () => {
    container.innerHTML = '<span>ABC</span><span>DEF</span>';
    const map = buildPositionMap(container);
    const pos = resolvePosition(3, map);
    expect(pos.node).toBe(container.querySelector('span:nth-child(2)')!.firstChild);
    expect(pos.offset).toBe(0);
  });
});
