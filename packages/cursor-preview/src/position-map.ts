import type { TextNodeEntry, TextNodePosition } from './types.js';

/**
 * Walk the DOM tree depth-first, collecting all Text nodes.
 * Uses manual recursion instead of TreeWalker for happy-dom compatibility.
 */
function collectTextNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node as Text);
    return;
  }
  let child = node.firstChild;
  while (child) {
    collectTextNodes(child, out);
    child = child.nextSibling;
  }
}

/**
 * Build a position map: for each Text node under `container`, record its
 * globalStart/globalEnd offsets in the concatenated text content.
 */
export function buildPositionMap(container: Element): TextNodeEntry[] {
  const textNodes: Text[] = [];
  collectTextNodes(container, textNodes);
  const entries: TextNodeEntry[] = [];
  let globalOffset = 0;
  for (const node of textNodes) {
    const len = node.textContent?.length ?? 0;
    entries.push({ node, globalStart: globalOffset, globalEnd: globalOffset + len });
    globalOffset += len;
  }
  return entries;
}

/**
 * Resolve a global text offset to a specific Text node + local offset.
 * At exact boundaries (globalOffset === entry.globalEnd), resolves to
 * offset 0 of the next node.
 */
export function resolvePosition(globalOffset: number, map: TextNodeEntry[]): TextNodePosition {
  for (const entry of map) {
    if (globalOffset < entry.globalEnd) {
      return { node: entry.node, offset: globalOffset - entry.globalStart };
    }
  }
  // Past the end: clamp to end of last node
  const last = map[map.length - 1];
  return { node: last.node, offset: last.globalEnd - last.globalStart };
}

/**
 * Concatenate the text content of all entries in the position map.
 */
export function collectText(map: TextNodeEntry[]): string {
  return map.map(e => e.node.textContent ?? '').join('');
}
