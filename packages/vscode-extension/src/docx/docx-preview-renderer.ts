import MarkdownIt = require('markdown-it');
import { parseForFormat, ChangeType } from '@changedown/core';
import { changedownPlugin, PluginConfig } from '@changedown/preview';

/**
 * Renders markdown (with CriticMarkup) to HTML using markdown-it
 * and the changedown preview plugin. Runs in the extension host.
 *
 * @param viewMode Controls how changes are rendered:
 *   - 'allMarkup' (default): full CriticMarkup rendering with colors
 *   - 'simple': settled text with change gutter, author colors, and footnote ref badges
 *   - 'original': pre-change view — insertions stripped, deletions/subs resolved to old text
 *   - 'final': post-change view — deletions stripped, insertions/subs resolved to new text
 */
export function renderMarkdownToHtml(
    markdown: string,
    isDarkTheme = false,
    viewMode: string = 'allMarkup'
): string {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

    const isSimple = viewMode === 'simple';
    const isResolved = viewMode === 'original' || viewMode === 'final';

    const config: PluginConfig = {
        enabled: true,
        showFootnotes: isSimple,  // Simple: keep ref badges (definitions hidden via CSS); others: sidebar handles it
        showComments: !isResolved,
        renderInCodeFences: true,
        metadataDetail: 'badge',
        authorColors: isResolved ? 'never' : 'auto',
        isDarkTheme,
    };

    md.use(changedownPlugin, () => config);

    let src = markdown;

    // For Original/Final modes, pre-process to strip one side of changes
    if (isResolved) {
        const doc = parseForFormat(src);
        const changes = [...doc.getChanges()].sort((a, b) => b.range.start - a.range.start);

        for (const c of changes) {
            if (viewMode === 'original') {
                if (c.type === ChangeType.Insertion) {
                    // Strip insertion entirely — it didn't exist in the original
                    src = src.slice(0, c.range.start) + src.slice(c.range.end);
                } else if (c.type === ChangeType.Deletion) {
                    // Resolve to original text (the deleted content)
                    const text = c.originalText ?? src.slice(c.contentRange.start, c.contentRange.end);
                    src = src.slice(0, c.range.start) + text + src.slice(c.range.end);
                } else if (c.type === ChangeType.Substitution) {
                    // Resolve to original text (before the substitution)
                    const text = c.originalText ?? '';
                    src = src.slice(0, c.range.start) + text + src.slice(c.range.end);
                }
            } else {
                // viewMode === 'final'
                if (c.type === ChangeType.Insertion) {
                    // Resolve to inserted text (keep the content)
                    const text = c.modifiedText ?? src.slice(c.contentRange.start, c.contentRange.end);
                    src = src.slice(0, c.range.start) + text + src.slice(c.range.end);
                } else if (c.type === ChangeType.Deletion) {
                    // Strip deletion entirely — it's gone in the final
                    src = src.slice(0, c.range.start) + src.slice(c.range.end);
                } else if (c.type === ChangeType.Substitution) {
                    // Resolve to modified text (after the substitution)
                    const text = c.modifiedText ?? '';
                    src = src.slice(0, c.range.start) + text + src.slice(c.range.end);
                }
            }
        }
    }

    return md.render(src);
}
