// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/author.ts.
export { resolveAuthor } from '@changedown/cli/engine';
export type { ResolveAuthorResult } from '@changedown/cli/engine';

/** MCP clientInfo as sent in the initialize request params. */
export interface ClientInfo {
  name: string;
  version?: string;
}

/**
 * Derive a stable `ai:<id>` author string from MCP clientInfo.name.
 *
 * Transformation rules applied to the name:
 *   1. Lowercase
 *   2. Runs of whitespace → single hyphen
 *   3. Any remaining character outside [a-z0-9._-] → hyphen
 *   4. Trim leading/trailing hyphens
 *
 * Returns undefined if input is undefined or if the name collapses to
 * an empty string after transformation (so callers can fall back gracefully).
 *
 * Non-ASCII characters (e.g. "クロード", accents on "café") are dropped because
 * the identifier regex permits only [a-z0-9._-]; clients with non-ASCII names
 * should pass an explicit `author` argument.
 *
 * The ai: namespace identifies machine-generated authors distinct from
 * human: authors, matching the convention in resolveAuthor().
 */
export function synthesizeAuthorFromClientInfo(
  clientInfo: ClientInfo | undefined,
): string | undefined {
  if (clientInfo === undefined) return undefined;

  const raw = clientInfo.name;
  if (!raw) return undefined;

  const id = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!id) return undefined;

  return `ai:${id}`;
}
