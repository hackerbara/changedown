/**
 * Shared visual-semantic constants for ChangeDown.
 *
 * Consumed by both the editor decorator (VS Code decorations) and the
 * markdown preview plugin (HTML/CSS rendering). Extracted from decorator.ts
 * so that every rendering surface uses the same palette and style mapping.
 *
 * Also provides shared type-label and icon-mapping helpers used by
 * change-comments, change-timeline, and review-panel.
 */

import * as vscode from 'vscode';
import { ChangeType } from '@changedown/core';

// Re-export platform-agnostic types and data from shared package
export { ThemeColor, AUTHOR_PALETTE, CHANGE_COLORS, ChangeStyleInfo, getChangeStyle } from '@changedown/preview';

// ---------------------------------------------------------------------------
// Type label and icon helpers (shared by change-comments, timeline, panel)
// ---------------------------------------------------------------------------

/** Lowercase type label (e.g. 'insertion', 'deletion'). */
export function typeLabel(type: ChangeType): string {
    switch (type) {
        case ChangeType.Insertion: return 'insertion';
        case ChangeType.Deletion: return 'deletion';
        case ChangeType.Substitution: return 'substitution';
        case ChangeType.Highlight: return 'highlight';
        case ChangeType.Comment: return 'comment';
    }
}

/** Capitalized type label (e.g. 'Insertion', 'Deletion'). */
export function typeLabelCapitalized(type: ChangeType): string {
    switch (type) {
        case ChangeType.Insertion: return 'Insertion';
        case ChangeType.Deletion: return 'Deletion';
        case ChangeType.Substitution: return 'Substitution';
        case ChangeType.Highlight: return 'Highlight';
        case ChangeType.Comment: return 'Comment';
    }
}

/** ThemeIcon for a change type (shared icon mapping). */
export function iconForType(type: ChangeType): vscode.ThemeIcon {
    switch (type) {
        case ChangeType.Insertion: return new vscode.ThemeIcon('diff-added');
        case ChangeType.Deletion: return new vscode.ThemeIcon('diff-removed');
        case ChangeType.Substitution: return new vscode.ThemeIcon('diff-modified');
        case ChangeType.Highlight: return new vscode.ThemeIcon('symbol-color');
        case ChangeType.Comment: return new vscode.ThemeIcon('comment');
    }
}
