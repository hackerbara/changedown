import { settleAcceptedChangesOnly, settleRejectedChangesOnly } from '@changedown/core';

/**
 * Thin wrapper around core's settleAcceptedChangesOnly. Used by review handlers
 * for auto-settlement after approval; not exposed as a standalone MCP tool.
 */
export function settleAcceptedChanges(fileContent: string): {
  settledContent: string;
  settledIds: string[];
} {
  return settleAcceptedChangesOnly(fileContent);
}

/**
 * Thin wrapper around core's settleRejectedChangesOnly. Used by review handlers
 * for auto-settlement after rejection; not exposed as a standalone MCP tool.
 */
export function settleRejectedChanges(fileContent: string): {
  settledContent: string;
  settledIds: string[];
} {
  return settleRejectedChangesOnly(fileContent);
}
