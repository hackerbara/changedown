/**
 * Tokens-to-Docx converter.
 *
 * Takes CriticMarkup markdown text and produces docx Paragraph[] using
 * @changedown/core's parser and the docx npm library.
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
  UnderlineType,
  type ICommentOptions,
  type ParagraphChild,
} from 'docx';

import { basename } from '../shared/basename.js';

import {
  parseForFormat,
  ChangeType,
  ChangeStatus,
  computeSettledText,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  type ChangeNode,
} from '@changedown/core';

import { parseInlineSegments, type InlineSegment, type TextSegment, type LinkSegment } from './inline-segments.js';
import { buildCommentChain, type CommentReply } from './comment-builder.js';
import type { CommentPatchInfo, ImagePatchInfo, HyperlinkPatchInfo } from '../shared/patch-types.js';
import { resolveImageDimensions, buildImageRun } from './image-builder.js';
import { type ImageDimensions, type ImagePositionMetadata, detectFormat } from '../shared/image-types.js';
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
  fileReader?: (path: string) => Uint8Array | null;
}

export interface DocxConversionResult {
  paragraphs: Paragraph[];
  commentDefs: ICommentOptions[];
  commentPatchInfos: CommentPatchInfo[];
  imagePatchInfos: ImagePatchInfo[];
  hyperlinkPatchInfos: HyperlinkPatchInfo[];
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
  if (imgPath.startsWith('/')) return imgPath;
  if (!mediaDir) return imgPath;
  return mediaDir + '/' + imgPath;
}

function resolveImageWithFallback(
  imgPath: string,
  mediaDir: string | undefined,
  fileReader?: (path: string) => Uint8Array | null,
): Uint8Array | null {
  if (!fileReader) return null;
  const primary = resolveImagePath(imgPath, mediaDir);
  const data = fileReader(primary);
  if (data) return data;
  // Basename fallback — handles "media/hash.png" vs "{basename}_media/hash.png"
  const name = basename(imgPath);
  const fallback = mediaDir ? mediaDir + '/' + name : name;
  if (fallback !== primary) {
    return fileReader(fallback);
  }
  return null;
}

/**
 * Try to read an image file and build an ImageRun.
 * Optionally accepts a sentinel name for tracked image changes (JSZip post-processing).
 */
function tryBuildImageRun(
  imgPath: string,
  mediaDir?: string,
  fileReader?: (path: string) => Uint8Array | null,
  footnoteDimensions?: ImageDimensions,
  dpi?: number,
  maxWidthInches?: number,
  sentinelName?: string,
  position?: ImagePositionMetadata,
): ImageRun | null {
  try {
    const data = resolveImageWithFallback(imgPath, mediaDir, fileReader);
    if (!data) return null;
    const resolvedPath = resolveImagePath(imgPath, mediaDir);
    const format = detectFormat(resolvedPath);
    if (!format || !SUPPORTED_IMAGE_FORMATS.has(format)) return null;

    const dims = resolveImageDimensions({ footnoteDimensions, dpi, maxWidthInches });
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
function parseInlineMarkdown(text: string, mediaDir?: string, fileReader?: (path: string) => Uint8Array | null): ParagraphChild[] {
  if (!text) return [];
  const segments = parseInlineSegments(text);
  return segments.flatMap((seg) => segmentToParagraphChild(seg, mediaDir, fileReader));
}

/** Apply formatting flags from a text or link segment onto a run options object. */
function applySegmentFormatting(seg: TextSegment | LinkSegment, opts: Record<string, unknown>): void {
  if (seg.bold) opts.bold = true;
  if (seg.italics) opts.italics = true;
  if (seg.strikethrough) opts.strike = true;
  if (seg.underline) opts.underline = { type: UnderlineType.SINGLE };
  if ('code' in seg && seg.code) opts.font = { name: 'Courier New' };
}

function segmentToParagraphChild(seg: InlineSegment, mediaDir?: string, fileReader?: (path: string) => Uint8Array | null): ParagraphChild[] {
  switch (seg.kind) {
    case 'text': {
      const opts: Record<string, unknown> = { text: seg.text };
      applySegmentFormatting(seg, opts);
      return [new TextRun(opts as any)];
    }
    case 'link': {
      const linkOpts: Record<string, unknown> = { text: seg.text, style: 'Hyperlink' };
      applySegmentFormatting(seg, linkOpts);
      return [new ExternalHyperlink({ link: seg.url, children: [new TextRun(linkOpts as any)] })];
    }
    case 'image': {
      const imageRun = tryBuildImageRun(seg.path, mediaDir, fileReader);
      return imageRun ? [imageRun] : seg.altText ? [new TextRun({ text: seg.altText })] : [];
    }
  }
}

function segmentToTrackedRun(
  seg: InlineSegment,
  changeType: 'ins' | 'del',
  ctx: ConversionContext,
  author: string,
  date: string,
): ParagraphChild[] {
  const isoDate = toIsoString(date);

  if (seg.kind === 'image') {
    if (!seg.altText) return [];
    return segmentToTrackedRun(
      { kind: 'text', text: seg.altText },
      changeType, ctx, author, date,
    );
  }

  if (seg.kind === 'link') {
    const revId = ctx.nextRevId();
    const sentinelUrl = `https://_ct_link_${revId}_${changeType}.invalid/`;
    ctx.hyperlinkPatchInfos.push({
      sentinelUrl,
      realUrl: seg.url,
      changeType,
      author,
      date: isoDate,
      revisionId: revId,
    });
    const linkOpts: Record<string, unknown> = { text: seg.text, style: 'Hyperlink' };
    applySegmentFormatting(seg, linkOpts);
    return [new ExternalHyperlink({ link: sentinelUrl, children: [new TextRun(linkOpts as any)] })];
  }

  const RunClass = changeType === 'ins' ? InsertedTextRun : DeletedTextRun;
  const opts: Record<string, unknown> = {
    text: seg.text,
    id: ctx.nextRevId(),
    author,
    date: isoDate,
  };
  applySegmentFormatting(seg, opts);
  return [new RunClass(opts as any)];
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
  hyperlinkPatchInfos: HyperlinkPatchInfo[];
  mediaDir?: string;
  fileReader?: (path: string) => Uint8Array | null;
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
 * Try to build an ImageRun from a ChangeNode's content.
 * When `tracked` is provided, assigns a sentinel name and pushes an ImagePatchInfo
 * for post-processing (same pattern as hyperlink sentinels).
 */
function tryBuildImageFromNode(
  content: string,
  node: ChangeNode,
  ctx: ConversionContext,
  tracked?: { changeType: 'ins' | 'del'; author: string; date: string },
): ImageRun | null {
  const imgMatch = content.match(STANDALONE_IMAGE_REGEX);
  if (!imgMatch) return null;

  const imgPath = imgMatch[2];
  const footnoteDims = node.metadata?.imageDimensions;
  const imageMetaBag = node.metadata?.imageMetadata;
  const position = imageMetaBag ? parseImagePosition(imageMetaBag) : undefined;

  const sentinelName = tracked
    ? `_ct_tracked_img_${ctx.imagePatchInfos.length}_${tracked.changeType}`
    : undefined;

  const imageRun = tryBuildImageRun(
    imgPath, ctx.mediaDir, ctx.fileReader, footnoteDims, ctx.defaultDpi, ctx.maxWidthInches,
    sentinelName,
    position,
  );
  if (!imageRun) return null;

  if (tracked && sentinelName) {
    ctx.imagePatchInfos.push({
      sentinelName,
      changeType: tracked.changeType,
      author: tracked.author,
      date: toIsoString(tracked.date),
      revisionId: ctx.nextRevId(),
    });
  }

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

      const trackedImg = tryBuildImageFromNode(content, node, ctx, { changeType: 'ins', author: displayName, date });
      if (trackedImg) {
        ctx.stats.insertions++;
        ctx.stats.authorSet.add(displayName);
        children.push(trackedImg);
        break;
      }

      ctx.stats.insertions++;
      ctx.stats.authorSet.add(displayName);
      const segs = parseInlineSegments(content);
      for (const seg of segs) {
        children.push(...segmentToTrackedRun(seg, 'ins', ctx, displayName, date));
      }
      break;
    }

    case ChangeType.Deletion: {
      const content = node.originalText || (node.status === ChangeStatus.Proposed ? '\u200B' : '');
      if (!content) break;

      const trackedImg = tryBuildImageFromNode(content, node, ctx, { changeType: 'del', author: displayName, date });
      if (trackedImg) {
        ctx.stats.deletions++;
        ctx.stats.authorSet.add(displayName);
        children.push(trackedImg);
        break;
      }

      ctx.stats.deletions++;
      ctx.stats.authorSet.add(displayName);
      const segs = parseInlineSegments(content);
      for (const seg of segs) {
        children.push(...segmentToTrackedRun(seg, 'del', ctx, displayName, date));
      }
      break;
    }

    case ChangeType.Substitution: {
      const zwsFallback = node.status === ChangeStatus.Proposed ? '\u200B' : '';
      ctx.stats.substitutions++;
      ctx.stats.authorSet.add(displayName);

      const oldSegs = parseInlineSegments(node.originalText || zwsFallback);
      for (const seg of oldSegs) {
        children.push(...segmentToTrackedRun(seg, 'del', ctx, displayName, date));
      }

      const newSegs = parseInlineSegments(node.modifiedText || zwsFallback);
      for (const seg of newSegs) {
        children.push(...segmentToTrackedRun(seg, 'ins', ctx, displayName, date));
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
    children.push(...parseInlineMarkdown(lineText, ctx.mediaDir, ctx.fileReader));
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
        children.push(...parseInlineMarkdown(plain, ctx.mediaDir, ctx.fileReader));
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
      children.push(new BookmarkStart(`cn-sep-${sepId}`, sepId));
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
      children.push(...parseInlineMarkdown(trailing, ctx.mediaDir, ctx.fileReader));
    }
  }

  return children;
}

/**
 * Determine if a line should be skipped (tracking headers, footnote blocks, etc).
 */
function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '<!-- changedown.com/v1: tracked -->') return true;
  if (/^\[\^cn-/.test(line)) return true;
  if (/^\[\^sc-/.test(line)) return true;
  // Skip footnote continuation lines (indented lines following [^cn-N]: definitions)
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
  const hyperlinkPatchInfos: HyperlinkPatchInfo[] = [];
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
    hyperlinkPatchInfos,
    mediaDir: options.mediaDir,
    fileReader: options.fileReader,
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
  let inFencedCodeBlock = false;

  for (const line of lines) {
    const lineStart = lineOffset;
    const lineEnd = lineOffset + line.length;
    lineOffset = lineEnd + 1; // +1 for the \n

    // Track fenced code blocks so we don't misinterpret their contents
    // as footnote definitions, tracking headers, or other metadata.
    if (/^```/.test(line.trimStart())) {
      inFencedCodeBlock = !inFencedCodeBlock;
      // Emit the fence line itself as a paragraph (plain text)
      if (!inFootnoteBlock) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line })] }));
      }
      continue;
    }

    // Inside a fenced code block, emit lines verbatim as plain text paragraphs
    if (inFencedCodeBlock) {
      if (!inFootnoteBlock) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, font: { name: 'Courier New' } })] }));
      }
      continue;
    }

    // Detect footnote block start — only at end-of-document footnote definitions,
    // never inside code blocks (handled above). Once we enter the footnote block
    // and then hit a non-footnote, non-continuation, non-empty line, we exit it
    // so that content after example footnotes isn't swallowed.
    if (/^\[\^cn-/.test(line) || /^\[\^sc-/.test(line)) {
      inFootnoteBlock = true;
    } else if (inFootnoteBlock) {
      // Footnote continuation lines are indented (4 spaces) or empty
      const isContinuation = /^\s{4}/.test(line) || line.trim() === '';
      if (!isContinuation) {
        inFootnoteBlock = false;
      }
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
      const inlineChildren = parseInlineMarkdown(content, options.mediaDir, options.fileReader);
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
    hyperlinkPatchInfos,
    stats: {
      insertions: stats.insertions,
      deletions: stats.deletions,
      substitutions: stats.substitutions,
      comments: stats.comments,
      authors: [...stats.authorSet],
    },
  };
}
