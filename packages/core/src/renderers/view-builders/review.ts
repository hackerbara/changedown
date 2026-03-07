/**
 * Review view builder — produces a ThreeZoneDocument with typed CriticMarkup spans.
 *
 * The review view is the richest view: it preserves all CriticMarkup inline,
 * identifies `[^ct-N]` footnote refs as anchor spans (preserving the caret), and projects
 * footnote metadata into Zone 3 (LineMetadata[]) on each line.
 *
 * Three zones per line:
 *   Zone 1 (Margin): lineNumber, hash, flags (P/A)
 *   Zone 2 (Content): typed ContentSpan[] with CriticMarkup decomposed into
 *     delimiter, insertion, deletion, sub_old, sub_arrow, sub_new, highlight,
 *     comment, anchor, and plain spans
 *   Zone 3 (Metadata): LineMetadata[] from footnotes referenced on this line
 */

import { parseFootnotes, type FootnoteInfo } from '../../footnote-parser.js';
import { computeLineHash } from '../../hashline.js';
import { computeSettledLineHash, settledLine } from '../../hashline-tracked.js';
import {
  buildDeliberationHeader,
  buildLineRefMap,
  findFootnoteSectionRange,
  type BuildHeaderOptions,
} from '../view-builder-utils.js';
import type {
  ThreeZoneDocument,
  ThreeZoneLine,
  ContentSpan,
  LineMetadata,
  LineFlag,
  ViewName,
} from '../three-zone-types.js';

// ─── CriticMarkup regex for per-line span decomposition ─────────────────────

/**
 * Matches all 5 CriticMarkup types on a single line.
 *
 * Capture groups:
 *   0: full match
 *   1: insertion content  ({++text++} → text)
 *   2: deletion content   ({--text--} → text)
 *   3: sub old            ({~~old~>new~~} → old)
 *   4: sub new            ({~~old~>new~~} → new)
 *   5: highlight content  ({==text==} → text)
 *   6: comment content    ({>>text<<} → text)
 *
 * Uses non-greedy matching within each type. Single-line-safe character
 * class negation for insertion/deletion/highlight/comment, and explicit
 * ~> split for substitution.
 */
const CRITIC_MARKUP_RE = /\{\+\+((?:[^+]|\+(?!\+\}))*?)\+\+\}|\{--((?:[^-]|-(?!-\}))*?)--\}|\{~~((?:[^~]|~(?!>))*?)~>((?:[^~]|~(?!~\}))*?)~~\}|\{==((?:[^=]|=(?!=\}))*?)==\}|\{>>((?:[^<]|<(?!<\}))*?)<<\}/g;

/**
 * Matches a footnote reference `[^ct-N]` or `[^ct-N.M]`.
 * Capture group 1: the ID (e.g. "ct-1", "ct-2.3").
 */
const FOOTNOTE_REF_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ReviewBuildOptions {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;
  defaultView: ViewName;
  viewPolicy: string;
}

/**
 * Build a ThreeZoneDocument in review view from raw file content.
 *
 * 1. Parse footnotes for metadata
 * 2. Find and exclude footnote section lines (+ preceding blank line)
 * 3. For each content line:
 *    a. Decompose CriticMarkup into typed ContentSpan[]
 *    b. Identify [^ct-N] refs as anchor spans (preserving caret)
 *    c. Build Zone 3 metadata from referenced footnotes
 *    d. Compute flags from footnote statuses
 * 4. Build deliberation header with aggregate counts
 */
export function buildReviewDocument(
  content: string,
  options: ReviewBuildOptions,
): ThreeZoneDocument {
  const footnotes = parseFootnotes(content);
  const rawLines = content.split('\n');
  const allSettled = rawLines.map(l => settledLine(l));

  // Determine footnote section range to exclude
  const fnRange = findFootnoteSectionRange(footnotes);

  // Build line-to-footnote-ID map for Zone 3 and flag computation
  const lineRefMap = buildLineRefMap(rawLines);

  // Process each line
  const outputLines: ThreeZoneLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    // Skip footnote section lines
    if (fnRange && i >= fnRange[0] && i <= fnRange[1]) {
      continue;
    }

    // Skip blank line immediately before footnote section
    if (fnRange && i === fnRange[0] - 1 && rawLines[i].trim() === '') {
      continue;
    }

    const rawLine = rawLines[i];
    const lineNum = i + 1; // 1-indexed

    // Build Zone 2: typed content spans
    const contentSpans = buildContentSpans(rawLine, footnotes);

    // Build Zone 3: metadata from footnotes referenced on this line
    const refIds = lineRefMap.get(i);
    const metadata = buildLineMetadata(refIds, footnotes);

    // Build Zone 1: margin with flags
    const flags = computeFlags(refIds, footnotes);
    const hash = computeLineHash(i, rawLine, rawLines);

    outputLines.push({
      margin: { lineNumber: lineNum, hash, flags },
      content: contentSpans,
      metadata,
      rawLineNumber: lineNum,
      sessionHashes: {
        raw: hash,
        settled: computeSettledLineHash(lineNum, rawLine, allSettled),
      },
    });
  }

  // Build header
  const header = buildDeliberationHeader({
    filePath: options.filePath,
    trackingStatus: options.trackingStatus,
    protocolMode: options.protocolMode,
    defaultView: options.defaultView,
    viewPolicy: options.viewPolicy,
    footnotes,
  });

  return {
    view: 'review',
    header,
    lines: outputLines,
  };
}

// ─── Span building ──────────────────────────────────────────────────────────

/**
 * Decompose a single line into typed ContentSpan[].
 *
 * Strategy:
 * 1. Find all CriticMarkup regions via regex
 * 2. Between regions, identify [^ct-N] footnote refs as anchor spans
 * 3. Emit typed spans for each region
 */
function buildContentSpans(
  line: string,
  footnotes: Map<string, FootnoteInfo>,
): ContentSpan[] {
  const spans: ContentSpan[] = [];
  let lastIndex = 0;

  // Reset regex state
  const re = new RegExp(CRITIC_MARKUP_RE.source, 'g');

  for (const match of line.matchAll(re)) {
    const matchStart = match.index!;

    // Emit plain/anchor spans for text between last match and this match
    if (matchStart > lastIndex) {
      const between = line.slice(lastIndex, matchStart);
      emitPlainAndAnchors(between, footnotes, spans);
    }

    // Determine which CriticMarkup type matched and emit typed spans
    if (match[1] !== undefined) {
      // Insertion: {++text++}
      spans.push({ type: 'delimiter', text: '{++' });
      spans.push({ type: 'insertion', text: match[1] });
      spans.push({ type: 'delimiter', text: '++}' });
    } else if (match[2] !== undefined) {
      // Deletion: {--text--}
      spans.push({ type: 'delimiter', text: '{--' });
      spans.push({ type: 'deletion', text: match[2] });
      spans.push({ type: 'delimiter', text: '--}' });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      // Substitution: {~~old~>new~~}
      spans.push({ type: 'delimiter', text: '{~~' });
      spans.push({ type: 'sub_old', text: match[3] ?? '' });
      spans.push({ type: 'sub_arrow', text: '~>' });
      spans.push({ type: 'sub_new', text: match[4] ?? '' });
      spans.push({ type: 'delimiter', text: '~~}' });
    } else if (match[5] !== undefined) {
      // Highlight: {==text==}
      spans.push({ type: 'delimiter', text: '{==' });
      spans.push({ type: 'highlight', text: match[5] });
      spans.push({ type: 'delimiter', text: '==}' });
    } else if (match[6] !== undefined) {
      // Comment: {>>text<<}
      spans.push({ type: 'delimiter', text: '{>>' });
      spans.push({ type: 'comment', text: match[6] });
      spans.push({ type: 'delimiter', text: '<<}' });
    }

    lastIndex = matchStart + match[0].length;
  }

  // Emit any remaining text after the last match
  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex);
    emitPlainAndAnchors(remaining, footnotes, spans);
  }

  // If the line was empty or produced no spans, emit a single empty plain span
  if (spans.length === 0) {
    spans.push({ type: 'plain', text: '' });
  }

  return spans;
}

/**
 * Process a plain text segment, identifying `[^ct-N]` footnote refs as
 * anchor spans (preserving the caret for raw-file consistency).
 */
function emitPlainAndAnchors(
  text: string,
  footnotes: Map<string, FootnoteInfo>,
  spans: ContentSpan[],
): void {
  let lastIdx = 0;
  const re = new RegExp(FOOTNOTE_REF_RE.source, 'g');

  for (const match of text.matchAll(re)) {
    const matchStart = match.index!;
    const id = match[1];
    const info = footnotes.get(id);

    // Plain text before this ref
    if (matchStart > lastIdx) {
      spans.push({ type: 'plain', text: text.slice(lastIdx, matchStart) });
    }

    if (info) {
      // Known footnote: emit [^ct-N] anchor (preserving caret for raw-file consistency)
      spans.push({ type: 'anchor', text: `[^${info.id}]` });
    } else {
      // Unknown ref: keep as plain text
      spans.push({ type: 'plain', text: match[0] });
    }

    lastIdx = matchStart + match[0].length;
  }

  // Remaining text after last ref
  if (lastIdx < text.length) {
    spans.push({ type: 'plain', text: text.slice(lastIdx) });
  }
}

// ─── Zone 3: Metadata ───────────────────────────────────────────────────────

/**
 * Build LineMetadata[] from footnote IDs referenced on a line.
 */
function buildLineMetadata(
  refIds: Set<string> | undefined,
  footnotes: Map<string, FootnoteInfo>,
): LineMetadata[] {
  if (!refIds) return [];

  const metadata: LineMetadata[] = [];
  for (const id of refIds) {
    const info = footnotes.get(id);
    if (!info) continue;
    metadata.push({
      changeId: info.id,
      author: info.author,
      reason: info.reason || undefined,
      replyCount: info.replyCount > 0 ? info.replyCount : undefined,
      status: info.status as LineMetadata['status'],
    });
  }
  return metadata;
}

// ─── Zone 1: Flags ──────────────────────────────────────────────────────────

/**
 * Compute flags for a line based on footnote statuses.
 * P (proposed) takes priority over A (accepted).
 * Lines with no refs or only rejected changes get no flags.
 */
function computeFlags(
  refIds: Set<string> | undefined,
  footnotes: Map<string, FootnoteInfo>,
): LineFlag[] {
  if (!refIds) return [];

  let hasProposed = false;
  let hasAccepted = false;

  for (const id of refIds) {
    const info = footnotes.get(id);
    if (!info) continue;
    if (info.status === 'proposed') hasProposed = true;
    if (info.status === 'accepted') hasAccepted = true;
  }

  // P takes priority over A
  if (hasProposed) return ['P'];
  if (hasAccepted) return ['A'];
  return [];
}
