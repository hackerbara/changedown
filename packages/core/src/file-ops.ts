/**
 * Pure file-ops functions extracted from the MCP server.
 *
 * These are text-transform functions with no I/O or config dependencies.
 * They operate on strings and return strings (or structured results).
 */

import { generateFootnoteDefinition } from './operations/footnote-generator.js';
import { nowTimestamp } from './timestamp.js';
import {
  defaultNormalizer,
  normalizedIndexOf,
  whitespaceCollapsedFind,
  whitespaceCollapsedIsAmbiguous,
  tryDiagnosticConfusableMatch,
  type TextNormalizer,
} from './text-normalizer.js';
import {
  stripHashlinePrefixes,
  stripBoundaryEcho,
} from './hashline-cleanup.js';
import { CriticMarkupParser } from './parser/parser.js';
import { ChangeType, ChangeStatus } from './model/types.js';
import { parseFootnotes } from './footnote-parser.js';
import { findFootnoteSectionRange } from './renderers/view-builder-utils.js';
import { findCodeZones } from './parser/code-zones.js';
import { viewAwareFind } from './view-surface.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProposeChangeParams {
  text: string;          // current file content
  oldText: string;       // text to replace (empty for insertion)
  newText: string;       // replacement (empty for deletion)
  changeId: string;      // e.g., "ct-1"
  author: string;        // e.g., "ai:claude-opus-4.6"
  reasoning?: string;    // optional why
  insertAfter?: string;  // anchor for insertions (when oldText is empty)
  /** 1 = adjacent comment only (Level 1); 2 = footnote (Level 2). Default 2. */
  level?: 1 | 2;
}

export interface ProposeChangeResult {
  modifiedText: string;
  changeType: 'ins' | 'del' | 'sub';
}

export interface CriticMarkupOverlap {
  /** The change ID (e.g. "ct-1") if one was found, or undefined for Level 0/1 changes */
  changeId?: string;
  /** The type of the overlapping CriticMarkup (e.g. "sub", "ins", "del") */
  changeType: string;
  /** Start offset of the overlapping CriticMarkup span in the document */
  spanStart: number;
  /** End offset of the overlapping CriticMarkup span in the document */
  spanEnd: number;
}

export interface UniqueMatch {
  index: number;
  length: number;
  originalText: string;  // The actual text from the document at the match position
  wasNormalized: boolean;
  /** True when the match was found via settled-text fallback (CriticMarkup stripped). */
  wasSettledMatch?: boolean;
}

export interface LineRangeResult {
  /** The extracted text content (lines joined by \n) */
  content: string;
  /** Byte offset in the original text where this range starts */
  startOffset: number;
  /** Byte offset in the original text where this range ends (exclusive) */
  endOffset: number;
}

export interface ApplySingleOperationParams {
  fileContent: string;
  oldText: string;
  newText: string;
  changeId: string;
  author: string;
  reasoning?: string;
  insertAfter?: string;
  /** Already-adjusted 1-based line (hashline insertion). */
  afterLine?: number;
  /** Already-adjusted 1-based start line (hashline range). */
  startLine?: number;
  /** Already-adjusted 1-based end line (hashline range). */
  endLine?: number;
}

export interface ApplySingleOperationResult {
  modifiedText: string;
  changeType: 'ins' | 'del' | 'sub';
  affectedStartLine?: number;
  affectedEndLine?: number;
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * CriticMarkup construct range in raw text, used for settled-text position mapping.
 */
interface MarkupRange {
  rawStart: number;
  rawEnd: number;      // exclusive
}

interface SettledMapResult {
  /** Text with CriticMarkup resolved (insertions kept, deletions removed, subs keep new text). */
  settled: string;
  /** Maps each settled-text character position to its raw-text position. */
  toRaw: number[];
  /** Ranges in raw text occupied by CriticMarkup constructs (delimiters, old text in subs, deletions). */
  markupRanges: MarkupRange[];
}

/** Build Level 1 adjacent comment: @author|date|type|proposed */
function level1Comment(author: string, changeType: 'ins' | 'del' | 'sub'): string {
  const ts = nowTimestamp();
  const authorPrefixed = author.startsWith('@') ? author : `@${author}`;
  return `{>>${authorPrefixed}|${ts.raw}|${changeType}|proposed<<}`;
}

/**
 * Returns true if the text contains any CriticMarkup delimiters.
 */
function containsCriticMarkup(text: string): boolean {
  return /\{\+\+|\{--|\{~~|\{==|\{>>/.test(text);
}

/**
 * Returns true if the line opens or closes a fenced code block (CommonMark).
 * Handles ``` or ```lang; same line pattern toggles the fence.
 */
function isCodeFenceLine(line: string): boolean {
  return line.trim().startsWith('```');
}

// ─── Overlap detection ──────────────────────────────────────────────────────

/**
 * Checks whether the range [matchStart, matchStart + matchLength) overlaps with
 * any existing CriticMarkup construct in `text`.
 *
 * Uses the core CriticMarkupParser to find all CriticMarkup spans, then checks
 * for overlap. Returns overlap info if found, or null if the match is safe.
 *
 * This guard prevents nested/broken CriticMarkup when an agent targets text
 * that happens to exist verbatim inside existing markup (e.g., the old side
 * of a substitution).
 */
export function checkCriticMarkupOverlap(
  text: string,
  matchStart: number,
  matchLength: number,
): CriticMarkupOverlap | null {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();

  // Resolve footnote statuses so the semantic filter can distinguish
  // proposed vs accepted/rejected changes.
  const footnotes = parseFootnotes(text);
  for (const node of changes) {
    const fnInfo = footnotes.get(node.id);
    if (fnInfo) {
      const s = fnInfo.status.toLowerCase();
      if (s === 'accepted') node.status = ChangeStatus.Accepted;
      else if (s === 'rejected') node.status = ChangeStatus.Rejected;
    }
  }

  const matchEnd = matchStart + matchLength;

  for (const node of changes) {
    // Semantic filter: only protect active proposals.
    // Settled refs (node.settled) are metadata anchors — never block.
    // Accepted/rejected changes are already decided — no corruption risk.
    if (node.settled || node.status !== ChangeStatus.Proposed) continue;

    const spanStart = node.range.start;
    const spanEnd = node.range.end;

    // Check for overlap: two ranges overlap if neither is completely before or after the other
    if (matchStart < spanEnd && matchEnd > spanStart) {
      // Extract change ID from the node
      const changeId = node.level >= 2 ? node.id : undefined;

      // Determine type label
      let changeType: string;
      switch (node.type) {
        case ChangeType.Insertion: changeType = 'ins'; break;
        case ChangeType.Deletion: changeType = 'del'; break;
        case ChangeType.Substitution: changeType = 'sub'; break;
        case ChangeType.Highlight: changeType = 'highlight'; break;
        case ChangeType.Comment: changeType = 'comment'; break;
        default: changeType = 'unknown'; break;
      }

      return { changeId, changeType, spanStart, spanEnd };
    }
  }

  return null;
}

/**
 * Throws an actionable error if the match position overlaps with existing CriticMarkup.
 * Call this after findUniqueMatch returns a result and before wrapping in new markup.
 */
export function guardOverlap(text: string, matchStart: number, matchLength: number): void {
  const overlap = checkCriticMarkupOverlap(text, matchStart, matchLength);
  if (overlap) {
    const idRef = overlap.changeId ? ` (${overlap.changeId})` : '';
    throw new Error(
      `Target text overlaps with proposed change${idRef}. ` +
      `The matched text falls inside a ${overlap.changeType} change at positions ${overlap.spanStart}-${overlap.spanEnd}. ` +
      `Use amend_change to modify your own proposed change, or review_changes to accept/reject it.`
    );
  }
}

// ─── Ref preservation ────────────────────────────────────────────────────────

/**
 * Strips footnote refs ([^ct-N] or [^ct-N.M]) from text and returns
 * the cleaned text plus the extracted refs in order. Used to prevent
 * refs from being wrapped inside CriticMarkup delimiters — they are
 * re-attached after the markup.
 */
export function stripRefsFromContent(text: string): { cleaned: string; refs: string[] } {
  const refs: string[] = [];
  const cleaned = text.replace(/\[\^ct-\d+(?:\.\d+)?\]/g, (match) => {
    refs.push(match);
    return '';
  });
  return { cleaned, refs };
}

// ─── CriticMarkup stripping ────────────────────────────────────────────────

/**
 * Strip CriticMarkup delimiters and footnote refs to produce "settled" text,
 * along with a character-position mapping from settled back to raw positions
 * and a list of CriticMarkup construct ranges.
 *
 * Settled semantics: insertions are kept (accepted), deletions are removed,
 * substitutions keep the new text, highlights keep the text, comments removed.
 * Footnote references `[^ct-N]` or `[^ct-N.M]` are removed.
 */
export function stripCriticMarkupWithMap(text: string): SettledMapResult {
  const settled: string[] = [];
  const toRaw: number[] = [];
  const markupRanges: MarkupRange[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for footnote ref: [^ct-N] or [^ct-N.M]
    if (text[i] === '[' && text[i + 1] === '^' && text.startsWith('ct-', i + 2)) {
      const closeIdx = text.indexOf(']', i + 2);
      if (closeIdx !== -1
          && /^\[\^ct-\d+(?:\.\d+)?\]$/.test(text.slice(i, closeIdx + 1))
          && text[closeIdx + 1] !== ':') {
        markupRanges.push({ rawStart: i, rawEnd: closeIdx + 1 });
        i = closeIdx + 1;
        continue;
      }
    }

    // Check for CriticMarkup opening delimiter
    if (text[i] === '{' && i + 2 < text.length) {
      const twoChar = text[i + 1]! + text[i + 2]!;

      if (twoChar === '++') {
        // Insertion: {++text++} -> keep text
        const end = text.indexOf('++}', i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3; // after '{++'
          const contentEnd = end;     // before '++}'
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
          // Keep the insertion content, map positions to raw
          for (let j = contentStart; j < contentEnd; j++) {
            settled.push(text[j]!);
            toRaw.push(j);
          }
          i = constructEnd;
          continue;
        }
      }

      if (twoChar === '--') {
        // Deletion: {--text--} -> remove entirely
        const end = text.indexOf('--}', i + 3);
        if (end !== -1) {
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: i, rawEnd: constructEnd });
          i = constructEnd;
          continue;
        }
      }

      if (twoChar === '~~') {
        // Substitution: {~~old~>new~~} -> keep new text
        const end = text.indexOf('~~}', i + 3);
        if (end !== -1) {
          const arrow = text.indexOf('~>', i + 3);
          if (arrow !== -1 && arrow < end) {
            const constructStart = i;
            const newStart = arrow + 2;   // after '~>'
            const newEnd = end;            // before '~~}'
            const constructEnd = end + 3;
            markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
            // Keep the new text, map positions to raw
            for (let j = newStart; j < newEnd; j++) {
              settled.push(text[j]!);
              toRaw.push(j);
            }
            i = constructEnd;
            continue;
          }
        }
      }

      if (twoChar === '==') {
        // Highlight: {==text==} -> keep text
        const end = text.indexOf('==}', i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
          for (let j = contentStart; j < contentEnd; j++) {
            settled.push(text[j]!);
            toRaw.push(j);
          }
          i = constructEnd;
          continue;
        }
      }

      if (twoChar === '>>') {
        // Comment: {>>text<<} -> remove entirely
        const end = text.indexOf('<<}', i + 3);
        if (end !== -1) {
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: i, rawEnd: constructEnd });
          i = constructEnd;
          continue;
        }
      }
    }

    // Plain character: keep as-is
    settled.push(text[i]!);
    toRaw.push(i);
    i++;
  }

  return { settled: settled.join(''), toRaw, markupRanges };
}

/**
 * Strip CriticMarkup delimiters and footnote refs to produce "settled" text.
 * Insertions are kept (accepted), deletions are removed (accepted),
 * substitutions keep the new text (accepted), highlights keep the text.
 */
export function stripCriticMarkup(text: string): string {
  return stripCriticMarkupWithMap(text).settled;
}

// ─── Unique matching ────────────────────────────────────────────────────────

/**
 * Finds `target` in `text` using a cascading match:
 *
 * 1. Exact match: `text.indexOf(target)`. Check uniqueness.
 * 1.5. Ref-transparent match: strips `[^ct-N]` refs from both haystack and needle.
 * 2. Normalized match (if normalizer provided): normalize both, find match,
 *    check uniqueness in normalized space, extract original text.
 * 3. Whitespace-collapsed match: collapse all whitespace runs to single space.
 * 5. Settled-text match: strips CriticMarkup, then match.
 *
 * Throws with diagnostic error message if not found at any level or ambiguous.
 */
export function findUniqueMatch(
  text: string,
  target: string,
  normalizer?: TextNormalizer,
): UniqueMatch {
  // Level 1: Exact match
  const firstIdx = text.indexOf(target);
  if (firstIdx !== -1) {
    const secondIdx = text.indexOf(target, firstIdx + 1);
    if (secondIdx !== -1) {
      throw new Error(
        `Text "${target}" found multiple times (ambiguous). Provide more context to uniquely identify the location.`
      );
    }
    return {
      index: firstIdx,
      length: target.length,
      originalText: target,
      wasNormalized: false,
    };
  }

  // Level 1.5: Ref-transparent match (if haystack OR needle contains refs)
  if (text.includes('[^ct-') || target.includes('[^ct-') || target.includes('[ct-')) {
    // Strip refs from needle too (agent may have copied [^ct-N] or [ct-N] from view)
    const cleanTarget = target.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, '');
    const viewMatch = viewAwareFind(text, cleanTarget);
    if (viewMatch) {
      return {
        index: viewMatch.index,
        length: viewMatch.length,
        originalText: viewMatch.rawText,
        wasNormalized: true,
      };
    }
  }

  // Level 2: Normalized match (if normalizer provided)
  if (normalizer) {
    const normalizedText = normalizer(text);
    const normalizedTarget = normalizer(target);
    const normIdx = normalizedText.indexOf(normalizedTarget);
    if (normIdx !== -1) {
      const normSecondIdx = normalizedText.indexOf(normalizedTarget, normIdx + 1);
      if (normSecondIdx !== -1) {
        throw new Error(
          `Text "${target}" found multiple times after normalization (ambiguous). Provide more context to uniquely identify the location.`
        );
      }
      const originalText = text.slice(normIdx, normIdx + target.length);
      return {
        index: normIdx,
        length: target.length,
        originalText,
        wasNormalized: true,
      };
    }
  }

  // Level 3: Whitespace-collapsed match
  // Collapses all whitespace runs (spaces, tabs, newlines) to a single space,
  // then matches. This handles LLMs sending text with different line wrapping
  // than the source file. Position mapping converts collapsed match coordinates
  // back to original file positions.
  {
    const wsMatch = whitespaceCollapsedFind(text, target);
    if (wsMatch !== null) {
      if (whitespaceCollapsedIsAmbiguous(text, target)) {
        throw new Error(
          `Text "${target}" found multiple times after whitespace collapsing (ambiguous). Provide more context to uniquely identify the location.`
        );
      }
      return {
        index: wsMatch.index,
        length: wsMatch.length,
        originalText: wsMatch.originalText,
        wasNormalized: true,
      };
    }
  }

  // Level 4: (removed — ref-transparent matching promoted to Level 1.5)

  // Level 5: Settled-text match (strip CriticMarkup, then match)
  // When the text contains CriticMarkup, agents reading the "settled" view
  // see text without delimiters. Their proposed old_text targets that view.
  // This fallback strips CriticMarkup and matches against the settled text,
  // then maps the match back to raw positions (expanding to cover complete
  // CriticMarkup constructs).
  if (containsCriticMarkup(text)) {
    const { settled, toRaw, markupRanges } = stripCriticMarkupWithMap(text);
    const settledIdx = settled.indexOf(target);
    if (settledIdx !== -1) {
      const settledSecondIdx = settled.indexOf(target, settledIdx + 1);
      if (settledSecondIdx !== -1) {
        throw new Error(
          `Text "${target}" found multiple times in settled text (ambiguous). Provide more context to uniquely identify the location.`
        );
      }

      // Map settled match boundaries to raw positions
      const settledEnd = settledIdx + target.length - 1; // inclusive
      let rawStart = toRaw[settledIdx]!;
      let rawEnd = toRaw[settledEnd]! + 1; // exclusive

      // Expand to cover any CriticMarkup constructs that overlap the raw range
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const range of markupRanges) {
          if (range.rawStart < rawEnd && range.rawEnd > rawStart) {
            // This construct overlaps -- expand the raw range to include it fully
            if (range.rawStart < rawStart) {
              rawStart = range.rawStart;
              expanded = true;
            }
            if (range.rawEnd > rawEnd) {
              rawEnd = range.rawEnd;
              expanded = true;
            }
          }
        }
      }

      // Also expand to cover footnote refs adjacent to the raw range
      // (footnote refs like [^ct-N] follow CriticMarkup constructs with no gap)
      for (const range of markupRanges) {
        if (range.rawStart === rawEnd && /^\[\^ct-/.test(text.slice(range.rawStart))) {
          rawEnd = range.rawEnd;
        }
      }

      return {
        index: rawStart,
        length: rawEnd - rawStart,
        originalText: target, // Return the settled text as originalText for clean CriticMarkup
        wasNormalized: true,
        wasSettledMatch: true,
      };
    }
  }

  // Not found at any level
  const hint = normalizer
    ? 'Tried: exact match, normalized match (NFKC), whitespace-collapsed match, view-surface match, settled-text match.'
    : 'Tried: exact match only (no normalizer), whitespace-collapsed match, view-surface match, settled-text match.';
  const preview = target.length > 80 ? target.slice(0, 80) + '...' : target;

  // Diagnostic confusable detection (ADR-061)
  // After all levels fail, check if confusable normalization would produce a match.
  // This is diagnostic ONLY -- never used for actual matching or writing.
  const diagnosticResult = tryDiagnosticConfusableMatch(text, target);
  if (diagnosticResult) {
    const diffLines = diagnosticResult.differences.map(d =>
      `  Position ${d.position}: you sent ${d.agentName} (U+${d.agentCodepoint.toString(16).toUpperCase().padStart(4, '0')}), ` +
      `file has ${d.fileName} (U+${d.fileCodepoint.toString(16).toUpperCase().padStart(4, '0')})`
    ).join('\n');
    const diagPreview = diagnosticResult.matchedText.length > 80
      ? diagnosticResult.matchedText.slice(0, 80) + '...'
      : diagnosticResult.matchedText;
    throw new Error(
      `Text not found in document.\n${hint}\n\n` +
      `Unicode mismatch detected -- your text would match with character substitution:\n${diffLines}\n\n` +
      `Copy the exact text from file for retry:\n  "${diagPreview}"`
    );
  }

  throw new Error(
    `Text not found in document.\n${hint}\nInput (first 80 chars): "${preview}"\nHint: Re-read the file for current content, or use LINE:HASH addressing.`
  );
}

/**
 * Replaces `target` in `text` exactly once. Throws if target is not found
 * or appears more than once.
 *
 * When `normalizer` is provided, falls back to normalized matching if exact
 * match fails. The replacement is applied at the matched position using the
 * original text length.
 */
export function replaceUnique(
  text: string,
  target: string,
  replacement: string,
  normalizer?: TextNormalizer,
): string {
  const match = findUniqueMatch(text, target, normalizer);
  return text.slice(0, match.index) + replacement + text.slice(match.index + match.length);
}

// ─── Content-zone truncation ────────────────────────────────────────────────

/**
 * Returns the portion of `fullText` before the footnote definition section.
 * Used to restrict `findUniqueMatch` searches to the content zone so that
 * text echoed inside footnote definitions doesn't create false "ambiguous" errors.
 *
 * Since the footnote section is always at the end of the file, the character
 * offsets of any match found in the truncated text are identical in the full text.
 *
 * Footnotes inside fenced code blocks are ignored — only real footnote definitions
 * (outside code blocks) establish the content-zone boundary.
 */
export function contentZoneText(fullText: string): string {
  const footnotes = parseFootnotes(fullText);
  if (footnotes.size === 0) return fullText;

  // Filter out footnotes inside fenced code blocks
  const codeZones = findCodeZones(fullText);
  const lines = fullText.split('\n');

  // Build line-offset lookup.
  // The +1 accounts for the '\n' delimiter consumed by split().
  // lineOffsets[i] gives the character offset where line i starts in fullText.
  // Since we always slice at the START of a footnote line (lineOffsets[range[0]]),
  // the accumulated offset is correct regardless of whether the file has a trailing newline.
  const lineOffsets: number[] = new Array(lines.length);
  let cumOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i] = cumOffset;
    cumOffset += lines[i].length + 1; // +1 for newline
  }

  // Remove footnotes whose start line falls inside a code zone
  for (const [id, fn] of footnotes) {
    const fnCharOffset = lineOffsets[fn.startLine];
    if (codeZones.some(z => fnCharOffset >= z.start && fnCharOffset < z.end)) {
      footnotes.delete(id);
    }
  }

  const range = findFootnoteSectionRange(footnotes);
  if (!range) return fullText; // no real footnotes outside code blocks

  // range[0] is the 0-based line index of the first real footnote definition.
  // Truncate at that line boundary.
  return fullText.slice(0, lineOffsets[range[0]]);
}

// ─── Propose change ─────────────────────────────────────────────────────────

/**
 * Applies a proposed change to document text using CriticMarkup syntax.
 *
 * - Substitution (both oldText and newText non-empty): `{~~old~>new~~}[^changeId]`
 * - Deletion (newText is empty): `{--old--}[^changeId]`
 * - Insertion (oldText is empty, insertAfter required): `{++new++}[^changeId]` after anchor
 *
 * Appends a footnote definition at the end of the file (or after the last
 * existing footnote block).
 */
export function applyProposeChange(params: ProposeChangeParams): ProposeChangeResult {
  const { text, oldText, newText, changeId, author, reasoning, insertAfter, level = 2 } = params;

  // Validate: both empty is invalid
  if (oldText === '' && newText === '') {
    throw new Error('Both oldText and newText are empty — nothing to change.');
  }

  let changeType: 'ins' | 'del' | 'sub';
  let inlineMarkup: string;
  let modifiedBody: string;

  const refSuffix = level === 2 ? `[^${changeId}]` : '';

  if (oldText === '') {
    // --- Insertion ---
    changeType = 'ins';
    if (!insertAfter) {
      throw new Error('Insertion requires an insertAfter anchor to locate where to insert.');
    }
    // Pad with a space when content starts with '+' to avoid the visually ambiguous '{+++' sequence.
    const insPad = /^[+\-~]/.test(newText) ? ' ' : '';
    inlineMarkup = `{++${insPad}${newText}++}${refSuffix}${level === 1 ? level1Comment(author, 'ins') : ''}`;
    // Anchor matching: exact first, then normalized fallback, then whitespace-collapsed
    let anchorIndex = text.indexOf(insertAfter);
    let anchorLength = insertAfter.length;
    if (anchorIndex === -1) {
      anchorIndex = normalizedIndexOf(text, insertAfter, defaultNormalizer);
    }
    if (anchorIndex === -1) {
      const wsMatch = whitespaceCollapsedFind(text, insertAfter);
      if (wsMatch !== null) {
        anchorIndex = wsMatch.index;
        anchorLength = wsMatch.length;
      }
    }
    if (anchorIndex === -1) {
      throw new Error(`insertAfter anchor not found in text: "${insertAfter}"`);
    }
    // Guard: anchor must not resolve inside existing CriticMarkup
    guardOverlap(text, anchorIndex, anchorLength);
    const insertPos = anchorIndex + anchorLength;
    const charBefore = insertPos > 0 ? text[insertPos - 1] : '\n';
    const needsNewlineBefore = charBefore !== '\n';
    // Only prepend a newline when the inserted content looks like a block element
    // (starts with a list marker, heading, blockquote, ordered list, or contains a newline).
    // Inline insertions like adding a word within a sentence should not get a newline.
    const isBlockContent = /^[-#>*\d]/.test(newText) || newText.includes('\n');
    const prefix = needsNewlineBefore && isBlockContent ? '\n' : '';
    modifiedBody = text.slice(0, insertPos) + prefix + inlineMarkup + text.slice(insertPos);
  } else if (newText === '') {
    // --- Deletion ---
    changeType = 'del';
    const searchText = contentZoneText(text);
    const match = findUniqueMatch(searchText, oldText, defaultNormalizer);
    // Skip overlap guard for settled-text matches -- the match already resolved
    // CriticMarkup and the raw range intentionally covers existing constructs.
    if (!match.wasSettledMatch) {
      guardOverlap(text, match.index, match.length);
    }
    const actualOldText = match.originalText;
    // Strip footnote refs so they don't end up inside CriticMarkup delimiters
    const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
    // Pad with a space when content starts with '-' to avoid the visually ambiguous '{---' sequence.
    const delPad = /^[+\-~]/.test(cleanedOld) ? ' ' : '';
    inlineMarkup = `{--${delPad}${cleanedOld}--}${refSuffix}${preservedRefs.join('')}${level === 1 ? level1Comment(author, 'del') : ''}`;
    modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
  } else {
    // --- Substitution ---
    changeType = 'sub';
    const searchText = contentZoneText(text);
    const match = findUniqueMatch(searchText, oldText, defaultNormalizer);
    // Skip overlap guard for settled-text matches -- the match already resolved
    // CriticMarkup and the raw range intentionally covers existing constructs.
    if (!match.wasSettledMatch) {
      guardOverlap(text, match.index, match.length);
    }
    const actualOldText = match.originalText;
    // Strip footnote refs so they don't end up inside CriticMarkup delimiters
    const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
    // Pad with a space when old content starts with '~' to avoid the visually ambiguous '{~~~' sequence.
    const subPad = /^[+\-~]/.test(cleanedOld) ? ' ' : '';
    inlineMarkup = `{~~${subPad}${cleanedOld}~>${newText}~~}${refSuffix}${preservedRefs.join('')}${level === 1 ? level1Comment(author, 'sub') : ''}`;
    modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
  }

  if (level === 1) {
    return { modifiedText: modifiedBody, changeType };
  }

  // Level 2: footnote
  const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
  const reasonLine = reasoning ? `\n    @${author} ${nowTimestamp().raw}: ${reasoning}` : '';
  const footnoteBlock = footnoteHeader + reasonLine;
  const modifiedText = appendFootnote(modifiedBody, footnoteBlock);
  return { modifiedText, changeType };
}

// ─── Line range extraction ──────────────────────────────────────────────────

/**
 * Extract content from a range of lines in a file.
 *
 * @param fileLines - Array of file lines (0-indexed array)
 * @param startLine - First line of range (1-indexed)
 * @param endLine - Last line of range (1-indexed, inclusive)
 * @returns The extracted content, start offset, and end offset
 */
export function extractLineRange(
  fileLines: string[],
  startLine: number,
  endLine: number,
): LineRangeResult {
  if (startLine < 1 || startLine > fileLines.length) {
    throw new Error(`start_line ${startLine} is out of range (file has ${fileLines.length} lines)`);
  }
  if (endLine < startLine || endLine > fileLines.length) {
    throw new Error(`end_line ${endLine} is out of range (file has ${fileLines.length} lines, start_line is ${startLine})`);
  }

  // Compute start offset: sum of lengths of lines before startLine plus newlines
  let startOffset = 0;
  for (let i = 0; i < startLine - 1; i++) {
    startOffset += fileLines[i]!.length + 1; // +1 for \n
  }

  // Extract the lines
  const extractedLines = fileLines.slice(startLine - 1, endLine);
  const content = extractedLines.join('\n');

  // End offset is start + content length
  const endOffset = startOffset + content.length;

  return { content, startOffset, endOffset };
}

// ─── Footnote placement ─────────────────────────────────────────────────────

/**
 * Appends a footnote block to the document. If existing `[^ct-` footnotes
 * are present outside fenced code blocks, appends after the last such
 * footnote block (including indented continuation lines). Otherwise
 * appends at the end. Footnote definitions inside ``` code blocks are
 * ignored so that example snippets do not capture new footnotes.
 */
export function appendFootnote(text: string, footnoteBlock: string): string {
  // Check if document has existing footnotes
  if (!text.includes('[^ct-')) {
    return text + footnoteBlock;
  }

  const lines = text.split('\n');
  let lastFootnoteEnd = -1;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    if (line.startsWith('[^ct-')) {
      lastFootnoteEnd = i;
      let j = i + 1;
      while (j < lines.length && lines[j]!.startsWith('    ')) {
        lastFootnoteEnd = j;
        j++;
      }
    }
  }

  if (lastFootnoteEnd === -1) {
    return text + footnoteBlock;
  }

  const before = lines.slice(0, lastFootnoteEnd + 1).join('\n');
  const after = lines.slice(lastFootnoteEnd + 1).join('\n');

  // Ensure the new footnote block never concatenates with the last line of the previous
  // footnote (e.g. "trial" + "aks" -> "trialaks"). Insert exactly one blank line between
  // the previous block and the new footnote; block already provides leading \n\n.
  const block = footnoteBlock.startsWith('\n') ? footnoteBlock : '\n\n' + footnoteBlock;
  const separator = '';

  if (after.length > 0) {
    return before + separator + block + '\n' + after;
  }
  return before + separator + block;
}

// ─── applySingleOperation ───────────────────────────────────────────────────

/**
 * Applies one CriticMarkup operation to document text: string match, after_line insertion,
 * or line-range substitution/deletion. Appends footnote. Does not validate, write to disk, or allocate IDs.
 * Hashline params must be already validated and adjusted (e.g. by propose_batch loop).
 */
export function applySingleOperation(params: ApplySingleOperationParams): ApplySingleOperationResult {
  const {
    fileContent,
    oldText,
    newText,
    changeId,
    author,
    reasoning,
    insertAfter,
    afterLine,
    startLine,
    endLine,
  } = params;

  if (oldText === '' && newText === '') {
    throw new Error('Both oldText and newText are empty — nothing to change.');
  }

  const fileLines = fileContent.split('\n');

  if (afterLine !== undefined && oldText === '') {
    const changeType: 'ins' | 'del' | 'sub' = 'ins';
    let cleanedNewText = newText;
    const newTextLines = cleanedNewText.split('\n');
    const strippedLines = stripHashlinePrefixes(newTextLines);
    cleanedNewText = strippedLines.join('\n');
    // Pad with a space when content starts with '+', '-', or '~' to avoid ambiguous delimiter sequences.
    const insPad = /^[+\-~]/.test(cleanedNewText) ? ' ' : '';
    const inlineMarkup = `{++${insPad}${cleanedNewText}++}[^${changeId}]`;
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = reasoning
      ? `\n    @${author} ${nowTimestamp().raw}: ${reasoning}`
      : '';
    const footnoteBlock = footnoteHeader + reasonLine;
    const insertPos = fileLines.slice(0, afterLine).join('\n').length;
    let modifiedText = fileContent.slice(0, insertPos) + '\n' + inlineMarkup + fileContent.slice(insertPos);
    modifiedText = appendFootnote(modifiedText, footnoteBlock);
    const affectedEnd = Math.min(modifiedText.split('\n').length, afterLine + 3);
    return { modifiedText, changeType, affectedStartLine: afterLine, affectedEndLine: affectedEnd };
  }

  if (startLine !== undefined) {
    const effectiveEndLine = endLine ?? startLine;
    const extracted = extractLineRange(fileLines, startLine, effectiveEndLine);
    let cleanedNewText = newText;
    let newTextLines = cleanedNewText.split('\n');
    newTextLines = stripHashlinePrefixes(newTextLines);
    newTextLines = stripBoundaryEcho(fileLines, startLine, effectiveEndLine, newTextLines);
    cleanedNewText = newTextLines.join('\n');

    let modifiedBody: string;
    let changeType: 'ins' | 'del' | 'sub';

    if (oldText !== '') {
      const match = findUniqueMatch(contentZoneText(extracted.content), oldText, defaultNormalizer);
      // Check overlap using absolute position in the full file content
      const absPos = extracted.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const actualOldText = match.originalText;
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedOldText, refs: preservedRefs } = stripRefsFromContent(actualOldText);
      changeType = cleanedNewText === '' ? 'del' : 'sub';
      // Pad with a space when old content starts with '-' or '~' to avoid ambiguous delimiter sequences.
      const pad = /^[+\-~]/.test(cleanedOldText) ? ' ' : '';
      const inlineMarkup =
        changeType === 'del'
          ? `{--${pad}${cleanedOldText}--}[^${changeId}]${preservedRefs.join('')}`
          : `{~~${pad}${cleanedOldText}~>${cleanedNewText}~~}[^${changeId}]${preservedRefs.join('')}`;
      const absEnd = absPos + match.length;
      modifiedBody = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    } else {
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
      changeType = cleanedNewText === '' ? 'del' : 'sub';
      // Pad with a space when content starts with '-' or '~' to avoid ambiguous delimiter sequences.
      const pad = /^[+\-~]/.test(cleanedExtracted) ? ' ' : '';
      const inlineMarkup =
        changeType === 'del'
          ? `{--${pad}${cleanedExtracted}--}[^${changeId}]${preservedRefs.join('')}`
          : `{~~${pad}${cleanedExtracted}~>${cleanedNewText}~~}[^${changeId}]${preservedRefs.join('')}`;
      modifiedBody =
        fileContent.slice(0, extracted.startOffset) + inlineMarkup + fileContent.slice(extracted.endOffset);
    }

    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = reasoning
      ? `\n    @${author} ${nowTimestamp().raw}: ${reasoning}`
      : '';
    const modifiedText = appendFootnote(modifiedBody, footnoteHeader + reasonLine);
    const affectedEnd = Math.min(modifiedText.split('\n').length, effectiveEndLine + 5);
    return { modifiedText, changeType, affectedStartLine: startLine, affectedEndLine: affectedEnd };
  }

  const applied = applyProposeChange({
    text: fileContent,
    oldText,
    newText,
    changeId,
    author,
    reasoning,
    insertAfter,
  });
  const lines = applied.modifiedText.split('\n');
  // Find the line containing the CriticMarkup change to return a bounded window
  let matchLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (/\{\+\+|\{--|\{~~|\{==/.test(lines[i])) {
      matchLine = i + 1;
      break;
    }
  }
  return {
    modifiedText: applied.modifiedText,
    changeType: applied.changeType,
    affectedStartLine: Math.max(1, matchLine - 2),
    affectedEndLine: Math.min(lines.length, matchLine + 5),
  };
}
