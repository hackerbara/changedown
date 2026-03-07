/**
 * Shared visual-semantic constants for ChangeTracks.
 *
 * Consumed by both the editor decorator (VS Code decorations) and the
 * markdown preview plugin (HTML/CSS rendering). Extracted from decorator.ts
 * so that every rendering surface uses the same palette and style mapping.
 *
 * Also provides shared type-label and icon-mapping helpers used by
 * change-comments, change-timeline, and review-panel.
 */

import * as vscode from 'vscode';
import { ChangeType, ChangeStatus } from '@changetracks/core';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

export interface ThemeColor {
    light: string;
    dark: string;
}

export const CHANGE_COLORS = {
    insertion: { light: '#1E824C', dark: '#66BB6A' } as ThemeColor,
    deletion:  { light: '#C0392B', dark: '#EF5350' } as ThemeColor,
    highlight: { background: 'rgba(255,255,0,0.3)' },
    comment:   { background: 'rgba(173,216,230,0.2)', border: 'rgba(100,149,237,0.5)' },
    move:      { light: '#8E44AD', dark: '#CE93D8' } as ThemeColor,
} as const;

/**
 * Per-author palette. Authors are assigned colors in insertion order,
 * cycling when there are more than 5 distinct authors.
 */
export const AUTHOR_PALETTE: ThemeColor[] = [
    { light: '#1E824C', dark: '#66BB6A' },  // Green
    { light: '#8E44AD', dark: '#CE93D8' },  // Purple
    { light: '#E67E22', dark: '#FFB74D' },  // Orange
    { light: '#16A085', dark: '#4DB6AC' },  // Teal
    { light: '#2980B9', dark: '#64B5F6' },  // Blue
];

// ---------------------------------------------------------------------------
// Style mapping
// ---------------------------------------------------------------------------

export interface ChangeStyleInfo {
    /** Space-separated CSS class names (e.g. "ct-ins ct-proposed") */
    cssClass: string;
    /** Semantic HTML tag for preview rendering */
    htmlTag: string;
    /** Foreground theme color (when applicable) */
    foreground?: ThemeColor;
    /** Whether the text should be rendered with strikethrough */
    strikethrough: boolean;
}

/**
 * Resolve the visual style for a given change type, status, and optional
 * move role. The returned object is rendering-backend agnostic: it carries
 * enough information for both the VS Code decorator and the markdown
 * preview plugin to produce correct output.
 */
export function getChangeStyle(
    type: ChangeType,
    status: ChangeStatus,
    moveRole?: 'from' | 'to',
): ChangeStyleInfo {
    const statusClass = status.toLowerCase();

    // Move role overrides normal type-based styling
    if (moveRole === 'from') {
        return {
            cssClass: `ct-move-from ct-${statusClass}`,
            htmlTag: 'del',
            foreground: CHANGE_COLORS.move as ThemeColor,
            strikethrough: true,
        };
    }
    if (moveRole === 'to') {
        return {
            cssClass: `ct-move-to ct-${statusClass}`,
            htmlTag: 'ins',
            foreground: CHANGE_COLORS.move as ThemeColor,
            strikethrough: false,
        };
    }

    switch (type) {
        case ChangeType.Insertion:
            return {
                cssClass: `ct-ins ct-${statusClass}`,
                htmlTag: 'ins',
                foreground: CHANGE_COLORS.insertion,
                strikethrough: false,
            };

        case ChangeType.Deletion:
            return {
                cssClass: `ct-del ct-${statusClass}`,
                htmlTag: 'del',
                foreground: CHANGE_COLORS.deletion,
                strikethrough: true,
            };

        case ChangeType.Substitution:
            return {
                cssClass: `ct-sub ct-${statusClass}`,
                htmlTag: 'span',
                foreground: CHANGE_COLORS.insertion, // modified text uses insertion color
                strikethrough: false,
            };

        case ChangeType.Highlight:
            return {
                cssClass: 'ct-hl',
                htmlTag: 'mark',
                strikethrough: false,
            };

        case ChangeType.Comment:
            return {
                cssClass: 'ct-comment',
                htmlTag: 'span',
                strikethrough: false,
            };
    }
}

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
