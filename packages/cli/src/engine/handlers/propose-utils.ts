import {
  computeLineHash,
} from '@changedown/core';

export interface AffectedLineEntry {
  line: number;
  content: string;
  hash?: string;     // Only when hashlines enabled
  flag?: string;      // 'P' for proposed change on this line
}

/**
 * View projection mapping: raw line number → view-space coordinate.
 * Used to translate raw-file affected_lines into the coordinate space
 * the agent was working in (settled or changes view).
 */
export interface ViewProjection {
  view: 'settled' | 'changes';
  /** Map from raw 1-indexed line number to view-space line info */
  rawToView: Map<number, { viewLine: number; viewHash: string; viewContent: string }>;
}

/**
 * Compute affected_lines for the region around a change.
 * Returns content + optional hashes for lines near the edit.
 * Returns only the edit region (+ context), not full-file hashes.
 *
 * When viewProjection is provided, affected_lines are returned in view-space
 * coordinates (line numbers and hashes from the view the agent was reading).
 * Raw lines that don't appear in the view (e.g., footnote lines hidden in
 * settled view) are omitted from the output.
 */
export function computeAffectedLines(
  modifiedText: string,
  affectedStartLine: number,
  affectedEndLine: number,
  options: {
    hashlineEnabled: boolean;
    contextLines?: number; // lines of context around affected region, default 2
    viewProjection?: ViewProjection;
  },
): AffectedLineEntry[] {
  const lines = modifiedText.split('\n');
  const result: AffectedLineEntry[] = [];
  const ctx = options.contextLines ?? 2;

  // Expand range by context lines
  const start = Math.max(1, affectedStartLine - ctx);
  const end = Math.min(lines.length, affectedEndLine + ctx);

  for (let lineNum = start; lineNum <= end; lineNum++) {
    const lineContent = lines[lineNum - 1];

    if (options.viewProjection) {
      // View-space projection: translate raw line to view-space coordinates
      const viewEntry = options.viewProjection.rawToView.get(lineNum);
      if (!viewEntry) {
        // This raw line doesn't appear in the view (e.g., footnote lines in settled view)
        // Skip it — agent can't reference it from the view they were using
        continue;
      }
      const entry: AffectedLineEntry = {
        line: viewEntry.viewLine,
        content: viewEntry.viewContent,
      };
      if (options.hashlineEnabled) {
        entry.hash = viewEntry.viewHash;
      }
      // Flag: check the raw content for proposed markup (visible in view would be different)
      if (lineContent.match(/\{\+\+|\{--|\{~~|\{==/)) {
        entry.flag = 'P';
      }
      result.push(entry);
    } else {
      const entry: AffectedLineEntry = {
        line: lineNum,
        content: lineContent,
      };

      if (options.hashlineEnabled) {
        entry.hash = computeLineHash(lineNum - 1, lineContent, lines);
      }

      // Flag lines with proposed CriticMarkup
      if (lineContent.match(/\{\+\+|\{--|\{~~|\{==/)) {
        entry.flag = 'P';
      }

      result.push(entry);
    }
  }

  return result;
}
