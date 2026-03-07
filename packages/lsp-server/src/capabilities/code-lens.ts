/**
 * Code Lens Capability
 *
 * Provides inline action buttons for CriticMarkup changes.
 * Shows "Accept" and "Reject" buttons above each change,
 * plus document-level "Accept All" and "Reject All" at the top.
 */

import { CodeLens, Command, Range } from 'vscode-languageserver';
import { ChangeNode } from '@changetracks/core';
import { offsetToPosition } from '../converters';

/**
 * Create code lenses for CriticMarkup changes
 *
 * @param changes Array of change nodes from parser
 * @param text Full document text (needed for offset-to-position conversion)
 * @returns Array of CodeLens objects
 */
export function createCodeLenses(changes: ChangeNode[], text: string): CodeLens[] {
  const lenses: CodeLens[] = [];

  // If no changes, return empty array
  if (changes.length === 0) {
    return lenses;
  }

  // Create document-level lenses at line 0
  const changeCount = changes.length;
  const changeWord = changeCount === 1 ? 'change' : 'changes';

  const acceptAllLens: CodeLens = {
    range: Range.create(0, 0, 0, 0),
    command: Command.create(
      `Accept All (${changeCount} ${changeWord})`,
      'changetracks.acceptAll'
    )
  };

  const rejectAllLens: CodeLens = {
    range: Range.create(0, 0, 0, 0),
    command: Command.create(
      `Reject All (${changeCount} ${changeWord})`,
      'changetracks.rejectAll'
    )
  };

  lenses.push(acceptAllLens, rejectAllLens);

  // Create per-change lenses
  for (const change of changes) {
    // Position lens at the start of the change range
    const position = offsetToPosition(text, change.range.start);
    const lensRange = Range.create(position, position);

    // Accept lens
    const acceptLens: CodeLens = {
      range: lensRange,
      command: Command.create(
        'Accept',
        'changetracks.acceptChange',
        change.id
      )
    };

    // Reject lens
    const rejectLens: CodeLens = {
      range: lensRange,
      command: Command.create(
        'Reject',
        'changetracks.rejectChange',
        change.id
      )
    };

    lenses.push(acceptLens, rejectLens);
  }

  return lenses;
}
