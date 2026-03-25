import { ChangeNode, ChangeType, ChangeStatus, OffsetRange } from '../model/types.js';
import { VirtualDocument } from '../model/document.js';
import { parseOp } from '../op-parser.js';
import { parseTimestamp } from '../timestamp.js';
import { computeLineHash } from '../hashline.js';
import { relocateHashRef } from '../hashline-cleanup.js';
import { FOOTNOTE_DEF_START, FOOTNOTE_L3_EDIT_OP, FOOTNOTE_THREAD_REPLY, splitBodyAndFootnotes, CTX_RE, unescapeCtxString } from '../footnote-patterns.js';
import { parseFootnoteHeader } from '../footnote-utils.js';
import { tryFindUniqueMatch, type UniqueMatch } from '../file-ops.js';
import { defaultNormalizer } from '../text-normalizer.js';
import { resolveReplayFromParsedFootnotes, type ReplayFootnote } from '../operations/scrub.js';
import { lineOffset } from '../comment-syntax.js';

// CriticMarkup opener → closer mapping
const CM_OPENERS: Record<string, string> = {
  '{++': '++}',
  '{--': '--}',
  '{~~': '~~}',
  '{==': '==}',
  '{>>': '<<}',  // optional closer for comments
};

/**
 * Detect and extract contextual edit-op format.
 *
 * Contextual format: `Protocol {++o++}verview` — surrounding text provides
 * the body-match anchor. This differs from the old "self-anchoring" format
 * where the op string starts directly with a CriticMarkup delimiter.
 *
 * Returns null if the opString is NOT contextual (i.e. starts directly with
 * a CriticMarkup opener with no non-whitespace prefix text).
 *
 * Returns `{ contextBefore, opString, contextAfter }` where `opString` is the
 * extracted CriticMarkup portion (suitable for passing to `parseOp`).
 */
export function parseContextualEditOp(
  opString: string,
): { contextBefore: string; opString: string; contextAfter: string } | null {
  // Find the first CriticMarkup opener in the string
  let opStart = -1;
  let opener = '';
  for (const o of Object.keys(CM_OPENERS)) {
    const idx = opString.indexOf(o);
    if (idx !== -1 && (opStart === -1 || idx < opStart)) {
      opStart = idx;
      opener = o;
    }
  }

  if (opStart === -1) return null; // No CriticMarkup op found at all

  const contextBefore = opString.slice(0, opStart);

  // Find the matching closer
  const expectedCloser = CM_OPENERS[opener];
  let opEnd = -1;

  if (opener === '{~~') {
    // Substitution: find ~~} that is NOT part of ~> separator
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf('~~}', searchFrom);
    opEnd = closerIdx !== -1 ? closerIdx + 3 : -1;
  } else if (opener === '{>>') {
    // Comment: closer is optional
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf('<<}', searchFrom);
    if (closerIdx !== -1) {
      opEnd = closerIdx + 3;
    } else {
      // No closer — op extends to end of string
      opEnd = opString.length;
    }
  } else {
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf(expectedCloser, searchFrom);
    opEnd = closerIdx !== -1 ? closerIdx + expectedCloser.length : -1;
  }

  if (opEnd === -1) return null; // Closer not found — malformed op, don't parse contextually

  const extractedOp = opString.slice(opStart, opEnd);
  const contextAfter = opString.slice(opEnd);

  // Contextual if EITHER contextBefore OR contextAfter has non-whitespace text.
  // A change at column 0 produces "{++c++}onversational" (empty before, trailing after).
  // A change at end of line produces "context{++c++}" (leading before, empty after).
  // No non-whitespace context on either side — not a contextual op.
  if (contextBefore.trim() === '' && contextAfter.trim() === '') return null;
  // Guard: old @ctx: format "{--text--} @ctx:..." is NOT contextual — it's legacy metadata.
  if (contextBefore.trim() === '' && contextAfter.trimStart().startsWith('@ctx:')) return null;
  // Guard: reasoning suffix "{==text==}{>>comment" is NOT contextual — {>> is reasoning.
  if (contextBefore.trim() === '' && contextAfter.trimStart().startsWith('{>>')) return null;

  return { contextBefore, opString: extractedOp, contextAfter };
}

/** Extract deletion context from the portion of opString after the CriticMarkup closer. */
function parseDeletionContext(opString: string): { before: string; after: string } | null {
  // Find end of {--text--} in the opString
  const closerIdx = opString.indexOf('--}');
  if (closerIdx < 0) return null;
  const remainder = opString.slice(closerIdx + 3);
  const match = remainder.match(CTX_RE);
  if (!match) return null;
  return { before: unescapeCtxString(match[1]), after: unescapeCtxString(match[2]) };
}

// Approval metadata lines (indented)
const APPROVED_RE = /^ {4}approved:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;
const REJECTED_META_RE = /^ {4}rejected:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;

interface ParsedFootnote {
  id: string;
  author: string;
  date: string;
  type: string;
  status: string;
  lineNumber?: number;
  hash?: string;
  opString?: string;
  discussionText?: string;
  approvals?: Array<{ author: string; date: string; reason: string }>;
  rejections?: Array<{ author: string; date: string; reason: string }>;
  /** 0-indexed line in the raw text where this footnote header starts */
  startLine?: number;
  /** 0-indexed line where this footnote ends (inclusive) */
  endLine?: number;
  /** Number of discussion thread reply lines in the footnote body */
  replyCount?: number;
  /** Parsed image dimensions from `image-dimensions:` metadata line */
  imageDimensions?: { widthIn: number; heightIn: number };
  /** Additional image metadata key-value pairs from `image-*:` lines */
  imageMetadata?: Record<string, string>;
}

export class FootnoteNativeParser {
  parse(text: string): VirtualDocument {
    const lines = text.split('\n');
    const { bodyLines, footnoteLines } = splitBodyAndFootnotes(lines);

    const footnotes = this.parseFootnotes(lines);
    if (footnotes.length === 0) {
      return new VirtualDocument([]);
    }

    const changes = this.resolveChanges(footnotes, bodyLines);

    // freshAnchors: updated edit-op lines from the scrub replay, keyed by change ID.
    // Populated during the replay fallback below; used to compute resolvedText.
    let freshAnchors = new Map<string, string>();

    // Resolution protocol fallback: if any changes are unanchored,
    // run the scrub replay (backward+forward) using already-parsed footnote
    // data — avoids re-parsing the document through resolve().
    if (changes.some(c => !c.anchored)) {
      try {
        const bodyText = bodyLines.join('\n');

        // Convert ParsedFootnote[] to ReplayFootnote[], reconstructing the
        // full indented LINE:HASH edit-op line from the parsed fields.
        const replayFootnotes: ReplayFootnote[] = footnotes.map(fn => ({
          id: fn.id,
          type: fn.type,
          status: fn.status,
          lineNumber: fn.lineNumber,
          hash: fn.hash,
          opString: fn.opString,
          editOpLine: fn.opString && fn.lineNumber !== undefined && fn.hash
            ? `    ${fn.lineNumber}:${fn.hash} ${fn.opString}`
            : undefined,
        }));

        const replay = resolveReplayFromParsedFootnotes(bodyText, replayFootnotes);

        for (const node of changes) {
          if (node.anchored) continue;
          const finalPos = replay.finalPositions.get(node.id);
          const isConsumed = replay.consumption.has(node.id);
          // Only mark anchored if the protocol provides a valid body range.
          // Consumed ops stay anchored:false but are visible to LSP consumers
          // via their footnote-block range (assigned below).
          if (finalPos && !isConsumed) {
            node.anchored = true;
            node.range = { start: finalPos.start, end: finalPos.end };
            node.contentRange = { ...node.range };
            node.resolutionPath = 'replay';
          }
          const freshAnchor = replay.freshAnchors.get(node.id);
          if (freshAnchor) node.freshAnchor = freshAnchor;
          const consumed = replay.consumption.get(node.id);
          if (consumed) {
            node.consumedBy = consumed.consumedBy;
            node.consumptionType = consumed.type;

            // Assign footnote definition block as range for consumed ops
            // so LSP consumers have a valid position to attach UI to.
            if (node.footnoteLineRange) {
              const start = lineOffset(lines, node.footnoteLineRange.startLine);
              const end = lineOffset(lines, node.footnoteLineRange.endLine) + lines[node.footnoteLineRange.endLine].length;
              node.range = { start, end };
              node.contentRange = { ...node.range };
            }
          }
        }

        freshAnchors = replay.freshAnchors;
      } catch {
        // Resolution protocol failed — leave nodes unanchored
      }
    }

    // Compute real coherence rate from resolved vs total changes.
    // Ghost nodes (anchored:false) count as unresolved.
    const resolvableCount = changes.length;
    const resolvedCount = changes.filter(c => c.anchored || !!c.consumedBy).length;
    const coherenceRate = resolvableCount > 0
      ? Math.round((resolvedCount / resolvableCount) * 100)
      : 100;

    // Build resolvedText: rewrite footnote section with fresh anchors from replay.
    // Only set if at least one anchor changed (signals LSP write-back is needed).
    let resolvedText: string | undefined;
    if (freshAnchors.size > 0) {
      const rebuiltFootnotes: string[] = [];
      let anyChanged = false;
      let fi = 0;
      while (fi < footnoteLines.length) {
        const fline = footnoteLines[fi];
        const idMatch = fline.match(/^\[\^(ct-[\w.]+)\]:/);
        if (idMatch) {
          const freshAnchor = freshAnchors.get(idMatch[1]);
          rebuiltFootnotes.push(fline);
          fi++;
          let editOpReplaced = false;
          while (fi < footnoteLines.length) {
            const contLine = footnoteLines[fi];
            if (FOOTNOTE_DEF_START.test(contLine)) break;
            if (!editOpReplaced && FOOTNOTE_L3_EDIT_OP.test(contLine) && freshAnchor) {
              if (freshAnchor !== contLine) anyChanged = true;
              rebuiltFootnotes.push(freshAnchor);
              editOpReplaced = true;
              fi++;
            } else if (/^\s/.test(contLine) || contLine.trim() === '') {
              rebuiltFootnotes.push(contLine);
              fi++;
            } else {
              break;
            }
          }
        } else {
          rebuiltFootnotes.push(fline);
          fi++;
        }
      }
      if (anyChanged) {
        resolvedText = bodyLines.join('\n') + '\n\n' + rebuiltFootnotes.join('\n') + '\n';
      }
    }

    return new VirtualDocument(changes, coherenceRate, [], resolvedText);
  }

  private parseFootnotes(lines: string[]): ParsedFootnote[] {
    const entries: ParsedFootnote[] = [];
    let current: ParsedFootnote | null = null;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      if (FOOTNOTE_DEF_START.test(line)) {
        if (current) {
          // Close the previous footnote — its last line is the line before this one
          current.endLine = lineIdx - 1;
          entries.push(current);
        }
        // Extract ID from [^ct-N]: prefix
        const idMatch = line.match(/^\[\^(ct-[\w.]+)\]:/);
        const header = parseFootnoteHeader(line);
        if (idMatch && header) {
          current = {
            id: idMatch[1],
            author: '@' + header.author,
            date: header.date,
            type: header.type,
            status: header.status,
            startLine: lineIdx,
            replyCount: 0,
          };
        } else {
          current = null;
        }
        continue;
      }

      if (!current) continue;

      // Try to match a LINE:HASH {op} body line
      const opMatch = line.match(FOOTNOTE_L3_EDIT_OP);
      if (opMatch && current.opString === undefined) {
        current.lineNumber = parseInt(opMatch[1], 10);
        current.hash = opMatch[2].toLowerCase();
        current.opString = opMatch[3];
        continue;
      }

      // Count thread reply lines
      if (FOOTNOTE_THREAD_REPLY.test(line)) {
        current.replyCount = (current.replyCount ?? 0) + 1;
        continue;
      }

      // Try to match approved: metadata
      const approvedMatch = line.match(APPROVED_RE);
      if (approvedMatch) {
        if (!current.approvals) current.approvals = [];
        current.approvals.push({
          author: approvedMatch[1],
          date: approvedMatch[2],
          reason: approvedMatch[3],
        });
        continue;
      }

      // Try to match rejected: metadata
      const rejectedMatch = line.match(REJECTED_META_RE);
      if (rejectedMatch) {
        if (!current.rejections) current.rejections = [];
        current.rejections.push({
          author: rejectedMatch[1],
          date: rejectedMatch[2],
          reason: rejectedMatch[3],
        });
        continue;
      }

      // Try to match image metadata key-value lines: `    key: value`
      const imageMeta = line.match(/^\s+([\w-]+):\s*(.*)/);
      if (imageMeta) {
        const key = imageMeta[1];
        const value = imageMeta[2].trim();
        if (key === 'image-dimensions') {
          const dimMatch = value.match(/^([\d.]+)in\s*x\s*([\d.]+)in$/);
          if (dimMatch) {
            current.imageDimensions = {
              widthIn: parseFloat(dimMatch[1]),
              heightIn: parseFloat(dimMatch[2]),
            };
          }
        } else if (key.startsWith('image-') || key === 'merge-detected') {
          if (!current.imageMetadata) current.imageMetadata = {};
          current.imageMetadata[key] = value;
        }
        continue;
      }

      // Fallback: unmatched continuation line — store as discussion text (all change types)
      const trimmed = line.trim();
      if (trimmed && !current.discussionText) {
        current.discussionText = trimmed;
      }
    }

    if (current) {
      // Close the last footnote — trim trailing blank lines for accurate endLine
      let end = lines.length - 1;
      while (end > (current.startLine ?? 0) && lines[end].trim() === '') end--;
      current.endLine = end;
      entries.push(current);
    }
    return entries;
  }

  private resolveChanges(
    footnotes: ParsedFootnote[],
    bodyLines: string[],
  ): ChangeNode[] {
    const changes: ChangeNode[] = [];

    // Precompute cumulative line-start offsets for O(1) lookup
    const lineOffsets: number[] = [0];
    for (let i = 0; i < bodyLines.length; i++) {
      lineOffsets.push(lineOffsets[i] + bodyLines[i].length + 1);
    }

    for (const fn of footnotes) {
      const changeType = this.resolveType(fn.type);
      if (changeType === null) continue; // Skip unrecognized change types
      const status = this.resolveStatus(fn.status);

      // Parse the CriticMarkup op to extract text content.
      // For contextual format (e.g. "Protocol {++o++}verview"), extract the
      // CriticMarkup portion first — parseOp expects the string to start with
      // a CriticMarkup delimiter.
      let parsedOp: ReturnType<typeof parseOp> | null = null;
      let ctxResult: ReturnType<typeof parseContextualEditOp> = null;
      if (fn.opString) {
        try {
          ctxResult = parseContextualEditOp(fn.opString);
          parsedOp = parseOp(ctxResult ? ctxResult.opString : fn.opString);
        } catch {
          // Malformed op — skip this footnote
          continue;
        }
      }

      // Resolve range in body text
      const { range, originalText, modifiedText, comment, anchored, resolutionPath } = this.resolveRangeAndContent(
        fn,
        parsedOp,
        ctxResult,
        changeType,
        status,
        bodyLines,
        lineOffsets,
      );

      // Build the ChangeNode
      const node: ChangeNode = {
        id: fn.id,
        type: changeType,
        status,
        range,
        contentRange: { ...range }, // L3: range === contentRange (no delimiters in body)
        level: 2,
        // anchored:false means position could not be deterministically resolved (Invariant A).
        // anchored:true (default) means either resolved uniquely or explicitly OK (deletion line-start).
        anchored: anchored !== false,
        metadata: {
          author: fn.author,
          date: fn.date,
          comment: comment ?? parsedOp?.reasoning ?? undefined,
        },
      };

      if (originalText !== undefined) node.originalText = originalText;
      if (modifiedText !== undefined) node.modifiedText = modifiedText;

      // Populate enriched fields
      if (fn.startLine !== undefined) {
        node.footnoteLineRange = { startLine: fn.startLine, endLine: fn.endLine ?? fn.startLine };
      }
      node.replyCount = fn.replyCount ?? 0;
      if (fn.imageDimensions) {
        node.metadata!.imageDimensions = fn.imageDimensions;
      }
      if (fn.imageMetadata) {
        node.metadata!.imageMetadata = fn.imageMetadata;
      }
      if (resolutionPath !== undefined) {
        node.resolutionPath = resolutionPath;
      }

      // Approvals
      if (fn.approvals && fn.approvals.length > 0) {
        node.metadata!.approvals = fn.approvals.map(a => ({
          author: a.author,
          date: a.date,
          timestamp: parseTimestamp(a.date),
          reason: a.reason || undefined,
        }));
      }

      // Rejections
      if (fn.rejections && fn.rejections.length > 0) {
        node.metadata!.rejections = fn.rejections.map(r => ({
          author: r.author,
          date: r.date,
          timestamp: parseTimestamp(r.date),
          reason: r.reason || undefined,
        }));
      }

      changes.push(node);
    }

    changes.sort((a, b) => a.range.start - b.range.start);
    return changes;
  }

  /**
   * Resolve the character range for a change node in the body text.
   *
   * For L3:
   * - Insertion: search for newText on the target line via findUniqueMatch; range covers the matched text
   * - Deletion: zero-width range at the anchor point; uses @ctx: field for precise positioning
   * - Substitution: search for newText (proposed/accepted) or oldText (rejected) on target line
   * - Highlight: search for the highlighted text on the target line
   * - Comment: fall back to line start (no text to anchor to)
   * - Rejected insertion: text is not in body; zero-width range at line start
   *
   * DETERMINISTIC ANCHOR RESOLUTION INVARIANTS (spec §11):
   *
   * Invariant A — Non-deletion ops (ins, sub, highlight) MUST resolve uniquely via
   * findUniqueMatch on the hash-resolved line. If the match fails (text not found or
   * ambiguous), the node is marked anchored:false. There is NO fallback to line-start
   * for non-deletion ops. Silent fallback produces wrong decoration placement.
   *
   * Invariant B — Deletion ops resolve via @ctx:"before"||"after" ONLY. The deleted
   * text is absent from the body so there is nothing to search for. Line-start fallback
   * when @ctx is missing is acceptable degradation (not a silent error).
   *
   * Invariant C — anchored:false is an error path, not a silent default. Consumers
   * must not render anchored:false nodes as correctly placed decorations.
   *
   * Task 3 enforced Invariant A by removing the fallbackRange branches for
   * ins/sub/highlight and setting anchored:false + sentinel range {0,0} instead.
   */
  private resolveRangeAndContent(
    fn: ParsedFootnote,
    parsedOp: ReturnType<typeof parseOp> | null,
    ctxResult: ReturnType<typeof parseContextualEditOp>,
    changeType: ChangeType,
    status: ChangeStatus,
    bodyLines: string[],
    lineOffsets: number[],
  ): {
    range: OffsetRange;
    originalText?: string;
    modifiedText?: string;
    comment?: string;
    anchored?: boolean;  // false = could not resolve position deterministically (Invariant A)
    resolutionPath?: 'hash' | 'context' | 'rejected';
  } {
    // Resolve the effective line number — verify hash and relocate if needed
    let effectiveLineNumber = fn.lineNumber;
    let hashMatched = false;
    if (fn.lineNumber !== undefined && fn.hash) {
      const hashCheckIdx = fn.lineNumber - 1;
      if (hashCheckIdx >= 0 && hashCheckIdx < bodyLines.length) {
        const actualHash = computeLineHash(hashCheckIdx, bodyLines[hashCheckIdx], bodyLines);
        if (actualHash.toLowerCase() === fn.hash.toLowerCase()) {
          hashMatched = true;
        } else {
          const relocated = relocateHashRef(
            { line: fn.lineNumber, hash: fn.hash },
            bodyLines,
            computeLineHash,
          );
          if (relocated?.relocated) {
            effectiveLineNumber = relocated.newLine;
            hashMatched = true;
          }
        }
      }
    }

    // Compute the character offset of the start of the target line
    const lineIdx = (effectiveLineNumber ?? 1) - 1;
    const lineOffset = (lineIdx >= 0 && lineIdx < lineOffsets.length)
      ? lineOffsets[lineIdx]
      : 0;
    const lineContent = (lineIdx >= 0 && lineIdx < bodyLines.length)
      ? bodyLines[lineIdx]
      : '';

    // Fallback zero-width range at line start
    const fallbackRange: OffsetRange = { start: lineOffset, end: lineOffset };

    if (!parsedOp) {
      // No op string — settled/ghost footnote. No deterministic position can be resolved.
      // Mark anchored:false so consumers can filter these ghost nodes (Invariant A).
      return { range: fallbackRange, anchored: false, comment: fn.discussionText, resolutionPath: 'rejected' };
    }

    // Unified matching: find search text on the target line via findUniqueMatch
    const findOnLine = (searchText: string): UniqueMatch | null => {
      if (!searchText || !lineContent) return null;
      return tryFindUniqueMatch(lineContent, searchText, defaultNormalizer);
    };

    // ── Contextual edit-op resolution ─────────────────────────────────────
    // New format: `3:hash Protocol {++o++}verview` — the surrounding text
    // provides a body-match anchor so the op position can be pinpointed even
    // when the changed text alone is ambiguous. ctxResult and parsedOp are
    // pre-computed by the caller — no need to re-parse here.
    if (ctxResult && parsedOp) {
      const { contextBefore, contextAfter } = ctxResult;

      // Build the body-match string — what actually appears in the body for this op
      let bodyMatch: string;
      switch (changeType) {
        case ChangeType.Insertion:
          if (status === ChangeStatus.Rejected) {
            bodyMatch = contextBefore + contextAfter;
          } else {
            bodyMatch = contextBefore + parsedOp.newText + contextAfter;
          }
          break;
        case ChangeType.Deletion:
          bodyMatch = contextBefore + contextAfter;
          break;
        case ChangeType.Substitution:
          if (status === ChangeStatus.Rejected) {
            bodyMatch = contextBefore + parsedOp.oldText + contextAfter;
          } else {
            bodyMatch = contextBefore + parsedOp.newText + contextAfter;
          }
          break;
        case ChangeType.Highlight:
          bodyMatch = contextBefore + parsedOp.oldText + contextAfter;
          break;
        default:
          bodyMatch = contextBefore + contextAfter;
      }

      const bodyMatchResult = findOnLine(bodyMatch);

      if (bodyMatchResult) {
        const matchStart = lineOffset + bodyMatchResult.index;
        const opStart = matchStart + contextBefore.length;

        // Compute op body-side length
        let opBodyLength: number;
        switch (changeType) {
          case ChangeType.Insertion:
            opBodyLength = status === ChangeStatus.Rejected ? 0 : parsedOp.newText.length;
            break;
          case ChangeType.Deletion:
            opBodyLength = 0;
            break;
          case ChangeType.Substitution:
            opBodyLength = status === ChangeStatus.Rejected
              ? parsedOp.oldText.length
              : parsedOp.newText.length;
            break;
          case ChangeType.Highlight:
            opBodyLength = parsedOp.oldText.length;
            break;
          default:
            opBodyLength = 0;
        }

        const range: OffsetRange = { start: opStart, end: opStart + opBodyLength };
        return {
          range,
          originalText: parsedOp.oldText || undefined,
          modifiedText: parsedOp.newText || undefined,
          comment: parsedOp.reasoning ?? undefined,
          // When the hash also matched, label as 'hash' (same semantics as the
          // old resolve() Phase A: hash gate passed, context match pinpointed position).
          // When only context matched (hash mismatch or relocation), label as 'context'.
          resolutionPath: hashMatched ? 'hash' : 'context',
        };
      }
      // If body-match not found on line, fall through to legacy resolution
    }
    // ── End contextual resolution ──────────────────────────────────────────

    switch (changeType) {
      case ChangeType.Insertion: {
        // Invariant A: resolve by unique text match (newText) in line content.
        // No fallback to line-start for non-deletion cases.
        const text = parsedOp.newText;
        if (text === '') {
          return { range: fallbackRange, modifiedText: text, resolutionPath: hashMatched ? 'hash' : undefined };
        }
        // Rejected insertions: body still contains the inserted text (applyReview
        // only updates the footnote header, not the body). Search for newText so
        // settlement can locate and remove it.
        // Proposed/accepted insertions: same search — newText is in the body.
        const match = findOnLine(text);
        if (!match) {
          // Invariant A: non-deletion op could not be uniquely resolved — signal unresolved.
          // Use a zero-width sentinel range (not fallbackRange) so consumers can detect
          // the unresolved state without confusing it with a valid line-start position.
          return { range: { start: 0, end: 0 }, modifiedText: text, anchored: false };
        }
        const range: OffsetRange = {
          start: lineOffset + match.index,
          end: lineOffset + match.index + match.length,
        };
        return { range, modifiedText: text, resolutionPath: hashMatched ? 'hash' : undefined };
      }

      case ChangeType.Deletion: {
        // Invariant B: @ctx required for deterministic positioning.
        // Deleted text is absent from body — only context-based positioning is possible.
        const text = parsedOp.oldText;
        // Try context-based positioning from @ctx: field
        const ctx = fn.opString ? parseDeletionContext(fn.opString) : null;
        if (ctx) {
          const joined = ctx.before + ctx.after;
          if (joined.length > 0) {
            const match = findOnLine(joined);
            if (match) {
              const delPoint = lineOffset + match.index + ctx.before.length;
              return {
                range: { start: delPoint, end: delPoint },
                originalText: text,
                resolutionPath: hashMatched ? 'hash' : undefined,
              };
            }
          }
        }
        // No @ctx or context match failed — line-start fallback is acceptable for del
        // (Invariant B: this degradation is explicitly sanctioned, unlike ins/sub/highlight)
        return { range: fallbackRange, originalText: text, resolutionPath: hashMatched ? 'hash' : undefined };
      }

      case ChangeType.Substitution: {
        // Invariant A: resolve by unique text match in line content.
        // Body always contains newText regardless of status — applyReview only
        // updates the footnote header, not the body text. Search for newText
        // so settlement can locate and revert if rejected.
        // No fallback to line-start for non-deletion cases.
        const oldText = parsedOp.oldText;
        const newText = parsedOp.newText;
        const searchText = newText;
        const match = searchText ? findOnLine(searchText) : null;
        if (!match) {
          // Invariant A: non-deletion op could not be uniquely resolved — signal unresolved.
          return { range: { start: 0, end: 0 }, originalText: oldText, modifiedText: newText, anchored: false };
        }
        const range: OffsetRange = {
          start: lineOffset + match.index,
          end: lineOffset + match.index + match.length,
        };
        return { range, originalText: oldText, modifiedText: newText, resolutionPath: hashMatched ? 'hash' : undefined };
      }

      case ChangeType.Highlight: {
        // Highlights carry a comment annotation — the comment is the primary
        // payload, the text anchor is positioning. Unlike ins/sub where
        // decorating the wrong text is actively harmful, a highlight pinned
        // to the correct line (even at line-start) is still useful because
        // the user sees the comment. Best-effort: resolve if we can, fall
        // back to line-start if we can't, but always render.
        const text = parsedOp.oldText;
        const comment = parsedOp.reasoning;
        if (!text) {
          // Empty text (malformed footnote, Word round-trip artifact, cursor-
          // point highlight). Best-effort: pin to line-start, show comment.
          return { range: fallbackRange, comment };
        }
        const match = findOnLine(text);
        if (!match) {
          // Text not found or ambiguous on line. Best-effort: pin to line-
          // start so the comment is still visible on the correct line.
          return { range: fallbackRange, comment, resolutionPath: hashMatched ? 'hash' : undefined };
        }
        const range: OffsetRange = {
          start: lineOffset + match.index,
          end: lineOffset + match.index + match.length,
        };
        return { range, comment, resolutionPath: hashMatched ? 'hash' : undefined };
      }

      case ChangeType.Comment: {
        // Comments have no text to anchor to — line-start is the correct and only option.
        // (spec §11 summary table: comment always anchored at line-start)
        // When parsedOp.reasoning is empty, fall back to discussion text from the footnote body.
        const comment = (parsedOp.reasoning || undefined) ?? (parsedOp.oldText || fn.discussionText);
        return { range: fallbackRange, comment, resolutionPath: hashMatched ? 'hash' : undefined };
      }

      default:
        return { range: fallbackRange, resolutionPath: hashMatched ? 'hash' : undefined };
    }
  }

  private resolveType(type: string): ChangeType | null {
    switch (type) {
      case 'ins': case 'insertion': return ChangeType.Insertion;
      case 'del': case 'deletion': return ChangeType.Deletion;
      case 'sub': case 'substitution': return ChangeType.Substitution;
      case 'highlight': case 'hi': case 'hig': return ChangeType.Highlight;
      case 'comment': case 'com': return ChangeType.Comment;
      default: return null;
    }
  }

  private resolveStatus(status: string): ChangeStatus {
    switch (status) {
      case 'accepted': return ChangeStatus.Accepted;
      case 'rejected': return ChangeStatus.Rejected;
      default: return ChangeStatus.Proposed;
    }
  }
}
