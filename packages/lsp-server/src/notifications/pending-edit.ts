/**
 * Pending Edit Notification
 *
 * Sends changetracks/pendingEditFlushed notification to the LSP client
 * when a pending edit crystallizes into CriticMarkup.
 */

import { Connection, Range } from 'vscode-languageserver';

/**
 * Payload for pendingEditFlushed notification.
 *
 * Tells the client to apply an edit: replace the text in `range` with `newText`.
 * The client is responsible for applying the workspace edit to the document.
 */
export interface PendingEditFlushedParams {
  uri: string;
  range: Range;
  newText: string;
}

/**
 * Send pendingEditFlushed notification to the client.
 *
 * This notification is sent when a pending edit crystallizes into CriticMarkup
 * (e.g., an insertion buffer flushes to `{++text++}`, or a deletion immediately
 * wraps as `{--text--}`).
 *
 * @param connection LSP connection
 * @param uri Document URI
 * @param range The range in the document to replace
 * @param newText The CriticMarkup-wrapped text to insert
 */
export function sendPendingEditFlushed(
  connection: Connection,
  uri: string,
  range: Range,
  newText: string
): void {
  const params: PendingEditFlushedParams = { uri, range, newText };
  connection.sendNotification('changetracks/pendingEditFlushed', params);
}
