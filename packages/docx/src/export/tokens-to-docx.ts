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
  ImageRun,
  BookmarkStart,
  BookmarkEnd,
  type ICommentOptions,
  type ParagraphChild,
} from 'docx';

import * as fs from 'fs';
import * as path from 'path';

import {
  parseForFormat,
  ChangeType,
  ChangeStatus,
  computeSettledText,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  type ChangeNode,
} from '@changetracks/core';

import { buildCommentChain, type CommentReply } from './comment-builder.js';
import type { CommentPatchInfo } from './word-online-patch.js';
import { resolveImageDimensions, buildImageRun } from './image-builder.js';
import { type ImagePatchInfo, type ImageDimensions, type ImagePositionMetadata, detectFormat } from '../shared/image-types.js';
import { toDocxAuthor } from '../shared/author-mapper.js';
import { toIsoString } from '../shared/date-utils.js';

// ============================================================================
// Public types
// ============================================================================

export interface DocxConversionOptions {
  mode: 'tracked' | 'settled' | 'clean';
  comments: 'all' | 'none' | 'unresolved';
  /** Directory to resolve relative image paths against */
  mediaDir?: string;
  /** DPI for images without metadata (default: 96) */
  defaultDpi?: number;
  /** Page content width clamp in inches (default: 6.5) */
  maxWidthInches?: number;
}

export interface DocxConversionResult {
  paragraphs: Paragraph[];
  commentDefs: ICommentOptions[];
  commentPatchInfos: CommentPatchInfo[];
  imagePatchInfos: ImagePatchInfo[];
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
  let bookmarkIdCounter = 1;
  return {
    nextRevId(): number { return revisionIdCounter++; },
    nextCommentId(): number { return commentIdCounter++; },
    advanceCommentId(nextId: number): void { if (nextId > commentIdCounter) commentIdCounter = nextId; },
    nextBookmarkId(): number { return bookmarkIdCounter++; },
  };
}

// ============================================================================
// Inline markdown formatting helpers
// ============================================================================

/** Matches ![alt](path) image references */
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** Matches a standalone image reference (entire content is one image) */
const STANDALONE_IMAGE_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/;

const SUPPORTED_IMAGE_FORMATS = new Set(['png', 'jpg', 'gif', 'bmp']);

// ============================================================================
// Image positioning metadata (for floating/anchored images round-trip)
// ============================================================================

function parseImagePosition(meta: Record<string, string>): ImagePositionMetadata | undefined {
  if (meta['image-float'] !== 'anchor') return undefined;
  const pos: ImagePositionMetadata = { float: 'anchor' };
  if (meta['image-h-anchor']) pos.hAnchor = meta['image-h-anchor'];
  if (meta['image-h-offset']) pos.hOffset = parseInt(meta['image-h-offset'], 10);
  if (meta['image-h-align']) pos.hAlign = meta['image-h-align'];
  if (meta['image-v-anchor']) pos.vAnchor = meta['image-v-anchor'];
  if (meta['image-v-offset']) pos.vOffset = parseInt(meta['image-v-offset'], 10);
  if (meta['image-v-align']) pos.vAlign = meta['image-v-align'];
  if (meta['image-wrap']) pos.wrapType = meta['image-wrap'];
  if (meta['image-wrap-side']) pos.wrapSide = meta['image-wrap-side'];
  if (meta['image-z']) pos.behindDocument = meta['image-z'] === 'background';
  if (meta['image-dist']) {
    const parts = meta['image-dist'].split(/\s+/).map(Number);
    if (parts.length === 4) [pos.distT, pos.distB, pos.distL, pos.distR] = parts;
  }
  return pos;
}

/**
 * Resolve an image path against a media directory.
 * Handles absolute paths, relative paths, and pandoc's "media/" prefix fallback.
 */
function resolveImagePath(imgPath: string, mediaDir?: string): string {
  if (path.isAbsolute(imgPath) && fs.existsSync(imgPath)) return imgPath;
  if (!mediaDir) return imgPath;
  const candidate = path.resolve(mediaDir, imgPath);
  if (fs.existsSync(candidate)) return candidate;
  return path.resolve(mediaDir, path.basename(imgPath));
}

/**
 * Try to read an image file and build an ImageRun.
 * Optionally accepts a sentinel name for tracked image changes (JSZip post-processing).
 */
function tryBuildImageRun(
  imgPath: string,
  mediaDir?: string,
  footnoteDimensions?: ImageDimensions,
  dpi?: number,
  maxWidthInches?: number,
  sentinelName?: string,
  position?: ImagePositionMetadata,
): ImageRun | null {
  try {
    const resolvedPath = resolveImagePath(imgPath, mediaDir);
    const data = fs.readFileSync(resolvedPath);
    const format = detectFormat(resolvedPath);
    if (!format || !SUPPORTED_IMAGE_FORMATS.has(format)) return null;

    const dims = resolveImageDimensions({ footnoteDimensions, imageBuffer: data, dpi, maxWidthInches });
    return buildImageRun(
      data,
      format as 'png' | 'jpg' | 'gif' | 'bmp',
      dims,
      dpi,
      sentinelName ? { name: sentinelName, description: '', title: '' } : undefined,
      position,
    );
  } catch {
    return null;
  }
}

/**
 * Parse inline markdown formatting: **bold**, *italic*, `code`, [link](url), ![alt](path).
 */
function parseInlineMarkdown(text: string, mediaDir?: string): ParagraphChild[] {
  if (!text) return [];

  const children: ParagraphChild[] = [];

  // First pass: split on images, emit ImageRun or fallback text for each segment
  const imageSegments: Array<{ start: number; end: number; imgPath: string; altText: string }> = [];
  IMAGE_REGEX.lastIndex = 0;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = IMAGE_REGEX.exec(text)) !== null) {
    imageSegments.push({
      start: imgMatch.index,
      end: imgMatch.index + imgMatch[0].length,
      altText: imgMatch[1],
      imgPath: imgMatch[2],
    });
  }

  if (imageSegments.length > 0) {
    let pos = 0;
    for (const seg of imageSegments) {
      // Emit text before the image
      if (seg.start > pos) {
        const before = text.slice(pos, seg.start);
        children.push(...parseInlineMarkdown(before, mediaDir));
      }
      // Attempt to build an ImageRun; fall back to alt text on failure
      const imageRun = tryBuildImageRun(seg.imgPath, mediaDir);
      if (imageRun) {
        children.push(imageRun);
      } else if (seg.altText) {
        children.push(new TextRun({ text: seg.altText }));
      }
      pos = seg.end;
    }
    // Emit remaining text after last image
    if (pos < text.length) {
      children.push(...parseInlineMarkdown(text.slice(pos), mediaDir));
    }
    return children;
  }

  // No images — proceed with original inline formatting logic
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
  imagePatchInfos: ImagePatchInfo[];
  mediaDir?: string;
  defaultDpi?: number;
  maxWidthInches?: number;
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
  advanceCommentId: (nextId: number) => void;
  nextBookmarkId: () => number;
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
 * Shared image detection + dimension resolution from a ChangeNode.
 * Used by both tracked images (ins/del sentinel path) and highlight images (direct emit).
 */
function tryBuildImageFromNode(
  content: string,
  node: ChangeNode,
  ctx: ConversionContext,
): ImageRun | null {
  const imgMatch = content.match(STANDALONE_IMAGE_REGEX);
  if (!imgMatch) return null;

  const imgPath = imgMatch[2];
  const footnoteDims = node.metadata?.imageDimensions;
  const imageMetaBag = node.metadata?.imageMetadata;
  const position = imageMetaBag ? parseImagePosition(imageMetaBag) : undefined;

  return tryBuildImageRun(
    imgPath, ctx.mediaDir, footnoteDims, ctx.defaultDpi, ctx.maxWidthInches,
    undefined,
    position,
  );
}

/**
 * Try to handle image content inside a tracked change node.
 * Returns the ImageRun if successful, null if content is not an image.
 */
function tryHandleTrackedImage(
  content: string,
  changeType: 'ins' | 'del',
  ctx: ConversionContext,
  displayName: string,
  date: string,
  node: ChangeNode,
): ImageRun | null {
  const imgMatch = content.match(STANDALONE_IMAGE_REGEX);
  if (!imgMatch) return null;

  const imgPath = imgMatch[2];
  const sentinelName = `_ct_tracked_img_${ctx.imagePatchInfos.length}_${changeType}`;
  const metaBag = node.metadata as Record<string, unknown> | undefined;
  const footnoteDims = metaBag?.imageDimensions as ImageDimensions | undefined;
  const imageMetaBag = metaBag?.imageMetadata as Record<string, string> | undefined;
  const position = imageMetaBag ? parseImagePosition(imageMetaBag) : undefined;
  const imageRun = tryBuildImageRun(
    imgPath, ctx.mediaDir, footnoteDims, ctx.defaultDpi, ctx.maxWidthInches, sentinelName, position
  );
  if (!imageRun) return null;

  ctx.imagePatchInfos.push({
    sentinelName,
    changeType,
    author: displayName,
    date: toIsoString(date),
    revisionId: ctx.nextRevId(),
  });
  return imageRun;
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
      const content = node.modifiedText || (node.status === ChangeStatus.Proposed ? '\u200B' : '');
      if (!content) break;

      const trackedImg = tryHandleTrackedImage(content, 'ins', ctx, displayName, date, node);
      if (trackedImg) {
        ctx.stats.insertions++;
        ctx.stats.authorSet.add(displayName);
        children.push(trackedImg);
        break;
      }

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
      const content = node.originalText || (node.status === ChangeStatus.Proposed ? '\u200B' : '');
      if (!content) break;

      const trackedImg = tryHandleTrackedImage(content, 'del', ctx, displayName, date, node);
      if (trackedImg) {
        ctx.stats.deletions++;
        ctx.stats.authorSet.add(displayName);
        children.push(trackedImg);
        break;
      }

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
      const zwsFallback = node.status === ChangeStatus.Proposed ? '\u200B' : '';
      ctx.stats.substitutions++;
      ctx.stats.authorSet.add(displayName);
      const oldFmt = extractFormatting(node.originalText || zwsFallback);
      if (oldFmt.text) {
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
      const newFmt = extractFormatting(node.modifiedText || zwsFallback);
      if (newFmt.text) {
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

      // Image inside highlight — emit ImageRun with metadata (no tracked change wrapping)
      const highlightImageRun = tryBuildImageFromNode(highlightContent, node, ctx);
      if (highlightImageRun) {
        children.push(highlightImageRun);
        break;
      }

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

        const chainResult = buildCommentChain(
          cId,
          commentText,
          commentMeta.displayName,
          commentMeta.date,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.advanceCommentId(chainResult.id);
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

        const chainResult = buildCommentChain(
          cId,
          commentText,
          commentMeta.displayName,
          commentMeta.date,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.advanceCommentId(chainResult.id);
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

        const chainResult = buildCommentChain(
          cId,
          rootText,
          rootAuthor,
          rootDate,
          ctx.commentDefs,
          ctx.commentPatchInfos,
          replies.length > 0 ? replies : undefined
        );
        ctx.advanceCommentId(chainResult.id);
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
      // For footnote-style comments, text lives in metadata.discussion[0].text.
      // For inline {>>text<<} comments, text lives in metadata.comment or modifiedText.
      const disc = node.metadata?.discussion;
      let commentText: string;
      let commentAuthor: string;
      let commentDate: string;
      let commentReplies: CommentReply[];
      if (disc && disc.length > 0) {
        commentText = disc[0].text;
        commentAuthor = toDocxAuthor(disc[0].author).displayName;
        commentDate = disc[0].date || '';
        commentReplies = disc.slice(1).map((d) => ({
          author: toDocxAuthor(d.author).displayName,
          date: d.date || '',
          text: d.text,
          depth: d.depth,
        }));
      } else {
        commentText = node.metadata?.comment?.trim() || node.modifiedText?.trim() || '';
        const commentMeta = getMetaAuthorDate(node);
        commentAuthor = commentMeta.displayName;
        commentDate = commentMeta.date;
        commentReplies = buildRepliesFromDiscussion(node);
      }

      const chainResult = buildCommentChain(
        cId,
        commentText,
        commentAuthor,
        commentDate,
        ctx.commentDefs,
        ctx.commentPatchInfos,
        commentReplies.length > 0 ? commentReplies : undefined
      );
      // Advance the comment ID counter past all IDs consumed by this chain
      // (root + replies) to prevent collisions with subsequent comments.
      ctx.advanceCommentId(chainResult.id);
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
    children.push(...parseInlineMarkdown(lineText, ctx.mediaDir));
    return children;
  }

  let pos = lineStart;
  const skipNext = { value: false };

  // Track last emitted revision run type/author for bookmark separation
  let lastRunType: ChangeType | null = null;
  let lastRunAuthor: string | null = null;

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
        children.push(...parseInlineMarkdown(plain, ctx.mediaDir));
        lastRunType = null;
        lastRunAuthor = null;
      }
    }

    const { displayName } = getMetaAuthorDate(change);
    let thisRunType: ChangeType | null = null;
    if (change.type === ChangeType.Insertion || change.type === ChangeType.Deletion) {
      thisRunType = change.type;
    }

    // Insert bookmark separator if same type+author as previous run
    if (
      thisRunType !== null &&
      thisRunType === lastRunType &&
      displayName === lastRunAuthor
    ) {
      const sepId = ctx.nextBookmarkId();
      children.push(new BookmarkStart(`ct-sep-${sepId}`, sepId));
      children.push(new BookmarkEnd(sepId));
    }

    // Emit the change
    children.push(...changeNodeToDocxChildren(change, ctx, nextChange, skipNext));

    if (change.type === ChangeType.Substitution) {
      // Substitution ends with an InsertedTextRun
      lastRunType = ChangeType.Insertion;
      lastRunAuthor = displayName;
    } else if (thisRunType !== null) {
      lastRunType = thisRunType;
      lastRunAuthor = displayName;
    } else {
      lastRunType = null;
      lastRunAuthor = null;
    }

    pos = change.range.end;
  }

  // Emit trailing plain text after the last change
  if (pos < lineEnd) {
    const trailing = text.substring(pos, lineEnd);
    if (trailing) {
      children.push(...parseInlineMarkdown(trailing, ctx.mediaDir));
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
  if (/^\s{4}(approved|rejected|revised|previous|image-dimensions|image-[\w-]+|merge-detected):/.test(line)) return true;
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
  const imagePatchInfos: ImagePatchInfo[] = [];
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
  const doc = parseForFormat(text);
  const changes = doc.getChanges();

  const includeComments = options.comments !== 'none';

  const ctx: ConversionContext = {
    text,
    changes,
    commentDefs,
    commentPatchInfos,
    imagePatchInfos,
    mediaDir: options.mediaDir,
    defaultDpi: options.defaultDpi,
    maxWidthInches: options.maxWidthInches,
    stats,
    includeComments,
    nextRevId: counters.nextRevId,
    nextCommentId: counters.nextCommentId,
    advanceCommentId: counters.advanceCommentId,
    nextBookmarkId: counters.nextBookmarkId,
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
      const inlineChildren = parseInlineMarkdown(content, options.mediaDir);
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
    imagePatchInfos,
    stats: {
      insertions: stats.insertions,
      deletions: stats.deletions,
      substitutions: stats.substitutions,
      comments: stats.comments,
      authors: [...stats.authorSet],
    },
  };
}
