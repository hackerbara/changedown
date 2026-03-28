/**
 * View Mode Notifications
 *
 * Custom LSP notifications for synchronizing view mode between client and server:
 * - changedown/setViewMode (client -> server): Client requests view mode change
 * - changedown/viewModeChanged (server -> client): Server confirms mode change
 */

import { Connection } from 'vscode-languageserver';
import type { ViewName } from '@changedown/core';

/**
 * Parameters for setViewMode notification (client -> server)
 */
export interface SetViewModeParams {
  textDocument: { uri: string };
  viewMode: ViewName;
}

/**
 * Parameters for viewModeChanged notification (server -> client)
 */
export interface ViewModeChangedParams {
  textDocument: { uri: string };
  viewMode: ViewName;
}

/**
 * Send viewModeChanged notification to client.
 *
 * Broadcasts the current view mode for a document back to the client,
 * confirming that the server has updated its stored mode.
 *
 * @param connection LSP connection
 * @param uri Document URI
 * @param viewMode The active view mode
 */
export function sendViewModeChanged(
  connection: Connection,
  uri: string,
  viewMode: ViewName
): void {
  const params: ViewModeChangedParams = {
    textDocument: { uri },
    viewMode
  };
  connection.sendNotification('changedown/viewModeChanged', params);
}
