/**
 * Diagnostics Capability
 *
 * Converts CriticMarkup changes into LSP diagnostics that appear in the
 * problems panel. Each change becomes a diagnostic with metadata for
 * code actions.
 */

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ChangeNode, ChangeType } from '@changetracks/core';
import { offsetRangeToLspRange } from '../converters';

/**
 * Maximum length for content displayed in diagnostic messages
 */
const MAX_MESSAGE_CONTENT_LENGTH = 80;

/**
 * Create LSP diagnostics from CriticMarkup changes
 *
 * Each change is converted to a Hint-level diagnostic with:
 * - Range spanning the entire change (including delimiters)
 * - Human-readable message describing the change
 * - Change ID as the diagnostic code
 * - Change metadata for code actions
 *
 * @param changes Array of parsed CriticMarkup changes
 * @param text Full document text for offset-to-position conversion
 * @returns Array of LSP diagnostics
 */
export function createDiagnostics(changes: ChangeNode[], text: string): Diagnostic[] {
  return changes.map(change => {
    const range = offsetRangeToLspRange(text, change.range.start, change.range.end);
    const message = createDiagnosticMessage(change, text);

    return {
      range,
      severity: DiagnosticSeverity.Hint,
      source: 'changetracks',
      message,
      code: change.id,
      data: {
        changeId: change.id,
        changeType: change.type,
      }
    };
  });
}

/**
 * Create a human-readable diagnostic message for a change
 *
 * @param change The change node
 * @param text Full document text for extracting content
 * @returns Formatted diagnostic message
 */
function createDiagnosticMessage(change: ChangeNode, text: string): string {
  const content = extractContent(change, text);
  const truncatedContent = truncateContent(content);

  switch (change.type) {
    case ChangeType.Insertion:
      return `Insertion: ${truncatedContent}`;

    case ChangeType.Deletion:
      return `Deletion: ${truncatedContent}`;

    case ChangeType.Substitution:
      const original = change.originalText || extractTextFromRange(text, change.originalRange!);
      const modified = change.modifiedText || extractTextFromRange(text, change.modifiedRange!);
      return `Substitution: ${truncateContent(original)} → ${truncateContent(modified)}`;

    case ChangeType.Highlight:
      if (change.metadata?.comment) {
        return `Highlight: ${truncatedContent} (${change.metadata.comment})`;
      }
      return `Highlight: ${truncatedContent}`;

    case ChangeType.Comment:
      return `Comment: ${truncatedContent}`;

    default:
      return `Change: ${truncatedContent}`;
  }
}

/**
 * Extract content text from a change node
 *
 * @param change The change node
 * @param text Full document text
 * @returns Content text
 */
function extractContent(change: ChangeNode, text: string): string {
  return text.substring(change.contentRange.start, change.contentRange.end);
}

/**
 * Extract text from an offset range
 *
 * @param text Full document text
 * @param range Offset range
 * @returns Text in the range
 */
function extractTextFromRange(text: string, range: { start: number; end: number }): string {
  return text.substring(range.start, range.end);
}

/**
 * Truncate content for display in diagnostic messages
 *
 * @param content Content text
 * @returns Truncated content with ellipsis if needed
 */
function truncateContent(content: string): string {
  if (content.length <= MAX_MESSAGE_CONTENT_LENGTH) {
    return content;
  }

  return content.substring(0, MAX_MESSAGE_CONTENT_LENGTH) + '...';
}
