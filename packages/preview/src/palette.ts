/**
 * Shared visual-semantic constants for ChangeDown rendering.
 *
 * Extracted from packages/vscode-extension/src/visual-semantics.ts so that
 * the preview package (browser, LSP, CLI) can use the same palette and style
 * mapping without depending on the `vscode` module.
 */

import { ChangeType, ChangeStatus } from '@changedown/core';

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
    /** Space-separated CSS class names (e.g. "cn-ins cn-proposed") */
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
            cssClass: `cn-move-from cn-${statusClass}`,
            htmlTag: 'del',
            foreground: CHANGE_COLORS.move as ThemeColor,
            strikethrough: true,
        };
    }
    if (moveRole === 'to') {
        return {
            cssClass: `cn-move-to cn-${statusClass}`,
            htmlTag: 'ins',
            foreground: CHANGE_COLORS.move as ThemeColor,
            strikethrough: false,
        };
    }

    switch (type) {
        case ChangeType.Insertion:
            return {
                cssClass: `cn-ins cn-${statusClass}`,
                htmlTag: 'ins',
                foreground: CHANGE_COLORS.insertion,
                strikethrough: false,
            };

        case ChangeType.Deletion:
            return {
                cssClass: `cn-del cn-${statusClass}`,
                htmlTag: 'del',
                foreground: CHANGE_COLORS.deletion,
                strikethrough: true,
            };

        case ChangeType.Substitution:
            return {
                cssClass: `cn-sub cn-${statusClass}`,
                htmlTag: 'span',
                foreground: CHANGE_COLORS.insertion, // modified text uses insertion color
                strikethrough: false,
            };

        case ChangeType.Highlight:
            return {
                cssClass: 'cn-hl',
                htmlTag: 'mark',
                strikethrough: false,
            };

        case ChangeType.Comment:
            return {
                cssClass: 'cn-comment',
                htmlTag: 'span',
                strikethrough: false,
            };
    }
}
