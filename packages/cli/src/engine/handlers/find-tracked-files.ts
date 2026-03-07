/**
 * Handler for the `sc files` / `sc ls` CLI command.
 *
 * Walks a directory tree and returns files that match the project's
 * tracking include/exclude patterns from .changetracks/config.toml.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import picomatch from 'picomatch';
import type { ConfigResolver } from '../config-resolver.js';
import type { SessionState } from '../state.js';

export async function handleFindTrackedFiles(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  _state: SessionState,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const dirArg = args.path as string | undefined;

  // Resolve the search directory and load config by using a synthetic file
  // path under the target directory so ConfigResolver discovers the right project.
  const searchDir = dirArg ? path.resolve(dirArg) : resolver.resolveDir();
  const syntheticFile = path.join(searchDir, '__probe__.md');
  const { config, projectDir } = await resolver.forFile(syntheticFile);

  const matchesInclude = picomatch(config.tracking.include);
  const matchesExclude = picomatch(config.tracking.exclude);

  const tracked: string[] = [];
  await walkDir(searchDir, projectDir, matchesInclude, matchesExclude, tracked);

  // Sort for stable output
  tracked.sort();

  return {
    content: [{ type: 'text', text: tracked.join('\n') }],
  };
}

async function walkDir(
  dir: string,
  projectDir: string,
  matchesInclude: (path: string) => boolean,
  matchesExclude: (path: string) => boolean,
  results: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    let relative = path.relative(projectDir, fullPath);
    // Normalize to forward slashes for glob matching
    relative = relative.split(path.sep).join('/');

    if (entry.isDirectory()) {
      // Skip excluded directories early (performance optimization)
      if (matchesExclude(relative) || matchesExclude(relative + '/')) {
        continue;
      }
      // Skip hidden directories
      if (entry.name.startsWith('.')) {
        continue;
      }
      await walkDir(fullPath, projectDir, matchesInclude, matchesExclude, results);
    } else if (entry.isFile()) {
      if (matchesInclude(relative) && !matchesExclude(relative)) {
        results.push(relative);
      }
    }
  }
}
