import { CriticMarkupParser, ChangeNode, ChangeType } from '@changetracks/core';
import { buildReplacements, PreviewOptions } from './replacements';
import { escapeHtml } from './escape-html';

// CriticMarkup opening delimiters
const CRITIC_MARKERS = ['{++', '{--', '{~~', '{==', '{>>'];

/**
 * Quick check: does the text contain any CriticMarkup opening delimiter?
 * Used to decide whether a code fence needs special rendering.
 */
export function containsCriticMarkup(text: string): boolean {
    return CRITIC_MARKERS.some(m => text.includes(m));
}

/**
 * Converts a single ChangeNode into an HTML string for use inside a
 * code fence. The content text is HTML-escaped; only the wrapper tags
 * are raw HTML.
 */
function fenceChangeToHtml(change: ChangeNode, src: string): string {
    const sc = `ct-${change.status.toLowerCase()}`;

    switch (change.type) {
        case ChangeType.Insertion: {
            const text = change.modifiedText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<ins class="ct-ins ${sc}">${escapeHtml(text)}</ins>`;
        }
        case ChangeType.Deletion: {
            const text = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<del class="ct-del ${sc}">${escapeHtml(text)}</del>`;
        }
        case ChangeType.Substitution: {
            const original = change.originalText ?? '';
            const modified = change.modifiedText ?? '';
            return `<del class="ct-sub-del ${sc}">${escapeHtml(original)}</del><ins class="ct-sub-ins ${sc}">${escapeHtml(modified)}</ins>`;
        }
        case ChangeType.Highlight: {
            const text = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<mark class="ct-hl">${escapeHtml(text)}</mark>`;
        }
        case ChangeType.Comment: {
            const comment = change.metadata?.comment ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<span class="ct-comment" title="${escapeHtml(comment)}">&#x1F4AC;</span>`;
        }
        default:
            return escapeHtml(src.slice(change.range.start, change.range.end));
    }
}

/**
 * Renders a code fence body that contains CriticMarkup.
 * Parses the content, produces styled HTML for each change, and
 * HTML-escapes all non-change text. Wraps the result in
 * <pre><code class="language-{lang}">.
 *
 * Unlike buildReplacements (which leaves surrounding text unescaped
 * for markdown-it to handle), this function escapes everything because
 * code fences require all text to be HTML-safe.
 */
export function renderFenceWithCriticMarkup(content: string, lang: string): string {
    const parser = new CriticMarkupParser();
    const doc = parser.parse(content);
    const changes = doc.getChanges();

    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';

    if (changes.length === 0) {
        return `<pre><code${langClass}>${escapeHtml(content)}</code></pre>\n`;
    }

    // Sort changes by start position to walk through sequentially
    const sorted = [...changes].sort((a, b) => a.range.start - b.range.start);

    // Build result: escape text between changes, insert styled HTML for changes
    const parts: string[] = [];
    let pos = 0;

    for (const change of sorted) {
        // Escape text before this change
        if (change.range.start > pos) {
            parts.push(escapeHtml(content.slice(pos, change.range.start)));
        }
        // Render the change as styled HTML
        parts.push(fenceChangeToHtml(change, content));
        pos = change.range.end;
    }

    // Escape remaining text after the last change
    if (pos < content.length) {
        parts.push(escapeHtml(content.slice(pos)));
    }

    return `<pre><code${langClass}>${parts.join('')}</code></pre>\n`;
}

export interface PluginConfig {
    enabled: boolean;
    showFootnotes: boolean;
    showComments: boolean;
    renderInCodeFences: boolean;
    metadataDetail: 'badge' | 'summary' | 'projected';
    authorColors: 'auto' | 'always' | 'never';
    isDarkTheme: boolean;
}

/**
 * Reads VS Code configuration for preview options.
 * Wrapped in try/catch so it works in test environments where
 * the vscode module is not available.
 */
function getVSCodeConfig(): PluginConfig {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('changetracks.preview');
        // ColorThemeKind.Dark = 2, ColorThemeKind.HighContrast = 3
        const isDark = vscode.window.activeColorTheme?.kind === 2
            || vscode.window.activeColorTheme?.kind === 3;
        return {
            enabled: config.get('enabled', true) as boolean,
            showFootnotes: config.get('showFootnotes', true) as boolean,
            showComments: config.get('showComments', true) as boolean,
            renderInCodeFences: config.get('renderInCodeFences', true) as boolean,
            metadataDetail: config.get('metadataDetail', 'badge') as 'badge' | 'summary' | 'projected',
            authorColors: config.get('authorColors', 'auto') as 'auto' | 'always' | 'never',
            isDarkTheme: isDark,
        };
    } catch {
        return {
            enabled: true,
            showFootnotes: true,
            showComments: true,
            renderInCodeFences: true,
            metadataDetail: 'badge',
            authorColors: 'auto',
            isDarkTheme: false,
        };
    }
}

// Fence languages to skip — these contain CriticMarkup as examples/docs
const SKIP_LANGS = new Set(['changetracks', 'criticmarkup']);

/**
 * markdown-it plugin: registers a core rule for source pre-processing
 * and a custom fence renderer for CriticMarkup in code blocks.
 *
 * @param md - markdown-it instance
 * @param getConfig - optional config getter (injected for testing)
 */
export function changetracksPlugin(md: any, getConfig?: () => PluginConfig): void {
    const resolveConfig = getConfig ?? getVSCodeConfig;

    const parser = new CriticMarkupParser();

    // --- Core rule: rewrite state.src BEFORE block tokenization ---
    // Must run before 'block' rule so state.src changes take effect.
    md.core.ruler.before('block', 'changetracks', (state: any) => {
        const config = resolveConfig();
        if (!config.enabled) return;

        const doc = parser.parse(state.src);
        const changes = doc.getChanges();
        if (changes.length > 0) {
            const options: PreviewOptions = {
                showFootnotes: config.showFootnotes,
                showComments: config.showComments,
                metadataDetail: config.metadataDetail,
                authorColors: config.authorColors,
                isDarkTheme: config.isDarkTheme,
            };
            state.src = buildReplacements(state.src, changes, options);
        }
    });

    // --- Custom fence renderer: handle CriticMarkup in code blocks ---
    const originalFence = md.renderer.rules.fence ||
        function (tokens: any[], idx: number, options: any, env: any, self: any) {
            return self.renderToken(tokens, idx, options);
        };

    md.renderer.rules.fence = function (tokens: any[], idx: number, options: any, env: any, self: any) {
        const config = resolveConfig();
        if (!config.enabled || !config.renderInCodeFences) {
            return originalFence(tokens, idx, options, env, self);
        }

        const token = tokens[idx];
        const info = token.info ? token.info.trim() : '';
        const lang = info.split(/\s+/)[0] || '';

        // Skip documentation fences that show CriticMarkup as examples
        if (SKIP_LANGS.has(lang.toLowerCase())) {
            return originalFence(tokens, idx, options, env, self);
        }

        const content = token.content;
        if (containsCriticMarkup(content)) {
            return renderFenceWithCriticMarkup(content, lang);
        }

        return originalFence(tokens, idx, options, env, self);
    };
}

export default changetracksPlugin;
