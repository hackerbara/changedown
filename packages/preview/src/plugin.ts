import { CriticMarkupParser, Workspace, ChangeNode, ChangeType, splitBodyAndFootnotes } from '@changedown/core';
import { buildReplacements, PreviewOptions, LineOffsetMap } from './replacements.js';
import { escapeHtml, sanitizeContentHtml } from './escape-html.js';

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
    const sc = `cn-${change.status.toLowerCase()}`;

    switch (change.type) {
        case ChangeType.Insertion: {
            const text = change.modifiedText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<ins class="cn-ins ${sc}">${sanitizeContentHtml(text)}</ins>`;
        }
        case ChangeType.Deletion: {
            const text = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<del class="cn-del ${sc}">${sanitizeContentHtml(text)}</del>`;
        }
        case ChangeType.Substitution: {
            const original = change.originalText ?? '';
            const modified = change.modifiedText ?? '';
            return `<del class="cn-sub-del ${sc}">${sanitizeContentHtml(original)}</del><ins class="cn-sub-ins ${sc}">${sanitizeContentHtml(modified)}</ins>`;
        }
        case ChangeType.Highlight: {
            const text = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<mark class="cn-hl">${sanitizeContentHtml(text)}</mark>`;
        }
        case ChangeType.Comment: {
            const comment = change.metadata?.comment ?? src.slice(change.contentRange.start, change.contentRange.end);
            return `<span class="cn-comment" title="${escapeHtml(comment)}">&#x1F4AC;</span>`;
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
    // Code fences contain example CriticMarkup text, not real tracked changes.
    // L3 format (footnote-native) uses clean body text and never appears inside
    // a code fence, so CriticMarkupParser is the correct parser here.
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
    emitSourceMap?: boolean;
    urlResolver?: (url: string) => string | null;
}

// Fence languages to skip — these contain CriticMarkup as examples/docs
const SKIP_LANGS = new Set(['changedown', 'criticmarkup']);

/**
 * markdown-it plugin: registers a core rule for source pre-processing
 * and a custom fence renderer for CriticMarkup in code blocks.
 *
 * @param md - markdown-it instance
 * @param getConfig - optional config getter (injected for testing)
 */
export function changedownPlugin(md: any, getConfig?: () => PluginConfig): void {
    const defaultConfig: PluginConfig = {
        enabled: true,
        showFootnotes: true,
        showComments: true,
        renderInCodeFences: true,
        metadataDetail: 'badge',
        authorColors: 'auto',
        isDarkTheme: false,
    };
    const resolveConfig = getConfig ?? (() => defaultConfig);

    const workspace = new Workspace();

    // --- Core rule: rewrite state.src BEFORE block tokenization ---
    // Must run before 'block' rule so state.src changes take effect.
    md.core.ruler.before('block', 'changedown', (state: any) => {
        const config = resolveConfig();
        if (!config.enabled) return;

        const doc = workspace.parse(state.src);
        const changes = doc.getChanges();
        if (changes.length > 0) {
            const isL3 = workspace.isFootnoteNative(state.src);
            // For L3 documents, strip the footnote block before building replacements.
            // L3 footnotes are metadata (LINE:HASH edit-ops), not user-readable content.
            // Change offsets produced by FootnoteNativeParser reference body positions only,
            // so stripping the trailing footnote block does not affect offset alignment.
            const sourceForReplacements = isL3
                ? splitBodyAndFootnotes(state.src.split('\n')).bodyLines.join('\n') + '\n'
                : state.src;

            const options: PreviewOptions = {
                // L3 footnotes are metadata, not content — suppress from preview output.
                // Non-L3 footnotes (L2) are user-visible deliberation panels.
                showFootnotes: config.showFootnotes && !isL3,
                showComments: config.showComments,
                metadataDetail: config.metadataDetail,
                authorColors: config.authorColors,
                isDarkTheme: config.isDarkTheme,
            };
            const lineMap = config.emitSourceMap ? new LineOffsetMap() : undefined;
            state.src = buildReplacements(sourceForReplacements, changes, options, lineMap);
            if (lineMap) {
                state.env = state.env || {};
                state.env.__ctLineMap = lineMap;
            }
        }
    });

    // --- Core rule: emit data-source-line attributes AFTER block tokenization ---
    // Must run after 'block' rule so tokens already have their .map set.
    if (resolveConfig().emitSourceMap) {
        md.core.ruler.after('block', 'changedown_sourcemap', (state: any) => {
            const config = resolveConfig();
            if (!config.enabled || !config.emitSourceMap) return;
            const lineMap: LineOffsetMap | undefined = state.env?.__ctLineMap;
            for (const token of state.tokens) {
                if (token.type === 'inline' || !token.map) continue;
                const rewrittenLine = token.map[0];
                const originalLine = lineMap ? lineMap.toOriginal(rewrittenLine) : rewrittenLine;
                token.attrSet('data-source-line', String(originalLine));
            }
        });
    }

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

    // --- URL resolver: override md.normalizeLink to rewrite image/link URLs ---
    // Applied once per md instance during registration. Uses resolveConfig() at
    // call time so the latest config.urlResolver is always used.
    const originalNormalizeLink = md.normalizeLink.bind(md);
    md.normalizeLink = function(url: string): string {
        const config = resolveConfig();
        if (typeof config.urlResolver === 'function') {
            const resolved = config.urlResolver(url);
            if (resolved) return resolved;
        }
        return originalNormalizeLink(url);
    };
}

export default changedownPlugin;
