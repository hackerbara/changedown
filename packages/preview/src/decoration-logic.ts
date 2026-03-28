/**
 * Platform-agnostic decoration plan builder.
 *
 * Extracts the core decoration loop from the VS Code EditorDecorator into a
 * pure function that works entirely with UTF-16 offsets. Consumers (VS Code
 * adapter, browser EditorDecorator) convert the offset-based plan into their
 * platform's decoration API.
 */

import { ChangeNode, ChangeStatus, ChangeType, findFootnoteBlockStart, isGhostNode } from '@changedown/core';
import { AUTHOR_PALETTE } from './palette.js';
import { diffChars } from 'diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'review' | 'changes' | 'settled' | 'raw';

export interface OffsetRange {
    start: number;
    end: number;
}

export interface OffsetDecoration {
    range: OffsetRange;
    hoverText?: string;
    renderBefore?: { contentText: string };
    renderAfter?: { contentText: string; fontStyle?: string };
}

export type AuthorDecorationRole =
    | 'insertion'
    | 'deletion'
    | 'substitution-original'
    | 'substitution-modified'
    | 'move-from'
    | 'move-to';

export interface DecorationPlan {
    insertions: OffsetDecoration[];
    deletions: OffsetDecoration[];
    substitutionOriginals: OffsetDecoration[];
    substitutionModifieds: OffsetDecoration[];
    highlights: OffsetDecoration[];
    comments: OffsetDecoration[];
    hiddens: OffsetDecoration[];
    unfoldedDelimiters: OffsetDecoration[];
    commentIcons: OffsetDecoration[];
    activeHighlights: OffsetDecoration[];
    moveFroms: OffsetDecoration[];
    moveTos: OffsetDecoration[];
    settledRefs: OffsetDecoration[];
    settledDims: OffsetDecoration[];
    ghostDeletions: OffsetDecoration[];
    consumedRanges: OffsetDecoration[];
    consumingOpAnnotations: OffsetDecoration[];
    hiddenOffsets: OffsetRange[];
    /** Per-author decoration groups. Key format: `"author:role"` (e.g. `"Alice:insertion"`). */
    authorDecorations: Map<string, { role: AuthorDecorationRole; ranges: OffsetDecoration[] }>;
}

// ---------------------------------------------------------------------------
// AuthorColorMap — consumer-side utility for VS Code and browser decorators.
// NOT used inside buildDecorationPlan() itself; the plan groups decorations by
// "author:role" key and defers color lookup to the platform adapter.
// ---------------------------------------------------------------------------

export class AuthorColorMap {
    private map: Map<string, number> = new Map();

    getIndex(author: string): number {
        if (!this.map.has(author)) {
            this.map.set(author, this.map.size % AUTHOR_PALETTE.length);
        }
        return this.map.get(author)!;
    }

    getColor(author: string): { light: string; dark: string } {
        return AUTHOR_PALETTE[this.getIndex(author)];
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Precompute byte offsets of each line start for O(log n) offset→line lookup. */
function computeLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
}

/** Binary-search line number for a UTF-16 offset. */
function offsetToLine(lineStarts: number[], offset: number): number {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function isOffsetInRange(offset: number, range: OffsetRange): boolean {
    return offset >= range.start && offset <= range.end;
}

function hideDelimiters(
    fullRange: OffsetRange,
    contentRange: OffsetRange,
    hiddens: OffsetDecoration[],
): void {
    if (fullRange.start < contentRange.start) {
        hiddens.push({ range: { start: fullRange.start, end: contentRange.start } });
    }
    if (contentRange.end < fullRange.end) {
        hiddens.push({ range: { start: contentRange.end, end: fullRange.end } });
    }
}

function revealDelimiters(
    fullRange: OffsetRange,
    contentRange: OffsetRange,
    unfoldedDelimiters: OffsetDecoration[],
): void {
    if (fullRange.start < contentRange.start) {
        unfoldedDelimiters.push({ range: { start: fullRange.start, end: contentRange.start } });
    }
    if (contentRange.end < fullRange.end) {
        unfoldedDelimiters.push({ range: { start: contentRange.end, end: fullRange.end } });
    }
}

function getCharLevelRanges(change: ChangeNode): OffsetRange[] {
    if (!change.originalText || !change.modifiedText) return [];
    if (change.originalText.includes('\n') || change.modifiedText.includes('\n')) return [];
    const charDiffs = diffChars(change.originalText, change.modifiedText);
    const ranges: OffsetRange[] = [];
    let modOffset = 0;
    for (const diff of charDiffs) {
        if (diff.added) {
            ranges.push({
                start: change.contentRange.start + modOffset,
                end: change.contentRange.start + modOffset + diff.value.length,
            });
            modOffset += diff.value.length;
        } else if (!diff.removed) {
            modOffset += diff.value.length;
        }
    }
    return ranges;
}

function createEmptyPlan(): DecorationPlan {
    return {
        insertions: [],
        deletions: [],
        substitutionOriginals: [],
        substitutionModifieds: [],
        highlights: [],
        comments: [],
        hiddens: [],
        unfoldedDelimiters: [],
        commentIcons: [],
        activeHighlights: [],
        moveFroms: [],
        moveTos: [],
        settledRefs: [],
        settledDims: [],
        ghostDeletions: [],
        consumedRanges: [],
        consumingOpAnnotations: [],
        hiddenOffsets: [],
        authorDecorations: new Map(),
    };
}

// ---------------------------------------------------------------------------
// buildDecorationPlan — the core extraction
// ---------------------------------------------------------------------------

/**
 * Build a platform-agnostic decoration plan from parsed CriticMarkup changes.
 *
 * This is a pure function: no side effects, no VS Code API, no DOM.
 * Consumers convert the returned offset-based plan into their platform's
 * decoration API (VS Code DecorationOptions, Monaco deltaDecorations, etc.).
 */
export function buildDecorationPlan(
    changes: ChangeNode[],
    text: string,
    viewMode: ViewMode,
    cursorOffset: number,
    showDelimiters: boolean,
    authorColorMode: 'auto' | 'always' | 'never',
): DecorationPlan {
    const plan = createEmptyPlan();
    const lineStarts = computeLineStarts(text);

    const isFinalMode = viewMode === 'settled';
    const isOriginalMode = viewMode === 'raw';
    const isReviewMode = viewMode === 'review';
    const showDelimitersInMarkup = showDelimiters && isReviewMode;
    const cursorRevealMode = showDelimiters && !isReviewMode && !isFinalMode && !isOriginalMode;

    // Determine if per-author coloring is active
    let useAuthorColors = authorColorMode === 'always';
    if (authorColorMode === 'auto') {
        const authors = new Set<string>();
        for (const c of changes) {
            if (c.metadata?.author) authors.add(c.metadata.author);
            if (c.inlineMetadata?.author) authors.add(c.inlineMetadata.author);
            if (authors.size >= 2) break;
        }
        useAuthorColors = authors.size >= 2;
    }

    // Per-author decoration grouping: key = "author:role"
    const addAuthorDecoration = (author: string, role: AuthorDecorationRole, decoration: OffsetDecoration) => {
        const key = `${author}:${role}`;
        if (!plan.authorDecorations.has(key)) {
            plan.authorDecorations.set(key, { role, ranges: [] });
        }
        plan.authorDecorations.get(key)!.ranges.push(decoration);
    };

    // Pre-build consumed-by lookup for O(1) predecessor queries
    const consumedByMap = new Map<string, ChangeNode[]>();
    for (const c of changes) {
        if (c.consumedBy) {
            const list = consumedByMap.get(c.consumedBy) ?? [];
            list.push(c);
            consumedByMap.set(c.consumedBy, list);
        }
    }

    const cursorLine = offsetToLine(lineStarts, cursorOffset);

    changes.forEach(change => {
        // Skip unresolved L3 nodes (anchored === false on level >= 2)
        if (isGhostNode(change)) return;

        // Consumed ops: dimmed + italic "consumed by" label
        if (change.consumedBy) {
            plan.consumedRanges.push({
                range: change.range,
                renderAfter: {
                    contentText: ` consumed by ${change.consumedBy}`,
                    fontStyle: 'italic',
                }
            });
            return;
        }

        const fullRange = change.range;
        const contentRange = change.contentRange;
        const isCursorInChange = isOffsetInRange(cursorOffset, contentRange);
        const changeStartLine = offsetToLine(lineStarts, fullRange.start);
        const changeEndLine = offsetToLine(lineStarts, fullRange.end);
        const isCursorOnChangeLine = changeStartLine <= cursorLine && cursorLine <= changeEndLine;
        const author = change.metadata?.author ?? change.inlineMetadata?.author;

        // Active highlight: cursor inside a change in review/changes mode
        if (isCursorInChange && !isFinalMode && !isOriginalMode) {
            if (change.type === ChangeType.Substitution && change.originalRange && change.modifiedRange) {
                plan.activeHighlights.push({ range: change.originalRange });
                plan.activeHighlights.push({ range: change.modifiedRange });
            } else {
                plan.activeHighlights.push({ range: fullRange });
            }
        }

        // Push helpers: route to default array or author-specific group
        const pushInsertion = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'insertion', d);
            else plan.insertions.push(d);
        };
        const pushDeletion = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'deletion', d);
            else plan.deletions.push(d);
        };
        const pushSubOriginal = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'substitution-original', d);
            else plan.substitutionOriginals.push(d);
        };
        const pushSubModified = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'substitution-modified', d);
            else plan.substitutionModifieds.push(d);
        };
        const pushHighlight = (d: OffsetDecoration) => { plan.highlights.push(d); };
        const pushComment = (d: OffsetDecoration) => { plan.comments.push(d); };
        const pushMoveFrom = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'move-from', d);
            else plan.moveFroms.push(d);
        };
        const pushMoveTo = (d: OffsetDecoration) => {
            if (author && useAuthorColors) addAuthorDecoration(author, 'move-to', d);
            else plan.moveTos.push(d);
        };

        // ─── Final / Original mode ───────────────────────────────────────
        if (isFinalMode || isOriginalMode) {
            const effectiveType = change.moveRole === 'from' ? ChangeType.Deletion
                : change.moveRole === 'to' ? ChangeType.Insertion
                : change.type;

            if (effectiveType === ChangeType.Insertion) {
                if (isFinalMode) {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                } else {
                    plan.hiddens.push({ range: fullRange });
                }
            } else if (effectiveType === ChangeType.Deletion) {
                if (change.range.start === change.range.end) {
                    // L3 zero-width deletion
                    if (isOriginalMode) {
                        const deletedText = change.originalText ?? '';
                        if (deletedText) {
                            plan.ghostDeletions.push({
                                range: fullRange,
                                renderBefore: { contentText: deletedText }
                            });
                        }
                    }
                } else if (isFinalMode) {
                    plan.hiddens.push({ range: fullRange });
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
            } else if (effectiveType === ChangeType.Substitution) {
                if (change.originalRange && change.modifiedRange) {
                    const openDelimiterEnd = change.range.start + 3;
                    const separatorStart = change.originalRange.end;
                    const separatorEnd = change.modifiedRange.start;
                    const closeDelimiterStart = change.modifiedRange.end;

                    if (isFinalMode) {
                        plan.hiddens.push({ range: { start: fullRange.start, end: openDelimiterEnd } });
                        plan.hiddens.push({ range: { start: change.originalRange.start, end: separatorEnd } });
                        plan.hiddens.push({ range: { start: closeDelimiterStart, end: fullRange.end } });
                    } else {
                        plan.hiddens.push({ range: { start: fullRange.start, end: openDelimiterEnd } });
                        plan.hiddens.push({ range: { start: separatorStart, end: fullRange.end } });
                    }
                }
            } else if (effectiveType === ChangeType.Highlight) {
                if (change.metadata?.comment) {
                    if (fullRange.start < contentRange.start) {
                        plan.hiddens.push({ range: { start: fullRange.start, end: contentRange.start } });
                    }
                    const highlightCloseEnd = contentRange.end + 3;
                    plan.hiddens.push({ range: { start: contentRange.end, end: highlightCloseEnd } });
                    plan.hiddens.push({ range: { start: highlightCloseEnd, end: fullRange.end } });
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
            } else if (effectiveType === ChangeType.Comment) {
                plan.hiddens.push({ range: fullRange });
            }
            return;
        }

        // ─── Settled refs ────────────────────────────────────────────────
        if (change.settled) {
            if (!showDelimiters) {
                plan.hiddens.push({ range: fullRange });
                return;
            }
            plan.settledRefs.push({ range: contentRange });
            if (change.status === ChangeStatus.Accepted || change.status === ChangeStatus.Rejected) {
                plan.settledDims.push({ range: contentRange });
            }
            return;
        }

        // ─── Review / Changes mode ──────────────────────────────────────

        // Move-first check
        if (change.moveRole === 'from') {
            if (showDelimitersInMarkup) {
                pushMoveFrom({ range: fullRange });
            } else if (isReviewMode) {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
                pushMoveFrom({ range: contentRange });
            } else if (isCursorOnChangeLine) {
                if (cursorRevealMode && isCursorInChange) {
                    revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
                pushMoveFrom({ range: contentRange });
            } else {
                plan.hiddens.push({ range: fullRange });
            }
        } else if (change.moveRole === 'to') {
            if (showDelimitersInMarkup) {
                pushMoveTo({ range: fullRange });
            } else if (isReviewMode) {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
                pushMoveTo({ range: contentRange });
            } else if (isCursorOnChangeLine) {
                if (cursorRevealMode && isCursorInChange) {
                    revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
                pushMoveTo({ range: contentRange });
            } else {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
            }
        } else if (change.type === ChangeType.Insertion) {
            const reasonHover = change.metadata?.comment
                ? `**Reason:** ${change.metadata.comment}`
                : undefined;
            if (showDelimitersInMarkup) {
                pushInsertion({ range: fullRange, hoverText: reasonHover });
            } else if (isReviewMode) {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
                pushInsertion({ range: contentRange, hoverText: reasonHover });
            } else if (isCursorOnChangeLine) {
                if (cursorRevealMode && isCursorInChange) {
                    revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
                pushInsertion({ range: contentRange, hoverText: reasonHover });
            } else {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
            }
        } else if (change.type === ChangeType.Deletion) {
            const reasonHover = change.metadata?.comment
                ? `**Reason:** ${change.metadata.comment}`
                : undefined;

            if (change.range.start === change.range.end) {
                // L3 zero-width deletion: ghost text
                const deletedText = change.originalText ?? '';
                if (deletedText && !isFinalMode) {
                    if (isReviewMode || isOriginalMode || isCursorOnChangeLine) {
                        plan.ghostDeletions.push({
                            range: fullRange,
                            renderBefore: { contentText: deletedText },
                            hoverText: reasonHover,
                        });
                    }
                }
            } else {
                // L2 deletion with content
                if (showDelimitersInMarkup) {
                    pushDeletion({ range: fullRange, hoverText: reasonHover });
                } else if (isReviewMode) {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                    pushDeletion({ range: contentRange, hoverText: reasonHover });
                } else if (isCursorOnChangeLine) {
                    if (cursorRevealMode && isCursorInChange) {
                        revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                    } else {
                        hideDelimiters(fullRange, contentRange, plan.hiddens);
                    }
                    pushDeletion({ range: contentRange, hoverText: reasonHover });
                } else {
                    plan.hiddens.push({ range: fullRange });
                }
            }
        } else if (change.type === ChangeType.Substitution) {
            const reasonHover = change.metadata?.comment
                ? `**Reason:** ${change.metadata.comment}`
                : undefined;

            if (change.originalRange && change.modifiedRange) {
                // CriticMarkup substitution with delimiter ranges
                const openDelimiterEnd = change.range.start + 3;
                const separatorStart = change.originalRange.end;
                const separatorEnd = change.modifiedRange.start;
                const closeDelimiterStart = change.modifiedRange.end;

                if (showDelimitersInMarkup) {
                    pushSubOriginal({ range: { start: fullRange.start, end: change.modifiedRange.start }, hoverText: reasonHover });
                    pushSubModified({ range: { start: change.modifiedRange.start, end: fullRange.end }, hoverText: reasonHover });
                } else if (isReviewMode) {
                    plan.hiddens.push({ range: { start: fullRange.start, end: openDelimiterEnd } });
                    plan.hiddens.push({ range: { start: separatorStart, end: separatorEnd } });
                    plan.hiddens.push({ range: { start: closeDelimiterStart, end: fullRange.end } });
                    pushSubOriginal({ range: change.originalRange, hoverText: reasonHover });
                    pushSubModified({ range: change.modifiedRange, hoverText: reasonHover });
                } else {
                    if (isCursorOnChangeLine) {
                        if (cursorRevealMode && isCursorInChange) {
                            plan.unfoldedDelimiters.push({ range: { start: fullRange.start, end: openDelimiterEnd } });
                            plan.unfoldedDelimiters.push({ range: { start: separatorStart, end: separatorEnd } });
                            plan.unfoldedDelimiters.push({ range: { start: closeDelimiterStart, end: fullRange.end } });
                        } else {
                            plan.hiddens.push({ range: { start: fullRange.start, end: openDelimiterEnd } });
                            plan.hiddens.push({ range: { start: separatorStart, end: separatorEnd } });
                            plan.hiddens.push({ range: { start: closeDelimiterStart, end: fullRange.end } });
                        }
                        pushSubOriginal({ range: change.originalRange, hoverText: reasonHover });
                        pushSubModified({ range: change.modifiedRange, hoverText: reasonHover });
                    } else {
                        // Settled-base: show only new text
                        plan.hiddens.push({ range: { start: fullRange.start, end: separatorEnd } });
                        plan.hiddens.push({ range: { start: closeDelimiterStart, end: fullRange.end } });
                    }
                }
            } else if (change.originalText || change.modifiedText) {
                // Sidecar substitution (L3)
                const charRanges = getCharLevelRanges(change);

                if (isReviewMode || isCursorOnChangeLine) {
                    if (charRanges.length > 0) {
                        for (const r of charRanges) {
                            pushSubModified({ range: r, hoverText: reasonHover });
                        }
                    } else {
                        if (change.modifiedText) pushSubModified({ range: contentRange, hoverText: reasonHover });
                        if (change.originalText) pushSubOriginal({ range: contentRange, hoverText: reasonHover });
                    }
                }
                // else: settled-base, no styling
            }
        } else if (change.type === ChangeType.Highlight) {
            const hoverText = change.metadata?.comment
                ? `**Comment:** ${change.metadata.comment}`
                : undefined;

            if (showDelimitersInMarkup) {
                pushHighlight({ range: fullRange, hoverText });
            } else if (isReviewMode) {
                hideDelimiters(fullRange, contentRange, plan.hiddens);
                pushHighlight({ range: contentRange, hoverText });
            } else if (isCursorOnChangeLine) {
                if (cursorRevealMode && isCursorInChange) {
                    revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                }
                pushHighlight({ range: contentRange, hoverText });
            } else {
                // Settled-base: highlight stays visible
                if (change.metadata?.comment) {
                    if (fullRange.start < contentRange.start) {
                        plan.hiddens.push({ range: { start: fullRange.start, end: contentRange.start } });
                    }
                    const highlightCloseEnd = contentRange.end + 3;
                    plan.hiddens.push({ range: { start: contentRange.end, end: highlightCloseEnd } });
                    plan.hiddens.push({ range: { start: highlightCloseEnd, end: fullRange.end } });
                    plan.commentIcons.push({
                        range: { start: contentRange.end, end: contentRange.end },
                        hoverText,
                    });
                    pushHighlight({ range: contentRange, hoverText });
                } else {
                    hideDelimiters(fullRange, contentRange, plan.hiddens);
                    pushHighlight({ range: contentRange, hoverText });
                }
            }
        } else if (change.type === ChangeType.Comment) {
            const hoverText = change.metadata?.comment
                ? `**Comment:** ${change.metadata.comment}`
                : undefined;

            if (showDelimitersInMarkup) {
                pushComment({ range: fullRange, hoverText });
            } else if (isReviewMode) {
                plan.hiddens.push({ range: fullRange });
                plan.commentIcons.push({
                    range: { start: fullRange.start, end: fullRange.start },
                    hoverText,
                });
            } else if (isCursorOnChangeLine) {
                if (cursorRevealMode && isCursorInChange) {
                    revealDelimiters(fullRange, contentRange, plan.unfoldedDelimiters);
                    pushComment({ range: contentRange, hoverText });
                } else {
                    plan.hiddens.push({ range: fullRange });
                    plan.commentIcons.push({
                        range: { start: fullRange.start, end: fullRange.start },
                        hoverText,
                    });
                }
            } else {
                plan.hiddens.push({ range: fullRange });
                plan.commentIcons.push({
                    range: { start: fullRange.start, end: fullRange.start },
                    hoverText,
                });
            }
        }

        // Consuming op annotations
        const consumedPreds = consumedByMap.get(change.id) ?? [];
        if (consumedPreds.length > 0) {
            const ids = consumedPreds.map(c => c.id).join(', ');
            plan.consumingOpAnnotations.push({
                range: { start: fullRange.end, end: fullRange.end },
                renderAfter: {
                    contentText: ` (consumed ${ids})`,
                    fontStyle: 'italic',
                }
            });
        }
    });

    // ─── L3 footnote edit-op dimming ─────────────────────────────────
    const hasL3Changes = changes.some(c => c.level >= 2);
    if (!isFinalMode && !isOriginalMode && hasL3Changes) {
        const lines = text.split('\n');
        const blockStart = findFootnoteBlockStart(lines);
        if (blockStart < lines.length) {
            const lastLine = lines.length - 1;
            const dimStart = lineStarts[blockStart];
            const dimEnd = lineStarts[lastLine] + lines[lastLine].length;
            plan.settledDims.push({ range: { start: dimStart, end: dimEnd } });
        }
    }

    // ─── Footnote ref splitting (post-processing) ────────────────────
    if (isReviewMode && text) {
        const searchArrays: OffsetDecoration[][] = [
            plan.insertions, plan.deletions, plan.substitutionOriginals,
            plan.substitutionModifieds, plan.highlights, plan.comments,
            plan.moveFroms, plan.moveTos,
        ];
        for (const [, entry] of plan.authorDecorations) {
            searchArrays.push(entry.ranges);
        }

        for (const change of changes) {
            if (!change.footnoteRefStart || change.settled) continue;
            const refStart = change.footnoteRefStart;
            const refEnd = change.range.end;

            for (const arr of searchArrays) {
                for (let i = 0; i < arr.length; i++) {
                    const entry = arr[i];
                    if (entry.range.end === refEnd && entry.range.start < refStart) {
                        arr[i] = { ...entry, range: { start: entry.range.start, end: refStart } };
                        plan.settledRefs.push({ range: { start: refStart, end: refEnd } });
                        break;
                    }
                }
            }
        }
    }

    // ─── Compute hiddenOffsets from plan.hiddens ─────────────────────
    plan.hiddenOffsets = plan.hiddens.map(h => ({ start: h.range.start, end: h.range.end }));

    return plan;
}
