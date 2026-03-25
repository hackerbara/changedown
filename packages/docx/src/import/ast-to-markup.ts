import { toChangeTracksAuthor } from '../shared/author-mapper.js';
import { toShortDate } from '../shared/date-utils.js';
import type { ImportStats } from '../types.js';
import type { EnrichmentMap, RevisionEnrichment } from './correlation-engine.js';
import type { PandocAst, PandocBlock, PandocInline } from './pandoc-runner.js';
import type { DocxComment, DrawingElement, RunFragment } from './xml-metadata-extractor.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AstToMarkupOptions {
  mergeSubstitutions: boolean;
  comments: boolean;
  commentData?: {
    allComments: Map<string, DocxComment>;
    rangedIds: Set<string>;
    replies: Map<string, string[]>;
  };
  enrichment?: EnrichmentMap;
}

// ---------------------------------------------------------------------------
// Internal state (encapsulated per call via closure)
// ---------------------------------------------------------------------------

interface Footnote {
  id: number;
  author: string;
  date: string;
  type: string;
  status: string;
  comments: Array<{
    author: string;
    date: string;
    text: string;
    depth: number;
  }>;
  imageDimensions?: string;  // e.g., "2.5in x 1.8in"
  extraLines?: string[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function astToMarkup(
  ast: PandocAst,
  options: AstToMarkupOptions
): { markdown: string; stats: ImportStats } {
  // Per-call mutable state
  let ctIdCounter = 0;
  const footnotes: Footnote[] = [];
  let currentBlockPath: number[] = [];
  let currentSpanIndex = 0;
  const wordComments = new Map<
    string,
    { author: string; date: string; text: string }
  >();
  const activeRanges = new Map<
    string,
    { author: string; date: string; text: string }
  >();
  const consumedCommentIds = new Set<string>();
  const consumedCommentScId = new Map<string, number>();

  function nextCtId(): number {
    return ++ctIdCounter;
  }

  function addChangeFootnote(
    author: string,
    date: string,
    type: string,
    status: string,
    imageDimensions?: { width: string; height: string },
  ): number {
    const id = nextCtId();
    const fn: Footnote = {
      id,
      author: toChangeTracksAuthor(author),
      date: toShortDate(date),
      type,
      status: status || 'proposed',
      comments: [],
    };
    if (imageDimensions) {
      fn.imageDimensions = `${imageDimensions.width} x ${imageDimensions.height}`;
    }
    footnotes.push(fn);
    return id;
  }

  function addCommentToFootnote(
    ctId: number,
    author: string,
    date: string,
    text: string,
    depth: number
  ): void {
    const fn = footnotes.find((f) => f.id === ctId);
    if (fn) {
      fn.comments.push({
        author: toChangeTracksAuthor(author),
        date: toShortDate(date),
        text,
        depth: depth || 0,
      });
    }
  }

  function addStandaloneCommentFootnote(
    author: string,
    date: string,
    text: string
  ): number {
    const id = nextCtId();
    footnotes.push({
      id,
      author: toChangeTracksAuthor(author),
      date: toShortDate(date),
      type: 'comment',
      status: 'proposed',
      comments: [
        {
          author: toChangeTracksAuthor(author),
          date: toShortDate(date),
          text,
          depth: 0,
        },
      ],
    });
    return id;
  }

  function addFootnoteExtraLines(ctId: number, lines: string[]): void {
    const fn = footnotes.find((f) => f.id === ctId);
    if (fn) {
      if (!fn.extraLines) fn.extraLines = [];
      fn.extraLines.push(...lines);
    }
  }

  function buildImagePositionLines(drawing: DrawingElement): string[] {
    const lines: string[] = [];
    lines.push('image-float: anchor');
    if (drawing.horizontalPosition?.anchor) {
      lines.push(`image-h-anchor: ${drawing.horizontalPosition.anchor}`);
    }
    if (drawing.horizontalPosition?.offset != null) {
      lines.push(`image-h-offset: ${drawing.horizontalPosition.offset}`);
    } else if (drawing.horizontalPosition?.align) {
      lines.push(`image-h-align: ${drawing.horizontalPosition.align}`);
    }
    if (drawing.verticalPosition?.anchor) {
      lines.push(`image-v-anchor: ${drawing.verticalPosition.anchor}`);
    }
    if (drawing.verticalPosition?.offset != null) {
      lines.push(`image-v-offset: ${drawing.verticalPosition.offset}`);
    } else if (drawing.verticalPosition?.align) {
      lines.push(`image-v-align: ${drawing.verticalPosition.align}`);
    }
    if (drawing.wrapType) {
      lines.push(`image-wrap: ${drawing.wrapType}`);
    }
    if (drawing.wrapSide) {
      lines.push(`image-wrap-side: ${drawing.wrapSide}`);
    }
    if (drawing.behindDocument != null) {
      lines.push(`image-z: ${drawing.behindDocument ? 'background' : 'foreground'}`);
    }
    if (
      drawing.distT != null &&
      drawing.distB != null &&
      drawing.distL != null &&
      drawing.distR != null
    ) {
      lines.push(`image-dist: ${drawing.distT} ${drawing.distB} ${drawing.distL} ${drawing.distR}`);
    }
    return lines;
  }

  function addImagePositionMetadata(ctId: number, src: string): void {
    const basename = src.split('/').pop() || '';
    const imgEnrichment = options.enrichment?.getImageEnrichment(basename);
    if (imgEnrichment && !imgEnrichment.inline) {
      addFootnoteExtraLines(ctId, buildImagePositionLines(imgEnrichment));
    }
  }

  // -------------------------------------------------------------------------
  // Span helpers
  // -------------------------------------------------------------------------

  function getSpanClasses(node: PandocInline): string[] {
    return node.c[0][1];
  }

  function getSpanKvs(
    node: PandocInline
  ): Record<string, string> {
    return Object.fromEntries(node.c[0][2]);
  }

  function getSpanContent(node: PandocInline): PandocInline[] {
    return node.c[1];
  }

  // -------------------------------------------------------------------------
  // Look-ahead for substitution detection
  // -------------------------------------------------------------------------

  function findNextInsertion(
    inlines: PandocInline[],
    j: number
  ): {
    index: number;
    skippedComments: Array<{ node: PandocInline; index: number }>;
  } | null {
    const skippedComments: Array<{ node: PandocInline; index: number }> = [];
    let k = j;
    while (k < inlines.length) {
      const node = inlines[k];
      // Skip whitespace nodes (Space, SoftBreak) between deletion and insertion
      if (node.t === 'Space' || node.t === 'SoftBreak') {
        k++;
        continue;
      }
      if (node.t === 'Span') {
        const cls = getSpanClasses(node);
        if (cls.includes('comment-start') || cls.includes('comment-end')) {
          skippedComments.push({ node, index: k });
          k++;
          continue;
        }
        if (cls.includes('insertion')) {
          return { index: k, skippedComments };
        }
      }
      break;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Enrichment helper
  // -------------------------------------------------------------------------

  function renderFormattedText(runs: RunFragment[]): string {
    let result = '';
    for (const run of runs) {
      let text = run.text;
      if (run.strikethrough) text = `~~${text}~~`;
      if (run.bold) text = `**${text}**`;
      if (run.italic) text = `*${text}*`;
      if (run.underline) text = `<u>${text}</u>`;
      result += text;
    }
    return result;
  }

  function getCurrentEnrichment(): RevisionEnrichment | undefined {
    return options.enrichment?.getRevisionEnrichment(
      currentBlockPath,
      currentSpanIndex
    );
  }

  function getEnrichedText(content: PandocInline[]): string {
    const enrichment = getCurrentEnrichment();
    return enrichment && enrichment.splitCount === 1
      ? renderFormattedText(enrichment.runs)
      : renderInlineContent(content);
  }

  // -------------------------------------------------------------------------
  // Inline rendering
  // -------------------------------------------------------------------------

  function renderInlines(inlines: PandocInline[]): string {
    let result = '';
    let i = 0;

    while (i < inlines.length) {
      const node = inlines[i];

      if (node.t === 'Span') {
        const classes = getSpanClasses(node);

        // --- Deletion ---
        if (classes.includes('deletion')) {
          const meta = getSpanKvs(node);
          const content = getSpanContent(node);

          // Check for image inside deletion — must come before substitution merge logic
          const imageNodeDel = content.find((n: PandocInline) => n.t === 'Image');
          if (imageNodeDel) {
            const imgAttrs = imageNodeDel.c[0][2] as [string, string][];
            const alt = renderInlineContent(imageNodeDel.c[1]);
            const src = imageNodeDel.c[2][0];
            const widthAttr = imgAttrs.find(([k]: [string, string]) => k === 'width');
            const heightAttr = imgAttrs.find(([k]: [string, string]) => k === 'height');
            const ctId = addChangeFootnote(
              meta.author, meta.date, 'del', 'proposed',
              widthAttr && heightAttr ? { width: widthAttr[1], height: heightAttr[1] } : undefined,
            );
            addImagePositionMetadata(ctId, src);
            result += `{--![${alt}](${src})--}[^ct-${ctId}]`;
            currentSpanIndex++;
            i++;
            continue;
          }

          // Check for boundary splitting
          const delEnrichment = getCurrentEnrichment();
          if (delEnrichment && delEnrichment.splitCount > 1 && delEnrichment.splitBoundaries) {
            // Emit one CriticMarkup span per boundary element
            for (const boundary of delEnrichment.splitBoundaries) {
              const text = renderFormattedText(boundary.runs);
              const ctId = addChangeFootnote(
                boundary.author,
                boundary.date,
                'del',
                'proposed'
              );
              result += `{--${text}--}[^ct-${ctId}]`;
            }
            currentSpanIndex++;
            i++;
            continue;
          }

          // Check for merge-detected diagnostic
          if (delEnrichment && delEnrichment.mergeDetected) {
            const delText = renderFormattedText(delEnrichment.runs);
            const ctId = addChangeFootnote(
              meta.author,
              meta.date,
              'del',
              'proposed'
            );
            addFootnoteExtraLines(ctId, [
              `merge-detected: ${delEnrichment.mergeDetected} original revisions`,
            ]);
            result += `{--${delText}--}[^ct-${ctId}]`;
            currentSpanIndex++;
            i++;
            continue;
          }

          const delText = getEnrichedText(content);

          if (options.mergeSubstitutions) {
            // Look ahead for substitution
            const ahead = findNextInsertion(inlines, i + 1);
            if (ahead) {
              const insNode = inlines[ahead.index];
              const insMeta = getSpanKvs(insNode);
              if (
                meta.author === insMeta.author &&
                meta.date === insMeta.date
              ) {
                // Advance past the deletion span for enrichment
                currentSpanIndex++;
                const insText = getEnrichedText(
                  getSpanContent(insNode)
                );
                const ctId = addChangeFootnote(
                  meta.author,
                  meta.date,
                  'sub',
                  'proposed'
                );
                result += `{~~${delText}~>${insText}~~}[^ct-${ctId}]`;
                currentSpanIndex++;

                // Process skipped comment spans
                if (options.comments) {
                  for (const { node: cNode } of ahead.skippedComments) {
                    const cCls = getSpanClasses(cNode);
                    if (cCls.includes('comment-start')) {
                      const cMeta = getSpanKvs(cNode);
                      const commentText = renderInlineContent(
                        getSpanContent(cNode)
                      );
                      addCommentToFootnote(
                        ctId,
                        cMeta.author,
                        cMeta.date,
                        commentText,
                        0
                      );
                      consumedCommentIds.add(cMeta.id);
                      consumedCommentScId.set(cMeta.id, ctId);
                    }
                    if (cCls.includes('comment-end')) {
                      const cMeta = getSpanKvs(cNode);
                      consumedCommentIds.add(cMeta.id);
                    }
                  }
                }

                i = ahead.index + 1;
                continue;
              }
            }
          }

          // Standalone deletion
          const ctId = addChangeFootnote(
            meta.author,
            meta.date,
            'del',
            'proposed'
          );
          result += `{--${delText}--}[^ct-${ctId}]`;
          currentSpanIndex++;
          i++;
          continue;
        }

        // --- Insertion ---
        if (classes.includes('insertion')) {
          const meta = getSpanKvs(node);
          const content = getSpanContent(node);

          // Check if content contains an Image node
          const imageNodeIns = content.find((n: PandocInline) => n.t === 'Image');
          if (imageNodeIns) {
            const imgAttrs = imageNodeIns.c[0][2] as [string, string][];
            const alt = renderInlineContent(imageNodeIns.c[1]);
            const src = imageNodeIns.c[2][0];
            const widthAttr = imgAttrs.find(([k]: [string, string]) => k === 'width');
            const heightAttr = imgAttrs.find(([k]: [string, string]) => k === 'height');
            const ctId = addChangeFootnote(
              meta.author, meta.date, 'ins', 'proposed',
              widthAttr && heightAttr ? { width: widthAttr[1], height: heightAttr[1] } : undefined,
            );
            addImagePositionMetadata(ctId, src);
            result += `{++![${alt}](${src})++}[^ct-${ctId}]`;
            currentSpanIndex++;
            i++;
            continue;
          }

          // Check for boundary splitting
          const enrichment = getCurrentEnrichment();
          if (enrichment && enrichment.splitCount > 1 && enrichment.splitBoundaries) {
            // Emit one CriticMarkup span per boundary element
            for (const boundary of enrichment.splitBoundaries) {
              const text = renderFormattedText(boundary.runs);
              const ctId = addChangeFootnote(
                boundary.author,
                boundary.date,
                'ins',
                'proposed'
              );
              result += `{++${text}++}[^ct-${ctId}]`;
            }
            currentSpanIndex++;
            i++;
            continue;
          }

          // Check for merge-detected diagnostic
          if (enrichment && enrichment.mergeDetected) {
            const text = renderFormattedText(enrichment.runs);
            const ctId = addChangeFootnote(
              meta.author,
              meta.date,
              'ins',
              'proposed'
            );
            addFootnoteExtraLines(ctId, [
              `merge-detected: ${enrichment.mergeDetected} original revisions`,
            ]);
            result += `{++${text}++}[^ct-${ctId}]`;
            currentSpanIndex++;
            i++;
            continue;
          }

          const text = getEnrichedText(content);
          const ctId = addChangeFootnote(
            meta.author,
            meta.date,
            'ins',
            'proposed'
          );
          result += `{++${text}++}[^ct-${ctId}]`;
          currentSpanIndex++;
          i++;
          continue;
        }

        // --- Comment start ---
        if (options.comments && classes.includes('comment-start')) {
          const meta = getSpanKvs(node);
          const children = getSpanContent(node);

          // Check for nested comment-end (zero-length comment range).
          // Pandoc nests comment-end inside comment-start when the range
          // has zero length and no text content.
          const hasNestedEnd = children.some(
            (child: PandocInline) =>
              child.t === 'Span' &&
              getSpanClasses(child).includes('comment-end')
          );

          if (hasNestedEnd) {
            // Self-closing comment: look up text from commentData
            // (xml-metadata-extractor already parsed word/comments.xml)
            const commentFromXml = options.commentData?.allComments.get(meta.id);
            const commentText = commentFromXml?.text
              || renderInlineContent(children);
            const ctId = addStandaloneCommentFootnote(
              meta.author || commentFromXml?.author || 'Unknown',
              meta.date || commentFromXml?.date || '',
              commentText
            );
            // Attach replies
            const replies = options.commentData?.replies.get(meta.id);
            if (replies) {
              for (const replyId of replies) {
                const reply = options.commentData?.allComments.get(replyId);
                if (reply) {
                  addCommentToFootnote(
                    ctId,
                    reply.author,
                    reply.date,
                    reply.text,
                    1
                  );
                }
              }
            }
            result += `[^ct-${ctId}]`;
            consumedCommentIds.add(meta.id);
            consumedCommentScId.set(meta.id, ctId);
          } else {
            // Normal case: store and wait for sibling comment-end
            const commentText = renderInlineContent(children);
            wordComments.set(meta.id, {
              author: meta.author,
              date: meta.date,
              text: commentText,
            });
            activeRanges.set(meta.id, {
              author: meta.author,
              date: meta.date,
              text: commentText,
            });
          }
          i++;
          continue;
        }

        // --- Comment end ---
        if (options.comments && classes.includes('comment-end')) {
          const meta = getSpanKvs(node);
          if (consumedCommentIds.has(meta.id)) {
            // Attach replies to the consumed footnote
            const parentCtId = consumedCommentScId.get(meta.id);
            const replies = options.commentData?.replies.get(meta.id);
            if (replies && replies.length > 0 && parentCtId) {
              for (const replyId of replies) {
                const reply = options.commentData?.allComments.get(replyId);
                if (reply) {
                  addCommentToFootnote(
                    parentCtId,
                    reply.author,
                    reply.date,
                    reply.text,
                    1
                  );
                }
              }
            }
            i++;
            continue;
          }
          const commentInfo = wordComments.get(meta.id);
          if (commentInfo) {
            const ctId = addStandaloneCommentFootnote(
              commentInfo.author,
              commentInfo.date,
              commentInfo.text
            );
            // Add replies
            const replies = options.commentData?.replies.get(meta.id);
            if (replies) {
              for (const replyId of replies) {
                const reply = options.commentData?.allComments.get(replyId);
                if (reply) {
                  addCommentToFootnote(
                    ctId,
                    reply.author,
                    reply.date,
                    reply.text,
                    1
                  );
                }
              }
            }
            result += `[^ct-${ctId}]`;
          }
          activeRanges.delete(meta.id);
          i++;
          continue;
        }
      }

      // Plain image — highlight-wrap and attach synthetic footnote with metadata
      if (node.t === 'Image') {
        const imgAttrs = node.c[0][2] as [string, string][];
        const alt = renderInlineContent(node.c[1]);
        const src = node.c[2][0];
        const widthAttr = imgAttrs.find(([k]: [string, string]) => k === 'width');
        const heightAttr = imgAttrs.find(([k]: [string, string]) => k === 'height');

        // Check if there's any metadata worth preserving
        const hasDimensions = !!(widthAttr && heightAttr);
        const basename = src.split('/').pop() || '';
        const imgEnrichment = options.enrichment?.getImageEnrichment(basename);
        const hasPositionMetadata = !!(imgEnrichment && !imgEnrichment.inline);

        if (hasDimensions || hasPositionMetadata) {
          const ctId = addChangeFootnote(
            '@system', new Date().toISOString(), 'image', 'proposed',
            hasDimensions ? { width: widthAttr![1], height: heightAttr![1] } : undefined,
          );
          addImagePositionMetadata(ctId, src);
          result += `{==![${alt}](${src})==}[^ct-${ctId}]`;
        } else {
          result += `![${alt}](${src})`;
        }
        i++;
        continue;
      }

      // Regular inline
      result += renderInline(node);
      i++;
    }

    return result;
  }

  function renderInlineContent(inlines: PandocInline[]): string {
    let result = '';
    for (const node of inlines) {
      result += renderInline(node);
    }
    return result.replace(/\u200B/g, '');
  }

  function renderInline(node: PandocInline): string {
    switch (node.t) {
      case 'Str':
        return node.c;
      case 'Space':
        return ' ';
      case 'SoftBreak':
        return '\n';
      case 'LineBreak':
        return '  \n';
      case 'Strong':
        return `**${renderInlineContent(node.c)}**`;
      case 'Emph':
        return `*${renderInlineContent(node.c)}*`;
      case 'Strikeout':
        return `~~${renderInlineContent(node.c)}~~`;
      case 'Code':
        return `\`${node.c[1]}\``;
      case 'Link':
        return `[${renderInlineContent(node.c[1])}](${node.c[2][0]})`;
      case 'Image':
        return `![${renderInlineContent(node.c[1])}](${node.c[2][0]})`;
      case 'Superscript':
        return `^${renderInlineContent(node.c)}^`;
      case 'Subscript':
        return `~${renderInlineContent(node.c)}~`;
      case 'SmallCaps':
        return `<span style="font-variant:small-caps">${renderInlineContent(node.c)}</span>`;
      case 'Quoted':
        if (node.c[0].t === 'DoubleQuote') {
          return `\u201c${renderInlineContent(node.c[1])}\u201d`;
        }
        return `\u2018${renderInlineContent(node.c[1])}\u2019`;
      case 'Span': {
        const spanClasses = getSpanClasses(node);
        const inner = renderInlineContent(getSpanContent(node));
        if (spanClasses.includes('underline')) {
          return `<u>${inner}</u>`;
        }
        return inner;
      }
      case 'RawInline':
        return node.c[1];
      case 'Note':
        return '';
      case 'Cite':
        return renderInlineContent(node.c[1]);
      case 'Math':
        return node.c[0].t === 'InlineMath'
          ? `$${node.c[1]}$`
          : `$$${node.c[1]}$$`;
      default:
        return '';
    }
  }

  // -------------------------------------------------------------------------
  // Block rendering
  // -------------------------------------------------------------------------

  function renderBlocks(blocks: PandocBlock[], parentPath: number[] = []): string {
    const parts: string[] = [];
    for (let idx = 0; idx < blocks.length; idx++) {
      const blockPath = [...parentPath, idx];
      const rendered = renderBlock(blocks[idx], blockPath);
      if (rendered !== null) {
        parts.push(rendered);
      }
    }
    return parts.join('\n\n');
  }

  function renderBlock(block: PandocBlock, blockPath: number[] = []): string | null {
    // Set block path and reset span index for enrichment tracking
    currentBlockPath = blockPath;
    currentSpanIndex = 0;

    switch (block.t) {
      case 'Para':
        return renderInlines(block.c);

      case 'Plain':
        return renderInlines(block.c);

      case 'Header': {
        const level: number = block.c[0];
        const text = renderInlines(block.c[2]);
        return '#'.repeat(level) + ' ' + text;
      }

      case 'BulletList':
        return renderBulletList(block.c, blockPath);

      case 'OrderedList':
        return renderOrderedList(block.c, blockPath);

      case 'Table':
        return renderTable(block);

      case 'BlockQuote':
        return block.c
          .map((b: PandocBlock, i: number) => renderBlock(b, [...blockPath, i]))
          .filter(Boolean)
          .map((l: string) => '> ' + l.replace(/\n/g, '\n> '))
          .join('\n>\n');

      case 'CodeBlock': {
        const lang: string = block.c[0][1][0] || '';
        return '```' + lang + '\n' + block.c[1] + '\n```';
      }

      case 'HorizontalRule':
        return '---';

      case 'Div':
        return renderBlocks(block.c[1], blockPath);

      case 'RawBlock':
        return block.c[1];

      case 'LineBlock':
        return block.c
          .map((line: PandocInline[]) => renderInlineContent(line))
          .join('\n');

      case 'Null':
        return null;

      default:
        return null;
    }
  }

  function renderBulletList(items: PandocBlock[][], parentPath: number[]): string {
    const lines: string[] = [];
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const content = renderListItem(items[itemIdx], [...parentPath, itemIdx]);
      const itemLines = content.split('\n');
      lines.push('- ' + itemLines[0]);
      for (let i = 1; i < itemLines.length; i++) {
        lines.push('  ' + itemLines[i]);
      }
    }
    return lines.join('\n');
  }

  function renderOrderedList(args: [any, PandocBlock[][]], parentPath: number[]): string {
    const [listAttrs, items] = args;
    const start: number = listAttrs[0] || 1;
    const lines: string[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const content = renderListItem(items[idx], [...parentPath, idx]);
      const num = start + idx;
      const itemLines = content.split('\n');
      lines.push(`${num}. ` + itemLines[0]);
      for (let i = 1; i < itemLines.length; i++) {
        lines.push('   ' + itemLines[i]);
      }
    }
    return lines.join('\n');
  }

  function renderListItem(blocks: PandocBlock[], parentPath: number[]): string {
    return blocks
      .map((b, i) => renderBlock(b, [...parentPath, i]))
      .filter(Boolean)
      .join('\n');
  }

  // -------------------------------------------------------------------------
  // Table rendering
  // -------------------------------------------------------------------------

  function renderTable(tableNode: PandocBlock): string {
    const c = tableNode.c;
    const colSpecs = c[2];
    const numCols: number = colSpecs.length;

    const tableHead = c[3];
    const headRows = tableHead[1] || [];

    const tableBodies = c[4];
    const bodyRows: any[] = [];
    for (const body of tableBodies) {
      const rows = body[3] || [];
      bodyRows.push(...rows);
    }

    const allRows = [...headRows, ...bodyRows];
    if (allRows.length === 0) return '';

    const renderedRows = allRows.map((row: any) => {
      const cells = row[1];
      return cells.map((cell: any) => {
        const blocks = cell[4];
        return blocks
          .map((b: PandocBlock) => renderBlock(b))
          .filter(Boolean)
          .join(' ')
          .replace(/\|/g, '\\|');
      });
    });

    for (const row of renderedRows) {
      while (row.length < numCols) row.push('');
    }

    const colWidths = new Array(numCols).fill(3);
    for (const row of renderedRows) {
      for (let j = 0; j < numCols; j++) {
        colWidths[j] = Math.max(colWidths[j], (row[j] || '').length);
      }
    }

    const lines: string[] = [];
    const headerRow = renderedRows[0] || new Array(numCols).fill('');
    lines.push(
      '| ' +
        headerRow
          .map((cell: string, j: number) => cell.padEnd(colWidths[j]))
          .join(' | ') +
        ' |'
    );
    lines.push(
      '| ' +
        colWidths.map((w: number) => '-'.repeat(w)).join(' | ') +
        ' |'
    );

    for (let i = 1; i < renderedRows.length; i++) {
      lines.push(
        '| ' +
          renderedRows[i]
            .map((cell: string, j: number) => cell.padEnd(colWidths[j]))
            .join(' | ') +
          ' |'
      );
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Footnote rendering
  // -------------------------------------------------------------------------

  function renderFootnotes(): string {
    if (footnotes.length === 0) return '';

    const lines: string[] = [];
    for (const fn of footnotes) {
      lines.push(
        `[^ct-${fn.id}]: ${fn.author} | ${fn.date} | ${fn.type} | ${fn.status}`
      );

      if (fn.imageDimensions) {
        lines.push(`    image-dimensions: ${fn.imageDimensions}`);
      }

      if (fn.extraLines) {
        for (const line of fn.extraLines) {
          lines.push(`    ${line}`);
        }
      }

      for (const comment of fn.comments) {
        const indent = '    ' + '  '.repeat(comment.depth);
        lines.push(
          `${indent}${comment.author} ${comment.date}: ${comment.text}`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Execute
  // -------------------------------------------------------------------------

  const header = '<!-- ctrcks.com/v1: tracked -->\n\n';
  const markdown = renderBlocks(ast.blocks);
  const footnotesText = renderFootnotes();

  const output = header + markdown + '\n\n' + footnotesText;

  const stats: ImportStats = {
    insertions: footnotes.filter((f) => f.type === 'ins').length,
    deletions: footnotes.filter((f) => f.type === 'del').length,
    substitutions: footnotes.filter((f) => f.type === 'sub').length,
    comments: footnotes.filter((f) => f.type === 'comment').length,
    authors: [...new Set(footnotes.map((f) => f.author))],
  };

  return { markdown: output, stats };
}
