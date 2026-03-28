import { ChangeNode, ChangeType, ChangeStatus, Approval, Revision, DiscussionComment, Resolution, findCodeZones, CodeZone } from '@changedown/core';
import { PreviewAuthorColorMap } from './author-colors.js';
import { escapeHtml, sanitizeContentHtml } from './escape-html.js';

export interface PreviewOptions {
    showFootnotes: boolean;
    showComments: boolean;
    metadataDetail: 'badge' | 'summary' | 'projected';
    authorColors?: 'auto' | 'always' | 'never';
    isDarkTheme?: boolean;
}

interface Replacement {
    start: number;
    end: number;
    html: string;
}

export interface FenceZone {
    start: number;
    end: number;
    lang: string;
}

/**
 * Scans source text for fenced code blocks (``` or ~~~) and returns
 * their byte ranges. CriticMarkup inside these zones is left untouched.
 *
 * Delegates to findCodeZones() from @changedown/core for the actual
 * detection logic. This wrapper preserves the FenceZone interface for
 * backward compatibility. Note: `lang` is no longer populated (always '')
 * since CodeZone does not carry info-string data. No current consumer
 * reads `lang`; if needed in the future, extend CodeZone in core.
 */
export function findFenceZones(src: string): FenceZone[] {
    const codeZones = findCodeZones(src);
    return codeZones
        .filter(z => z.type === 'fence')
        .map(z => ({ start: z.start, end: z.end, lang: '' }));
}

function isInCodeZone(start: number, end: number, zones: CodeZone[]): boolean {
    return zones.some(z => start >= z.start && end <= z.end);
}

function statusClass(status: ChangeStatus): string {
    return `cn-${status.toLowerCase()}`;
}

/**
 * If the change is level 2 (has a footnote ref attached), produces
 * a <sup> badge suffix. The ref text [^cn-N] is consumed by the
 * parser as part of the change's range but not its contentRange.
 */
function refBadgeSuffix(change: ChangeNode): string {
    if (change.level === 2 && /^cn-\d+/.test(change.id)) {
        const id = change.id;
        return `<sup class="cn-ref" id="cn-fn-ref-${escapeHtml(id)}" data-cn-id="${escapeHtml(id)}"><a href="#cn-fn-def-${escapeHtml(id)}">${escapeHtml(id)}</a></sup>`;
    }
    return '';
}

// ===== Deliberation rendering helpers =====

/**
 * Renders the context line with {changed} portions highlighted.
 */
function renderContext(context: string): string {
    // escapeHtml MUST run before the regex so that $1 captures already-escaped
    // content. If the order were reversed, raw HTML chars inside {…} would be
    // injected unescaped into the output.
    const highlighted = escapeHtml(context).replace(
        /\{([^}]+)\}/g,
        '<span class="cn-ctx-changed">$1</span>'
    );
    return `  <div class="cn-fn-context">${highlighted}</div>\n`;
}

/**
 * Renders a list of approval/rejection/request-changes entries.
 */
function renderApprovals(approvals: Approval[], cssClass: string, label: string): string {
    if (!approvals || approvals.length === 0) return '';
    let html = '';
    for (const a of approvals) {
        html += `  <div class="${cssClass}">`;
        html += `<span class="cn-fn-verdict-label">${escapeHtml(label)}</span> `;
        html += `<span class="cn-fn-reviewer">${escapeHtml(a.author)}</span> `;
        html += `<span class="cn-fn-date">${escapeHtml(a.date)}</span>`;
        if (a.reason) html += ` <span class="cn-fn-reason">${escapeHtml(a.reason)}</span>`;
        html += `</div>\n`;
    }
    return html;
}

/**
 * Renders the revision history list.
 */
function renderRevisions(revisions: Revision[]): string {
    if (!revisions || revisions.length === 0) return '';
    let html = `  <div class="cn-fn-revisions">\n`;
    for (const r of revisions) {
        html += `    <div class="cn-fn-revision">`;
        html += `<span class="cn-fn-rev-label">${escapeHtml(r.label)}</span> `;
        html += `<span class="cn-fn-author">${escapeHtml(r.author)}</span> `;
        html += `<span class="cn-fn-date">${escapeHtml(r.date)}</span>: `;
        html += `<span class="cn-fn-rev-text">${escapeHtml(r.text)}</span>`;
        html += `</div>\n`;
    }
    html += `  </div>\n`;
    return html;
}

/**
 * Renders discussion thread comments with nesting depth.
 */
function renderDiscussion(discussion: DiscussionComment[]): string {
    if (!discussion || discussion.length === 0) return '';
    let html = `  <div class="cn-fn-discussion">\n`;
    for (const c of discussion) {
        const safeDepth = Math.max(0, Math.min(10, Math.floor(c.depth)));
        const depthClass = safeDepth > 0 ? ` cn-reply-depth-${safeDepth}` : '';
        html += `    <div class="cn-discussion-comment${depthClass}" style="margin-left: ${safeDepth * 1.2}em">`;
        html += `<span class="cn-fn-author">${escapeHtml(c.author)}</span> `;
        html += `<span class="cn-fn-date">${escapeHtml(c.date)}</span>`;
        if (c.label) {
            html += ` <span class="cn-label">${escapeHtml(c.label)}</span>`;
        }
        html += `: <span class="cn-fn-text">${escapeHtml(c.text)}</span>`;
        html += `</div>\n`;
    }
    html += `  </div>\n`;
    return html;
}

/**
 * Renders the resolution status (resolved or open).
 */
function renderResolution(resolution: Resolution | undefined): string {
    if (!resolution) return '';
    if (resolution.type === 'resolved') {
        let html = `  <div class="cn-fn-resolution cn-resolved">`;
        html += `<span class="cn-fn-resolution-icon">&#x2714;</span> resolved `;
        html += `<span class="cn-fn-author">${escapeHtml(resolution.author)}</span> `;
        html += `<span class="cn-fn-date">${escapeHtml(resolution.date)}</span>`;
        if (resolution.reason) html += `: ${escapeHtml(resolution.reason)}`;
        html += `</div>\n`;
        return html;
    }
    // open
    let html = `  <div class="cn-fn-resolution cn-open">`;
    html += `<span class="cn-fn-resolution-icon">&#x25CB;</span> open`;
    if (resolution.reason) html += ` &#x2014; ${escapeHtml(resolution.reason)}`;
    html += `</div>\n`;
    return html;
}

/**
 * Escapes a string for use in an HTML attribute value (href, title, etc.).
 * Uses the same character set as escapeHtml but is named separately to
 * make intent clear at call sites.
 */
function escapeAttr(text: string): string {
    return escapeHtml(text);
}

/**
 * Injects a per-author color inline style into the first opening HTML tag.
 * Only applied to actual changes: insertions, move-to destinations, and
 * substitution insertion side. Deletion spans use fixed CSS deletion color.
 * Highlights and comments never get author color — they mark discussion,
 * not changes.
 */
function injectAuthorColor(
    html: string,
    change: ChangeNode,
    options: PreviewOptions,
    authorMap: PreviewAuthorColorMap | null
): string {
    if (!authorMap) return html;
    const author = change.metadata?.author;
    if (!author) return html;
    const color = authorMap.getColor(author);
    const colorValue = options.isDarkTheme ? color.dark : color.light;
    // Insert style attribute into the first opening tag (e.g. <ins, <mark)
    return html.replace(/^(<\w+)/, `$1 style="color: ${escapeAttr(colorValue)}"`);
}

/**
 * Builds an inline anchor annotation snippet for summary and projected modes.
 * Returns an empty string for badge mode or when no metadata is present.
 *
 * Author comes from change.metadata.author (populated by footnote merge).
 * Status comes from change.status (the canonical enum field, always present).
 */
function buildAnchorAnnotation(
    change: ChangeNode,
    detail: PreviewOptions['metadataDetail']
): string {
    if (detail === 'badge') return '';
    const meta = change.metadata;
    if (!meta) return '';

    if (detail === 'summary') {
        const parts: string[] = [];
        if (meta.author) {
            parts.push(`<span class="cn-anchor-author">${escapeHtml(meta.author)}</span>`);
        }
        const sc = statusClass(change.status);
        const statusLower = change.status.toLowerCase();
        parts.push(`<span class="cn-anchor-status ${escapeAttr(sc)}">${escapeHtml(statusLower)}</span>`);
        return `<span class="cn-anchor-meta">${parts.join(' ')}</span>`;
    }

    if (detail === 'projected') {
        const parts: string[] = [];
        if (meta.author) {
            parts.push(`<span class="cn-anchor-author">${escapeHtml(meta.author)}</span>`);
        }
        if (meta.date) {
            parts.push(`<span class="cn-anchor-date">${escapeHtml(meta.date)}</span>`);
        }
        const sc = statusClass(change.status);
        const statusLower = change.status.toLowerCase();
        parts.push(`<span class="cn-anchor-status ${escapeAttr(sc)}">${escapeHtml(statusLower)}</span>`);
        if (meta.comment) {
            parts.push(`<span class="cn-anchor-comment">${escapeHtml(meta.comment)}</span>`);
        }
        const approvalCount = meta.approvals?.length ?? 0;
        const rejectionCount = meta.rejections?.length ?? 0;
        if (approvalCount > 0 || rejectionCount > 0) {
            let badges = '';
            if (approvalCount > 0) badges += `&#x2714;${approvalCount}`;
            if (rejectionCount > 0) badges += ` &#x2718;${rejectionCount}`;
            parts.push(`<span class="cn-anchor-approvals">${badges.trim()}</span>`);
        }
        return `<span class="cn-anchor-meta cn-anchor-projected">${parts.join(' ')}</span>`;
    }

    return '';
}

/**
 * Converts a single ChangeNode into an HTML replacement.
 * Returns null if the node should be skipped entirely.
 *
 * @param allChanges - The full list of changes in the document, used to
 *   resolve paired move group members via groupId.
 */
function changeToReplacement(change: ChangeNode, src: string, options: PreviewOptions, allChanges: ChangeNode[], authorMap: PreviewAuthorColorMap | null): Replacement | null {
    const sc = statusClass(change.status);
    const badge = refBadgeSuffix(change);

    // Bidirectional linking attribute for annotation sidebar
    const pairAttr = ` data-cn-pair="cn-pair-${change.range.start}"`;

    // Move operations get dedicated classes with directional labels
    if (change.moveRole === 'from') {
        const content = src.slice(change.contentRange.start, change.contentRange.end);
        const paired = allChanges.find(c => c.groupId === change.groupId && c.moveRole === 'to');
        const pairedId = paired?.id ?? '';
        const label = pairedId
            ? ` <a class="cn-move-label" href="#cn-fn-ref-${escapeAttr(pairedId)}" title="moved to ${escapeAttr(pairedId)}">&#x2192; moved</a>`
            : ' <span class="cn-move-label">&#x2192; moved</span>';
        const annotation = buildAnchorAnnotation(change, options.metadataDetail);
        return {
            start: change.range.start,
            end: change.range.end,
            html: `<del class="cn-move-from ${sc}"${pairAttr}>${escapeHtml(content)}</del>${badge}${annotation}${label}`,
        };
    }
    if (change.moveRole === 'to') {
        const content = src.slice(change.contentRange.start, change.contentRange.end);
        const paired = allChanges.find(c => c.groupId === change.groupId && c.moveRole === 'from');
        const pairedId = paired?.id ?? '';
        const label = pairedId
            ? `<a class="cn-move-label" href="#cn-fn-ref-${escapeAttr(pairedId)}" title="moved from ${escapeAttr(pairedId)}">&#x2190; moved here</a> `
            : '<span class="cn-move-label">&#x2190; moved here</span> ';
        const annotation = buildAnchorAnnotation(change, options.metadataDetail);
        const moveToIns = injectAuthorColor(`<ins class="cn-move-to ${sc}"${pairAttr}>${sanitizeContentHtml(content)}</ins>`, change, options, authorMap);
        return {
            start: change.range.start,
            end: change.range.end,
            html: `${label}${moveToIns}${badge}${annotation}`,
        };
    }

    switch (change.type) {
        case ChangeType.Insertion: {
            const content = change.modifiedText ?? src.slice(change.contentRange.start, change.contentRange.end);
            const annotation = buildAnchorAnnotation(change, options.metadataDetail);
            const insHtml = injectAuthorColor(`<ins class="cn-ins ${sc}"${pairAttr}>${sanitizeContentHtml(content)}</ins>`, change, options, authorMap);
            return {
                start: change.range.start,
                end: change.range.end,
                html: `${insHtml}${badge}${annotation}`,
            };
        }
        case ChangeType.Deletion: {
            const content = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            const annotation = buildAnchorAnnotation(change, options.metadataDetail);
            // Deletion spans always use fixed CSS deletion color — no per-author override
            return {
                start: change.range.start,
                end: change.range.end,
                html: `<del class="cn-del ${sc}"${pairAttr}>${sanitizeContentHtml(content)}</del>${badge}${annotation}`,
            };
        }
        case ChangeType.Substitution: {
            const original = change.originalText ?? '';
            const modified = change.modifiedText ?? '';
            const annotation = buildAnchorAnnotation(change, options.metadataDetail);
            // Author color applies only to the insertion side; deletion side stays fixed red
            const insHtml = injectAuthorColor(`<ins class="cn-sub-ins ${sc}">${sanitizeContentHtml(modified)}</ins>`, change, options, authorMap);
            return {
                start: change.range.start,
                end: change.range.end,
                html: `<del class="cn-sub-del ${sc}"${pairAttr}>${sanitizeContentHtml(original)}</del>${insHtml}${badge}${annotation}`,
            };
        }
        case ChangeType.Highlight: {
            // Highlights always use standard styling — no author color.
            // They mark "what is being discussed", not "what changed".
            const content = change.originalText ?? src.slice(change.contentRange.start, change.contentRange.end);
            const annotation = buildAnchorAnnotation(change, options.metadataDetail);

            const markHtml = `<mark class="cn-hl"${pairAttr}>${sanitizeContentHtml(content)}</mark>`;
            return {
                start: change.range.start,
                end: change.range.end,
                html: `${markHtml}${badge}${annotation}`,
            };
        }
        case ChangeType.Comment: {
            if (!options.showComments) {
                return { start: change.range.start, end: change.range.end, html: '' };
            }
            const comment = change.metadata?.comment ?? src.slice(change.contentRange.start, change.contentRange.end);
            const annotation = buildAnchorAnnotation(change, options.metadataDetail);

            // For comments preceded by an adjacent Highlight, use the highlight's
            // range.start for pairId consistency so both elements share the same
            // cn-pair identifier for bidirectional sidebar linking.
            let commentPairAttr = pairAttr;
            const idx = allChanges.indexOf(change);
            const prev = idx > 0 ? allChanges[idx - 1] : undefined;
            if (prev && prev.type === ChangeType.Highlight && change.range.start === prev.range.end) {
                commentPairAttr = ` data-cn-pair="cn-pair-${prev.range.start}"`;
            }

            return {
                start: change.range.start,
                end: change.range.end,
                html: `<span class="cn-comment"${commentPairAttr} title="${escapeHtml(comment)}">&#x1F4AC;</span>${badge}${annotation}`,
            };
        }
        default:
            return null;
    }
}

/**
 * Finds inline [^cn-N] references (not definitions) and produces
 * replacement entries that render them as styled <sup> badges.
 */
function footnoteRefReplacements(src: string): Replacement[] {
    const replacements: Replacement[] = [];
    const refRegex = /\[\^(cn-\d+(?:\.\d+)?)\]/g;
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(src)) !== null) {
        const afterRef = src.slice(match.index + match[0].length);
        const beforeRef = src.slice(0, match.index);
        const lineStart = beforeRef.lastIndexOf('\n') + 1;
        // A definition starts at col 0 and is followed by ':'
        const isDefinition = match.index === lineStart && afterRef.startsWith(':');
        if (isDefinition) continue;

        const scId = match[1];
        replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            html: `<sup class="cn-ref" id="cn-fn-ref-${escapeHtml(scId)}" data-cn-id="${escapeHtml(scId)}"><a href="#cn-fn-def-${escapeHtml(scId)}">${escapeHtml(scId)}</a></sup>`,
        });
    }
    return replacements;
}

/**
 * Renders the shared footnote header: a ref badge and a back-link anchor.
 * Used by both the projected (discussion-only) and full rendering branches.
 */
function renderFootnoteHeader(id: string): string {
    return `  <span class="cn-ref-badge">${escapeHtml(id)}</span>`
        + ` <a class="cn-fn-backlink" href="#cn-fn-ref-${escapeHtml(id)}" title="Back to change">&#x21A9;</a>`;
}

/**
 * Finds footnote definition blocks ([^cn-N]: ...). When showFootnotes
 * is true, wraps them in a styled <section> panel. When false, strips
 * the entire block by replacing it with empty string.
 */
function footnoteDefinitionReplacements(src: string, changes: ChangeNode[], options: PreviewOptions, codeZones?: CodeZone[]): Replacement[] {
    const replacements: Replacement[] = [];
    const defRegex = /^(\[\^(cn-\d+(?:\.\d+)?)\]:[ \t]*)(.*)/gm;
    let match: RegExpExecArray | null;
    const definitions: { start: number; end: number; id: string; firstLine: string }[] = [];
    const zones = codeZones ?? findCodeZones(src);

    while ((match = defRegex.exec(src)) !== null) {
        if (isInCodeZone(match.index, match.index + match[0].length, zones)) continue;
        const id = match[2];
        const firstLine = match[3];
        const start = match.index;

        let end = start + match[0].length;
        // Continuation: consume indented lines and blank lines until next
        // non-indented block or another footnote definition
        const rest = src.slice(end);
        const nextBreak = rest.search(/\n\s*\n|\n\[\^cn-/);
        if (nextBreak >= 0) {
            end += nextBreak;
        } else {
            end = src.length;
        }

        definitions.push({ start, end, id, firstLine });
    }

    if (definitions.length === 0) return [];

    const panelStart = definitions[0].start;
    const panelEnd = definitions[definitions.length - 1].end;

    // When showFootnotes is false, strip the entire definition block
    if (!options.showFootnotes) {
        return [{ start: panelStart, end: panelEnd, html: '' }];
    }

    let html = '<section class="cn-footnotes">\n';
    for (const def of definitions) {
        const node = changes.find(c => c.id === def.id);
        const meta = node?.metadata;

        if (options.metadataDetail === 'projected') {
            // Discussion-only container — metadata is at the anchor
            html += `<div class="cn-footnote cn-fn-discussion-only" id="cn-fn-def-${escapeHtml(def.id)}" data-cn-id="${escapeHtml(def.id)}">\n`;
            html += renderFootnoteHeader(def.id) + '\n';
            if (meta?.discussion && meta.discussion.length > 0) {
                html += renderDiscussion(meta.discussion);
            }
            html += '</div>\n';
        } else {
            // Full footnote rendering (badge and summary modes)
            html += `<div class="cn-footnote" id="cn-fn-def-${escapeHtml(def.id)}" data-cn-id="${escapeHtml(def.id)}">\n`;
            html += renderFootnoteHeader(def.id);
            if (meta?.author) html += ` <span class="cn-fn-author">${escapeHtml(meta.author)}</span>`;
            if (meta?.date) html += ` <span class="cn-fn-date">${escapeHtml(meta.date)}</span>`;
            if (meta?.status) html += ` <span class="cn-fn-status cn-${escapeHtml(meta.status)}">${escapeHtml(meta.status)}</span>`;
            if (meta?.comment) html += `\n  <div class="cn-fn-comment">${escapeHtml(meta.comment)}</div>`;
            html += '\n';
            // Deliberation fields
            if (meta) {
                if (meta.context) html += renderContext(meta.context);
                html += renderApprovals(meta.approvals ?? [], 'cn-fn-approval', 'approved');
                html += renderApprovals(meta.rejections ?? [], 'cn-fn-rejection', 'rejected');
                html += renderApprovals(meta.requestChanges ?? [], 'cn-fn-request-changes', 'request-changes');
                html += renderRevisions(meta.revisions ?? []);
                html += renderDiscussion(meta.discussion ?? []);
                html += renderResolution(meta.resolution);
            }
            html += '</div>\n';
        }
    }
    html += '</section>';

    replacements.push({ start: panelStart, end: panelEnd, html });
    return replacements;
}

/**
 * Maps rewritten line numbers back to original source line numbers.
 *
 * As CriticMarkup replacements expand or contract multi-line ranges,
 * the resulting HTML has different line counts than the original markdown.
 * This class tracks cumulative line deltas so scroll sync can map a
 * preview DOM line back to the corresponding editor line.
 *
 * Usage:
 *   const map = new LineOffsetMap();
 *   map.addDelta(rewrittenLine, delta);   // called once per replacement
 *   const origLine = map.toOriginal(line); // query at render time
 */
export class LineOffsetMap {
    private deltas: Array<{ rewrittenLine: number; cumulativeDelta: number }> = [];

    addDelta(rewrittenLine: number, delta: number): void {
        const prev = this.deltas.length > 0
            ? this.deltas[this.deltas.length - 1].cumulativeDelta
            : 0;
        this.deltas.push({ rewrittenLine, cumulativeDelta: prev + delta });
    }

    toOriginal(rewrittenLine: number): number {
        if (this.deltas.length === 0) return rewrittenLine;

        let lo = 0, hi = this.deltas.length - 1;
        let applicable = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.deltas[mid].rewrittenLine <= rewrittenLine) {
                applicable = this.deltas[mid].cumulativeDelta;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return rewrittenLine - applicable;
    }
}

/**
 * Counts newline characters in str between indices start (inclusive) and end (exclusive).
 */
function countNewlines(str: string, start: number, end: number): number {
    let count = 0;
    for (let i = start; i < end; i++) {
        if (str.charCodeAt(i) === 10) count++;
    }
    return count;
}

/**
 * Takes raw markdown source and parsed ChangeNodes, produces a new string
 * with CriticMarkup replaced by styled HTML elements. This output is fed
 * to markdown-it for final rendering.
 *
 * Processing order:
 * 1. Identify code fence exclusion zones
 * 2. Build replacement entries for each ChangeNode (skipping fenced ones)
 * 3. Build replacement entries for footnote refs and definitions
 * 4. Deduplicate overlapping replacements
 * 5. Apply replacements in reverse document order to preserve offsets
 */
export function buildReplacements(
    src: string,
    changes: ChangeNode[],
    options: PreviewOptions,
    lineMap?: LineOffsetMap
): string {
    const codeZones = findCodeZones(src);
    const replacements: Replacement[] = [];

    // Set up per-author color map (null when not needed)
    const authorColorMode = options.authorColors ?? 'auto';
    const useAuthorColors = PreviewAuthorColorMap.shouldApplyColors(changes, authorColorMode);
    const authorMap = useAuthorColors ? new PreviewAuthorColorMap() : null;

    // CriticMarkup change replacements
    for (const change of changes) {
        if (isInCodeZone(change.range.start, change.range.end, codeZones)) continue;
        const r = changeToReplacement(change, src, options, changes, authorMap);
        if (r) replacements.push(r);
    }

    // Footnote ref replacements (inline [^cn-N] badges)
    for (const r of footnoteRefReplacements(src)) {
        if (!isInCodeZone(r.start, r.end, codeZones)) {
            if (options.showFootnotes) {
                replacements.push(r);
            } else {
                // Strip refs entirely when footnotes are hidden
                replacements.push({ start: r.start, end: r.end, html: '' });
            }
        }
    }

    // Footnote definition panel
    replacements.push(...footnoteDefinitionReplacements(src, changes, options, codeZones));

    // Deduplicate overlapping replacements — keep the wider one
    replacements.sort((a, b) => a.start - b.start || b.end - a.end);
    const deduped: Replacement[] = [];
    for (const r of replacements) {
        const prev = deduped[deduped.length - 1];
        if (prev && r.start < prev.end) {
            // Overlapping: keep whichever spans more
            if (r.end - r.start > prev.end - prev.start) {
                deduped[deduped.length - 1] = r;
            }
            continue;
        }
        deduped.push(r);
    }

    // Populate the line map (forward pass, before reverse application)
    if (lineMap) {
        // deduped is still sorted front-to-back from the dedup step above.
        // Walk forward, tracking cumulative line offset as each replacement is applied.
        let cumulativeLineDelta = 0;
        for (const r of deduped) {
            const originalNewlines = countNewlines(src, r.start, r.end);
            const replacementNewlines = countNewlines(r.html, 0, r.html.length);
            const delta = replacementNewlines - originalNewlines;
            if (delta !== 0) {
                // The rewritten line number where this replacement starts:
                // lines before r.start in the original + cumulative delta from prior replacements
                const rewrittenLine = countNewlines(src, 0, r.start) + cumulativeLineDelta;
                lineMap.addDelta(rewrittenLine, delta);
                cumulativeLineDelta += delta;
            }
        }
    }

    // Apply in reverse document order so earlier offsets stay valid
    deduped.sort((a, b) => b.start - a.start);
    let result = src;
    for (const r of deduped) {
        result = result.slice(0, r.start) + r.html + result.slice(r.end);
    }
    return result;
}
