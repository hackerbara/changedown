import * as vscode from 'vscode';
import { ChangeNode, ChangeStatus, ChangeType, isGhostNode, VirtualDocument } from '@changetracks/core';
import { ViewMode } from './view-mode';
import { EditorPort } from './view/EditorPort';
import { offsetToPosition, positionToOffset } from './converters';
import { diffChars } from 'diff';
import { AUTHOR_PALETTE } from './visual-semantics';
import { getOutputChannel } from './output-channel';

/**
 * Maps author names to palette indices. Assignment is insertion-order based;
 * the palette cycles when there are more than 5 distinct authors.
 */
class AuthorColorMap {
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

/**
 * Visual role for author-specific decoration types.
 * Only applies to actual changes (insertions, deletions, substitutions, moves).
 * Highlights and comments always use default decoration types — they mark
 * "what is being discussed", not "what changed", so author color is irrelevant.
 */
type AuthorDecorationRole = 'insertion' | 'deletion' | 'substitution-original' | 'substitution-modified' | 'move-from' | 'move-to';

export class EditorDecorator {
    // Styles
    private insertionObj: vscode.TextEditorDecorationType;
    private deletionObj: vscode.TextEditorDecorationType;
    private substitutionOriginalObj: vscode.TextEditorDecorationType;
    private substitutionModifiedObj: vscode.TextEditorDecorationType;
    private highlightObj: vscode.TextEditorDecorationType;
    private commentObj: vscode.TextEditorDecorationType;
    private hiddenObj: vscode.TextEditorDecorationType;
    private unfoldedObj: vscode.TextEditorDecorationType;
    private commentIconObj: vscode.TextEditorDecorationType;
    private activeHighlightObj: vscode.TextEditorDecorationType;
    private moveFromObj: vscode.TextEditorDecorationType;
    private moveToObj: vscode.TextEditorDecorationType;
    private settledRefObj: vscode.TextEditorDecorationType;
    private settledDimObj: vscode.TextEditorDecorationType;
    // L3: shared ghost-text type for zero-width deletions. The base type sets the
    // visual style (strikethrough, italic, deletion color); per-range renderOptions
    // supply contentText individually, so one type handles all ghost deletions.
    private ghostDeletionObj: vscode.TextEditorDecorationType;
    private consumedRefObj: vscode.TextEditorDecorationType;
    private consumingOpAnnotationObj: vscode.TextEditorDecorationType;

    // Overview ruler mark decoration types — one per change type, using ThemeColor
    // references so the user can override colors in their VS Code theme.
    // These are separate from the inline decoration types so ruler marks can be
    // shown/cleared independently of view mode without touching the inline styles.
    private rulerInsertionObj!: vscode.TextEditorDecorationType;
    private rulerDeletionObj!: vscode.TextEditorDecorationType;
    private rulerSubstitutionObj!: vscode.TextEditorDecorationType;
    private rulerHighlightObj!: vscode.TextEditorDecorationType;
    private rulerCommentObj!: vscode.TextEditorDecorationType;

    private style: 'foreground' | 'background';
    private authorColors: 'auto' | 'always' | 'never';
    private authorColorMap: AuthorColorMap = new AuthorColorMap();
    private authorDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private hadHiddenRanges = false;
    /** UTF-16 offset ranges hidden by the last decorate() call, sorted by start. Half-open: [start, end). */
    private lastHiddenOffsets: Array<{start: number; end: number}> = [];

    /** Returns the hidden offset ranges from the most recent decorate() call. */
    public getHiddenOffsets(): ReadonlyArray<{start: number; end: number}> {
        return this.lastHiddenOffsets;
    }

    constructor(style: 'foreground' | 'background' = 'foreground', authorColors: 'auto' | 'always' | 'never' = 'auto') {
        this.style = style;
        this.authorColors = authorColors;

        if (style === 'foreground') {
            // Foreground mode: colored text, no background tinting (popular editor style)
            // CSS injection via textDecoration for maximum specificity over semantic tokens
            this.insertionObj = vscode.window.createTextEditorDecorationType({
                light: { textDecoration: 'underline dotted #1E824C40; color: #1E824C' },
                dark: { textDecoration: 'underline dotted #66BB6A40; color: #66BB6A' },
                overviewRulerColor: '#66BB6A80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.deletionObj = vscode.window.createTextEditorDecorationType({
                light: { textDecoration: 'line-through; color: #C0392B' },
                dark: { textDecoration: 'line-through; color: #EF5350' },
                overviewRulerColor: '#EF535080',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.substitutionOriginalObj = vscode.window.createTextEditorDecorationType({
                light: { textDecoration: 'line-through; color: #C0392B' },
                dark: { textDecoration: 'line-through; color: #EF5350' },
                overviewRulerColor: '#FFB74D80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.substitutionModifiedObj = vscode.window.createTextEditorDecorationType({
                light: { textDecoration: 'none; color: #1E824C' },
                dark: { textDecoration: 'none; color: #66BB6A' },
                overviewRulerColor: '#FFB74D80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });
        } else {
            // Background mode: background tinting (legacy behavior)
            // CSS injection via textDecoration moves background to view-lines layer
            this.insertionObj = vscode.window.createTextEditorDecorationType({
                textDecoration: 'none; background-color: rgba(0,255,0,0.2); color: inherit',
                overviewRulerColor: '#66BB6A80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.deletionObj = vscode.window.createTextEditorDecorationType({
                textDecoration: 'line-through; background-color: rgba(255,0,0,0.2); opacity: 0.6',
                overviewRulerColor: '#EF535080',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.substitutionOriginalObj = vscode.window.createTextEditorDecorationType({
                textDecoration: 'line-through; background-color: rgba(255,0,0,0.15); color: rgba(255,50,50,1); opacity: 0.7',
                overviewRulerColor: '#FFB74D80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });

            this.substitutionModifiedObj = vscode.window.createTextEditorDecorationType({
                light: { textDecoration: 'underline; background-color: rgba(0,255,0,0.15); color: rgba(0, 130, 0, 1)' },
                dark: { textDecoration: 'underline; background-color: rgba(0,255,0,0.15); color: rgba(80, 220, 80, 1)' },
                overviewRulerColor: '#FFB74D80',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });
        }

        // Shared decoration types (unchanged across modes)
        // CSS injection for highlight and comment to override semantic tokens
        this.highlightObj = vscode.window.createTextEditorDecorationType({
            textDecoration: 'none; background-color: rgba(255,255,0,0.3)',
            overviewRulerColor: '#FFFF0080',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        this.commentObj = vscode.window.createTextEditorDecorationType({
            textDecoration: 'none; background-color: rgba(173,216,230,0.2); border: 1px solid rgba(100,149,237,0.5)'
        });

        this.hiddenObj = vscode.window.createTextEditorDecorationType({
            textDecoration: 'none; display: none;'
        });

        this.unfoldedObj = vscode.window.createTextEditorDecorationType({
            light: { color: 'rgba(100, 100, 100, 0.85)' },
            dark: { color: 'rgba(180, 180, 180, 0.7)' },
            fontStyle: 'italic'
        });

        this.commentIconObj = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '\ud83d\udcac',
                margin: '0 0 0 4px',
                color: 'rgba(100, 149, 237, 0.8)'
            }
        });

        this.activeHighlightObj = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 149, 237, 0.18)'
        });

        // Move decoration types: purple color, CSS injection for specificity
        this.moveFromObj = vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'line-through; color: #6C3483' },
            dark: { textDecoration: 'line-through; color: #CE93D8' },
            after: {
                contentText: ' \u2934',
                color: 'rgba(108, 52, 131, 0.6)',
            },
            overviewRulerColor: '#CE93D880',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        this.moveToObj = vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'underline; color: #6C3483' },
            dark: { textDecoration: 'underline; color: #CE93D8' },
            after: {
                contentText: ' \u2935',
                color: 'rgba(108, 52, 131, 0.6)',
            },
            overviewRulerColor: '#CE93D880',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        // Settled (accepted/rejected) changes: dimmed + italic to create visual
        // triage hierarchy — "already resolved" vs "needs attention" (proposed)
        this.settledDimObj = vscode.window.createTextEditorDecorationType({
            opacity: '0.5',
            fontStyle: 'italic',
        });

        // Settled ref: dimmed metadata reference [^ct-N], not an active change
        this.settledRefObj = vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: rgba(128, 128, 128, 0.6); font-style: italic' },
            dark: { textDecoration: 'none; color: rgba(160, 160, 160, 0.5); font-style: italic' }
        });

        // L3 ghost-text deletion: base style shared by all zero-width deletion points.
        // Per-range renderOptions.before.contentText carries the individual deleted strings.
        // Colors match the inline deletionObj (#C0392B light / #EF5350 dark).
        this.ghostDeletionObj = vscode.window.createTextEditorDecorationType({
            light: {
                before: {
                    color: '#C0392B',
                    fontStyle: 'italic',
                    textDecoration: 'line-through',
                }
            },
            dark: {
                before: {
                    color: '#EF5350',
                    fontStyle: 'italic',
                    textDecoration: 'line-through',
                }
            }
        });

        // Consumed ops: dimmed + italic to signal "superseded by another change"
        this.consumedRefObj = vscode.window.createTextEditorDecorationType({
            opacity: '0.45',
            fontStyle: 'italic',
        });

        // Consuming op annotation: only the after-text renderOptions matter,
        // so the base style is empty (no opacity/color on the body text itself)
        this.consumingOpAnnotationObj = vscode.window.createTextEditorDecorationType({});

        // Overview ruler-only decoration types — no inline styling, pure ruler marks.
        // Colors reference ThemeColor tokens declared in package.json contributes.colors
        // so users can override them per-theme.
        this.rulerInsertionObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changetracks.insertionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerDeletionObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changetracks.deletionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerSubstitutionObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changetracks.substitutionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerHighlightObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changetracks.highlightRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerCommentObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changetracks.commentRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
    }

    /**
     * For sidecar substitutions: compute character-level decoration ranges
     * within the visible (modified) text.
     *
     * Only applies to single-line substitutions with both originalText and modifiedText.
     * Multi-line substitutions skip character-level highlighting (MVP limitation).
     *
     * @param change The ChangeNode with originalText and modifiedText
     * @param text The full document text
     * @returns Array of ranges for character-level highlighting, or empty array if not applicable
     */
    private getCharLevelRanges(
        change: ChangeNode,
        text: string
    ): vscode.Range[] {
        // Skip if missing required fields
        if (!change.originalText || !change.modifiedText) {
            return [];
        }

        // Skip multi-line changes (MVP limitation - too complex)
        if (change.originalText.includes('\n') || change.modifiedText.includes('\n')) {
            return [];
        }

        // Compute character-level diff
        const charDiffs = diffChars(change.originalText, change.modifiedText);

        const insertionRanges: vscode.Range[] = [];
        let modOffset = 0; // Current position in modifiedText

        // Walk through diff chunks to find insertions/changes
        for (const diff of charDiffs) {
            if (diff.added) {
                // These characters are insertions - highlight them green
                // Map character offsets within modifiedText to document positions
                const startPos = offsetToPosition(text, change.contentRange.start + modOffset);
                const endPos = offsetToPosition(text, change.contentRange.start + modOffset + diff.value.length);
                insertionRanges.push(new vscode.Range(startPos, endPos));
                modOffset += diff.value.length;
            } else if (diff.removed) {
                // These characters were deleted - shown via deletion line, skip
                // Don't advance modOffset (this text isn't in modifiedText)
            } else {
                // Unchanged characters - advance offset but don't highlight
                modOffset += diff.value.length;
            }
        }

        return insertionRanges;
    }

    /**
     * Apply decorations to the editor based on parsed CriticMarkup changes.
     * @param editor The editor (or spy) to decorate
     * @param doc The parsed VirtualDocument from core
     * @param viewMode The view mode: 'review' shows full markup, 'changes' hides delimiters,
     *   'settled' hides deletions and shows only accepted content, 'raw' hides insertions
     *   and shows only original content. Also accepts boolean for backward compat (true = review, false = changes).
     * @param text The document text, needed to convert offset ranges to line:char positions
     */
    public decorate(editor: EditorPort, doc: VirtualDocument, viewMode: ViewMode | boolean, text?: string, showDelimiters?: boolean) {
        // Backward compatibility: boolean true = 'review', false = 'changes'
        const mode: ViewMode = typeof viewMode === 'boolean'
            ? (viewMode ? 'review' : 'changes')
            : viewMode;

        // showDelimiters behavior matrix:
        // - Review + Delimiters ON: full static markup, no cursor tricks
        // - Review + Delimiters OFF: type decorations on contentRange, delimiters hidden
        // - Simple + Delimiters ON: hidden by default, cursor-in-content reveals
        // - Simple + Delimiters OFF: always hidden, no unfolding
        // - Settled/Raw: setting ignored
        showDelimiters = showDelimiters ?? vscode.workspace.getConfiguration('changetracks').get<boolean>('showDelimiters', false);
        const isFinalMode = mode === 'settled';
        const isOriginalMode = mode === 'raw';
        const isReviewMode = mode === 'review';
        const showDelimitersInMarkup = showDelimiters && isReviewMode;
        const cursorRevealMode = showDelimiters && !isReviewMode && !isFinalMode && !isOriginalMode;

        const changes = doc.getChanges();

        const insertions: vscode.DecorationOptions[] = [];
        const deletions: vscode.DecorationOptions[] = [];
        const substitutionOriginals: vscode.DecorationOptions[] = [];
        const substitutionModifieds: vscode.DecorationOptions[] = [];
        const highlights: vscode.DecorationOptions[] = [];
        const comments: vscode.DecorationOptions[] = [];
        const hiddens: vscode.DecorationOptions[] = [];
        const unfoldedDelimiters: vscode.DecorationOptions[] = [];
        const commentIcons: vscode.DecorationOptions[] = [];
        const activeHighlights: vscode.DecorationOptions[] = [];
        const moveFroms: vscode.DecorationOptions[] = [];
        const moveTos: vscode.DecorationOptions[] = [];
        const settledRefs: vscode.DecorationOptions[] = [];
        const settledDims: vscode.DecorationOptions[] = [];
        // L3: ghost-text entries for zero-width deletions (before pseudo-element per range)
        const ghostDeletions: vscode.DecorationOptions[] = [];
        const consumedRanges: vscode.DecorationOptions[] = [];
        const consumingOpAnnotations: vscode.DecorationOptions[] = [];

        const cursorPos = editor.selection.active;

        // Determine if per-author coloring is active for this render pass
        let useAuthorColors = this.authorColors === 'always';
        if (this.authorColors === 'auto') {
            const authors = new Set<string>();
            for (const c of changes) {
                if (c.metadata?.author) authors.add(c.metadata.author);
                if (c.inlineMetadata?.author) authors.add(c.inlineMetadata.author);
                if (authors.size >= 2) break; // early exit
            }
            useAuthorColors = authors.size >= 2;
        }

        // Per-author decoration collection: maps dynamic TextEditorDecorationType → ranges
        const authorDecorations: Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]> = new Map();
        const addAuthorDecoration = (type: vscode.TextEditorDecorationType, option: vscode.DecorationOptions) => {
            if (!authorDecorations.has(type)) {
                authorDecorations.set(type, []);
            }
            authorDecorations.get(type)!.push(option);
        };

        // Helper to convert an offset range to a vscode.Range
        const toRange = (range: { start: number; end: number }): vscode.Range => {
            if (text) {
                return new vscode.Range(
                    offsetToPosition(text, range.start),
                    offsetToPosition(text, range.end)
                );
            }
            // Fallback: should not happen in production, but keeps type safety
            return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        };

        // Pre-build consumed-by lookup for O(1) predecessor queries inside the loop
        const consumedByMap = new Map<string, ChangeNode[]>();
        for (const c of changes) {
            if (c.consumedBy) {
                const list = consumedByMap.get(c.consumedBy) ?? [];
                list.push(c);
                consumedByMap.set(c.consumedBy, list);
            }
        }

        changes.forEach(change => {
            // Skip unresolved L3 nodes: anchored === false on level >= 2 means the
            // FootnoteNativeParser could not uniquely locate the change in the document
            // body (Invariant A / C in the L3 spec). Rendering these with a sentinel
            // range {0,0} would produce a spurious decoration at the top of the file.
            // Note: L0/L1 inline changes also have anchored=false (meaning "no footnote
            // ref"), but their ranges ARE correct — they must NOT be filtered here.
            if (isGhostNode(change)) {
                const ch = getOutputChannel();
                if (ch) ch.appendLine(`[decorator] skipping unresolved L3 node id=${change.id} type=${change.type} — position could not be deterministically anchored`);
                return;
            }

            // Consumed ops: dimmed + italic with "consumed by ct-N" after-label.
            // Skip normal decoration logic — consumed ops are visually distinct.
            if (change.consumedBy) {
                consumedRanges.push({
                    range: toRange(change.range),
                    renderOptions: {
                        after: {
                            contentText: ` consumed by ${change.consumedBy}`,
                            color: new vscode.ThemeColor('editorCodeLens.foreground'),
                            fontStyle: 'italic',
                        }
                    }
                });
                return; // Don't process as normal change
            }

            const fullRange = toRange(change.range);
            const contentRange = toRange(change.contentRange);

            const isCursorInChange = this.isPositionInRange(cursorPos, contentRange);
            const isCursorOnChangeLine = fullRange.start.line <= cursorPos.line
                && cursorPos.line <= fullRange.end.line;
            const author = change.metadata?.author ?? change.inlineMetadata?.author;

            // Active highlight: when cursor is inside a change, add a subtle background
            // highlight to make the active change visually distinct. Works in all-markup
            // and simple modes. Skipped in final/original (clean text, no change awareness).
            if (isCursorInChange && !isFinalMode && !isOriginalMode) {
                if (change.type === ChangeType.Substitution && change.originalRange && change.modifiedRange) {
                    // Substitution: highlight BOTH halves as a single activation unit
                    activeHighlights.push({ range: toRange(change.originalRange) });
                    activeHighlights.push({ range: toRange(change.modifiedRange) });
                } else {
                    activeHighlights.push({ range: fullRange });
                }
            }

            // Helper: push to default array or author-specific type
            const pushInsertion = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'insertion'), option);
                } else {
                    insertions.push(option);
                }
            };
            const pushDeletion = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'deletion'), option);
                } else {
                    deletions.push(option);
                }
            };
            const pushSubOriginal = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'substitution-original'), option);
                } else {
                    substitutionOriginals.push(option);
                }
            };
            const pushSubModified = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'substitution-modified'), option);
                } else {
                    substitutionModifieds.push(option);
                }
            };
            // Highlights and comments always use default decoration types.
            // They mark "what is being discussed", not "what changed" —
            // author identity lives in the footnote, not the visual treatment.
            const pushHighlight = (option: vscode.DecorationOptions) => {
                highlights.push(option);
            };
            const pushComment = (option: vscode.DecorationOptions) => {
                comments.push(option);
            };
            const pushMoveFrom = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'move-from'), option);
                } else {
                    moveFroms.push(option);
                }
            };
            const pushMoveTo = (option: vscode.DecorationOptions) => {
                if (author && useAuthorColors) {
                    addAuthorDecoration(this.getAuthorDecorationType(author, 'move-to'), option);
                } else {
                    moveTos.push(option);
                }
            };

            // ─── Final / Original mode: hide everything that isn't the target text ───
            // Final = "all changes accepted" view: show insertions, hide deletions
            // Original = "all changes rejected" view: hide insertions, show deletions
            if (isFinalMode || isOriginalMode) {
                // In final/original modes, move-from is a deletion and move-to is an insertion
                const effectiveType = change.moveRole === 'from' ? ChangeType.Deletion
                    : change.moveRole === 'to' ? ChangeType.Insertion
                    : change.type;

                if (effectiveType === ChangeType.Insertion) {
                    if (isFinalMode) {
                        // Final: show insertion content, hide delimiters (accepted)
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    } else {
                        // Original: hide entire insertion (it didn't exist originally)
                        hiddens.push({ range: fullRange });
                    }
                } else if (effectiveType === ChangeType.Deletion) {
                    if (change.range.start === change.range.end) {
                        // L3 zero-width deletion in final/original mode.
                        // isFinalMode: deletion accepted = text is gone, nothing to render.
                        // isOriginalMode: show the deleted text as ghost text (it existed originally).
                        if (isOriginalMode) {
                            const deletedText = change.originalText ?? '';
                            if (deletedText) {
                                ghostDeletions.push({
                                    range: fullRange,
                                    renderOptions: { before: { contentText: deletedText } }
                                });
                            }
                        }
                        // isFinalMode: zero-width range, nothing to hide — no-op.
                    } else if (isFinalMode) {
                        // L2 final: hide entire deletion (accepted = removed)
                        hiddens.push({ range: fullRange });
                    } else {
                        // L2 original: show deletion content, hide delimiters (original text)
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                } else if (effectiveType === ChangeType.Substitution) {
                    if (change.originalRange && change.modifiedRange) {
                        const openDelimiterEnd = offsetToPosition(text || '', change.range.start + 3);
                        const separatorStart = offsetToPosition(text || '', change.originalRange.end);
                        const separatorEnd = offsetToPosition(text || '', change.modifiedRange.start);
                        const closeDelimiterStart = offsetToPosition(text || '', change.modifiedRange.end);
                        const originalRange = toRange(change.originalRange);

                        if (isFinalMode) {
                            // Final: show new text only — hide {~~, old text, ~>, and ~~}
                            // Hide opening delimiter {~~
                            hiddens.push({ range: new vscode.Range(fullRange.start, openDelimiterEnd) });
                            // Hide old text + separator (original range through separator end)
                            hiddens.push({ range: new vscode.Range(originalRange.start, separatorEnd) });
                            // Hide closing delimiter ~~}
                            hiddens.push({ range: new vscode.Range(closeDelimiterStart, fullRange.end) });
                        } else {
                            // Original: show old text only — hide {~~, ~>, new text, and ~~}
                            // Hide opening delimiter {~~
                            hiddens.push({ range: new vscode.Range(fullRange.start, openDelimiterEnd) });
                            // Hide separator + new text (separator start through closing delimiter)
                            hiddens.push({ range: new vscode.Range(separatorStart, fullRange.end) });
                        }
                    }
                    // Sidecar substitutions in final/original: no delimiters to hide, content
                    // is the visible text already — just show it without styling.
                } else if (effectiveType === ChangeType.Highlight) {
                    // Both modes: show highlighted content, hide delimiters and any attached comment
                    if (change.metadata?.comment) {
                        // Hide opening delimiter
                        if (!fullRange.start.isEqual(contentRange.start)) {
                            hiddens.push({ range: new vscode.Range(fullRange.start, contentRange.start) });
                        }
                        // Closing delimiter ==} (3 chars, always on same line as contentRange.end)
                        const highlightCloseEnd = new vscode.Position(
                            contentRange.end.line,
                            contentRange.end.character + 3
                        );
                        hiddens.push({ range: new vscode.Range(contentRange.end, highlightCloseEnd) });
                        // Attached comment {>>...<<}
                        hiddens.push({ range: new vscode.Range(highlightCloseEnd, fullRange.end) });
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                } else if (effectiveType === ChangeType.Comment) {
                    // Both modes: hide comments entirely
                    hiddens.push({ range: fullRange });
                }
                // Skip normal decoration logic — final/original show clean text
                return;
            }

            // Settled refs: accepted/rejected changes preserved as [^ct-N] references
            // Visible only when showDelimiters is enabled, styled as neutral metadata
            if (change.settled) {
                if (!showDelimiters) {
                    hiddens.push({ range: fullRange });
                    return;
                }
                // Neutral metadata styling — not type-colored
                settledRefs.push({ range: contentRange });
                // Dim settled (accepted/rejected) changes to visually distinguish
                // them from proposed changes that still need attention
                if (change.status === ChangeStatus.Accepted || change.status === ChangeStatus.Rejected) {
                    settledDims.push({ range: contentRange });
                }
                return;
            }

            // ─── All Markup / Simple mode: existing decoration logic ───

            // Move-first check: when a change has moveRole, use purple move decoration
            // instead of the normal type-based coloring. This skips the type switch below.
            if (change.moveRole === 'from') {
                if (showDelimitersInMarkup) {
                    pushMoveFrom({ range: fullRange });
                } else if (isReviewMode) {
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    pushMoveFrom({ range: contentRange });
                } else if (isCursorOnChangeLine) {
                    if (cursorRevealMode && isCursorInChange) {
                        this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                    pushMoveFrom({ range: contentRange });
                } else {
                    // Settled-base: move-from is a deletion — hide entirely
                    hiddens.push({ range: fullRange });
                }
            } else if (change.moveRole === 'to') {
                if (showDelimitersInMarkup) {
                    pushMoveTo({ range: fullRange });
                } else if (isReviewMode) {
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    pushMoveTo({ range: contentRange });
                } else if (isCursorOnChangeLine) {
                    if (cursorRevealMode && isCursorInChange) {
                        this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                    pushMoveTo({ range: contentRange });
                } else {
                    // Settled-base: move-to is an insertion — show as plain text
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    // NO pushMoveTo — content shows as plain text
                }
            } else if (change.type === ChangeType.Insertion) {
                const reasonHover = change.metadata?.comment
                    ? new vscode.MarkdownString(`**Reason:** ${change.metadata.comment}`)
                    : undefined;
                if (showDelimitersInMarkup) {
                    pushInsertion({ range: fullRange, hoverMessage: reasonHover });
                } else if (isReviewMode) {
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    pushInsertion({ range: contentRange, hoverMessage: reasonHover });
                } else if (isCursorOnChangeLine) {
                    // Cursor on this line — reveal with coloring
                    if (cursorRevealMode && isCursorInChange) {
                        this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                    pushInsertion({ range: contentRange, hoverMessage: reasonHover });
                } else {
                    // Settled-base: insertion shows as plain text, just hide delimiters
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    // NO pushInsertion — content shows as plain text
                }
            }
            else if (change.type === ChangeType.Deletion) {
                const reasonHover = change.metadata?.comment
                    ? new vscode.MarkdownString(`**Reason:** ${change.metadata.comment}`)
                    : undefined;

                // L3 zero-width deletion: the deleted text is not in the document body at
                // all — it lives only in change.originalText. Render it as ghost text via a
                // before pseudo-element so the reviewer can see what was removed.
                if (change.range.start === change.range.end) {
                    const deletedText = change.originalText ?? '';
                    if (deletedText && !isFinalMode) {
                        // In Simple (changes) mode, hide ghost text unless cursor is on
                        // the change's line — consistent with L2 deletion hiding at line 676.
                        // In Review and Raw modes, always show ghost text.
                        if (isReviewMode || isOriginalMode || isCursorOnChangeLine) {
                            ghostDeletions.push({
                                range: fullRange,
                                renderOptions: {
                                    before: { contentText: deletedText }
                                },
                                hoverMessage: reasonHover,
                            });
                        }
                    }
                    // Final mode (all accepted): deletion accepted means the text is gone —
                    // no ghost text, nothing to show. Range is already zero-width, so no
                    // additional hiding is needed.
                } else {
                    // L2: existing deletion handling — delimiter range [start, end) has content.
                    if (showDelimitersInMarkup) {
                        pushDeletion({ range: fullRange, hoverMessage: reasonHover });
                    } else if (isReviewMode) {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                        pushDeletion({ range: contentRange, hoverMessage: reasonHover });
                    } else if (isCursorOnChangeLine) {
                        // Cursor on this line — reveal with coloring
                        if (cursorRevealMode && isCursorInChange) {
                            this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                        } else {
                            this.hideDelimiters(fullRange, contentRange, hiddens);
                        }
                        pushDeletion({ range: contentRange, hoverMessage: reasonHover });
                    } else {
                        // Settled-base: hide entire deletion
                        hiddens.push({ range: fullRange });
                    }
                }
            }
            else if (change.type === ChangeType.Substitution) {
                const reasonHover = change.metadata?.comment
                    ? new vscode.MarkdownString(`**Reason:** ${change.metadata.comment}`)
                    : undefined;
                // Handle CriticMarkup substitutions (have originalRange/modifiedRange)
                if (change.originalRange && change.modifiedRange) {
                    const originalRange = toRange(change.originalRange);
                    const modifiedRange = toRange(change.modifiedRange);

                    // Calculate delimiter positions from offsets (shared by all branches below)
                    const openDelimiterEnd = offsetToPosition(text || '', change.range.start + 3);
                    const separatorStart = offsetToPosition(text || '', change.originalRange.end);
                    const separatorEnd = offsetToPosition(text || '', change.modifiedRange.start);
                    const closeDelimiterStart = offsetToPosition(text || '', change.modifiedRange.end);

                    if (showDelimitersInMarkup) {
                        // Include delimiters in decoration: {~~original~> in red, modified~~} in green
                        pushSubOriginal({ range: new vscode.Range(fullRange.start, modifiedRange.start), hoverMessage: reasonHover });
                        pushSubModified({ range: new vscode.Range(modifiedRange.start, fullRange.end), hoverMessage: reasonHover });
                    } else if (isReviewMode) {
                        // Review + Delimiters OFF: hide delimiters and separator, color both halves
                        hiddens.push({ range: new vscode.Range(fullRange.start, openDelimiterEnd) });
                        hiddens.push({ range: new vscode.Range(separatorStart, separatorEnd) });
                        hiddens.push({ range: new vscode.Range(closeDelimiterStart, fullRange.end) });
                        pushSubOriginal({ range: originalRange, hoverMessage: reasonHover });
                        pushSubModified({ range: modifiedRange, hoverMessage: reasonHover });
                    } else {

                        if (isCursorOnChangeLine) {
                            // Cursor on this line — reveal with coloring
                            if (cursorRevealMode && isCursorInChange) {
                                // Cursor inside: unfold delimiters
                                unfoldedDelimiters.push({
                                    range: new vscode.Range(fullRange.start, openDelimiterEnd)
                                });
                                unfoldedDelimiters.push({
                                    range: new vscode.Range(separatorStart, separatorEnd)
                                });
                                unfoldedDelimiters.push({
                                    range: new vscode.Range(closeDelimiterStart, fullRange.end)
                                });
                            } else {
                                // Cursor on same line but not inside (or CM OFF): hide delimiters
                                hiddens.push({
                                    range: new vscode.Range(fullRange.start, openDelimiterEnd)
                                });
                                hiddens.push({
                                    range: new vscode.Range(separatorStart, separatorEnd)
                                });
                                hiddens.push({
                                    range: new vscode.Range(closeDelimiterStart, fullRange.end)
                                });
                            }
                            pushSubOriginal({ range: originalRange, hoverMessage: reasonHover });
                            pushSubModified({ range: modifiedRange, hoverMessage: reasonHover });
                        } else {
                            // Settled-base: show only new text as plain, hide everything else
                            // Hide {~~ and original text and ~> (start through separator end)
                            hiddens.push({
                                range: new vscode.Range(fullRange.start, separatorEnd)
                            });
                            // Hide closing delimiter ~~}
                            hiddens.push({
                                range: new vscode.Range(closeDelimiterStart, fullRange.end)
                            });
                            // NO pushSubOriginal/pushSubModified — new text shows as plain
                        }
                    }
                }
                // Handle sidecar substitutions (have originalText and/or modifiedText)
                // These don't have delimiter ranges, just text fields
                else if ((change.originalText || change.modifiedText) && text) {
                    // For sidecar changes, contentRange covers the full visible change
                    if (isFinalMode) {
                        // Final (settled): new text wins — show content as plain text, no coloring
                        // contentRange already shows the modified text; no styling needed
                    } else if (isOriginalMode) {
                        // Original (raw): old text wins — show content with original coloring
                        pushSubOriginal({ range: contentRange, hoverMessage: reasonHover });
                    } else if (showDelimitersInMarkup) {
                        // N/A for L3 sidecar: no CriticMarkup delimiters to show
                        // Fall back to review-mode coloring
                        const charRanges = this.getCharLevelRanges(change, text);
                        if (charRanges.length > 0) {
                            for (const charRange of charRanges) {
                                pushSubModified({ range: charRange, hoverMessage: reasonHover });
                            }
                        } else {
                            if (change.modifiedText) {
                                pushSubModified({ range: contentRange, hoverMessage: reasonHover });
                            }
                            if (change.originalText) {
                                pushSubOriginal({ range: contentRange, hoverMessage: reasonHover });
                            }
                        }
                    } else if (isReviewMode) {
                        // Review: show ghost text + colors
                        const charRanges = this.getCharLevelRanges(change, text);
                        if (charRanges.length > 0) {
                            // Character-level highlighting available - use it instead of line-level
                            for (const charRange of charRanges) {
                                pushSubModified({ range: charRange, hoverMessage: reasonHover });
                            }
                        } else {
                            // No character-level highlighting - fall back to line-level
                            if (change.modifiedText) {
                                pushSubModified({ range: contentRange, hoverMessage: reasonHover });
                            }
                            if (change.originalText) {
                                pushSubOriginal({ range: contentRange, hoverMessage: reasonHover });
                            }
                        }
                    } else if (isCursorOnChangeLine) {
                        // Simple mode, cursor on this line: show colors without ghost text
                        const charRanges = this.getCharLevelRanges(change, text);
                        if (charRanges.length > 0) {
                            for (const charRange of charRanges) {
                                pushSubModified({ range: charRange, hoverMessage: reasonHover });
                            }
                        } else {
                            if (change.modifiedText) {
                                pushSubModified({ range: contentRange, hoverMessage: reasonHover });
                            }
                            if (change.originalText) {
                                pushSubOriginal({ range: contentRange, hoverMessage: reasonHover });
                            }
                        }
                    } else {
                        // Settled-base (Simple mode, cursor elsewhere): hide — show content as plain text
                        // No pushSubOriginal/pushSubModified — content shows unstyled
                    }
                }
            }
            else if (change.type === ChangeType.Highlight) {
                const hoverMessage = change.metadata?.comment
                    ? new vscode.MarkdownString(`**Comment:** ${change.metadata.comment}`)
                    : undefined;

                if (showDelimitersInMarkup) {
                    pushHighlight({ range: fullRange, hoverMessage });
                } else if (isReviewMode) {
                    this.hideDelimiters(fullRange, contentRange, hiddens);
                    pushHighlight({ range: contentRange, hoverMessage });
                } else if (isCursorOnChangeLine) {
                    // Cursor on this line — reveal with coloring
                    if (cursorRevealMode && isCursorInChange) {
                        this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                    }
                    pushHighlight({
                        range: contentRange,
                        hoverMessage
                    });
                } else {
                    // Settled-base: highlights stay visible (subtle highlight, hide delimiters)
                    if (change.metadata?.comment) {
                        // Highlight with attached comment: hide 3 non-overlapping ranges
                        if (!fullRange.start.isEqual(contentRange.start)) {
                            hiddens.push({
                                range: new vscode.Range(fullRange.start, contentRange.start)
                            });
                        }

                        // Closing delimiter ==} (3 chars after content ends)
                        const highlightCloseEnd = new vscode.Position(
                            contentRange.end.line,
                            contentRange.end.character + 3
                        );
                        hiddens.push({
                            range: new vscode.Range(contentRange.end, highlightCloseEnd)
                        });

                        // Entire comment block {>>...<<}
                        hiddens.push({
                            range: new vscode.Range(highlightCloseEnd, fullRange.end)
                        });

                        // Show icon at end of highlighted text
                        commentIcons.push({
                            range: new vscode.Range(contentRange.end, contentRange.end),
                            hoverMessage
                        });

                        // Background covers content text only (not comment block).
                        // View-lines layer handles the visual shift from hidden delimiters.
                        pushHighlight({
                            range: contentRange,
                            hoverMessage
                        });
                    } else {
                        this.hideDelimiters(fullRange, contentRange, hiddens);
                        pushHighlight({
                            range: contentRange,
                            hoverMessage
                        });
                    }
                }
            }
            else if (change.type === ChangeType.Comment) {
                const hoverMessage = change.metadata?.comment
                    ? new vscode.MarkdownString(`**Comment:** ${change.metadata.comment}`)
                    : undefined;

                if (showDelimitersInMarkup) {
                    pushComment({ range: fullRange, hoverMessage });
                } else if (isReviewMode) {
                    // Review + Delimiters OFF: hide everything, show comment icon
                    hiddens.push({ range: fullRange });
                    commentIcons.push({
                        range: new vscode.Range(fullRange.start, fullRange.start),
                        hoverMessage
                    });
                } else if (isCursorOnChangeLine) {
                    // Cursor on this line
                    if (cursorRevealMode && isCursorInChange) {
                        // Cursor inside: unfold delimiters, show comment styling
                        this.revealDelimiters(fullRange, contentRange, unfoldedDelimiters);
                        pushComment({
                            range: contentRange,
                            hoverMessage
                        });
                    } else {
                        // Cursor on same line but not inside (or CM OFF): hide, show icon
                        hiddens.push({ range: fullRange });
                        commentIcons.push({
                            range: new vscode.Range(fullRange.start, fullRange.start),
                            hoverMessage
                        });
                    }
                } else {
                    // Settled-base: hide entirely, keep comment icon
                    hiddens.push({ range: fullRange });
                    commentIcons.push({
                        range: new vscode.Range(fullRange.start, fullRange.start),
                        hoverMessage
                    });
                }
            }

            const consumedPreds = consumedByMap.get(change.id) ?? [];
            if (consumedPreds.length > 0) {
                const ids = consumedPreds.map(c => c.id).join(', ');
                consumingOpAnnotations.push({
                    range: new vscode.Range(fullRange.end, fullRange.end),
                    renderOptions: {
                        after: {
                            contentText: ` (consumed ${ids})`,
                            color: new vscode.ThemeColor('editorCodeLens.foreground'),
                            fontStyle: 'italic',
                        }
                    }
                });
            }
        });

        // ─── Overview ruler marks (right lane, ThemeColor) ───────────────────────
        // Collect ruler ranges grouped by change type. Rulers are shown in review
        // and changes modes where proposed changes are visible. In settled (final)
        // and raw (original) modes there are no pending changes, so clear all rulers.
        const rulerInsertions: vscode.DecorationOptions[] = [];
        const rulerDeletions: vscode.DecorationOptions[] = [];
        const rulerSubstitutions: vscode.DecorationOptions[] = [];
        const rulerHighlights: vscode.DecorationOptions[] = [];
        const rulerComments: vscode.DecorationOptions[] = [];

        if (!isFinalMode && !isOriginalMode) {
            for (const change of changes) {
                // Skip settled inline refs — they are dimmed and not pending review
                if (change.settled) { continue; }
                const range = toRange(change.range);
                const effectiveType = change.moveRole === 'from' ? ChangeType.Deletion
                    : change.moveRole === 'to' ? ChangeType.Insertion
                    : change.type;
                switch (effectiveType) {
                    case ChangeType.Insertion:
                        rulerInsertions.push({ range });
                        break;
                    case ChangeType.Deletion:
                        rulerDeletions.push({ range });
                        break;
                    case ChangeType.Substitution:
                        rulerSubstitutions.push({ range });
                        break;
                    case ChangeType.Highlight:
                        rulerHighlights.push({ range });
                        break;
                    case ChangeType.Comment:
                        rulerComments.push({ range });
                        break;
                }
            }
        }

        // ─── Footnote ref splitting (post-processing) ─────────────────────
        // In review mode, anchored L2 changes have [^ct-N] refs at the end
        // of their range. The type-colored decoration was applied to the full range
        // above. Now trim those decorations to end before the ref, and add the ref
        // portion to settledRefs (gray styling) instead.
        if ((showDelimitersInMarkup || isReviewMode) && text) {
            const searchArrays: vscode.DecorationOptions[][] = [
                insertions, deletions, substitutionOriginals, substitutionModifieds,
                highlights, comments, moveFroms, moveTos,
            ];
            for (const [, arr] of authorDecorations) {
                searchArrays.push(arr);
            }

            for (const change of changes) {
                if (!change.footnoteRefStart || change.settled) continue;
                const refStartPos = offsetToPosition(text, change.footnoteRefStart);
                const refEndPos = offsetToPosition(text, change.range.end);
                const refRange = new vscode.Range(refStartPos, refEndPos);

                // Find and trim the decoration entry that covers this ref
                for (const arr of searchArrays) {
                    for (let i = 0; i < arr.length; i++) {
                        const entry = arr[i];
                        if (entry.range.end.isEqual(refEndPos) &&
                            entry.range.start.isBefore(refStartPos)) {
                            // Trim: end the type-colored decoration before the ref
                            arr[i] = { ...entry, range: new vscode.Range(entry.range.start, refStartPos) };
                            settledRefs.push({ range: refRange });
                            break;
                        }
                    }
                }
            }
        }

        // Apply all base decorations (10 fixed types — index-sensitive, see SpyEditor)
        editor.setDecorations(this.insertionObj, insertions);
        editor.setDecorations(this.deletionObj, deletions);
        editor.setDecorations(this.substitutionOriginalObj, substitutionOriginals);
        editor.setDecorations(this.substitutionModifiedObj, substitutionModifieds);
        editor.setDecorations(this.highlightObj, highlights);
        editor.setDecorations(this.commentObj, comments);
        // Build sorted offset array of all hidden ranges for cursor snap.
        // The hiddens array is already in document order (changes processed sequentially).
        this.lastHiddenOffsets = text
            ? hiddens.map(h => ({
                start: positionToOffset(text, h.range.start),
                end: positionToOffset(text, h.range.end)
            }))
            : [];
        // Only dispose/recreate hiddenObj to flush CSS cache when a document that
        // actually has changes transitions to a mode with no hidden ranges (e.g.
        // settled→review). Skip the guard for empty-change editors (comment threads)
        // because disposing the shared decoration type would remove display:none
        // from the main document editor too.
        if (hiddens.length === 0 && this.hadHiddenRanges && changes.length > 0) {
            this.hiddenObj.dispose();
            this.hiddenObj = vscode.window.createTextEditorDecorationType({
                textDecoration: 'none; display: none;'
            });
            this.hadHiddenRanges = false;
        }
        editor.setDecorations(this.hiddenObj, hiddens);
        if (hiddens.length > 0) {
            this.hadHiddenRanges = true;
        }
        editor.setDecorations(this.unfoldedObj, unfoldedDelimiters);
        editor.setDecorations(this.commentIconObj, commentIcons);
        editor.setDecorations(this.activeHighlightObj, activeHighlights);
        editor.setDecorations(this.moveFromObj, moveFroms);
        editor.setDecorations(this.moveToObj, moveTos);
        editor.setDecorations(this.settledRefObj, settledRefs);
        editor.setDecorations(this.settledDimObj, settledDims);
        // L3 ghost-text deletions (before pseudo-elements, one entry per zero-width deletion)
        editor.setDecorations(this.ghostDeletionObj, ghostDeletions);
        // Consumed ops: dimmed body + "consumed by" after-label
        editor.setDecorations(this.consumedRefObj, consumedRanges);
        // Consuming op annotations: "(consumed ct-N)" after-label on the consuming op
        editor.setDecorations(this.consumingOpAnnotationObj, consumingOpAnnotations);

        // Overview ruler marks — applied after base decorations to preserve
        // SpyEditor index order (indices 0–11 must stay stable for fast tests)
        editor.setDecorations(this.rulerInsertionObj, rulerInsertions);
        editor.setDecorations(this.rulerDeletionObj, rulerDeletions);
        editor.setDecorations(this.rulerSubstitutionObj, rulerSubstitutions);
        editor.setDecorations(this.rulerHighlightObj, rulerHighlights);
        editor.setDecorations(this.rulerCommentObj, rulerComments);

        // Clear all known per-author decoration types, then apply current ones.
        // Without this, switching from a mode that renders author colors (review/changes)
        // to one that doesn't (final/original) leaves stale author-colored text.
        for (const [, type] of this.authorDecorationTypes) {
            if (!authorDecorations.has(type)) {
                editor.setDecorations(type, []);
            }
        }
        for (const [type, options] of authorDecorations) {
            editor.setDecorations(type, options);
        }
    }

    private hideDelimiters(
        fullRange: vscode.Range,
        contentRange: vscode.Range,
        hiddens: vscode.DecorationOptions[]
    ) {
        if (!fullRange.start.isEqual(contentRange.start)) {
            hiddens.push({
                range: new vscode.Range(fullRange.start, contentRange.start)
            });
        }

        if (!contentRange.end.isEqual(fullRange.end)) {
            hiddens.push({
                range: new vscode.Range(contentRange.end, fullRange.end)
            });
        }
    }

    private revealDelimiters(
        fullRange: vscode.Range,
        contentRange: vscode.Range,
        unfoldedDelimiters: vscode.DecorationOptions[]
    ) {
        if (!fullRange.start.isEqual(contentRange.start)) {
            unfoldedDelimiters.push({
                range: new vscode.Range(fullRange.start, contentRange.start)
            });
        }

        if (!contentRange.end.isEqual(fullRange.end)) {
            unfoldedDelimiters.push({
                range: new vscode.Range(contentRange.end, fullRange.end)
            });
        }
    }

    /**
     * Returns the vscode.Range covering the `[^ct-N]` footnote anchor at the end of
     * a change's full range, or undefined if the change has no attached footnote ref.
     * Used in All Markup mode to style the ref with neutral gray instead of the
     * change type colour.
     */
    private isPositionInRange(position: vscode.Position, range: vscode.Range): boolean {
        return range.contains(position);
    }

    /**
     * Get or create a decoration type for a specific author + visual role combination.
     * Decoration types are cached by a composite key of author:role:style.
     */
    private getAuthorDecorationType(author: string, role: AuthorDecorationRole): vscode.TextEditorDecorationType {
        const key = `${author}:${role}:${this.style}`;
        if (!this.authorDecorationTypes.has(key)) {
            const color = this.authorColorMap.getColor(author);
            const needsStrikethrough = role === 'deletion' || role === 'substitution-original' || role === 'move-from';
            const needsUnderline = role === 'move-to';

            // Deletion-like roles always use fixed red, not author color.
            // Strikethrough already signals "removal"; author color on deleted text
            // sends contradictory signals (e.g. green strikethrough for first author).
            const isDeletionRole = role === 'deletion' || role === 'substitution-original';

            let decorationOptions: vscode.DecorationRenderOptions;

            // CSS injection via textDecoration for maximum specificity
            if (role === 'move-from' || role === 'move-to') {
                const base = needsStrikethrough ? 'line-through' : (needsUnderline ? 'underline' : 'none');
                decorationOptions = {
                    light: { textDecoration: `${base}; color: #6C3483` },
                    dark: { textDecoration: `${base}; color: #CE93D8` },
                };
            } else if (this.style === 'foreground') {
                const base = needsStrikethrough ? 'line-through' : 'none';
                if (isDeletionRole) {
                    // Fixed red for deletions regardless of author
                    decorationOptions = {
                        light: { textDecoration: `${base}; color: #C0392B` },
                        dark: { textDecoration: `${base}; color: #EF5350` },
                    };
                } else {
                    decorationOptions = {
                        light: { textDecoration: `${base}; color: ${color.light}` },
                        dark: { textDecoration: `${base}; color: ${color.dark}` },
                    };
                }
            } else {
                // Background mode: use author color as background tint via CSS injection
                const base = needsStrikethrough ? 'line-through' : 'none';
                if (isDeletionRole) {
                    // Fixed red for deletions regardless of author
                    decorationOptions = {
                        textDecoration: `${base}; background-color: rgba(255,0,0,0.15); color: rgba(255,50,50,1); opacity: 0.7`,
                    };
                } else {
                    decorationOptions = {
                        textDecoration: `${base}; background-color: ${color.light}20`,
                    };
                }
            }

            this.authorDecorationTypes.set(key, vscode.window.createTextEditorDecorationType(decorationOptions));
        }
        return this.authorDecorationTypes.get(key)!;
    }

    public dispose() {
        this.insertionObj.dispose();
        this.deletionObj.dispose();
        this.substitutionOriginalObj.dispose();
        this.substitutionModifiedObj.dispose();
        this.highlightObj.dispose();
        this.commentObj.dispose();
        this.hiddenObj.dispose();
        this.unfoldedObj.dispose();
        this.commentIconObj.dispose();
        this.activeHighlightObj.dispose();
        this.moveFromObj.dispose();
        this.moveToObj.dispose();
        this.settledRefObj.dispose();
        this.settledDimObj.dispose();
        this.ghostDeletionObj.dispose();
        this.consumedRefObj.dispose();
        this.consumingOpAnnotationObj.dispose();
        this.rulerInsertionObj.dispose();
        this.rulerDeletionObj.dispose();
        this.rulerSubstitutionObj.dispose();
        this.rulerHighlightObj.dispose();
        this.rulerCommentObj.dispose();

        // Dispose all dynamic per-author decoration types
        this.authorDecorationTypes.forEach(type => type.dispose());
        this.authorDecorationTypes.clear();
    }
}
