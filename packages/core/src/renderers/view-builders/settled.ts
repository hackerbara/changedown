import { computeSettledView } from '../../operations/settled-text.js';
import { computeLineHash } from '../../hashline.js';
import { computeSettledLineHash, settledLine } from '../../hashline-tracked.js';
import { parseFootnotes } from '../../footnote-parser.js';
import { buildDeliberationHeader } from '../view-builder-utils.js';
import type { ThreeZoneDocument, ThreeZoneLine, ViewName } from '../three-zone-types.js';

export interface SettledViewOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
}

export function buildSettledDocument(
  rawContent: string,
  options: SettledViewOptions,
): ThreeZoneDocument {
  const footnotes = parseFootnotes(rawContent);
  const settledResult = computeSettledView(rawContent);
  const rawLines = rawContent.split('\n');
  const allSettled = rawLines.map(l => settledLine(l));

  // Trim trailing blank lines from footnote stripping
  while (
    settledResult.lines.length > 0 &&
    settledResult.lines[settledResult.lines.length - 1].text.trim() === ''
  ) {
    settledResult.lines.pop();
  }

  const lines: ThreeZoneLine[] = settledResult.lines.map(sl => ({
    margin: {
      lineNumber: sl.settledLineNum,
      hash: sl.hash,
      flags: [],
    },
    content: [{ type: 'plain' as const, text: sl.text }],
    metadata: [],
    rawLineNumber: sl.rawLineNum,
    sessionHashes: {
      raw: computeLineHash(sl.rawLineNum - 1, rawLines[sl.rawLineNum - 1] ?? '', rawLines),
      settled: computeSettledLineHash(sl.rawLineNum, rawLines[sl.rawLineNum - 1] ?? '', allSettled),
      settledView: sl.hash,
      rawLineNum: sl.rawLineNum,
    },
  }));

  const header = buildDeliberationHeader({
    ...options,
    footnotes,
    lineRange: { start: 1, end: lines.length, total: lines.length },
  });

  return { view: 'settled', header, lines };
}
