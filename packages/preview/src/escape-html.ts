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

/**
 * Escape HTML then restore whitelisted inline formatting tags.
 *
 * Used for CriticMarkup change content that can contain safe inline
 * formatting from DOCX import (e.g. `<u>`, `<span style="font-variant:small-caps">`).
 */
export function sanitizeContentHtml(text: string): string {
    let s = escapeHtml(text);
    const safeTags = ['u', 'b', 'i', 'em', 'strong', 's', 'sub', 'sup'];
    for (const tag of safeTags) {
        s = s.replace(new RegExp(`&lt;${tag}&gt;`, 'g'), `<${tag}>`);
        s = s.replace(new RegExp(`&lt;/${tag}&gt;`, 'g'), `</${tag}>`);
    }
    // SmallCaps: <span style="font-variant:small-caps">
    s = s.replace(/&lt;span style=&quot;font-variant:small-caps&quot;&gt;/g, '<span style="font-variant:small-caps">');
    s = s.replace(/&lt;\/span&gt;/g, '</span>');
    return s;
}
