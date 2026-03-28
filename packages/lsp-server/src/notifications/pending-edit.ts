/**
 * Pending Edit Notification
 *
 * Sends changedown/pendingEditFlushed notification to the LSP client
 * when a pending edit crystallizes into CriticMarkup.
 *
 * The notification carries two edits atomically:
 * - markupEdit: replaces user's typed text with CriticMarkup + footnote ref (L2)
 *               or empty/no-op for L3 (body text stays as-is)
 * - footnoteEdit: appends footnote definition at the document end
 *
 * The client must apply both edits in a single workspace edit.
 */

import { Connection, Range } from 'vscode-languageserver';

/**
 * Payload for pendingEditFlushed notification.
 *
 * Contains two edits that must be applied atomically:
 * the inline markup replacement and the footnote definition append.
 */
export interface PendingEditFlushedParams {
  uri: string;
  edits: Array<{ range: Range; newText: string }>;
}

/**
 * Send pendingEditFlushed notification to the client.
 *
 * This notification is sent when a pending edit crystallizes into CriticMarkup.
 * It carries both the inline markup edit and the footnote definition edit
 * so the client can apply them atomically in a single workspace edit.
 *
 * @param connection LSP connection
 * @param uri Document URI
 * @param markupRange The range for the inline markup replacement
 * @param markupNewText The CriticMarkup-wrapped text for the inline edit
 * @param footnoteRange The range for the footnote definition append
 * @param footnoteNewText The footnote definition text
 */
export function sendPendingEditFlushed(
  connection: Connection,
  uri: string,
  markupRange: Range,
  markupNewText: string,
  footnoteRange: Range,
  footnoteNewText: string,
): void {
  const params: PendingEditFlushedParams = {
    uri,
    edits: [
      { range: markupRange, newText: markupNewText },
      { range: footnoteRange, newText: footnoteNewText },
    ],
  };
  connection.sendNotification('changedown/pendingEditFlushed', params);
}
