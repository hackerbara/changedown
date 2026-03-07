/**
 * CLI-specific batch handler that adds --from file support
 * on top of the standard handleProposeBatch MCP handler.
 *
 * Priority: --changes flag > --from file
 */

import * as fs from 'node:fs/promises';
import { handleProposeBatch, type ConfigResolver, type SessionState } from './engine/index.js';

export async function handleCliBatch(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  // If --changes is already provided (via CLI flag), pass through directly
  if (args.changes !== undefined) {
    return handleProposeBatch(args, resolver, state);
  }

  // Try --from file
  const fromPath = args.from as string | undefined;
  if (fromPath) {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(fromPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Failed to read --from file "${fromPath}": ${msg}` }],
        isError: true,
      };
    }

    let changes: unknown;
    try {
      changes = JSON.parse(fileContent);
      if (!Array.isArray(changes)) {
        throw new Error('Expected a JSON array');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Invalid JSON in --from file "${fromPath}": ${msg}` }],
        isError: true,
      };
    }

    return handleProposeBatch({ ...args, changes }, resolver, state);
  }

  // If neither --changes nor --from, report error
  return {
    content: [{
      type: 'text',
      text: 'No changes provided. Use --changes JSON or --from file.json.',
    }],
    isError: true,
  };
}
