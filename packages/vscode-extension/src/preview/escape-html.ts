/**
 * Shared HTML escaping utility for preview rendering.
 *
 * Used by both plugin.ts (code fence preview) and replacements.ts (inline preview).
 */

/** Escape HTML special characters for safe insertion into HTML content. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
