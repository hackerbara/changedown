/**
 * Semantic Tokens Capability
 *
 * Provides syntax highlighting for CriticMarkup using LSP semantic tokens.
 * Maps CriticMarkup change types to semantic token types and modifiers.
 */

import { SemanticTokens, SemanticTokensLegend } from 'vscode-languageserver/node';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';
import type { ViewName } from '@changetracks/core';

/**
 * Token types for CriticMarkup syntax highlighting
 *
 * Custom token types (changetracks-*) are used instead of standard types
 * (string, comment, type) to prevent VS Code themes from overriding
 * the extension's TextEditorDecorationType colors via CSS specificity.
 * Custom types have no default theme colors in any editor.
 *
 * Order matters - indices are used in token encoding.
 */
const TOKEN_TYPES = [
    'changetracks-insertion',     // 0: additions and modified text
    'changetracks-deletion',      // 1: deletions
    'changetracks-highlight',     // 2: highlights
    'changetracks-comment',       // 3: comments
    'changetracks-subOriginal',   // 4: substitution original half
    'changetracks-subModified',   // 5: substitution modified half
    'changetracks-moveFrom',      // 6: move source
    'changetracks-moveTo',        // 7: move target
] as const;

/**
 * Token modifiers for CriticMarkup change states
 *
 * These provide additional styling hints (e.g., dimmed, strikethrough).
 * Order matters - indices are used as bit positions.
 */
const TOKEN_MODIFIERS = [
    'modification',   // bit 0
    'deprecated',     // bit 1
    'proposed',       // bit 2
    'accepted',       // bit 3
    'hasThread',      // bit 4
    'authorSlot0',    // bit 5
    'authorSlot1',    // bit 6
    'authorSlot2',    // bit 7
] as const;

/**
 * Token type indices (must match TOKEN_TYPES array order)
 */
const enum TokenType {
  Insertion = 0,     // changetracks-insertion
  Deletion = 1,      // changetracks-deletion
  Highlight = 2,     // changetracks-highlight
  Comment = 3,       // changetracks-comment
  SubOriginal = 4,   // changetracks-subOriginal
  SubModified = 5,   // changetracks-subModified
  MoveFrom = 6,      // changetracks-moveFrom
  MoveTo = 7,        // changetracks-moveTo
}

/**
 * Token modifier bit flags
 */
const enum TokenModifier {
  Modification = 1 << 0,  // Bit 0: for additions/modifications
  Deprecated = 1 << 1,    // Bit 1: for deletions/strikethrough
  Proposed = 1 << 2,      // Bit 2: change is in proposed status
  Accepted = 1 << 3,      // Bit 3: change is in accepted status
  HasThread = 1 << 4,     // Bit 4: change has discussion thread
  AuthorSlot0 = 1 << 5,   // Bit 5: first author color slot
  AuthorSlot1 = 1 << 6,   // Bit 6: second author color slot
  AuthorSlot2 = 1 << 7,   // Bit 7: third author color slot
}

/**
 * Get the semantic tokens legend
 *
 * This defines the token types and modifiers used by the server.
 * Must be declared in server capabilities during initialization.
 *
 * @returns SemanticTokensLegend with token types and modifiers
 */
export function getSemanticTokensLegend(): SemanticTokensLegend {
  return {
    tokenTypes: [...TOKEN_TYPES],
    tokenModifiers: [...TOKEN_MODIFIERS]
  };
}

/**
 * Position tracking for delta encoding
 */
interface Position {
  line: number;
  character: number;
}

/**
 * Convert text offset to line/character position
 *
 * @param text Document text
 * @param offset Character offset
 * @returns Position with line and character
 */
function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let character = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
      // P1-20: Handle CRLF as a single newline — skip \r, the next iteration handles \n
      continue;
    }
    if (text[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return { line, character };
}

/**
 * Calculate text length in characters, handling multi-line content
 *
 * @param text Document text
 * @param start Start offset
 * @param end End offset
 * @returns Length in characters (for single line) or 0 (for multi-line, which needs special handling)
 */
function calculateLength(text: string, start: number, end: number): number {
  if (start >= end) return 0;

  const content = text.substring(start, end);
  // If contains newline, return 0 to skip (multi-line tokens need per-line handling)
  if (content.includes('\n')) return 0;

  return end - start;
}

/**
 * Compute modifier bits from ChangeNode metadata (status, thread, author).
 * Author palette uses first-seen ordering: first author → slot 0, etc.
 */
function getMetadataModifiers(change: ChangeNode, authorMap: Map<string, number>): number {
    let mods = 0;

    // Status modifiers
    if (change.status === ChangeStatus.Proposed || change.metadata?.status === 'proposed') {
        mods |= TokenModifier.Proposed;
    }
    if (change.status === ChangeStatus.Accepted || change.metadata?.status === 'accepted') {
        mods |= TokenModifier.Accepted;
    }

    // Thread modifier
    if (change.metadata?.discussion && change.metadata.discussion.length > 0) {
        mods |= TokenModifier.HasThread;
    }

    // Author slot modifier (first-seen ordering, mod 3)
    if (change.metadata?.author) {
        if (!authorMap.has(change.metadata.author)) {
            authorMap.set(change.metadata.author, authorMap.size);
        }
        const slot = authorMap.get(change.metadata.author)! % 3;
        if (slot === 0) mods |= TokenModifier.AuthorSlot0;
        else if (slot === 1) mods |= TokenModifier.AuthorSlot1;
        else mods |= TokenModifier.AuthorSlot2;
    }

    return mods;
}

/**
 * Determine whether a change type should emit tokens in the given view mode.
 *
 * View mode filtering rules:
 * - review: all token types emitted (full markup visible)
 * - changes: delimiter tokens omitted (content tokens only — insertions, deletions, etc.)
 * - settled: only non-change content tokens (highlights and comments survive; insertions/deletions/subs hidden)
 * - raw: no semantic tokens at all (handled at call site, never reaches this function)
 *
 * @param changeType The CriticMarkup change type
 * @param viewMode The active view mode
 * @returns true if tokens for this change type should be emitted
 */
function shouldEmitTokensForView(changeType: ChangeType, viewMode: ViewName): boolean {
  switch (viewMode) {
    case 'review':
      // All tokens visible
      return true;
    case 'changes':
      // Content tokens emitted (delimiter hiding handled by decorator CSS, not semantic tokens).
      // All change types get tokens so their content regions are styled.
      return true;
    case 'settled':
      // In settled view, only highlights and comments remain visible.
      // Insertions, deletions, and substitutions are resolved — no tokens.
      return changeType === ChangeType.Highlight || changeType === ChangeType.Comment;
    case 'raw':
      // No tokens at all — should not reach here (caller short-circuits)
      return false;
    default:
      // Unknown view mode — suppress tokens as a safe default
      return false;
  }
}

/**
 * Build semantic tokens for a document
 *
 * Encodes tokens in LSP's delta format:
 * [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
 *
 * Each token is 5 integers:
 * - deltaLine: line delta from previous token (or absolute for first)
 * - deltaStartChar: character delta from previous token (or absolute if different line)
 * - length: token length in characters
 * - tokenType: index into token types array
 * - tokenModifiers: bit flags for modifiers
 *
 * @param changes Array of change nodes from parser
 * @param text Document text for position calculation
 * @param viewMode Optional view mode for token filtering (defaults to 'review' — all tokens)
 * @returns SemanticTokens with encoded data array
 */
export function buildSemanticTokens(changes: ChangeNode[], text: string, viewMode: ViewName = 'review'): SemanticTokens {
  const data: number[] = [];
  let previousPosition: Position = { line: 0, character: 0 };
  const authorMap = new Map<string, number>();

  /**
   * Encode a single token into the data array
   */
  function encodeToken(
    start: number,
    end: number,
    tokenType: TokenType,
    tokenModifiers: number
  ): void {
    const length = calculateLength(text, start, end);
    if (length === 0) return; // Skip zero-length or multi-line tokens

    const position = offsetToPosition(text, start);

    // Calculate deltas
    const deltaLine = position.line - previousPosition.line;
    const deltaStartChar = deltaLine === 0
      ? position.character - previousPosition.character
      : position.character;

    // Encode token: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
    data.push(deltaLine, deltaStartChar, length, tokenType, tokenModifiers);

    // Update previous position
    previousPosition = position;
  }

  // Process each change node, filtering by view mode
  for (const change of changes) {
    // Skip change types that should not emit tokens in the current view mode
    if (!shouldEmitTokensForView(change.type, viewMode)) {
      continue;
    }

    switch (change.type) {
      case ChangeType.Insertion: {
        const metaMods = getMetadataModifiers(change, authorMap);
        if (change.moveRole === 'to') {
          encodeToken(
            change.contentRange.start,
            change.contentRange.end,
            TokenType.MoveTo,
            TokenModifier.Modification | metaMods
          );
        } else {
          encodeToken(
            change.contentRange.start,
            change.contentRange.end,
            TokenType.Insertion,
            TokenModifier.Modification | metaMods
          );
        }
        break;
      }

      case ChangeType.Deletion: {
        const metaMods = getMetadataModifiers(change, authorMap);
        if (change.moveRole === 'from') {
          encodeToken(
            change.contentRange.start,
            change.contentRange.end,
            TokenType.MoveFrom,
            TokenModifier.Deprecated | metaMods
          );
        } else {
          encodeToken(
            change.contentRange.start,
            change.contentRange.end,
            TokenType.Deletion,
            TokenModifier.Deprecated | metaMods
          );
        }
        break;
      }

      case ChangeType.Substitution: {
        const metaMods = getMetadataModifiers(change, authorMap);
        // Substitution has two parts:
        // 1. Original text: subOriginal + deprecated
        // 2. Modified text: subModified + modification
        if (change.originalRange) {
          encodeToken(
            change.originalRange.start,
            change.originalRange.end,
            TokenType.SubOriginal,
            TokenModifier.Deprecated | metaMods
          );
        }
        if (change.modifiedRange) {
          encodeToken(
            change.modifiedRange.start,
            change.modifiedRange.end,
            TokenType.SubModified,
            TokenModifier.Modification | metaMods
          );
        }
        break;
      }

      case ChangeType.Highlight: {
        const metaMods = getMetadataModifiers(change, authorMap);
        encodeToken(
          change.contentRange.start,
          change.contentRange.end,
          TokenType.Highlight,
          metaMods
        );
        break;
      }

      case ChangeType.Comment: {
        const metaMods = getMetadataModifiers(change, authorMap);
        encodeToken(
          change.contentRange.start,
          change.contentRange.end,
          TokenType.Comment,
          metaMods
        );
        break;
      }
    }
  }

  return { data };
}
