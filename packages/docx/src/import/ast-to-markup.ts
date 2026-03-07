import { toChangeTracksAuthor } from '../shared/author-mapper.js';
import { toShortDate } from '../shared/date-utils.js';
import type { ImportStats } from '../types.js';
import type { PandocAst, PandocBlock, PandocInline } from './pandoc-runner.js';
import type { DocxComment } from './comment-extractor.js';

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
    status: string
  ): number {
    const id = nextCtId();
    footnotes.push({
      id,
      author: toChangeTracksAuthor(author),
      date: toShortDate(date),
      type,
      status: status || 'proposed',
      comments: [],
    });
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
      if (node.t === 'Space') {
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
          const delText = renderInlineContent(getSpanContent(node));

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
                const insText = renderInlineContent(
                  getSpanContent(insNode)
                );
                const ctId = addChangeFootnote(
                  meta.author,
                  meta.date,
                  'sub',
                  'proposed'
                );
                result += `{~~${delText}~>${insText}~~}[^ct-${ctId}]`;

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
          i++;
          continue;
        }

        // --- Insertion ---
        if (classes.includes('insertion')) {
          const meta = getSpanKvs(node);
          const text = renderInlineContent(getSpanContent(node));
          const ctId = addChangeFootnote(
            meta.author,
            meta.date,
            'ins',
            'proposed'
          );
          result += `{++${text}++}[^ct-${ctId}]`;
          i++;
          continue;
        }

        // --- Comment start ---
        if (options.comments && classes.includes('comment-start')) {
          const meta = getSpanKvs(node);
          const commentText = renderInlineContent(getSpanContent(node));
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
    return result;
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
        return renderInlineContent(node.c);
      case 'Quoted':
        if (node.c[0].t === 'DoubleQuote') {
          return `\u201c${renderInlineContent(node.c[1])}\u201d`;
        }
        return `\u2018${renderInlineContent(node.c[1])}\u2019`;
      case 'Span': {
        return renderInlineContent(getSpanContent(node));
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

  function renderBlocks(blocks: PandocBlock[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
      const rendered = renderBlock(block);
      if (rendered !== null) {
        parts.push(rendered);
      }
    }
    return parts.join('\n\n');
  }

  function renderBlock(block: PandocBlock): string | null {
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
        return renderBulletList(block.c);

      case 'OrderedList':
        return renderOrderedList(block.c);

      case 'Table':
        return renderTable(block);

      case 'BlockQuote':
        return block.c
          .map((b: PandocBlock) => renderBlock(b))
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
        return renderBlocks(block.c[1]);

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

  function renderBulletList(items: PandocBlock[][]): string {
    const lines: string[] = [];
    for (const item of items) {
      const content = renderListItem(item);
      const itemLines = content.split('\n');
      lines.push('- ' + itemLines[0]);
      for (let i = 1; i < itemLines.length; i++) {
        lines.push('  ' + itemLines[i]);
      }
    }
    return lines.join('\n');
  }

  function renderOrderedList(args: [any, PandocBlock[][]]): string {
    const [listAttrs, items] = args;
    const start: number = listAttrs[0] || 1;
    const lines: string[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const content = renderListItem(items[idx]);
      const num = start + idx;
      const itemLines = content.split('\n');
      lines.push(`${num}. ` + itemLines[0]);
      for (let i = 1; i < itemLines.length; i++) {
        lines.push('   ' + itemLines[i]);
      }
    }
    return lines.join('\n');
  }

  function renderListItem(blocks: PandocBlock[]): string {
    return blocks
      .map((b) => renderBlock(b))
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
