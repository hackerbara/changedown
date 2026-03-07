/**
 * Tokens-to-Docx converter.
 *
 * Takes CriticMarkup markdown text and produces docx Paragraph[] using
 * @changetracks/core's parser and the docx npm library.
 */

import {
  Paragraph,
  TextRun,
  InsertedTextRun,
  DeletedTextRun,
  HeadingLevel,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
  ExternalHyperlink,
  HighlightColor,
  type ICommentOptions,
  type ParagraphChild,
} from 'docx';

import {
  CriticMarkupParser,
  ChangeType,
  computeSettledText,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  type ChangeNode,
} from '@changetracks/core';

import { buildCommentChain, type CommentReply } from './comment-builder.js';
import type { CommentPatchInfo } from './word-online-patch.js';
import { toDocxAuthor } from '../shared/author-mapper.js';
import { toIsoString } from '../shared/date-utils.js';

// ============================================================================
// Public types
// ============================================================================

export interface DocxConversionOptions {
  mode: 'tracked' | 'settled' | 'clean';
  comments: 'all' | 'none' | 'unresolved';
}

export interface DocxConversionResult {
  paragraphs: Paragraph[];
  commentDefs: ICommentOptions[];
  commentPatchInfos: CommentPatchInfo[];
  stats: {
    insertions: number;
    deletions: number;
    substitutions: number;
    comments: number;
    authors: string[];
  };
}

// ============================================================================
// Internal state (created per-call to avoid shared mutable state)
// ============================================================================

function createCounters() {
  let revisionIdCounter = 1;
  let commentIdCounter = 0;
  return {
    nextRevId(): number { return revisionIdCounter++; },
    nextCommentId(): number { return commentIdCounter++; },
  };
}

// ============================================================================
// Inline markdown formatting helpers
// ============================================================================

/**
 * Parse inline markdown formatting: **bold**, *italic*, `code`, [link](url).
 */
function parseInlineMarkdown(text: string): ParagraphChild[] {
  if (!text) return [];

  const children: ParagraphChild[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      const plain = text.slice(lastIndex, m.index);
      if (plain) children.push(new TextRun({ text: plain }));
    }

    if (m[2] !== undefined) {
      children.push(new TextRun({ text: m[2], bold: true }));
    } else if (m[3] !== undefined) {
      children.push(new TextRun({ text: m[3], italics: true }));
    } else if (m[4] !== undefined) {
      children.push(new TextRun({ text: m[4], font: { name: 'Courier New' } }));
    } else if (m[5] !== undefined && m[6] !== undefined) {
      children.push(
        new ExternalHyperlink({
          link: m[6],
          children: [new TextRun({ text: m[5], style: 'Hyperlink' })],
        })
      );
    }

    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) children.push(new TextRun({ text: remaining }));
  }

  if (children.length === 0 && text) {
    children.push(new TextRun({ text }));
  }

  return children;
}

/**
 * Extract formatting from text that wraps the entire content.
 * Handles: ***bold+italic***, **bold**, *italic*.
 */
function extractFormatting(text: string): {
  text: string;
  bold?: boolean;
  italics?: boolean;
} {
  let t = text;
  let bold = false;
  let italics = false;

  if (t.startsWith('***') && t.endsWith('***') && t.length > 6) {
    t = t.slice(3, -3);
    bold = true;
    italics = true;
  } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
    t = t.slice(2, -2);
    bold = true;
  } else if (t.startsWith('*') && t.endsWith('*') && t.length > 2 && !t.startsWith('**')) {
    t = t.slice(1, -1);
    italics = true;
  } else {
    t = t
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  return { text: t, ...(bold && { bold }), ...(italics && { italics }) };
}

// ============================================================================
// Change node to docx children
// ============================================================================

interface ConversionContext {
  text: string;
  changes: ChangeNode[];
  commentDefs: ICommentOptions[];
  commentPatchInfos: CommentPatchInfo[];
  stats: {
    insertions: number;
    deletions: number;
    substitutions: number;
    comments: number;
    authorSet: Set<string>;
  };
  includeComments: boolean;
  nextRevId: () => number;
  nextCommentId: () => number;
}

function getMetaAuthorDate(node: ChangeNode): { displayName: string; date: string } {
  const author = node.metadata?.author;
  const date = node.metadata?.date;

  if (author) {
    const { displayName } = toDocxAuthor(author);
    return { displayName, date: date || '2024-01-15' };
  }

  return { displayName: 'Unknown Author', date: date || '2024-01-15' };
}

function buildRepliesFromDiscussion(node: ChangeNode): CommentReply[] {
  const discussion = node.metadata?.discussion;
  if (!discussion || discussion.length === 0) return [];

  return discussion.map((d) => {
    const { displayName } = toDocxAuthor(d.author);
    return {
      author: displayName,
      date: d.date || '2024-01-15',
      text: d.text,
      depth: d.depth,
    };
  });
}

/**
 * Convert a single ChangeNode into docx ParagraphChild elements.
 */
function changeNodeToDocxChildren(
  node: ChangeNode,
  ctx: ConversionContext,
  nextChangeNode: ChangeNode | undefined,
  skipNext: { value: boolean }
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const { displayName, date } = getMetaAuthorDate(node);

  switch (node.type) {
    case ChangeType.Insertion: {
      const content = node.modifiedText || '';
      if (!content) break;
      const fmt = extractFormatting(content);
      ctx.stats.insertions++;
      ctx.stats.authorSet.add(displayName);
      children.push(
        new InsertedTextRun({
          text: fmt.text,
          id: ctx.nextRevId(),
          author: displayName,
          date: toIsoString(date),
          bold: fmt.bold,
          italics: fmt.italics,
        })
      );
      break;
    }

    case ChangeType.Deletion: {
      const content = node.originalText || '';
      if (!content) break;
      const fmt = extractFormatting(content);
      ctx.stats.deletions++;
      ctx.stats.authorSet.add(displayName);
      children.push(
        new DeletedTextRun({
          text: fmt.text,
          id: ctx.nextRevId(),
          author: displayName,
          date: toIsoString(date),
          bold: fmt.bold,
          italics: fmt.italics,
        })
      );
      break;
    }

    case ChangeType.Substitution: {
      ctx.stats.substitutions++;
      ctx.stats.authorSet.add(displayName);
      if (node.originalText) {
        const oldFmt = extractFormatting(node.originalText);
        children.push(
          new DeletedTextRun({
            text: oldFmt.text,
            id: ctx.nextRevId(),
            author: displayName,
            date: toIsoString(date),
            bold: oldFmt.bold,
            italics: oldFmt.italics,
          })
        );
      }
      if (node.modifiedText) {
        const newFmt = extractFormatting(node.modifiedText);
        children.push(
          new InsertedTextRun({
            text: newFmt.text,
            id: ctx.nextRevId(),
            author: displayName,
            date: toIsoString(date),
            bold: newFmt.bold,
            italics: newFmt.italics,
          })
        );
      }
      break;
    }

    case ChangeType.Highlight: {
      // The core parser uses originalText for highlight content, and
      // metadata.comment for an attached {>>comment<<} (merged into node).
      const highlightContent = node.originalText || node.modifiedText || '';

      if (!ctx.includeComments) {
        // Just emit the highlighted text without comment wrapping
        if (highlightContent) {
          children.push(new TextRun({ text: highlightContent, highlight: HighlightColor.YELLOW }));
        }
        break;
      }

      // Check for attached comment (core parser merges {==text==}{>>comment<<}
      // into a single Highlight node with metadata.comment)
      if (node.metadata?.comment) {
        const cId = ctx.nextCommentId();
        const commentText = node.metadata.comment.trim();
        const commentMeta = getMetaAuthorDate(node);
        const replies = buildRepliesFromDiscussion(node);

        buildCommentChain(
          cId,
          commentText,
          commentMeta.displayName,
          commentMeta.date,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.stats.comments++;

        children.push(new CommentRangeStart(cId));
        children.push(new TextRun({ text: highlightContent, highlight: HighlightColor.YELLOW }));
        children.push(new CommentRangeEnd(cId));
        children.push(new CommentReference(cId));
      } else if (
        nextChangeNode &&
        nextChangeNode.type === ChangeType.Comment &&
        nextChangeNode.range.start === node.range.end
      ) {
        // Fallback: separate Comment node immediately after highlight
        const cId = ctx.nextCommentId();
        const commentText = nextChangeNode.modifiedText?.trim() || '';
        const commentMeta = getMetaAuthorDate(nextChangeNode.metadata?.author ? nextChangeNode : node);
        const replies = buildRepliesFromDiscussion(nextChangeNode.metadata?.discussion ? nextChangeNode : node);

        buildCommentChain(
          cId,
          commentText,
          commentMeta.displayName,
          commentMeta.date,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.stats.comments++;

        children.push(new CommentRangeStart(cId));
        children.push(new TextRun({ text: highlightContent, highlight: HighlightColor.YELLOW }));
        children.push(new CommentRangeEnd(cId));
        children.push(new CommentReference(cId));

        skipNext.value = true; // Skip the consumed comment node
      } else if (node.metadata?.discussion && node.metadata.discussion.length > 0) {
        // Highlight with threaded discussion from footnote
        const cId = ctx.nextCommentId();
        const disc = node.metadata.discussion;
        const rootText = disc[0].text;
        const rootAuthor = toDocxAuthor(disc[0].author).displayName;
        const rootDate = disc[0].date || date;

        const replies = disc.slice(1).map((d) => ({
          author: toDocxAuthor(d.author).displayName,
          date: d.date || date,
          text: d.text,
          depth: d.depth,
        }));

        buildCommentChain(
          cId,
          rootText,
          rootAuthor,
          rootDate,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.stats.comments++;

        children.push(new CommentRangeStart(cId));
        children.push(new TextRun({ text: highlightContent, highlight: HighlightColor.YELLOW }));
        children.push(new CommentRangeEnd(cId));
        children.push(new CommentReference(cId));
      } else {
        // Standalone highlight (no comments)
        if (highlightContent) {
          children.push(new TextRun({ text: highlightContent, highlight: HighlightColor.YELLOW }));
        }
      }
      break;
    }

    case ChangeType.Comment: {
      if (!ctx.includeComments) break;

      // Standalone comment (not attached to a highlight)
      const cId = ctx.nextCommentId();
      const commentText = node.modifiedText?.trim() || '';
      const commentMeta = getMetaAuthorDate(node);
      const replies = buildRepliesFromDiscussion(node);

      buildCommentChain(
        cId,
        commentText,
        commentMeta.displayName,
        commentMeta.date,
        ctx.commentDefs,
        ctx.commentPatchInfos,
        replies.length > 0 ? replies : undefined
      );
      ctx.stats.comments++;

      // Zero-width comment range at this position
      children.push(new CommentRangeStart(cId));
      children.push(new CommentRangeEnd(cId));
      children.push(new CommentReference(cId));
      break;
    }
  }

  return children;
}

// ============================================================================
// Line-level processing
// ============================================================================

/**
 * Given a line of text (with CriticMarkup already parsed into changes),
 * produce the docx ParagraphChild[] by walking through the line content
 * and interleaving plain text with tracked change runs.
 */
function lineToDocxChildren(
  lineStart: number,
  lineEnd: number,
  changes: ChangeNode[],
  ctx: ConversionContext
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const text = ctx.text;

  // Find all changes that overlap this line
  const lineChanges = changes.filter(
    (c) => c.range.start < lineEnd && c.range.end > lineStart
  );

  if (lineChanges.length === 0) {
    // No changes on this line — emit as plain text
    const lineText = text.substring(lineStart, lineEnd);
    children.push(...parseInlineMarkdown(lineText));
    return children;
  }

  let pos = lineStart;
  const skipNext = { value: false };

  for (let i = 0; i < lineChanges.length; i++) {
    if (skipNext.value) {
      skipNext.value = false;
      continue;
    }

    const change = lineChanges[i];
    const nextChange = lineChanges[i + 1];

    // Emit plain text before this change
    if (change.range.start > pos) {
      const plainStart = Math.max(pos, lineStart);
      const plainEnd = Math.min(change.range.start, lineEnd);
      if (plainEnd > plainStart) {
        const plain = text.substring(plainStart, plainEnd);
        children.push(...parseInlineMarkdown(plain));
      }
    }

    // Emit the change
    children.push(...changeNodeToDocxChildren(change, ctx, nextChange, skipNext));

    pos = change.range.end;
  }

  // Emit trailing plain text after the last change
  if (pos < lineEnd) {
    const trailing = text.substring(pos, lineEnd);
    if (trailing) {
      children.push(...parseInlineMarkdown(trailing));
    }
  }

  return children;
}

/**
 * Determine if a line should be skipped (tracking headers, footnote blocks, etc).
 */
function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '<!-- ctrcks.com/v1: tracked -->') return true;
  if (/^\[\^ct-/.test(line)) return true;
  if (/^\[\^sc-/.test(line)) return true;
  // Skip footnote continuation lines (indented lines following [^ct-N]: definitions)
  if (/^\s{4}@/.test(line)) return true;
  if (/^\s{4}(approved|rejected|revised|previous):/.test(line)) return true;
  return false;
}

/**
 * Parse heading level from a markdown line.
 */
function parseHeading(content: string): {
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  content: string;
} {
  const match = content.match(/^(#{1,6})\s+(.*)/);
  if (!match) return { content };

  const level = match[1].length;
  const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };

  return { heading: headingMap[level], content: match[2] };
}

/**
 * Parse bullet/list from a line.
 */
function parseBullet(content: string): {
  bullet?: { level: number };
  content: string;
} {
  const bulletMatch = content.match(/^-\s+(.*)/);
  if (bulletMatch) {
    return { bullet: { level: 0 }, content: bulletMatch[1] };
  }

  const orderedMatch = content.match(/^\d+\.\s+(.*)/);
  if (orderedMatch) {
    return { bullet: { level: 1 }, content: orderedMatch[1] };
  }

  return { content };
}

// ============================================================================
// Main export function
// ============================================================================

/**
 * Convert CriticMarkup markdown to docx Paragraph[] with tracked changes.
 *
 * @param markdown - The CriticMarkup markdown source text
 * @param options - Conversion options (mode, comments)
 * @returns Paragraphs, comment definitions, patch infos, and statistics
 */
export function changesToDocxParagraphs(
  markdown: string,
  options: DocxConversionOptions
): DocxConversionResult {
  const counters = createCounters();

  const commentDefs: ICommentOptions[] = [];
  const commentPatchInfos: CommentPatchInfo[] = [];
  const stats = {
    insertions: 0,
    deletions: 0,
    substitutions: 0,
    comments: 0,
    authorSet: new Set<string>(),
  };

  // Step 1: Handle mode-based text transformation
  let text = markdown;
  if (options.mode === 'clean') {
    text = computeSettledText(markdown);
  } else if (options.mode === 'settled') {
    // Settle accepted changes (apply them) and rejected changes (revert them),
    // leaving only proposed changes as tracked changes in the output
    text = settleAcceptedChangesOnly(markdown).settledContent;
    text = settleRejectedChangesOnly(text).settledContent;
  }

  // Step 2: Parse with core parser
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();

  const includeComments = options.comments !== 'none';

  const ctx: ConversionContext = {
    text,
    changes,
    commentDefs,
    commentPatchInfos,
    stats,
    includeComments,
    nextRevId: counters.nextRevId,
    nextCommentId: counters.nextCommentId,
  };

  // Step 3: Process line by line
  const paragraphs: Paragraph[] = [];
  const lines = text.split('\n');
  let lineOffset = 0;
  let inFootnoteBlock = false;

  for (const line of lines) {
    const lineStart = lineOffset;
    const lineEnd = lineOffset + line.length;
    lineOffset = lineEnd + 1; // +1 for the \n

    // Detect footnote block start and stop processing
    if (!inFootnoteBlock && (/^\[\^ct-/.test(line) || /^\[\^sc-/.test(line))) {
      inFootnoteBlock = true;
    }
    if (inFootnoteBlock) continue;

    // Skip tracking headers and metadata lines
    if (isSkippableLine(line)) continue;

    // Empty line
    if (line.trim() === '') {
      paragraphs.push(new Paragraph({}));
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      paragraphs.push(new Paragraph({ text: '---' }));
      continue;
    }

    // Parse structural markdown (heading, bullet)
    let content = line;
    let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    let bullet: { level: number } | undefined;

    const headingResult = parseHeading(content);
    if (headingResult.heading) {
      heading = headingResult.heading;
      content = headingResult.content;
    }

    if (!heading) {
      const bulletResult = parseBullet(content);
      if (bulletResult.bullet) {
        bullet = bulletResult.bullet;
        content = bulletResult.content;
      }
    }

    // For clean mode, no tracked changes exist — just emit plain paragraphs
    if (options.mode === 'clean') {
      const inlineChildren = parseInlineMarkdown(content);
      paragraphs.push(
        new Paragraph({
          heading,
          bullet,
          children: inlineChildren.length > 0 ? inlineChildren : [new TextRun('')],
        })
      );
      continue;
    }

    // For tracked mode, walk changes and interleave
    // We need to figure out the content offset within the line for change matching
    const contentOffset = lineStart + (line.length - content.length);
    const contentEnd = lineEnd;

    const docxChildren = lineToDocxChildren(contentOffset, contentEnd, changes, ctx);

    paragraphs.push(
      new Paragraph({
        heading,
        bullet,
        children: docxChildren.length > 0 ? docxChildren : [new TextRun('')],
      })
    );
  }

  return {
    paragraphs,
    commentDefs,
    commentPatchInfos,
    stats: {
      insertions: stats.insertions,
      deletions: stats.deletions,
      substitutions: stats.substitutions,
      comments: stats.comments,
      authors: [...stats.authorSet],
    },
  };
}
