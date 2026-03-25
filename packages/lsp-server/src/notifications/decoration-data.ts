/**
 * Custom Notifications
 *
 * Sends custom notifications to the LSP client about parse results:
 * - changetracks/decorationData: Full ChangeNode[] for decoration rendering
 * - changetracks/changeCount: Aggregated counts by change type
 * - changetracks/allChangesResolved: Sent when no changes remain
 */

import { Connection } from 'vscode-languageserver';
import { ChangeNode, ChangeType, isGhostNode } from '@changetracks/core';
import type { DecorationDataParams, ChangeCountParams, AllChangesResolvedParams, CoherenceStatusParams } from '@changetracks/core';

/**
 * Send decoration data notification to client.
 *
 * This notification provides the full array of ChangeNode objects
 * so the client can render decorations without parsing.
 *
 * @param connection LSP connection
 * @param uri Document URI
 * @param changes Array of ChangeNode objects
 */
export function sendDecorationData(
  connection: Connection,
  uri: string,
  changes: ChangeNode[],
  documentVersion: number
): void {
  const filtered = changes.filter(c => !isGhostNode(c));
  const params: DecorationDataParams = { uri, changes: filtered, documentVersion };
  connection.sendNotification('changetracks/decorationData', params);
}

/**
 * Send coherence status notification to client.
 */
export function sendCoherenceStatus(
  connection: Connection,
  uri: string,
  coherenceRate: number,
  unresolvedCount: number,
  threshold: number,
): void {
  const params: CoherenceStatusParams = { uri, coherenceRate, unresolvedCount, threshold };
  connection.sendNotification('changetracks/coherenceStatus', params);
}

/**
 * Send change count notification to client.
 *
 * This notification provides aggregated statistics about changes in the document.
 * Also sends allChangesResolved notification when total count is zero.
 *
 * @param connection LSP connection
 * @param uri Document URI
 * @param changes Array of ChangeNode objects
 */
export function sendChangeCount(
  connection: Connection,
  uri: string,
  changes: ChangeNode[]
): void {
  // Aggregate counts by type
  const counts = {
    insertions: 0,
    deletions: 0,
    substitutions: 0,
    highlights: 0,
    comments: 0,
    total: changes.length
  };

  for (const change of changes) {
    switch (change.type) {
      case ChangeType.Insertion:
        counts.insertions++;
        break;
      case ChangeType.Deletion:
        counts.deletions++;
        break;
      case ChangeType.Substitution:
        counts.substitutions++;
        break;
      case ChangeType.Highlight:
        counts.highlights++;
        break;
      case ChangeType.Comment:
        counts.comments++;
        break;
    }
  }

  const params: ChangeCountParams = { uri, counts };
  connection.sendNotification('changetracks/changeCount', params);

  // Send all changes resolved notification if no changes remain
  if (counts.total === 0) {
    const resolvedParams: AllChangesResolvedParams = { uri };
    connection.sendNotification('changetracks/allChangesResolved', resolvedParams);
  }
}
