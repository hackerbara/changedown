import * as vscode from 'vscode';
import { ChangeType } from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';
import type { ViewMode } from './view-mode';

/**
 * Provides folding ranges for fully-hidden deletion regions in Simple mode.
 * When a deletion spans complete lines and the cursor is not on those lines,
 * the decorator hides the content via display:none, leaving blank lines.
 * This provider marks those regions as foldable so they can be auto-collapsed.
 *
 * Receives pre-parsed ChangeNode[] from the controller to avoid redundant parsing.
 */
export class ChangeTracksFoldingProvider implements vscode.FoldingRangeProvider {
    private _viewMode: ViewMode = 'review';
    private _cursorLine: number = -1;
    private _changes: ChangeNode[] = [];
    private _onDidChangeFoldingRanges = new vscode.EventEmitter<void>();
    readonly onDidChangeFoldingRanges = this._onDidChangeFoldingRanges.event;

    updateState(viewMode: ViewMode, cursorLine: number, changes?: ChangeNode[]): void {
        const changed = this._viewMode !== viewMode || this._cursorLine !== cursorLine;
        this._viewMode = viewMode;
        this._cursorLine = cursorLine;
        if (changes !== undefined) this._changes = changes;
        if (changed) {
            this._onDidChangeFoldingRanges.fire();
        }
    }

    provideFoldingRanges(
        document: vscode.TextDocument,
    ): vscode.FoldingRange[] {
        // Only provide folding in Simple mode
        if (this._viewMode !== 'changes') return [];

        const ranges: vscode.FoldingRange[] = [];

        for (const change of this._changes) {
            if (change.type !== ChangeType.Deletion) continue;
            if (change.settled) continue;

            const startLine = document.positionAt(change.range.start).line;
            const endLine = document.positionAt(change.range.end).line;

            // Only fold if the deletion spans at least one full line
            if (endLine <= startLine) continue;
            // Don't fold if cursor is on any of those lines
            if (this._cursorLine >= startLine && this._cursorLine <= endLine) continue;

            ranges.push(new vscode.FoldingRange(
                startLine,
                endLine,
                vscode.FoldingRangeKind.Region
            ));
        }

        return ranges;
    }

    dispose(): void {
        this._onDidChangeFoldingRanges.dispose();
    }
}
