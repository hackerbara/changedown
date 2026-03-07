import * as path from 'node:path';

/**
 * Returns the path relative to project root for use in MCP response payloads.
 * Keeps context-window token usage lower than absolute paths.
 */
export function toRelativePath(projectDir: string, filePath: string): string {
  return path.relative(projectDir, filePath);
}
