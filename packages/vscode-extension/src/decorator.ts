import * as vscode from 'vscode';
import { ChangeType, VirtualDocument } from '@changedown/core';
import { buildDecorationPlan, AuthorColorMap, DecorationPlan, OffsetDecoration, AuthorDecorationRole } from '@changedown/preview';
import { ViewMode } from './view-mode';
import { EditorPort } from './view/EditorPort';
import { offsetToPosition, positionToOffset } from './converters';
import { getOutputChannel } from './output-channel';

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

        // Settled ref: dimmed metadata reference [^cn-N], not an active change
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
            overviewRulerColor: new vscode.ThemeColor('changedown.insertionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerDeletionObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changedown.deletionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerSubstitutionObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changedown.substitutionRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerHighlightObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changedown.highlightRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.rulerCommentObj = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: new vscode.ThemeColor('changedown.commentRulerColor'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
    }

    /**
     * Convert a single OffsetDecoration to a vscode.DecorationOptions using the
     * document text for offset→position conversion.
     */
    private offsetToDecoration(d: OffsetDecoration, text: string): vscode.DecorationOptions {
        const range = new vscode.Range(
            offsetToPosition(text, d.range.start),
            offsetToPosition(text, d.range.end),
        );
        const result: vscode.DecorationOptions = { range };
        if (d.hoverText) {
            result.hoverMessage = new vscode.MarkdownString(d.hoverText);
        }
        if (d.renderBefore) {
            result.renderOptions = { before: { contentText: d.renderBefore.contentText } };
        }
        if (d.renderAfter) {
            result.renderOptions = {
                ...(result.renderOptions ?? {}),
                after: {
                    contentText: d.renderAfter.contentText,
                    color: new vscode.ThemeColor('editorCodeLens.foreground'),
                    fontStyle: d.renderAfter.fontStyle,
                }
            };
        }
        return result;
    }

    /**
     * Apply a DecorationPlan to the editor by converting offset-based decorations to
     * VS Code DecorationOptions and calling setDecorations for each type.
     *
     * The setDecorations call order (indices 0–11) must remain stable for SpyEditor tests.
     */
    private applyPlan(editor: EditorPort, plan: DecorationPlan, text: string, changes: ReturnType<VirtualDocument['getChanges']>): void {
        const convert = (arr: OffsetDecoration[]) => arr.map(d => this.offsetToDecoration(d, text));

        // Apply all base decorations (fixed types — index-sensitive, see SpyEditor)
        editor.setDecorations(this.insertionObj, convert(plan.insertions));
        editor.setDecorations(this.deletionObj, convert(plan.deletions));
        editor.setDecorations(this.substitutionOriginalObj, convert(plan.substitutionOriginals));
        editor.setDecorations(this.substitutionModifiedObj, convert(plan.substitutionModifieds));
        editor.setDecorations(this.highlightObj, convert(plan.highlights));
        editor.setDecorations(this.commentObj, convert(plan.comments));

        // hiddenObj lifecycle: dispose/recreate to flush CSS cache when transitioning
        // from had-ranges to no-ranges. Guard: changes.length > 0 to avoid disposing
        // the shared type for comment thread editors (which have 0 changes and 0 hiddens).
        this.lastHiddenOffsets = plan.hiddenOffsets;
        if (plan.hiddens.length === 0 && this.hadHiddenRanges && changes.length > 0) {
            this.hiddenObj.dispose();
            this.hiddenObj = vscode.window.createTextEditorDecorationType({
                textDecoration: 'none; display: none;'
            });
            this.hadHiddenRanges = false;
        }
        editor.setDecorations(this.hiddenObj, convert(plan.hiddens));
        if (plan.hiddens.length > 0) {
            this.hadHiddenRanges = true;
        }

        editor.setDecorations(this.unfoldedObj, convert(plan.unfoldedDelimiters));
        editor.setDecorations(this.commentIconObj, convert(plan.commentIcons));
        editor.setDecorations(this.activeHighlightObj, convert(plan.activeHighlights));
        editor.setDecorations(this.moveFromObj, convert(plan.moveFroms));
        editor.setDecorations(this.moveToObj, convert(plan.moveTos));
        editor.setDecorations(this.settledRefObj, convert(plan.settledRefs));
        editor.setDecorations(this.settledDimObj, convert(plan.settledDims));
        // L3 ghost-text deletions (before pseudo-elements, one entry per zero-width deletion)
        editor.setDecorations(this.ghostDeletionObj, convert(plan.ghostDeletions));
        // Consumed ops: dimmed body + "consumed by" after-label
        editor.setDecorations(this.consumedRefObj, convert(plan.consumedRanges));
        // Consuming op annotations: "(consumed cn-N)" after-label on the consuming op
        editor.setDecorations(this.consumingOpAnnotationObj, convert(plan.consumingOpAnnotations));

        // Per-author decoration types: clear unused, apply current
        const authorDecorations = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
        for (const [key, entry] of plan.authorDecorations) {
            const colonIdx = key.indexOf(':');
            const author = key.substring(0, colonIdx);
            const role = key.substring(colonIdx + 1) as AuthorDecorationRole;
            const type = this.getAuthorDecorationType(author, role);
            authorDecorations.set(type, convert(entry.ranges));
        }

        // Clear all known per-author types not in the current pass, then apply current ones.
        // Without this, switching from a mode with author colors to one without leaves stale text.
        for (const [, type] of this.authorDecorationTypes) {
            if (!authorDecorations.has(type)) {
                editor.setDecorations(type, []);
            }
        }
        for (const [type, options] of authorDecorations) {
            editor.setDecorations(type, options);
        }
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

        showDelimiters = showDelimiters ?? vscode.workspace.getConfiguration('changedown').get<boolean>('showDelimiters', false);

        const changes = doc.getChanges();
        const docText = text ?? '';

        // Log any unresolved L3 ghost nodes (those are filtered inside buildDecorationPlan,
        // but we still want the output channel message for debugging)
        const ch = getOutputChannel();
        if (ch) {
            for (const change of changes) {
                // isGhostNode is re-checked inside buildDecorationPlan; log here for visibility
                if (change.anchored === false && change.level >= 2) {
                    ch.appendLine(`[decorator] skipping unresolved L3 node id=${change.id} type=${change.type} — position could not be deterministically anchored`);
                }
            }
        }

        // Compute cursor offset for the shared plan builder
        const cursorPos = editor.selection.active;
        const cursorOffset = docText ? positionToOffset(docText, cursorPos) : 0;

        // Build the platform-agnostic decoration plan
        const plan = buildDecorationPlan(changes, docText, mode, cursorOffset, showDelimiters, this.authorColors);

        if (!docText) {
            // Without text we can't convert offsets to positions — clear all decorations
            this.lastHiddenOffsets = [];
            editor.setDecorations(this.insertionObj, []);
            editor.setDecorations(this.deletionObj, []);
            editor.setDecorations(this.substitutionOriginalObj, []);
            editor.setDecorations(this.substitutionModifiedObj, []);
            editor.setDecorations(this.highlightObj, []);
            editor.setDecorations(this.commentObj, []);
            editor.setDecorations(this.hiddenObj, []);
            editor.setDecorations(this.unfoldedObj, []);
            editor.setDecorations(this.commentIconObj, []);
            editor.setDecorations(this.activeHighlightObj, []);
            editor.setDecorations(this.moveFromObj, []);
            editor.setDecorations(this.moveToObj, []);
            editor.setDecorations(this.settledRefObj, []);
            editor.setDecorations(this.settledDimObj, []);
            editor.setDecorations(this.ghostDeletionObj, []);
            editor.setDecorations(this.consumedRefObj, []);
            editor.setDecorations(this.consumingOpAnnotationObj, []);
            editor.setDecorations(this.rulerInsertionObj, []);
            editor.setDecorations(this.rulerDeletionObj, []);
            editor.setDecorations(this.rulerSubstitutionObj, []);
            editor.setDecorations(this.rulerHighlightObj, []);
            editor.setDecorations(this.rulerCommentObj, []);
            return;
        }

        // Apply the plan to VS Code decoration types
        this.applyPlan(editor, plan, docText, changes);

        // ─── Overview ruler marks (right lane, ThemeColor) ───────────────────────
        // Collect ruler ranges grouped by change type. Rulers are shown in review
        // and changes modes where proposed changes are visible. In settled (final)
        // and raw (original) modes there are no pending changes, so clear all rulers.
        const isFinalMode = mode === 'settled';
        const isOriginalMode = mode === 'raw';

        const rulerInsertions: vscode.DecorationOptions[] = [];
        const rulerDeletions: vscode.DecorationOptions[] = [];
        const rulerSubstitutions: vscode.DecorationOptions[] = [];
        const rulerHighlights: vscode.DecorationOptions[] = [];
        const rulerComments: vscode.DecorationOptions[] = [];

        if (!isFinalMode && !isOriginalMode) {
            for (const change of changes) {
                // Skip settled inline refs — they are dimmed and not pending review
                if (change.settled) { continue; }
                const range = new vscode.Range(
                    offsetToPosition(docText, change.range.start),
                    offsetToPosition(docText, change.range.end),
                );
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

        // Overview ruler marks — applied after base decorations to preserve
        // SpyEditor index order (indices 0–11 must stay stable for fast tests)
        editor.setDecorations(this.rulerInsertionObj, rulerInsertions);
        editor.setDecorations(this.rulerDeletionObj, rulerDeletions);
        editor.setDecorations(this.rulerSubstitutionObj, rulerSubstitutions);
        editor.setDecorations(this.rulerHighlightObj, rulerHighlights);
        editor.setDecorations(this.rulerCommentObj, rulerComments);
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
