import * as vscode from 'vscode';
import { EditorPort } from 'changetracks-vscode/internals';

/**
 * Records which decoration types are given which ranges.
 * Used in tests to assert exact decoration behavior.
 */

export interface RecordedDecoration {
    range: vscode.Range;
    hoverMessage?: vscode.MarkdownString;
}

export class SpyEditor implements EditorPort {
    /** All setDecorations calls, keyed by decoration type object reference */
    private calls: Map<vscode.TextEditorDecorationType, RecordedDecoration[]> = new Map();

    /** Cursor position for the spy editor */
    public readonly selection: vscode.Selection;

    constructor(cursorLine: number = 0, cursorChar: number = 0) {
        const pos = new vscode.Position(cursorLine, cursorChar);
        this.selection = new vscode.Selection(pos, pos);
    }

    setDecorations(
        decorationType: vscode.TextEditorDecorationType,
        rangesOrOptions: vscode.DecorationOptions[] | vscode.Range[]
    ): void {
        const decorations: RecordedDecoration[] = (rangesOrOptions as any[]).map(item => {
            if (item instanceof vscode.Range) {
                return { range: item };
            }
            // It's a DecorationOptions
            return {
                range: item.range,
                hoverMessage: item.hoverMessage as vscode.MarkdownString | undefined,
            };
        });
        this.calls.set(decorationType, decorations);
    }

    /**
     * Get decorations for a specific type by its index in the order they were set.
     * Order matches EditorDecorator.decorate() apply order:
     *   0: insertions
     *   1: deletions
     *   2: substitutionOriginals
     *   3: substitutionModifieds
     *   4: highlights
     *   5: comments
     *   6: hiddens
     *   7: unfolded
     *   8: commentIcons
     *   9: activeHighlights
     *  10: moveFroms
     *  11: moveTos
     */
    getByIndex(index: number): RecordedDecoration[] {
        const entries = Array.from(this.calls.entries());
        if (index >= entries.length) {
            return [];
        }
        return entries[index][1];
    }

    /** Convenience accessors matching decoration names */
    get insertions(): RecordedDecoration[] { return this.getByIndex(0); }
    get deletions(): RecordedDecoration[] { return this.getByIndex(1); }
    get substitutionOriginals(): RecordedDecoration[] { return this.getByIndex(2); }
    get substitutionModifieds(): RecordedDecoration[] { return this.getByIndex(3); }
    get highlights(): RecordedDecoration[] { return this.getByIndex(4); }
    get comments(): RecordedDecoration[] { return this.getByIndex(5); }
    get hiddens(): RecordedDecoration[] { return this.getByIndex(6); }
    get unfolded(): RecordedDecoration[] { return this.getByIndex(7); }
    get commentIcons(): RecordedDecoration[] { return this.getByIndex(8); }
    get activeHighlights(): RecordedDecoration[] { return this.getByIndex(9); }
    get moveFroms(): RecordedDecoration[] { return this.getByIndex(10); }
    get moveTos(): RecordedDecoration[] { return this.getByIndex(11); }

    /** Total number of decoration types that were set */
    get callCount(): number { return this.calls.size; }

    /** Get all setDecorations calls as [type, decorations] pairs */
    getAllCalls(): Array<[vscode.TextEditorDecorationType, RecordedDecoration[]]> {
        return Array.from(this.calls.entries());
    }
}
