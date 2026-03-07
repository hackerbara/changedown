import { ChangeNode, ChangeType, ChangeStatus, InlineMetadata, Approval, Revision, DiscussionComment, Resolution } from '../model/types.js';
import { VirtualDocument } from '../model/document.js';
import { TokenType } from './tokens.js';
import { FOOTNOTE_REF_ANCHORED, FOOTNOTE_DEF_STRICT } from '../footnote-patterns.js';
import { tryMatchFenceOpen, tryMatchFenceClose, skipInlineCode } from './code-zones.js';
import { parseTimestamp } from '../timestamp.js';
import { scanMaxCtId } from '../operations/footnote-generator.js';

function parseInlineMetadata(raw: string): InlineMetadata {
  const result: InlineMetadata = { raw };
  const fields = raw.split('|').map((f) => f.trim());

  for (const field of fields) {
    if (!field) continue;
    if (field.startsWith('@')) {
      result.author = field;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(field)) {
      result.date = field;
    } else if (['ins', 'del', 'sub', 'highlight', 'comment'].includes(field)) {
      result.type = field;
    } else if (['proposed', 'accepted', 'rejected', 'approved'].includes(field)) {
      result.status = field;
    } else {
      result.freeText = result.freeText ? `${result.freeText}|${field}` : field;
    }
  }
  return result;
}

interface FootnoteDefinition {
  author?: string;
  date?: string;
  type?: string;
  status?: string;
  context?: string;
  approvals?: Approval[];
  rejections?: Approval[];
  requestChanges?: Approval[];
  revisions?: Revision[];
  discussion?: DiscussionComment[];
  resolution?: Resolution;
}

export interface ParseOptions {
  /**
   * When true (default), the parser skips CriticMarkup inside fenced code blocks
   * and inline code spans. Set to false for settlement operations, which need to
   * find CriticMarkup that was inserted into code blocks by propose_change.
   */
  skipCodeBlocks?: boolean;
}

export class CriticMarkupParser {
  private static readonly FOOTNOTE_REF = FOOTNOTE_REF_ANCHORED;
  private static readonly FOOTNOTE_DEF = FOOTNOTE_DEF_STRICT;

  private idBase: number = 0;

  // Level 2 line patterns
  private static readonly APPROVAL_RE = /^(approved|rejected|request-changes):\s+(@\S+)\s+(\S+)(?:\s+"([^"]*)")?$/;
  private static readonly DISCUSSION_RE = /^(@\S+)\s+(\S+)(?:\s+\[([^\]]+)\])?:\s*(.*)$/;
  private static readonly RESOLVED_RE = /^resolved\s+(@\S+)\s+(\S+)(?::\s*(.*))?$/;
  private static readonly OPEN_RE = /^open(?:\s+--\s+(.*))?$/;
  private static readonly REVISION_RE = /^(r\d+)\s+(@\S+)\s+(\S+):\s+"([^"]*)"$/;
  private static readonly CONTEXT_RE = /^context:\s+"([^"]*)"$/;
  private static readonly REASON_RE = /^reason:\s+(.+)$/;

  parse(text: string, options?: ParseOptions): VirtualDocument {
    this.idBase = scanMaxCtId(text);
    const changes: ChangeNode[] = [];
    let position = 0;
    let changeCounter = 0;
    const skipCodeBlocks = options?.skipCodeBlocks !== false; // default true
    const settledRefs = new Map<string, number>(); // id → offset position

    // Code block awareness state (local to this parse call)
    let atLineStart = true;
    let inFence = false;
    let fenceMarkerCode = 0; // charCode of '`' (96) or '~' (126)
    let fenceLength = 0;

    while (position < text.length) {
      const ch = text.charCodeAt(position);

      // ── Fenced code block handling ──────────────────────────────
      if (skipCodeBlocks && inFence) {
        if (atLineStart) {
          const closeResult = tryMatchFenceClose(text, position, fenceMarkerCode, fenceLength);
          if (closeResult >= 0) {
            // Fence closed — advance past the closing fence line
            inFence = false;
            position = closeResult;
            atLineStart = true;
            continue;
          }
        }
        // Inside fence: skip to end of line (or end of text)
        const nextNewline = text.indexOf('\n', position);
        if (nextNewline === -1) {
          position = text.length;
        } else {
          position = nextNewline + 1;
          atLineStart = true;
        }
        continue;
      }

      // ── Fence opening detection (only at line start) ───────────
      if (skipCodeBlocks && atLineStart) {
        const fenceResult = tryMatchFenceOpen(text, position);
        if (fenceResult) {
          inFence = true;
          fenceMarkerCode = fenceResult.markerCode;
          fenceLength = fenceResult.length;
          position = fenceResult.nextPos;
          atLineStart = true;
          continue;
        }
      }

      // ── Inline code span detection ─────────────────────────────
      // Backtick (96) starts an inline code span
      if (skipCodeBlocks && ch === 96) { // '`'
        const skipTo = skipInlineCode(text, position);
        if (skipTo > position) {
          // Check if we crossed a newline boundary within the skipped range
          atLineStart = text.charCodeAt(skipTo - 1) === 10; // '\n'
          position = skipTo;
          continue;
        }
        // Unmatched backtick run — advance past it but don't skip content
        let runEnd = position + 1;
        while (runEnd < text.length && text.charCodeAt(runEnd) === 96) {
          runEnd++;
        }
        atLineStart = false;
        position = runEnd;
        continue;
      }

      // ── Normal CriticMarkup parsing ────────────────────────────
      const node = this.tryParseNode(text, position, changeCounter);
      if (node) {
        this.tryAttachAdjacentComment(text, node);
        this.tryAttachFootnoteRef(text, node);
        changeCounter++;
        changes.push(node);
        position = node.range.end;
        // Update atLineStart based on the character before the new position
        atLineStart = position > 0 && text.charCodeAt(position - 1) === 10;
      } else {
        // Check for standalone footnote ref [^ct-N] not attached to CriticMarkup
        if (ch === 91 && text.charCodeAt(position + 1) === 94) { // '[^'
          const remaining = text.substring(position, position + 30);
          const refMatch = remaining.match(CriticMarkupParser.FOOTNOTE_REF);
          if (refMatch) {
            const afterRef = position + refMatch[0].length;
            // Skip footnote definitions — [^ct-N]: is a definition, not a standalone ref
            if (text.charCodeAt(afterRef) !== 58) { // not ':'
              const refId = refMatch[1];
              // Only track if not already claimed by a CriticMarkup change
              if (!changes.some(c => c.id === refId)) {
                settledRefs.set(refId, position);
              }
              position = afterRef;
              atLineStart = false;
              continue;
            }
          }
        }
        // Update atLineStart: current char is a newline means NEXT position is at line start
        atLineStart = ch === 10; // '\n'
        position++;
      }
    }

    const footnotes = this.parseFootnoteDefinitions(text);
    this.mergeFootnoteMetadata(changes, footnotes, settledRefs);
    this.resolveMoveGroups(changes, footnotes);

    // Renumber unanchored changes sequentially after all anchored IDs are settled.
    // Anchored changes already have their ct-N from footnote refs. Unanchored ones
    // get the next available ct-N after both idBase and any anchored IDs in this parse.
    const usedIds = new Set<number>();
    for (const c of changes) {
      if (c.anchored) {
        const m = c.id.match(/^ct-(\d+)(?:\.\d+)?$/);
        if (m) usedIds.add(parseInt(m[1], 10));
      }
    }
    let nextId = this.idBase;
    const unanchored = changes.filter(c => !c.anchored && c.id.startsWith('ct-'));
    for (const c of unanchored) {
      do { nextId++; } while (usedIds.has(nextId));
      c.id = `ct-${nextId}`;
    }

    return new VirtualDocument(changes);
  }

  private tryParseNode(text: string, startPos: number, counter: number): ChangeNode | null {
    if (this.matchesAt(text, startPos, TokenType.AdditionOpen)) {
      return this.parseInsertion(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.DeletionOpen)) {
      return this.parseDeletion(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.SubstitutionOpen)) {
      return this.parseSubstitution(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.HighlightOpen)) {
      return this.parseHighlight(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.CommentOpen)) {
      return this.parseComment(text, startPos, counter);
    }
    return null;
  }

  private parseInsertion(text: string, startPos: number, counter: number): ChangeNode | null {
    const contentStart = startPos + TokenType.AdditionOpen.length;
    const closePos = text.indexOf(TokenType.AdditionClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.AdditionClose.length;
    const content = text.substring(contentStart, closePos);

    return {
      id: this.assignId(counter),
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      modifiedText: content,
      level: 0,
      anchored: false,
    };
  }

  private parseDeletion(text: string, startPos: number, counter: number): ChangeNode | null {
    const contentStart = startPos + TokenType.DeletionOpen.length;
    const closePos = text.indexOf(TokenType.DeletionClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.DeletionClose.length;
    const content = text.substring(contentStart, closePos);

    return {
      id: this.assignId(counter),
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalText: content,
      level: 0,
      anchored: false,
    };
  }

  /**
   * Finds the next ~~} at or after searchStart that is not inside a backtick-quoted
   * span (so that substitutions whose new text contains literal `` `~~}` `` parse correctly).
   */
  private indexOfSubstitutionCloseOutsideBackticks(text: string, searchStart: number): number {
    const close = TokenType.SubstitutionClose;
    let pos = searchStart;
    while (pos < text.length) {
      const next = text.indexOf(close, pos);
      if (next === -1) return -1;
      const between = text.substring(searchStart, next);
      const backtickCount = (between.match(/`/g) ?? []).length;
      if (backtickCount % 2 === 0) return next;
      pos = next + close.length;
    }
    return -1;
  }

  private parseSubstitution(text: string, startPos: number, counter: number): ChangeNode | null {
    const contentStart = startPos + TokenType.SubstitutionOpen.length;
    const separatorPos = text.indexOf(TokenType.SubstitutionSeparator, contentStart);
    if (separatorPos === -1) return null;

    const modifiedStart = separatorPos + TokenType.SubstitutionSeparator.length;
    const closePos = this.indexOfSubstitutionCloseOutsideBackticks(text, modifiedStart);
    if (closePos === -1 || separatorPos >= closePos) {
      return null;
    }

    const originalText = text.substring(contentStart, separatorPos);
    const modifiedText = text.substring(modifiedStart, closePos);
    const endPos = closePos + TokenType.SubstitutionClose.length;

    return {
      id: this.assignId(counter),
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalRange: { start: contentStart, end: separatorPos },
      modifiedRange: { start: modifiedStart, end: closePos },
      originalText,
      modifiedText,
      level: 0,
      anchored: false,
    };
  }

  private parseHighlight(text: string, startPos: number, counter: number): ChangeNode | null {
    const contentStart = startPos + TokenType.HighlightOpen.length;
    const closePos = text.indexOf(TokenType.HighlightClose, contentStart);
    if (closePos === -1) {
      return null;
    }

    const highlightedText = text.substring(contentStart, closePos);
    let endPos = closePos + TokenType.HighlightClose.length;
    let comment: string | undefined;

    if (this.matchesAt(text, endPos, TokenType.CommentOpen)) {
      const commentContentStart = endPos + TokenType.CommentOpen.length;
      const commentClosePos = text.indexOf(TokenType.CommentClose, commentContentStart);
      if (commentClosePos !== -1) {
        comment = text.substring(commentContentStart, commentClosePos);
        endPos = commentClosePos + TokenType.CommentClose.length;
      }
    }

    return {
      id: this.assignId(counter),
      type: ChangeType.Highlight,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalText: highlightedText,
      metadata: comment !== undefined ? { comment } : undefined,
      level: 0,
      anchored: false,
    };
  }

  private parseComment(text: string, startPos: number, counter: number): ChangeNode | null {
    const contentStart = startPos + TokenType.CommentOpen.length;
    const closePos = text.indexOf(TokenType.CommentClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.CommentClose.length;
    const comment = text.substring(contentStart, closePos);

    return {
      id: this.assignId(counter),
      type: ChangeType.Comment,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      metadata: { comment },
      level: 0,
      anchored: false,
    };
  }

  private parseFootnoteDefinitions(text: string): Map<string, FootnoteDefinition> {
    const map = new Map<string, FootnoteDefinition>();

    // Fast exit: find the first footnote definition line to avoid splitting the entire document
    let searchStart = 0;
    if (text.startsWith('[^ct-')) {
      searchStart = 0;
    } else {
      const firstDef = text.indexOf('\n[^ct-');
      if (firstDef === -1) return map;
      searchStart = firstDef + 1;
    }

    const lines = text.substring(searchStart).split(/\r?\n/);
    let currentId: string | null = null;
    let currentDef: FootnoteDefinition | null = null;
    let lastDiscussionComment: DiscussionComment | null = null;
    let inRevisions = false;

    for (const line of lines) {
      // New footnote definition header
      const defMatch = line.match(CriticMarkupParser.FOOTNOTE_DEF);
      if (defMatch) {
        currentId = defMatch[1];
        currentDef = {
          author: defMatch[2],
          date: defMatch[3],
          type: defMatch[4],
          status: defMatch[5],
        };
        map.set(currentId, currentDef);
        lastDiscussionComment = null;
        inRevisions = false;
        continue;
      }

      // Not inside a footnote body — skip
      if (!currentId || !currentDef) {
        // If line starts with non-whitespace and is not blank, it's not a continuation
        continue;
      }

      // Blank lines are tolerated within footnote body
      if (line.trim() === '') {
        continue;
      }

      // Footnote body lines must be indented (at least 1 space or tab)
      if (!/^[\t ]/.test(line)) {
        // Non-indented non-blank line that's not a new footnote def: end current footnote
        currentId = null;
        currentDef = null;
        lastDiscussionComment = null;
        inRevisions = false;
        continue;
      }

      // Strip leading whitespace, but measure raw indent first
      const rawIndent = line.length - line.replace(/^[\t ]+/, '').length;
      const trimmed = line.trim();

      // revisions: keyword starts a revision block
      if (trimmed === 'revisions:') {
        inRevisions = true;
        lastDiscussionComment = null;
        continue;
      }

      // If inside revisions block, try to match revision entry
      if (inRevisions) {
        const revMatch = trimmed.match(CriticMarkupParser.REVISION_RE);
        if (revMatch) {
          if (!currentDef.revisions) currentDef.revisions = [];
          currentDef.revisions.push({
            label: revMatch[1],
            author: revMatch[2],
            date: revMatch[3],
            timestamp: parseTimestamp(revMatch[3]),
            text: revMatch[4],
          });
          continue;
        }
        // If it doesn't match a revision entry, fall out of revisions block
        inRevisions = false;
      }

      // context:
      const ctxMatch = trimmed.match(CriticMarkupParser.CONTEXT_RE);
      if (ctxMatch) {
        currentDef.context = ctxMatch[1];
        lastDiscussionComment = null;
        continue;
      }

      // approved: / rejected: / request-changes:
      const apprMatch = trimmed.match(CriticMarkupParser.APPROVAL_RE);
      if (apprMatch) {
        const approval: Approval = {
          author: apprMatch[2],
          date: apprMatch[3],
          timestamp: parseTimestamp(apprMatch[3]),
        };
        if (apprMatch[4] !== undefined) {
          approval.reason = apprMatch[4];
        }

        switch (apprMatch[1]) {
          case 'approved':
            if (!currentDef.approvals) currentDef.approvals = [];
            currentDef.approvals.push(approval);
            break;
          case 'rejected':
            if (!currentDef.rejections) currentDef.rejections = [];
            currentDef.rejections.push(approval);
            break;
          case 'request-changes':
            if (!currentDef.requestChanges) currentDef.requestChanges = [];
            currentDef.requestChanges.push(approval);
            break;
        }
        lastDiscussionComment = null;
        continue;
      }

      // resolved @author date / resolved @author date: reason
      const resolvedMatch = trimmed.match(CriticMarkupParser.RESOLVED_RE);
      if (resolvedMatch) {
        currentDef.resolution = {
          type: 'resolved',
          author: resolvedMatch[1],
          date: resolvedMatch[2],
          timestamp: parseTimestamp(resolvedMatch[2]),
          reason: resolvedMatch[3] || undefined,
        };
        lastDiscussionComment = null;
        continue;
      }

      // open / open -- reason
      const openMatch = trimmed.match(CriticMarkupParser.OPEN_RE);
      if (openMatch) {
        currentDef.resolution = {
          type: 'open',
          reason: openMatch[1] || undefined,
        };
        lastDiscussionComment = null;
        continue;
      }

      // reason: backward compat — map to discussion comment by footnote author
      const reasonMatch = trimmed.match(CriticMarkupParser.REASON_RE);
      if (reasonMatch) {
        const comment: DiscussionComment = {
          author: currentDef.author || 'unknown',
          date: currentDef.date || 'unknown',
          timestamp: parseTimestamp(currentDef.date || 'unknown'),
          text: reasonMatch[1],
          depth: 0,
        };
        if (!currentDef.discussion) currentDef.discussion = [];
        currentDef.discussion.push(comment);
        lastDiscussionComment = comment;
        continue;
      }

      // @author date [label]: text — discussion comment
      const discMatch = trimmed.match(CriticMarkupParser.DISCUSSION_RE);
      if (discMatch) {
        const depth = Math.max(0, Math.floor((rawIndent - 4) / 2));
        const comment: DiscussionComment = {
          author: discMatch[1],
          date: discMatch[2],
          timestamp: parseTimestamp(discMatch[2]),
          text: discMatch[4],
          depth,
        };
        if (discMatch[3]) {
          comment.label = discMatch[3];
        }
        if (!currentDef.discussion) currentDef.discussion = [];
        currentDef.discussion.push(comment);
        lastDiscussionComment = comment;
        continue;
      }

      // Continuation line — append to last discussion comment
      if (lastDiscussionComment) {
        lastDiscussionComment.text += '\n' + trimmed;
        continue;
      }

      // Unrecognized indented line with no discussion context — ignore (tolerate)
    }

    return map;
  }

  private mergeFootnoteMetadata(
    changes: ChangeNode[],
    footnotes: Map<string, FootnoteDefinition>,
    settledRefs?: Map<string, number>,
  ): void {
    for (const node of changes) {
      const def = footnotes.get(node.id);
      if (!def) continue;

      node.level = 2;

      // Merge status
      if (def.status === 'accepted') {
        node.status = ChangeStatus.Accepted;
      } else if (def.status === 'rejected') {
        node.status = ChangeStatus.Rejected;
      }

      // Preserve existing inline comment
      const existingComment = node.metadata?.comment;
      node.metadata = {
        ...node.metadata,
        author: def.author,
        date: def.date,
      };
      if (existingComment !== undefined) {
        node.metadata.comment = existingComment;
      }

      // Merge Level 2 fields (only set if present)
      if (def.context !== undefined) {
        node.metadata.context = def.context;
      }
      if (def.approvals) {
        node.metadata.approvals = def.approvals;
      }
      if (def.rejections) {
        node.metadata.rejections = def.rejections;
      }
      if (def.requestChanges) {
        node.metadata.requestChanges = def.requestChanges;
      }
      if (def.revisions) {
        node.metadata.revisions = def.revisions;
      }
      if (def.discussion) {
        node.metadata.discussion = def.discussion;
      }
      if (def.resolution) {
        node.metadata.resolution = def.resolution;
      }
    }

    // Synthesize ChangeNodes for settled refs (post-Layer-1 settlement)
    if (settledRefs) {
      const claimedIds = new Set(changes.map(c => c.id));
      for (const [id, offset] of settledRefs) {
        if (claimedIds.has(id)) continue; // Already merged into a CriticMarkup change
        const def = footnotes.get(id);
        if (!def) continue; // No footnote definition — skip

        const refLength = `[^${id}]`.length;
        let status = ChangeStatus.Proposed;
        if (def.status === 'accepted') status = ChangeStatus.Accepted;
        else if (def.status === 'rejected') status = ChangeStatus.Rejected;

        const TYPE_MAP: Record<string, ChangeType> = {
          ins: ChangeType.Insertion,
          del: ChangeType.Deletion,
          sub: ChangeType.Substitution,
          highlight: ChangeType.Highlight,
          comment: ChangeType.Comment,
          insertion: ChangeType.Insertion,
          deletion: ChangeType.Deletion,
          substitution: ChangeType.Substitution,
        };
        const type = TYPE_MAP[def.type ?? ''] ?? ChangeType.Substitution;

        const node: ChangeNode = {
          id,
          type,
          status,
          range: { start: offset, end: offset + refLength },
          contentRange: { start: offset, end: offset + refLength }, // covers [^ct-N] ref
          level: 2,
          settled: true,
          anchored: true,
          metadata: {
            author: def.author,
            date: def.date,
            type: def.type,
            status: def.status,
          },
        };

        // Merge full metadata
        if (def.context !== undefined) node.metadata!.context = def.context;
        if (def.approvals) node.metadata!.approvals = def.approvals;
        if (def.rejections) node.metadata!.rejections = def.rejections;
        if (def.requestChanges) node.metadata!.requestChanges = def.requestChanges;
        if (def.revisions) node.metadata!.revisions = def.revisions;
        if (def.discussion) node.metadata!.discussion = def.discussion;
        if (def.resolution) node.metadata!.resolution = def.resolution;

        changes.push(node);
      }

      // Re-sort by offset so changes are in document order
      changes.sort((a, b) => a.range.start - b.range.start);
    }
  }

  private resolveMoveGroups(changes: ChangeNode[], footnotes: Map<string, FootnoteDefinition>): void {
    for (const [id, def] of footnotes) {
      if (def.type !== 'move') continue;

      const parentId = id;
      const prefix = parentId + '.';

      for (const node of changes) {
        if (!node.id.startsWith(prefix)) continue;

        node.groupId = parentId;

        if (node.type === ChangeType.Deletion) {
          node.moveRole = 'from';
        } else if (node.type === ChangeType.Insertion) {
          node.moveRole = 'to';
        }
      }
    }
  }

  private tryAttachAdjacentComment(text: string, node: ChangeNode): void {
    const pos = node.range.end;
    if (!this.matchesAt(text, pos, TokenType.CommentOpen)) return;
    const contentStart = pos + TokenType.CommentOpen.length;
    const closePos = text.indexOf(TokenType.CommentClose, contentStart);
    if (closePos === -1) return;
    const content = text.substring(contentStart, closePos);
    const endPos = closePos + TokenType.CommentClose.length;
    node.inlineMetadata = parseInlineMetadata(content);
    node.level = 1;
    node.range = { start: node.range.start, end: endPos };
  }

  private tryAttachFootnoteRef(text: string, node: ChangeNode): void {
    if (text.charCodeAt(node.range.end) !== 91) return; // '[' = 91
    const remaining = text.substring(node.range.end, node.range.end + 30);
    const match = remaining.match(CriticMarkupParser.FOOTNOTE_REF);
    if (match) {
      node.id = match[1];
      node.range = { start: node.range.start, end: node.range.end + match[0].length };
      node.level = 2;
      node.anchored = true;
    }
  }

  private matchesAt(text: string, position: number, delimiter: string): boolean {
    return text.startsWith(delimiter, position);
  }

  private assignId(counter: number): string {
    return `ct-${this.idBase + counter + 1}`;
  }
}
