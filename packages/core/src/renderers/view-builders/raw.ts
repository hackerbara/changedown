import { computeLineHash } from '../../hashline.js';
import { computeSettledLineHash, settledLine } from '../../hashline-tracked.js';
import { parseForFormat } from '../../format-aware-parse.js';
import { buildDeliberationHeader, findFootnoteSectionRange, computeContinuationLines } from '../view-builder-utils.js';
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
  const changes = parseForFormat(rawContent).getChanges();
  const rawLines = rawContent.split('\n');
  const allSettled = rawLines.map(l => settledLine(l));

  const continuations = computeContinuationLines(rawContent, changes);

  const lines: ThreeZoneLine[] = rawLines.map((text, i) => {
    const rawHash = computeLineHash(i, text, rawLines);
    return {
      margin: {
        lineNumber: i + 1,
        hash: rawHash,
        flags: [],
      },
      content: [{ type: 'plain' as const, text }],
      metadata: [],
      rawLineNumber: i + 1,
      continuesChange: continuations.has(i) || undefined,
      sessionHashes: {
        raw: rawHash,
        settled: computeSettledLineHash(i + 1, text, allSettled),
      },
    };
  });

  const header = buildDeliberationHeader({
    ...options,
    changes,
    lineRange: { start: 1, end: lines.length, total: lines.length },
  });

  const fnRange = findFootnoteSectionRange(changes);
  const footnoteSection = fnRange
    ? rawLines.slice(fnRange[0], fnRange[1] + 1).join('\n')
    : undefined;

  return { view: 'raw', header, lines, footnoteSection };
}
