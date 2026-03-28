import {
  parseAt,
  computeLineHash,
  CriticMarkupParser,
  ChangeStatus,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  nowTimestamp,
  defaultNormalizer,
  generateFootnoteDefinition,
  resolveAt,
  computeCommittedView,
  computeSettledView,
} from '@changedown/core';
import { validateOrAutoRemap, HashlineMismatchError, type RelocationEntry, type AutoRemapResult } from './hashline-relocate.js';
import type { SessionState, ViewName } from '../state.js';
import type { ChangeDownConfig } from '../config.js';
import {
  findUniqueMatch,
  contentZoneText,
  guardOverlap,
  resolveOverlapWithAuthor,
  stripRefsFromContent,
  appendFootnote,
} from '../file-ops.js';
import { offsetToLineNumber } from './change-utils.js';

export interface NormalizedCompactOp {
  at: string;
  type: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  oldText: string;
  newText: string;
  reasoning?: string;
}

export interface ResolvedCoordinates {
  rawStartLine: number;
  rawEndLine: number;
  startOffset: number;
  endOffset: number;
  content: string;
  relocations: RelocationEntry[];
  remaps: AutoRemapResult[];
  viewResolved?: ViewName;
  op: NormalizedCompactOp;
}

export interface ApplyResult {
  modifiedText: string;
  changeType: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  supersededIds: string[];
  affectedStartLine: number;
  affectedEndLine: number;
  relocations: RelocationEntry[];
  remaps: AutoRemapResult[];
  viewResolved?: ViewName;
  settled: boolean;
}

export function resolveCoordinates(
  op: NormalizedCompactOp,
  fileContent: string,
  fileLines: string[],
  state: SessionState,
  filePath: string,
  config: { hashline: { enabled: boolean; auto_remap?: boolean } },
): ResolvedCoordinates {
  const relocations: RelocationEntry[] = [];
  const remaps: AutoRemapResult[] = [];
  const autoRemap = config.hashline.auto_remap ?? true;

  // Stage 1: Parse coordinates
  const parsed = parseAt(op.at);
  let startLine = parsed.startLine;
  let startHash = parsed.startHash;
  let endLine = parsed.endLine;
  let endHash = parsed.endHash;
  let viewResolved: ViewName | undefined;

  // Stage 2: View-aware translation
  const startResolution = state.resolveHash(filePath, startLine, startHash);
  // If view resolution matched, translate to raw coordinates.
  // If view resolution failed (match: false), DON'T throw — fall through to Stage 3
  // which will try file-based relocation via validateOrAutoRemap.
  // If no session state (undefined), also fall through (existing behavior).
  if (startResolution?.match) {
    viewResolved = startResolution.view;
    const rawStart = startResolution.rawLineNum;
    if (rawStart < 1 || rawStart > fileLines.length) {
      throw new Error(`Line ${startLine} out of range after view translation (raw line ${rawStart}).`);
    }
    startLine = rawStart;
    startHash = computeLineHash(rawStart - 1, fileLines[rawStart - 1], fileLines);
  }

  if (parsed.startLine !== parsed.endLine) {
    const endResolution = state.resolveHash(filePath, endLine, endHash);
    // Same pattern as start line: don't throw on mismatch, let Stage 3 try relocation.
    if (endResolution?.match) {
      viewResolved = viewResolved ?? endResolution.view;
      const rawEnd = endResolution.rawLineNum;
      if (rawEnd < 1 || rawEnd > fileLines.length) {
        throw new Error(`End line ${endLine} out of range after view translation (raw line ${rawEnd}).`);
      }
      endLine = rawEnd;
      endHash = computeLineHash(rawEnd - 1, fileLines[rawEnd - 1], fileLines);
    }
  } else {
    // Single-line op: sync end to start (endHash not consumed downstream
    // in current implementation, but kept consistent for clarity)
    endLine = startLine;
    endHash = startHash;
  }

  // Stage 3: Auto-relocation (with Stage 3.5a fallback)
  let stage3StartFailed = false;
  try {
    const startResult = validateOrAutoRemap(
      { line: startLine, hash: startHash }, fileLines, 'start_line', relocations, autoRemap,
    );
    startLine = startResult.line;
    if (startResult.remap) remaps.push(startResult.remap);
  } catch (stage3Err) {
    if (!(stage3Err instanceof HashlineMismatchError)) throw stage3Err;
    stage3StartFailed = true;
  }

  let stage3EndFailed = false;
  if (parsed.startLine !== parsed.endLine) {
    try {
      const endResult = validateOrAutoRemap(
        { line: endLine, hash: endHash }, fileLines, 'end_line', relocations, autoRemap,
      );
      endLine = endResult.line;
      if (endResult.remap) remaps.push(endResult.remap);
    } catch (stage3Err) {
      if (!(stage3Err instanceof HashlineMismatchError)) throw stage3Err;
      stage3EndFailed = true;
    }
  } else {
    endLine = startLine;
    stage3EndFailed = stage3StartFailed;
  }

  // Stage 3+: Content confirmation gate
  // When hash validated (Stage 3 passed) but op has oldText, verify the text
  // actually exists at the resolved line. Catches cases where quick-fix hashes
  // or hash collisions point to a valid-but-wrong line.
  if (!stage3StartFailed && !stage3EndFailed && op.oldText !== '') {
    const rangeText = fileLines.slice(startLine - 1, endLine).join('\n');
    try {
      findUniqueMatch(rangeText, op.oldText, defaultNormalizer);
    } catch (confirmErr: unknown) {
      // Only invalidate if text genuinely not found (not if ambiguous — ambiguous means it IS there)
      if (confirmErr instanceof Error && confirmErr.message.startsWith('Text not found')) {
        stage3StartFailed = true;
        stage3EndFailed = true;
      }
    }
  }

  // Stage 3.5a: findUniqueMatch fallback (sub/del/highlight with explicit oldText)
  if ((stage3StartFailed || stage3EndFailed) && op.oldText !== '') {
    try {
      const contentZone = contentZoneText(fileContent);
      const match = findUniqueMatch(contentZone, op.oldText, defaultNormalizer);
      const matchStartLine = offsetToLineNumber(contentZone, match.index);
      const matchEndLine = offsetToLineNumber(contentZone, match.index + match.length - 1);
      if (stage3StartFailed) startLine = matchStartLine;
      if (stage3EndFailed) endLine = matchEndLine;
      stage3StartFailed = false;
      stage3EndFailed = false;
    } catch {
      // findUniqueMatch failed (ambiguous or not found) — fall through to Stage 3.5b
    }
  }

  // Stage 3.5b: View-hash resolution via committed/settled view
  // Fires when 3.5a didn't resolve (insertion, comment, whole-line del/sub, or ambiguous oldText)
  if (stage3StartFailed || stage3EndFailed) {
    const lastView = state.getLastReadView(filePath) ?? 'raw';
    const useSettled = lastView === 'settled';

    // Compute the appropriate view — committed strips pending proposals,
    // settled accepts them. Both return line-number mappings to raw file.
    const viewResult = useSettled
      ? computeSettledView(fileContent)
      : computeCommittedView(fileContent);

    const viewLines = viewResult.lines;
    const viewToRaw: Map<number, number> = useSettled
      ? (viewResult as ReturnType<typeof computeSettledView>).settledToRaw
      : (viewResult as ReturnType<typeof computeCommittedView>).committedToRaw;

    const getViewLineNum = (entry: (typeof viewLines)[0]): number =>
      useSettled
        ? (entry as { settledLineNum: number }).settledLineNum
        : (entry as { committedLineNum: number }).committedLineNum;

    const findInView = (targetLine: number, targetHash: string): number | undefined => {
      // Try exact line match first
      const exact = viewLines.find(
        (l) => getViewLineNum(l) === targetLine && l.hash === targetHash,
      );
      if (exact) {
        return viewToRaw.get(targetLine);
      }

      // Content-addressed scan: find hash at any line (unique match only)
      let uniqueMatch: (typeof viewLines)[0] | undefined;
      let ambiguous = false;
      for (const entry of viewLines) {
        if (entry.hash === targetHash) {
          if (uniqueMatch) { ambiguous = true; break; }
          uniqueMatch = entry;
        }
      }
      if (uniqueMatch && !ambiguous) {
        const matchedViewLine = getViewLineNum(uniqueMatch);
        return viewToRaw.get(matchedViewLine);
      }
      return undefined;
    };

    if (stage3StartFailed) {
      const rawLine = findInView(parsed.startLine, parsed.startHash);
      if (rawLine !== undefined && rawLine >= 1 && rawLine <= fileLines.length) {
        startLine = rawLine;
        // Validate via Stage 3 contract: recompute raw hash
        startHash = computeLineHash(rawLine - 1, fileLines[rawLine - 1], fileLines);
        stage3StartFailed = false;
      }
    }

    if (stage3EndFailed && parsed.startLine !== parsed.endLine) {
      const rawLine = findInView(parsed.endLine, parsed.endHash);
      if (rawLine !== undefined && rawLine >= 1 && rawLine <= fileLines.length) {
        endLine = rawLine;
        endHash = computeLineHash(rawLine - 1, fileLines[rawLine - 1], fileLines);
        stage3EndFailed = false;
      }
    } else if (stage3EndFailed) {
      endLine = startLine;
      endHash = startHash;
      stage3EndFailed = stage3StartFailed;
    }

    // If still unresolved after all fallbacks, throw hospitable error
    if (stage3StartFailed || stage3EndFailed) {
      const failedEndpoint = stage3StartFailed ? parsed.startLine : parsed.endLine;
      const failedHash = stage3StartFailed ? parsed.startHash : parsed.endHash;
      throw new HashlineMismatchError([{
        line: failedEndpoint,
        expected: failedHash,
        actual: failedEndpoint <= fileLines.length
          ? computeLineHash(failedEndpoint - 1, fileLines[failedEndpoint - 1], fileLines)
          : 'out-of-range',
      }], fileLines);
    }
  }

  // Compute character offsets
  let startOffset = 0;
  for (let i = 0; i < startLine - 1; i++) {
    startOffset += fileLines[i].length + 1;
  }
  let endOffset = startOffset;
  for (let i = startLine - 1; i <= endLine - 1; i++) {
    endOffset += fileLines[i].length + (i < endLine - 1 ? 1 : 0);
  }
  const content = fileLines.slice(startLine - 1, endLine).join('\n');

  return {
    rawStartLine: startLine,
    rawEndLine: endLine,
    startOffset,
    endOffset,
    content,
    relocations,
    remaps,
    viewResolved,
    op,
  };
}

/**
 * Compact-path equivalent of settleOnDemandIfNeeded.
 *
 * Given raw line numbers from view-aware coordinate translation,
 * checks if the target region overlaps any accepted/rejected CriticMarkup.
 * If so, settles the entire file in-memory (accepted then rejected)
 * and returns the settled content.
 */
function settleOnDemandForCompact(
  fileContent: string,
  rawStartLine: number,
  rawEndLine: number,
): { content: string; settled: boolean } {
  // Quick path: no settleable CriticMarkup → no settlement needed.
  // Note: {== (highlight) and {>> (comment) are not settleable; excluding them is correct.
  if (!/\{\+\+|\{--|\{~~/.test(fileContent)) {
    return { content: fileContent, settled: false };
  }

  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent, { skipCodeBlocks: false });
  const changes = doc.getChanges();

  const settleableChanges = changes.filter(
    (c) => c.status === ChangeStatus.Accepted || c.status === ChangeStatus.Rejected,
  );

  if (settleableChanges.length === 0) {
    return { content: fileContent, settled: false };
  }

  // Convert raw line numbers to character offsets for overlap detection
  const lines = fileContent.split('\n');
  let targetStart = 0;
  for (let i = 0; i < rawStartLine - 1 && i < lines.length; i++) {
    targetStart += lines[i].length + 1;
  }
  let targetEnd = targetStart;
  for (let i = rawStartLine - 1; i < rawEndLine && i < lines.length; i++) {
    targetEnd += lines[i].length + 1;
  }

  // Check if the target region overlaps any accepted/rejected change
  const overlapsSettleable = settleableChanges.some(
    (c) => c.range.start < targetEnd && c.range.end > targetStart,
  );

  if (!overlapsSettleable) {
    return { content: fileContent, settled: false };
  }

  // Settle accepted then rejected (same as classic path)
  const { settledContent: afterAccepted } = settleAcceptedChangesOnly(fileContent);
  const { settledContent: afterRejected } = settleRejectedChangesOnly(afterAccepted);

  return { content: afterRejected, settled: true };
}

/**
 * Apply a compact op to file content, constructing CriticMarkup.
 *
 * Stages 4-7:
 *   4. Settle-on-demand (resolve accepted/rejected markup overlapping the target)
 *   5. Auto-supersede same-author overlapping proposed changes
 *   6. Sub-line matching (for del/sub/highlight with non-empty oldText)
 *   7. Markup construction (build CriticMarkup and append footnote for level 2)
 */
export function applyCompactOp(
  resolved: ResolvedCoordinates,
  op: NormalizedCompactOp,
  fileContent: string,
  fileLines: string[],
  changeId: string,
  author: string,
  config: { protocol: { level: number }; hashline: { enabled: boolean; auto_remap?: boolean } },
): ApplyResult {
  const { relocations, remaps, viewResolved } = resolved;
  const supersededIds: string[] = [];

  // Build the at string from resolved raw coordinates so we can re-resolve after settle
  let rawStartLine = resolved.rawStartLine;
  let rawEndLine = resolved.rawEndLine;
  let resolvedAt: string;
  if (rawStartLine === rawEndLine) {
    resolvedAt = `${rawStartLine}:${computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines)}`;
  } else {
    const startH = computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines);
    const endH = computeLineHash(rawEndLine - 1, fileLines[rawEndLine - 1], fileLines);
    resolvedAt = `${rawStartLine}:${startH}-${rawEndLine}:${endH}`;
  }

  // Stage 4: Settle-on-demand
  let settled = false;
  {
    const settleResult = settleOnDemandForCompact(fileContent, rawStartLine, rawEndLine);
    if (settleResult.settled) {
      fileContent = settleResult.content;
      fileLines = fileContent.split('\n');
      settled = true;
      // Recompute hash for target line(s) in settled content
      const newStartHash = computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines);
      if (rawStartLine === rawEndLine) {
        resolvedAt = `${rawStartLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawEndLine - 1, fileLines[rawEndLine - 1], fileLines);
        resolvedAt = `${rawStartLine}:${newStartHash}-${rawEndLine}:${newEndHash}`;
      }
    }
  }

  // Resolve the at coordinate to get target character offsets
  let target = resolveAt(resolvedAt, fileLines);

  // Stage 5: Auto-supersede same-author overlapping proposed changes
  // For sub-line ops, narrow to the actual match position before checking overlaps
  // (resolveAt returns whole-line offsets, which would false-positive on unrelated changes)
  if (op.type !== 'ins' && op.type !== 'comment') {
    let overlapStart = target.startOffset;
    let overlapLength = target.endOffset - target.startOffset;
    if (op.oldText !== '') {
      const preMatch = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      overlapStart = target.startOffset + preMatch.index;
      overlapLength = preMatch.length;
    }
    const supersedeResult = resolveOverlapWithAuthor(
      fileContent, overlapStart, overlapLength, author,
    );
    if (supersedeResult) {
      fileContent = supersedeResult.settledContent;
      fileLines = fileContent.split('\n');
      supersededIds.push(...supersedeResult.supersededIds);
      // Re-resolve target after settlement (offsets shift when markup is settled)
      const rawCoords = parseAt(resolvedAt);
      rawStartLine = rawCoords.startLine;
      rawEndLine = rawCoords.endLine;
      const newStartHash = computeLineHash(rawCoords.startLine - 1, fileLines[rawCoords.startLine - 1], fileLines);
      if (rawCoords.startLine === rawCoords.endLine) {
        resolvedAt = `${rawCoords.startLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawCoords.endLine - 1, fileLines[rawCoords.endLine - 1], fileLines);
        resolvedAt = `${rawCoords.startLine}:${newStartHash}-${rawCoords.endLine}:${newEndHash}`;
      }
      target = resolveAt(resolvedAt, fileLines);
    }
  }

  // Stage 6 + 7: Markup construction
  const level = config.protocol.level;
  const ts = nowTimestamp();
  const authorAt = author.startsWith('@') ? author : `@${author}`;
  const l1Comment = (ct: string): string =>
    level === 1 ? `{>>${authorAt}|${ts.raw}|${ct}|proposed<<}` : '';

  let modifiedText: string;
  const changeType = op.type;

  if (op.type === 'ins') {
    // Insertion: insert after the target line
    const inlineMarkup = level === 2
      ? `{++${op.newText}++}[^${changeId}]`
      : `{++${op.newText}++}${l1Comment('ins')}`;

    const insertPos = fileLines.slice(0, target.endLine).join('\n').length;
    modifiedText = fileContent.slice(0, insertPos) + '\n' + inlineMarkup + fileContent.slice(insertPos);
  } else if (op.type === 'del') {
    if (op.oldText === '') {
      // Whole-line or whole-range deletion
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{--${cleanedContent}--}[^${changeId}]${refTail}`
        : `{--${cleanedContent}--}${l1Comment('del')}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      // Stage 6: sub-line matching
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{--${cleanedOld}--}[^${changeId}]${refTail}`
        : `{--${cleanedOld}--}${l1Comment('del')}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (op.type === 'sub') {
    if (op.oldText === '') {
      // Whole-line or whole-range substitution
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{~~${cleanedContent}~>${op.newText}~~}[^${changeId}]${refTail}`
        : `{~~${cleanedContent}~>${op.newText}~~}${l1Comment('sub')}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      // Stage 6: sub-line matching
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{~~${cleanedOld}~>${op.newText}~~}[^${changeId}]${refTail}`
        : `{~~${cleanedOld}~>${op.newText}~~}${l1Comment('sub')}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (op.type === 'comment') {
    // Standalone comment: insert comment markup at end of target line
    const commentText = op.reasoning ?? '';
    const inlineMarkup = level === 2
      ? `{>>${commentText}<<}[^${changeId}]`
      : `{>>${commentText}<<}${l1Comment('comment')}`;
    modifiedText = fileContent.slice(0, target.endOffset) + inlineMarkup + fileContent.slice(target.endOffset);
  } else {
    // Highlight
    if (op.oldText === '') {
      // Whole-line or whole-range highlight (empty oldText)
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{==${cleanedContent}==}[^${changeId}]${refTail}`
        : `{==${cleanedContent}==}${l1Comment('highlight')}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      // Stage 6: sub-line matching
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join('');
      const inlineMarkup = level === 2
        ? `{==${cleanedOld}==}[^${changeId}]${refTail}`
        : `{==${cleanedOld}==}${l1Comment('highlight')}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  }

  // Append footnote for level 2
  if (level === 2) {
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = op.reasoning && changeType !== 'comment'
      ? `\n    ${authorAt} ${ts.raw}: ${op.reasoning}`
      : '';
    const footnoteBlock = footnoteHeader + reasonLine;
    modifiedText = appendFootnote(modifiedText, footnoteBlock);
  }

  return {
    modifiedText,
    changeType,
    supersededIds,
    affectedStartLine: rawStartLine,
    affectedEndLine: rawEndLine,
    relocations,
    remaps,
    viewResolved,
    settled,
  };
}

/**
 * Convenience wrapper: resolve coordinates and apply markup in a single call.
 */
export function resolveAndApply(
  op: NormalizedCompactOp,
  fileContent: string,
  fileLines: string[],
  state: SessionState,
  filePath: string,
  config: ChangeDownConfig,
  changeId: string,
  author: string,
): ApplyResult {
  const resolved = resolveCoordinates(op, fileContent, fileLines, state, filePath, config);
  return applyCompactOp(resolved, op, fileContent, fileLines, changeId, author, config);
}
