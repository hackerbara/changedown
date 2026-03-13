import type { ThreeZoneDocument, ThreeZoneLine, ContentSpan, LineMetadata } from '../three-zone-types.js';

export interface HtmlFormatOptions {
  /** Show CriticMarkup delimiters in output. Default: true. */
  showMarkup?: boolean;
  /** Show [^ct-N] anchors. Default: true. */
  showAnchors?: boolean;
  /** Show Zone 3 metadata as data attributes on anchor spans. Default: true. */
  embedMetadata?: boolean;
  /** Render Zone 3 metadata as visible spans at end of each line. Default: false. */
  showZone3?: boolean;
  /** CSS class prefix for spans. Default: 'ct'. */
  classPrefix?: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formats a ThreeZoneDocument as HTML with CSS-classed spans.
 *
 * Each line is a `<div class="tz-line">` containing:
 *   - Zone 1: `<span class="tz-margin">` with line number, hash, flags
 *   - Zone 2: `<span class="tz-content">` with typed content spans
 *   - Zone 3: metadata embedded as data-* attributes on anchor spans
 *
 * Content spans get CSS classes: ct-plain, ct-insertion, ct-deletion,
 * ct-sub-old, ct-sub-arrow, ct-sub-new, ct-highlight, ct-comment,
 * ct-anchor, ct-delimiter.
 */
export function formatHtml(doc: ThreeZoneDocument, options?: HtmlFormatOptions): string {
  const showMarkup = options?.showMarkup ?? true;
  const showAnchors = options?.showAnchors ?? true;
  const embedMeta = options?.embedMetadata ?? true;
  const showZone3 = options?.showZone3 ?? false;
  const prefix = options?.classPrefix ?? 'ct';

  const padWidth = doc.lines.length > 0
    ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2)
    : 2;

  // Build a metadata lookup by changeId for embedding on anchor spans
  const metaByChangeId = new Map<string, LineMetadata>();
  if (embedMeta) {
    for (const line of doc.lines) {
      for (const m of line.metadata) {
        metaByChangeId.set(m.changeId, m);
      }
    }
  }

  const lines = doc.lines.map(line =>
    formatLine(line, padWidth, showMarkup, showAnchors, showZone3, prefix, metaByChangeId)
  );

  return lines.join('\n');
}

function formatLine(
  line: ThreeZoneLine,
  padWidth: number,
  showMarkup: boolean,
  showAnchors: boolean,
  showZone3: boolean,
  prefix: string,
  metaByChangeId: Map<string, LineMetadata>,
): string {
  // Zone 1: margin
  const num = String(line.margin.lineNumber).padStart(padWidth, ' ');
  const hash = line.margin.hash;
  const flag = line.margin.flags.length > 0 ? line.margin.flags[0] : ' ';
  const flagClass = flag === 'P' ? ` ${prefix}-flag-proposed` : flag === 'A' ? ` ${prefix}-flag-accepted` : '';

  // Zone 2: content spans
  const content = line.content
    .map(s => formatSpan(s, showMarkup, showAnchors, prefix, metaByChangeId))
    .join('');

  // Zone 3: inline metadata projection
  const zone3 = showZone3 ? formatZone3(line.metadata, prefix) : '';

  return `<div class="${prefix}-line${flagClass}"><span class="${prefix}-margin">${num}:${hash}${flag !== ' ' ? flag : ' '}|</span>${content}${zone3}</div>`;
}

function formatSpan(
  span: ContentSpan,
  showMarkup: boolean,
  showAnchors: boolean,
  prefix: string,
  metaByChangeId: Map<string, LineMetadata>,
): string {
  switch (span.type) {
    case 'plain':
      return esc(span.text);
    case 'insertion':
      return `<span class="${prefix}-insertion">${esc(span.text)}</span>`;
    case 'deletion':
      return `<span class="${prefix}-deletion">${esc(span.text)}</span>`;
    case 'sub_old':
      return `<span class="${prefix}-sub-old">${esc(span.text)}</span>`;
    case 'sub_arrow':
      return `<span class="${prefix}-sub-arrow">${esc(span.text)}</span>`;
    case 'sub_new':
      return `<span class="${prefix}-sub-new">${esc(span.text)}</span>`;
    case 'highlight':
      return `<span class="${prefix}-highlight">${esc(span.text)}</span>`;
    case 'comment':
      return `<span class="${prefix}-comment">${esc(span.text)}</span>`;
    case 'anchor': {
      if (!showAnchors) return '';
      // Extract changeId from the anchor text [^ct-N] or [^ct-N.N]
      const idMatch = span.text.match(/\[\^(ct-[\d.]+)\]/);
      const changeId = idMatch ? idMatch[1] : '';
      const meta = metaByChangeId.get(changeId);
      const dataAttrs = meta ? buildDataAttrs(meta) : '';
      return `<span class="${prefix}-anchor" data-fn-id="${esc(changeId)}"${dataAttrs}>${esc(span.text)}</span>`;
    }
    case 'delimiter':
      if (!showMarkup) return '';
      return `<span class="${prefix}-delimiter">${esc(span.text)}</span>`;
    default:
      return esc(span.text);
  }
}

function buildDataAttrs(meta: LineMetadata): string {
  const attrs: string[] = [];
  if (meta.author) attrs.push(` data-author="${esc(meta.author)}"`);
  if (meta.status) attrs.push(` data-status="${esc(meta.status)}"`);
  if (meta.reason) attrs.push(` data-reason="${esc(meta.reason)}"`);
  if (meta.replyCount != null && meta.replyCount > 0) {
    attrs.push(` data-replies="${meta.replyCount}"`);
  }
  return attrs.join('');
}

/**
 * Render Zone 3 metadata as visible HTML at end of line,
 * matching MCP formatPlainText style: {>>ct-1 @author: reason | N replies<<}
 */
function formatZone3(metadata: LineMetadata[], prefix: string): string {
  if (metadata.length === 0) return '';
  const parts = metadata.map(m => {
    let text = m.changeId;
    if (m.author) text += ` ${m.author}:`;
    if (m.reason) text += ` ${m.reason}`;
    if (m.replyCount && m.replyCount > 0) {
      text += ` | ${m.replyCount} ${m.replyCount === 1 ? 'reply' : 'replies'}`;
    }
    const statusClass = m.status ? ` ${prefix}-z3-${m.status}` : '';
    return `<span class="${prefix}-zone3${statusClass}" data-change-id="${esc(m.changeId)}">${esc(text)}</span>`;
  });
  return ` <span class="${prefix}-zone3-group">${parts.join(' ')}</span>`;
}
