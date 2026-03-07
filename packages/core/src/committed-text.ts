/**
 * Committed-view computation.
 *
 * Per-line: processes a single raw line of CriticMarkup and returns the "committed" text:
 * - Accepted changes are applied (insertions kept, deletions removed, subs show new)
 * - Pending/unknown changes are reverted (insertions removed, deletions kept, subs show old)
 * - Rejected changes are reverted (same as pending for content, but don't set P/A flag)
 * - Highlights always show content, comments always removed
 * - Footnote refs always removed
 *
 * Document-level: parses footnotes, computes committed text for whole file,
 * hashes each committed line, builds committed<->raw line mapping.
 */

import { parseFootnotes } from './footnote-parser.js';
import { computeLineHash } from './hashline.js';
import {
  multiLineSubstitution,
  multiLineInsertion,
  multiLineDeletion,
  multiLineHighlight,
  multiLineComment,
  hasCriticMarkup,
} from './critic-regex.js';
import {
  footnoteRefGlobal,
  FOOTNOTE_DEF_START_QUICK,
} from './footnote-patterns.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FootnoteStatus {
  status: 'proposed' | 'accepted' | 'rejected';
  type: string;
}

export interface CommittedLineResult {
  text: string;
  flag: '' | 'P' | 'A';
  changeIds: string[];
}

// CriticMarkup regex patterns imported from critic-regex.ts (multi-line family).
// Footnote ref patterns imported from footnote-patterns.ts.
// Order matters: substitutions first (contain ~> which would confuse simpler patterns).

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Resolve the effective status for a change ID against the footnotes map.
 * Unknown IDs default to 'proposed' (safe default).
 */
function resolveStatus(
  changeId: string | undefined,
  footnotes: Map<string, FootnoteStatus>,
): 'proposed' | 'accepted' | 'rejected' {
  if (!changeId) return 'proposed'; // bare markup = proposed
  const info = footnotes.get(changeId);
  if (!info) return 'proposed'; // unknown ID = proposed
  return info.status;
}

/**
 * Compute the committed view of a single line.
 *
 * Processes CriticMarkup in this order:
 * 1. Substitutions (contain ~> separator)
 * 2. Insertions
 * 3. Deletions
 * 4. Highlights
 * 5. Comments
 * 6. Standalone footnote refs
 */
export function computeCommittedLine(
  line: string,
  footnotes: Map<string, FootnoteStatus>,
): CommittedLineResult {
  let result = line;
  const changeIds: string[] = [];
  let hasProposed = false;
  let hasAccepted = false;

  // Track status for flag computation (rejected changes don't set flags)
  function trackStatus(status: 'proposed' | 'accepted' | 'rejected', changeId: string | undefined): void {
    if (changeId) changeIds.push(changeId);
    if (status === 'proposed') hasProposed = true;
    else if (status === 'accepted') hasAccepted = true;
    // rejected: neither flag
  }

  // 1. Substitutions: {~~old~>new~~}[^ct-N]?
  result = result.replace(multiLineSubstitution(), (_match, old: string, newText: string, _refFull: string | undefined, refId: string | undefined) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    // accepted → new text; proposed/rejected → old text
    return status === 'accepted' ? newText : old;
  });

  // 2. Insertions: {++text++}[^ct-N]?
  result = result.replace(multiLineInsertion(), (_match, content: string, _refFull: string | undefined, refId: string | undefined) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    // accepted → keep text; proposed/rejected → remove
    return status === 'accepted' ? content : '';
  });

  // 3. Deletions: {--text--}[^ct-N]?
  result = result.replace(multiLineDeletion(), (_match, content: string, _refFull: string | undefined, refId: string | undefined) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    // accepted → remove text; proposed/rejected → keep text (revert deletion)
    return status === 'accepted' ? '' : content;
  });

  // 4. Highlights: {==text==}[^ct-N]? — always show content, no flag, no changeId
  result = result.replace(multiLineHighlight(), (_match, content: string) => {
    return content;
  });

  // 5. Comments: {>>text<<} — always removed
  result = result.replace(multiLineComment(), '');

  // 6. Standalone footnote refs: [^ct-N] — always removed
  result = result.replace(footnoteRefGlobal(), '');

  // Compute flag: P takes priority over A
  let flag: '' | 'P' | 'A' = '';
  if (hasProposed) flag = 'P';
  else if (hasAccepted) flag = 'A';

  return { text: result, flag, changeIds };
}

// ─── Document-level types ────────────────────────────────────────────────────

export interface CommittedLine {
  committedLineNum: number;  // 1-indexed, sequential (no gaps)
  rawLineNum: number;        // 1-indexed, raw file line number
  text: string;              // committed text (no CriticMarkup)
  hash: string;              // committed hash (2 hex chars)
  flag: '' | 'P' | 'A';     // status flag
  changeIds: string[];       // ct-N IDs on this line
}

export interface CommittedViewResult {
  lines: CommittedLine[];
  summary: { proposed: number; accepted: number; rejected: number; clean: number };
  committedToRaw: Map<number, number>;  // committed line num → raw line num
  rawToCommitted: Map<number, number>;  // raw line num → committed line num
}

export interface FormatOptions {
  filePath: string;
  trackingStatus: string;
}

// ─── Footnote line detection ─────────────────────────────────────────────────

// FOOTNOTE_DEF_START_QUICK imported from footnote-patterns.ts

/**
 * Build a set of 0-based line indices that belong to footnote definitions.
 * Includes the header line and all indented continuation lines.
 */
function findFootnoteLineIndices(lines: string[]): Set<number> {
  const indices = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (!FOOTNOTE_DEF_START_QUICK.test(lines[i])) continue;

    // Mark the header line
    indices.add(i);

    // Scan indented continuation lines
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      // Blank line: only include if followed by more indented content (same footnote)
      if (line.trim() === '') {
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k < lines.length && /^\s+\S/.test(lines[k])) {
          indices.add(j);
          j++;
          continue;
        }
        break;
      }
      // Indented line = continuation
      if (/^\s+\S/.test(line)) {
        indices.add(j);
        j++;
        continue;
      }
      break;
    }
  }

  return indices;
}

// ─── CriticMarkup detection ─────────────────────────────────────────────────

// hasCriticMarkup imported from critic-regex.ts

// ─── Document-level computation ──────────────────────────────────────────────

/**
 * Compute the committed view for an entire file.
 *
 * 1. Parses footnotes to get statuses
 * 2. Identifies footnote definition lines (excluded from output)
 * 3. Processes each non-footnote line through computeCommittedLine
 * 4. Skips lines that were entirely pending insertions (become empty)
 * 5. Assigns sequential committed line numbers and computes hashes
 * 6. Builds bidirectional line mapping
 */
export function computeCommittedView(rawText: string): CommittedViewResult {
  const rawLines = rawText.split('\n');

  // 1. Parse footnotes → Map<id, FootnoteInfo>
  const footnoteInfos = parseFootnotes(rawText);

  // 2. Build Map<id, FootnoteStatus> from parsed footnotes
  const statusMap = new Map<string, FootnoteStatus>();
  for (const [id, info] of footnoteInfos) {
    statusMap.set(id, {
      status: (info.status === 'accepted' || info.status === 'rejected')
        ? info.status
        : 'proposed',
      type: info.type,
    });
  }

  // 3. Find footnote definition line indices (excluded from committed view)
  const footnoteLineIndices = findFootnoteLineIndices(rawLines);

  // 4. Process each non-footnote raw line (two-pass: collect texts, then hash)
  //    Pass 1: collect committed line texts+metadata without hashing
  const preLines: Array<{
    committedLineNum: number;
    rawLineNum: number;
    text: string;
    flag: '' | 'P' | 'A';
    changeIds: string[];
  }> = [];
  let committedLineNum = 0;
  let cleanCount = 0;

  for (let rawIdx = 0; rawIdx < rawLines.length; rawIdx++) {
    // Skip footnote definition lines
    if (footnoteLineIndices.has(rawIdx)) continue;

    const rawLine = rawLines[rawIdx];
    const lineResult = computeCommittedLine(rawLine, statusMap);

    // Skip lines that were entirely pending insertions (raw had CriticMarkup,
    // committed is empty/whitespace, and the raw line was not already blank)
    const rawIsBlank = rawLine.trim() === '';
    const committedIsBlank = lineResult.text.trim() === '';
    if (!rawIsBlank && committedIsBlank && hasCriticMarkup(rawLine)) {
      continue;
    }

    // Assign sequential committed line number (1-indexed)
    committedLineNum++;
    const rawLineNum = rawIdx + 1; // 1-indexed

    // Track clean vs flagged
    if (lineResult.flag === '') {
      cleanCount++;
    }

    preLines.push({
      committedLineNum,
      rawLineNum,
      text: lineResult.text,
      flag: lineResult.flag,
      changeIds: lineResult.changeIds,
    });
  }

  //    Pass 2: extract all committed texts, then hash each with full context
  const allCommittedTexts = preLines.map(l => l.text);
  const committedLines: CommittedLine[] = [];
  const committedToRaw = new Map<number, number>();
  const rawToCommitted = new Map<number, number>();

  for (const pre of preLines) {
    const hash = computeLineHash(pre.committedLineNum - 1, pre.text, allCommittedTexts);

    committedLines.push({
      committedLineNum: pre.committedLineNum,
      rawLineNum: pre.rawLineNum,
      text: pre.text,
      hash,
      flag: pre.flag,
      changeIds: pre.changeIds,
    });

    // Build bidirectional mapping
    committedToRaw.set(pre.committedLineNum, pre.rawLineNum);
    rawToCommitted.set(pre.rawLineNum, pre.committedLineNum);
  }

  // 5. Build summary counts from footnotes
  const summary = { proposed: 0, accepted: 0, rejected: 0, clean: cleanCount };
  for (const info of footnoteInfos.values()) {
    if (info.status === 'proposed') summary.proposed++;
    else if (info.status === 'accepted') summary.accepted++;
    else if (info.status === 'rejected') summary.rejected++;
  }

  return { lines: committedLines, summary, committedToRaw, rawToCommitted };
}

// ─── Format output ──────────────────────────────────────────────────────────

/**
 * Format a committed view as text output.
 *
 * Produces a header with file path, tracking status, and change summary,
 * followed by lines formatted as: `N:HHF|content`
 * where N = line number, HH = hash, F = flag (P, A, or space).
 */
export function formatCommittedOutput(
  view: CommittedViewResult,
  options: FormatOptions,
): string {
  const headerLines: string[] = [];

  // Line 1: file path
  headerLines.push(`## file: ${options.filePath}`);

  // Line 2: view info + tracking + change summary
  const summaryParts: string[] = [];
  if (view.summary.proposed > 0) summaryParts.push(`${view.summary.proposed}P`);
  if (view.summary.accepted > 0) summaryParts.push(`${view.summary.accepted}A`);
  if (view.summary.rejected > 0) summaryParts.push(`${view.summary.rejected}R`);
  const changeSummary = summaryParts.length > 0 ? summaryParts.join(' ') : 'clean';

  headerLines.push(
    `## view: committed | tracking: ${options.trackingStatus} | changes: ${changeSummary}`,
  );

  // Line 3: line range
  const totalLines = view.lines.length;
  if (totalLines > 0) {
    headerLines.push(`## lines: 1-${totalLines} of ${totalLines}`);
  } else {
    headerLines.push('## lines: (empty)');
  }

  // Determine padding width for line numbers
  const maxLineNum = totalLines > 0 ? view.lines[view.lines.length - 1].committedLineNum : 1;
  const padWidth = Math.max(String(maxLineNum).length, 2);

  // Format content lines
  const contentLines = view.lines.map(line => {
    const num = String(line.committedLineNum).padStart(padWidth, ' ');
    const flag = line.flag || ' ';
    return `${num}:${line.hash}${flag}|${line.text}`;
  });

  return [...headerLines, '', ...contentLines].join('\n');
}
