/**
 * Document State Notification
 *
 * Sends resolved document state (tracking, view mode) to the client.
 * Fired on: textDocument/didOpen, header change, config change, view mode change.
 */

import { Connection } from 'vscode-languageserver';
import { LSP_METHOD } from '@changedown/core/host';

export interface TrackingState {
  enabled: boolean;
  source: 'file' | 'project' | 'default';
}

export interface DocumentStateParams {
  /** Host-native shape consumed by BaseController. */
  uri: string;
  textDocument: { uri: string };
  tracking: TrackingState;
  /** Host-native view key. Kept alongside viewMode for older LSP-shaped consumers. */
  view: string;
  viewMode: string;
}

/**
 * Resolve tracking state from document text and project config.
 * Resolution order: file header > project config > default (tracked).
 */
export function resolveTracking(
  docText: string,
  projectTrackingDefault?: string
): TrackingState {
  const headerMatch = docText.match(
    /^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m
  );
  if (headerMatch) {
    return { enabled: headerMatch[1] === 'tracked', source: 'file' };
  }
  if (projectTrackingDefault) {
    return {
      enabled: projectTrackingDefault === 'tracked',
      source: 'project',
    };
  }
  return { enabled: true, source: 'default' };
}

/**
 * Send document state notification to client.
 */
export function sendDocumentState(
  connection: Connection,
  uri: string,
  tracking: TrackingState,
  viewMode: string
): void {
  const params: DocumentStateParams = {
    uri,
    textDocument: { uri },
    tracking,
    view: viewMode,
    viewMode,
  };
  connection.sendNotification(LSP_METHOD.DOCUMENT_STATE, params);
}
