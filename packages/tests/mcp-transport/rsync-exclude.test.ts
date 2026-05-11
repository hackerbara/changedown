// packages/tests/mcp-transport/rsync-exclude.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

/**
 * Extract the exclude rules from the "Local config" block in sync-to-release.sh.
 * The block is delimited by:
 *   # ── Local config ──
 * and the next comment section header (# ── ... ──).
 *
 * Only directory-rule lines are extracted: lines that start with an optional
 * leading "/" followed by "." and end with "/".
 */
function extractLocalConfigExcludes(scriptSource: string): string {
  const startMarker = '# ── Local config ──';
  const startIdx = scriptSource.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('Could not find Local config exclude block in scripts/sync-to-release.sh');
  }

  // Find the next section header after the start marker
  const afterStart = scriptSource.slice(startIdx + startMarker.length);
  // Match the next "# ── ... ──" line
  const nextSectionMatch = afterStart.match(/\n# ── /);
  const blockContent =
    nextSectionMatch !== null
      ? afterStart.slice(0, nextSectionMatch.index)
      : afterStart;

  // Extract directory-rule lines: optional "/" then "." then name then "/"
  const dirRules = blockContent
    .split('\n')
    .filter((line) => /^\/?\..*\/$/.test(line.trim()) && line.trim() !== '')
    .map((line) => line.trim());

  if (dirRules.length === 0) {
    throw new Error(
      'Could not find Local config exclude block in scripts/sync-to-release.sh — no directory rules extracted',
    );
  }

  return dirRules.join('\n');
}

describe('sync-to-release rsync exclude rules', () => {
  let src: string;
  let dst: string;
  let excludeFile: string;

  beforeAll(async () => {
    // Resolve path to the script relative to this test file
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const scriptPath = resolve(thisDir, '../../../scripts/sync-to-release.sh');
    const scriptSource = await readFile(scriptPath, 'utf8');
    const excludes = extractLocalConfigExcludes(scriptSource);

    const work = await mkdtemp(join(tmpdir(), 'rsync-exclude-'));
    src = join(work, 'src');
    dst = join(work, 'dst');
    excludeFile = join(work, 'excludes.txt');
    await mkdir(join(src, '.claude-plugin'), { recursive: true });
    await mkdir(join(src, 'changedown-plugin/.claude-plugin'), { recursive: true });
    await writeFile(join(src, '.claude-plugin/marketplace.json'), '{"root":true}');
    await writeFile(
      join(src, 'changedown-plugin/.claude-plugin/plugin.json'),
      '{"name":"changedown","version":"0.4.7"}',
    );
    await writeFile(excludeFile, excludes);
  });

  afterAll(async () => {
    await rm(join(dst, '..'), { recursive: true, force: true });
  });

  it('strips root-level .claude-plugin/ but preserves nested changedown-plugin/.claude-plugin/', async () => {
    await execFileAsync('rsync', [
      '-a',
      `--exclude-from=${excludeFile}`,
      `${src}/`,
      `${dst}/`,
    ]);
    expect(existsSync(join(dst, '.claude-plugin/marketplace.json'))).toBe(false);
    expect(existsSync(join(dst, 'changedown-plugin/.claude-plugin/plugin.json'))).toBe(true);

    const nested = JSON.parse(
      await readFile(join(dst, 'changedown-plugin/.claude-plugin/plugin.json'), 'utf8'),
    );
    expect(nested.version).toBe('0.4.7');
  });
});
