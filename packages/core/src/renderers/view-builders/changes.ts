import { computeCommittedView } from '../../committed-text.js';
import { computeLineHash } from '../../hashline.js';
import { computeSettledLineHash, settledLine } from '../../hashline-tracked.js';
import { parseFootnotes } from '../../footnote-parser.js';
import { buildDeliberationHeader } from '../view-builder-utils.js';
import type { ThreeZoneDocument, ThreeZoneLine, LineFlag, LineMetadata, ViewName } from '../three-zone-types.js';

export interface ChangesViewOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
}

export function buildChangesDocument(
  rawContent: string,
  options: ChangesViewOptions,
): ThreeZoneDocument {
  const footnotes = parseFootnotes(rawContent);
  const committedResult = computeCommittedView(rawContent);
  const rawLines = rawContent.split('\n');
  const allSettled = rawLines.map(l => settledLine(l));

  // Trim trailing blank lines left over from footnote section stripping
  while (
    committedResult.lines.length > 0 &&
    committedResult.lines[committedResult.lines.length - 1].text.trim() === ''
  ) {
    committedResult.lines.pop();
  }

  const lines: ThreeZoneLine[] = committedResult.lines.map(cl => {
    const flags: LineFlag[] = cl.flag === 'P' ? ['P'] : cl.flag === 'A' ? ['A'] : [];
    const metadata: LineMetadata[] = cl.changeIds.map(id => ({ changeId: id }));

    return {
      margin: {
        lineNumber: cl.committedLineNum,
        hash: cl.hash,
        flags,
      },
      content: [{ type: 'plain' as const, text: cl.text }],
      metadata,
      rawLineNumber: cl.rawLineNum,
      sessionHashes: {
        raw: computeLineHash(cl.rawLineNum - 1, rawLines[cl.rawLineNum - 1] ?? '', rawLines),
        settled: computeSettledLineHash(cl.rawLineNum, rawLines[cl.rawLineNum - 1] ?? '', allSettled),
        committed: cl.hash,
        rawLineNum: cl.rawLineNum,
      },
    };
  });

  const header = buildDeliberationHeader({
    ...options,
    footnotes,
    lineRange: { start: 1, end: lines.length, total: lines.length },
  });

  return { view: 'changes', header, lines };
}
