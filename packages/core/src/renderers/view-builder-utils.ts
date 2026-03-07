import { type FootnoteInfo } from '../footnote-parser.js';
import type { DeliberationHeader, ViewName } from './three-zone-types.js';

const REF_EXTRACT_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;

export interface BuildHeaderOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
  footnotes: Map<string, FootnoteInfo>;
  lineRange?: { start: number; end: number; total: number };
}

export function buildDeliberationHeader(options: BuildHeaderOptions): DeliberationHeader {
  const { footnotes } = options;
  let proposed = 0, accepted = 0, rejected = 0, threadCount = 0;
  const authorSet = new Set<string>();

  for (const fn of footnotes.values()) {
    if (fn.status === 'proposed') proposed++;
    else if (fn.status === 'accepted') accepted++;
    else if (fn.status === 'rejected') rejected++;
    if (fn.replyCount > 0) threadCount++;
    if (fn.author) authorSet.add(fn.author);
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
 * Scans raw lines for [^ct-N] patterns.
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
export function findFootnoteSectionRange(footnotes: Map<string, FootnoteInfo>): [number, number] | null {
  if (footnotes.size === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const fn of footnotes.values()) {
    if (fn.startLine < min) min = fn.startLine;
    if (fn.endLine > max) max = fn.endLine;
  }
  return [min, max];
}
