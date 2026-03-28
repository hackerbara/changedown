import { parseForFormat } from '../format-aware-parse.js';
import { nodeStatus, type ChangeNode } from '../model/types.js';
import type { DeliberationHeader, ViewName } from './three-zone-types.js';

const REF_EXTRACT_RE = /\[\^(cn-\d+(?:\.\d+)?)\]/g;

export interface BuildHeaderOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
  changes: ChangeNode[];
  lineRange?: { start: number; end: number; total: number };
}

export function buildDeliberationHeader(options: BuildHeaderOptions): DeliberationHeader {
  const { changes } = options;
  let proposed = 0, accepted = 0, rejected = 0, threadCount = 0;
  const authorSet = new Set<string>();

  for (const node of changes) {
    const status = nodeStatus(node);
    if (status === 'proposed') proposed++;
    else if (status === 'accepted') accepted++;
    else if (status === 'rejected') rejected++;
    if ((node.replyCount ?? 0) > 0) threadCount++;
    const author = node.metadata?.author ?? node.inlineMetadata?.author;
    if (author) authorSet.add(author);
  }

  return {
    filePath: options.filePath,
    trackingStatus: options.trackingStatus,
    protocolMode: options.protocolMode,
    defaultView: options.defaultView,
    viewPolicy: options.viewPolicy,
    counts: { proposed, accepted, rejected },
    authors: [...authorSet].sort(),
    threadCount,
    lineRange: options.lineRange,
  };
}

/**
 * Map line index (0-based) to Set of footnote IDs referenced on that line.
 * Scans raw lines for [^cn-N] patterns.
 */
export function buildLineRefMap(lines: string[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (let i = 0; i < lines.length; i++) {
    const refs = new Set<string>();
    for (const match of lines[i].matchAll(REF_EXTRACT_RE)) {
      refs.add(match[1]);
    }
    if (refs.size > 0) map.set(i, refs);
  }
  return map;
}

/**
 * Find the start and end line indices (0-based, inclusive) of the footnote section.
 * Returns null if no footnotes exist.
 */
export function findFootnoteSectionRange(changes: ChangeNode[]): [number, number] | null {
  if (changes.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const node of changes) {
    if (!node.footnoteLineRange) continue;
    if (node.footnoteLineRange.startLine < min) min = node.footnoteLineRange.startLine;
    if (node.footnoteLineRange.endLine > max) max = node.footnoteLineRange.endLine;
  }
  if (min === Infinity) return null;
  return [min, max];
}

/**
 * Compute which lines (0-indexed) are continuations of multi-line CriticMarkup
 * blocks. A continuation line is any line AFTER the first line of a multi-line
 * change — truncating before it would leave an opener without its closer.
 *
 * Uses the parser (not string matching) so it ignores false positives like
 * `{++` inside code blocks or JSON strings that have no matching `++}`.
 */
export function computeContinuationLines(content: string, preParsed?: ChangeNode[]): Set<number> {
  const changes = preParsed ?? parseForFormat(content).getChanges();
  if (changes.length === 0) return new Set();

  // Build line-start byte offset table
  const lineStarts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineStarts.push(i + 1);
  }

  function byteToLine(offset: number): number {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo; // 0-indexed
  }

  const continuations = new Set<number>();
  for (const change of changes) {
    const startLine = byteToLine(change.range.start);
    const endLine = byteToLine(change.range.end - 1);
    if (endLine > startLine) {
      for (let line = startLine + 1; line <= endLine; line++) {
        continuations.add(line);
      }
    }
  }

  return continuations;
}
