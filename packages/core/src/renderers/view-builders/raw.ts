import { computeLineHash } from '../../hashline.js';
import { computeSettledLineHash, settledLine } from '../../hashline-tracked.js';
import { parseFootnotes } from '../../footnote-parser.js';
import { buildDeliberationHeader, findFootnoteSectionRange } from '../view-builder-utils.js';
import type { ThreeZoneDocument, ThreeZoneLine, ViewName } from '../three-zone-types.js';

export interface RawViewOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
}

export function buildRawDocument(
  rawContent: string,
  options: RawViewOptions,
): ThreeZoneDocument {
  const footnotes = parseFootnotes(rawContent);
  const rawLines = rawContent.split('\n');
  const allSettled = rawLines.map(l => settledLine(l));

  const lines: ThreeZoneLine[] = rawLines.map((text, i) => ({
    margin: {
      lineNumber: i + 1,
      hash: computeLineHash(i, text, rawLines),
      flags: [],
    },
    content: [{ type: 'plain' as const, text }],
    metadata: [],
    rawLineNumber: i + 1,
    sessionHashes: {
      raw: computeLineHash(i, text, rawLines),
      settled: computeSettledLineHash(i + 1, text, allSettled),
    },
  }));

  const header = buildDeliberationHeader({
    ...options,
    footnotes,
    lineRange: { start: 1, end: lines.length, total: lines.length },
  });

  const fnRange = findFootnoteSectionRange(footnotes);
  const footnoteSection = fnRange
    ? rawLines.slice(fnRange[0], fnRange[1] + 1).join('\n')
    : undefined;

  return { view: 'raw', header, lines, footnoteSection };
}
