import { ChangeNode, TextEdit, OffsetRange } from './model/types.js';
import { VirtualDocument } from './model/document.js';
import { CriticMarkupParser } from './parser/parser.js';
import { SidecarParser } from './parser/sidecar-parser.js';
import { FootnoteNativeParser } from './parser/footnote-native-parser.js';
import { computeAccept, computeReject, computeFootnoteStatusEdits } from './operations/accept-reject.js';
import { computeSidecarAccept, computeSidecarReject, computeSidecarResolveAll } from './operations/sidecar-accept-reject.js';
import { getCommentSyntax } from './comment-syntax.js';
import { nextChange as navNext, previousChange as navPrevious } from './operations/navigation.js';
import { wrapInsertion as trackWrap, wrapDeletion as trackWrapDel, wrapSubstitution as trackWrapSub } from './operations/tracking.js';
import { insertComment as commentInsert } from './operations/comment.js';
import { SIDECAR_BLOCK_MARKER } from './constants.js';
import { isL3Format } from './footnote-patterns.js';
import { parseForFormat } from './format-aware-parse.js';
import { computeSettledText, computeOriginalText, type SettledTextOptions } from './operations/settled-text.js';

export class Workspace {
  private criticParser = new CriticMarkupParser();
  private sidecarParser = new SidecarParser();
  private footnoteNativeParser = new FootnoteNativeParser();

  /**
   * Parses a document into a VirtualDocument.
   *
   * When footnoteNative is true (or auto-detected via marker), dispatches
   * to the FootnoteNativeParser for clean-body footnote-only format.
   * When languageId is provided and the text contains a sidecar block,
   * dispatches to the SidecarParser for code files.
   * Otherwise uses CriticMarkupParser (markdown, unknown languages,
   * code files without sidecar block).
   */
  parse(text: string, languageId?: string, footnoteNative?: boolean): VirtualDocument {
    if (this.shouldUseSidecar(text, languageId)) {
      return this.sidecarParser.parse(text, languageId!);
    }
    // Delegate L2/L3 routing to shared function
    // (footnoteNative override: true forces L3, false forces L2)
    if (footnoteNative === true) {
      return this.footnoteNativeParser.parse(text);
    }
    if (footnoteNative === false) {
      return this.criticParser.parse(text);
    }
    return parseForFormat(text);
  }

  /**
   * Computes edits to accept a change.
   *
   * For footnote-native format, updates the footnote status only (body is clean).
   * For sidecar-annotated code files (when text and languageId are provided
   * and a sidecar block is detected), returns TextEdit[] from computeSidecarAccept.
   * Otherwise wraps the single CriticMarkup TextEdit in an array.
   */
  acceptChange(change: ChangeNode, text?: string, languageId?: string): TextEdit[] {
    if (text !== undefined && this.shouldUseSidecar(text, languageId)) {
      return computeSidecarAccept(text, change.id, languageId!);
    }
    const edits = [computeAccept(change)];
    if (text !== undefined && change.id) {
      edits.push(...computeFootnoteStatusEdits(text, [change.id], 'accepted'));
    }
    return edits;
  }

  /**
   * Computes edits to reject a change.
   *
   * For footnote-native format, reverts the body text and updates footnote status.
   * For sidecar-annotated code files (when text and languageId are provided
   * and a sidecar block is detected), returns TextEdit[] from computeSidecarReject.
   * Otherwise wraps the single CriticMarkup TextEdit in an array.
   */
  rejectChange(change: ChangeNode, text?: string, languageId?: string): TextEdit[] {
    if (text !== undefined && this.shouldUseSidecar(text, languageId)) {
      return computeSidecarReject(text, change.id, languageId!);
    }
    const edits = [computeReject(change)];
    if (text !== undefined && change.id) {
      edits.push(...computeFootnoteStatusEdits(text, [change.id], 'rejected'));
    }
    return edits;
  }

  /**
   * Accepts all changes in a document.
   *
   * For sidecar-annotated code files, uses computeSidecarResolveAll to
   * produce non-overlapping edits (single sidecar block removal).
   * For CriticMarkup, maps over changes in reverse document order.
   */
  acceptAll(doc: VirtualDocument, text?: string, languageId?: string): TextEdit[] {
    if (text !== undefined && this.shouldUseSidecar(text, languageId)) {
      return computeSidecarResolveAll(text, doc.getChanges(), languageId!, 'accept');
    }
    const changes = doc.getChanges();
    const edits = [...changes].reverse().map(computeAccept);
    if (text !== undefined) {
      const ids = changes.map(c => c.id).filter(id => id !== '');
      edits.push(...computeFootnoteStatusEdits(text, ids, 'accepted'));
    }
    return edits;
  }

  /**
   * Rejects all changes in a document.
   *
   * For sidecar-annotated code files, uses computeSidecarResolveAll to
   * produce non-overlapping edits (single sidecar block removal).
   * For CriticMarkup, maps over changes in reverse document order.
   */
  rejectAll(doc: VirtualDocument, text?: string, languageId?: string): TextEdit[] {
    if (text !== undefined && this.shouldUseSidecar(text, languageId)) {
      return computeSidecarResolveAll(text, doc.getChanges(), languageId!, 'reject');
    }
    const changes = doc.getChanges();
    const edits = [...changes].reverse().map(computeReject);
    if (text !== undefined) {
      const ids = changes.map(c => c.id).filter(id => id !== '');
      edits.push(...computeFootnoteStatusEdits(text, ids, 'rejected'));
    }
    return edits;
  }

  /**
   * Accepts all members of a change group (e.g., a move operation).
   * Returns TextEdits in reverse document order to preserve ranges when applied sequentially.
   */
  acceptGroup(doc: VirtualDocument, groupId: string, text?: string): TextEdit[] {
    const members = doc.getGroupMembers(groupId);
    const edits = [...members]
      .sort((a, b) => b.range.start - a.range.start)
      .map(computeAccept);
    if (text !== undefined) {
      const ids = [groupId, ...members.map(m => m.id)].filter(id => id !== '');
      edits.push(...computeFootnoteStatusEdits(text, ids, 'accepted'));
    }
    return edits;
  }

  /**
   * Rejects all members of a change group (e.g., a move operation).
   * Returns TextEdits in reverse document order to preserve ranges when applied sequentially.
   */
  rejectGroup(doc: VirtualDocument, groupId: string, text?: string): TextEdit[] {
    const members = doc.getGroupMembers(groupId);
    const edits = [...members]
      .sort((a, b) => b.range.start - a.range.start)
      .map(computeReject);
    if (text !== undefined) {
      const ids = [groupId, ...members.map(m => m.id)].filter(id => id !== '');
      edits.push(...computeFootnoteStatusEdits(text, ids, 'rejected'));
    }
    return edits;
  }

  nextChange(doc: VirtualDocument, cursorOffset: number): ChangeNode | null {
    return navNext(doc, cursorOffset);
  }

  previousChange(doc: VirtualDocument, cursorOffset: number): ChangeNode | null {
    return navPrevious(doc, cursorOffset);
  }

  wrapInsertion(insertedText: string, offset: number, scId?: string): TextEdit {
    return trackWrap(insertedText, offset, scId);
  }

  wrapDeletion(deletedText: string, offset: number, scId?: string): TextEdit {
    return trackWrapDel(deletedText, offset, scId);
  }

  wrapSubstitution(oldText: string, newText: string, offset: number, scId?: string): TextEdit {
    return trackWrapSub(oldText, newText, offset, scId);
  }

  insertComment(commentText: string, offset: number, selectionRange?: OffsetRange, selectedText?: string): TextEdit {
    return commentInsert(commentText, offset, selectionRange, selectedText);
  }

  changeAtOffset(doc: VirtualDocument, offset: number): ChangeNode | null {
    return doc.changeAtOffset(offset);
  }

  /**
   * Determines whether to use the FootnoteNativeParser for a given text.
   *
   * Returns true when footnoteNative is explicitly true, or when auto-detected:
   * the text has [^ct-N] footnote definitions AND no inline CriticMarkup delimiters.
   * This distinguishes footnote-native files (clean body + footnotes) from
   * regular CriticMarkup files that also have L2 footnotes.
   */
  isFootnoteNative(text: string, footnoteNative?: boolean): boolean {
    if (footnoteNative === true) return true;
    if (footnoteNative === false) return false;
    return isL3Format(text);
  }

  /**
   * Computes the settled (accept-all) view of a document.
   * Routes through format detection so L3 documents are handled correctly.
   */
  settledText(text: string, options?: SettledTextOptions): string {
    return computeSettledText(text, options);
  }

  /**
   * Computes the original (reject-all) view of a document.
   * Routes through format detection so L3 documents are handled correctly.
   */
  originalText(text: string, options?: SettledTextOptions): string {
    return computeOriginalText(text, options);
  }

  /**
   * Determines whether to use the SidecarParser for a given text + languageId.
   *
   * Returns true when ALL of:
   * 1. languageId is provided and is NOT 'markdown'
   * 2. The language has line-comment syntax in the comment syntax map
   * 3. The text contains a '-- ChangeTracks' sidecar block marker
   */
  private shouldUseSidecar(text: string, languageId?: string): boolean {
    if (!languageId || languageId === 'markdown') {
      return false;
    }
    const syntax = getCommentSyntax(languageId);
    if (!syntax) {
      return false;
    }
    return text.includes(SIDECAR_BLOCK_MARKER);
  }
}
