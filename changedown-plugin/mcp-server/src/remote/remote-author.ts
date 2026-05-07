import type { RelayClientInfo } from './relay-context.js';

/** Worker-safe author synthesis for the remote relay MCP surface. */
export function synthesizeRemoteAuthorFromClientInfo(
  clientInfo: RelayClientInfo | undefined,
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
