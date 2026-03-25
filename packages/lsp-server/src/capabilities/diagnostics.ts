/**
 * Diagnostics Capability
 *
 * Converts CriticMarkup changes into LSP diagnostics that appear in the
 * problems panel. Each change becomes a diagnostic with metadata for
 * code actions.
 */

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ChangeNode, ChangeType, isGhostNode, consumptionLabel, UnresolvedDiagnostic } from '@changetracks/core';
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
 * @param unresolvedDiagnostics Optional array of unresolved anchor diagnostics from the resolution protocol
 * @returns Array of LSP diagnostics
 */
export function createDiagnostics(
  changes: ChangeNode[],
  text: string,
  unresolvedDiagnostics: UnresolvedDiagnostic[] = []
): Diagnostic[] {
  const unresolvedMap = unresolvedDiagnostics.length > 0
    ? new Map<string, UnresolvedDiagnostic>(unresolvedDiagnostics.map(d => [d.changeId, d]))
    : null;

  const result: Diagnostic[] = [];

  for (const change of changes) {
    // L0/L1 changes without anchoring are inline changes — skip entirely
    if (change.level < 2 && !change.anchored) continue;

    const range = offsetRangeToLspRange(text, change.range.start, change.range.end);

    // L2+ unanchored changes failed resolution — emit Warning
    if (isGhostNode(change)) {
      const detail = unresolvedMap?.get(change.id);
      const message = detail
        ? `Unresolved: expected "${detail.expectedText}" (tried: ${detail.attemptedPaths.join(', ')})`
        : `Unresolved: anchor could not be located in document`;

      result.push({
        range,
        severity: DiagnosticSeverity.Warning,
        source: 'changetracks',
        message,
        code: change.id,
        data: {
          changeId: change.id,
          changeType: change.type,
          unresolved: true,
        }
      });
      continue;
    }

    // Consumed ops: resolved but redundant — emit Information
    if (change.consumedBy) {
      const label = consumptionLabel(change.consumptionType);
      result.push({
        range,
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: `${label} by ${change.consumedBy} — this change's effect was absorbed by a later edit`,
        code: change.id,
        data: {
          changeId: change.id,
          changeType: change.type,
          consumed: true,
          consumedBy: change.consumedBy,
        }
      });
      continue;
    }

    // Anchored or L0 changes: emit Hint
    const message = createDiagnosticMessage(change, text);
    result.push({
      range,
      severity: DiagnosticSeverity.Hint,
      source: 'changetracks',
      message,
      code: change.id,
      data: {
        changeId: change.id,
        changeType: change.type,
      }
    });
  }

  return result;
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
      const original = change.originalText || (change.originalRange ? extractTextFromRange(text, change.originalRange) : '');
      const modified = change.modifiedText || (change.modifiedRange ? extractTextFromRange(text, change.modifiedRange) : '');
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
