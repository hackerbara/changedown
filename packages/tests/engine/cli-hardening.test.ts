import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';
import { formatResult } from 'changetracks/cli-output';

let tmpDir: string;

function makeTrackedFile(body: string, footnotes: string = ''): string {
  return `<!-- ctrcks.com/v1: tracked -->\n${body}${footnotes ? '\n\n' + footnotes : ''}`;
}

beforeAll(async () => {
  await initHashline();
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-hardening-'));
  const configDir = path.join(tmpDir, '.changetracks');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'config.toml'),
    '[tracking]\ninclude = ["**/*.md"]\n[author]\ndefault = "ai:test"\nenforcement = "optional"\n[settlement]\nauto_on_approve = true\nauto_on_reject = true\n',
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Bug 1: flag values starting with a dash
// ---------------------------------------------------------------------------

describe('Bug 1: flag values starting with dash', () => {
  it('--old with leading dash works via commander', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('- Item 1\n- Item 2'));

    const result = await runCommand('propose', [
      filePath, '--old', '- Item 1', '--new', '- Updated Item 1', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    // The substitution markup should appear
    expect(content).toContain('{~~');
    expect(content).toContain('Updated Item 1');
  });

  it('--new with leading dash works via commander', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('Some text'));

    const result = await runCommand('propose', [
      filePath, '--new', '- New list item', '--insert-after', 'Some text', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('- New list item');
  });
});

// ---------------------------------------------------------------------------
// Bug 2: list --pretty formatting
// ---------------------------------------------------------------------------

describe('Bug 2: list --pretty formatting', () => {
  it('list --pretty returns formatted table, not raw JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The quick brown fox.'));

    await runCommand('propose', [
      filePath, '--old', 'quick', '--new', 'slow', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    const result = await runCommand('list', [tmpDir], {
      outputFormat: 'json', projectDir: tmpDir,
    });

    expect(result.success).toBe(true);
    // result.message is the summarizeItems() table (always built this way)
    expect(result.message).toContain('ct-1');
    expect(result.message).not.toMatch(/^\[/);  // not a raw JSON array

    // Also verify formatResult('pretty') produces the formatted output
    const prettyOutput = formatResult(result, 'pretty');
    expect(prettyOutput).toContain('ct-1');
    expect(prettyOutput).not.toMatch(/^\[/);
  });
});

// ---------------------------------------------------------------------------
// Bug 4: review --settle flag
// ---------------------------------------------------------------------------

describe('Bug 4: review --settle flag', () => {
  it('review with --settle flag works (convenience mode)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The quick brown fox.'));

    await runCommand('propose', [
      filePath, '--old', 'quick', '--new', 'slow', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    const result = await runCommand('review', [
      filePath, 'ct-1', '--decision', 'approve', '--reason', 'Good', '--settle', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    // With auto_on_approve = true and --settle, the markup should be removed
    const content = await fs.readFile(filePath, 'utf-8');
    // The settled result should have the accepted text without CriticMarkup
    expect(content).toContain('slow');
    expect(content).not.toContain('{~~');
  });
});

// ---------------------------------------------------------------------------
// Bug 5: idempotent review
// ---------------------------------------------------------------------------

describe('Bug 5: idempotent review', () => {
  it('re-approving accepted change produces no duplicate approved: line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile(
      'Hello {++world++}[^ct-1]',
      '[^ct-1]: @ai:test | 2026-02-18 | ins | proposed',
    ));

    await runCommand('review', [
      filePath, 'ct-1', '--decision', 'approve', '--reason', 'OK', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    const result = await runCommand('review', [
      filePath, 'ct-1', '--decision', 'approve', '--reason', 'Again', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    const approvalCount = (content.match(/approved:/g) || []).length;
    expect(approvalCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ergonomics: review convenience flags
// ---------------------------------------------------------------------------

describe('Ergonomics: review convenience flags', () => {
  it('sc review <file> <id> --decision approve works without --reviews JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile(
      'Hello {++world++}[^ct-1]',
      '[^ct-1]: @ai:test | 2026-02-18 | ins | proposed',
    ));

    const result = await runCommand('review', [
      filePath, 'ct-1', '--decision', 'approve', '--reason', 'LGTM', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('approved:');
  });

  it('providing both change_id and --reviews returns USAGE_ERROR', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('Hello world.'));

    const result = await runCommand('review', [
      filePath, 'ct-1', '--reviews', '[{"change_id":"ct-1","decision":"approve","reason":"OK"}]', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    // Should fail with USAGE_ERROR (both modes provided)
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Ergonomics: amend --new alias
// ---------------------------------------------------------------------------

describe('Ergonomics: amend --new alias', () => {
  it('amend with --new works identically to --new-text', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The quick brown fox.'));

    await runCommand('propose', [
      filePath, '--old', 'quick', '--new', 'slow', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    const result = await runCommand('amend', [
      filePath, 'ct-1', '--new', 'fast', '--reason', 'Changed mind', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('fast');
    // The substitution markup should show the amended new text
    expect(content).toContain('{~~');
  });
});

// ---------------------------------------------------------------------------
// Bug 7: delimiter padding
// ---------------------------------------------------------------------------

describe('Bug 7: delimiter padding via CLI', () => {
  it('propose deletion starting with dash via CLI produces {-- not {---', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('- Item 1\n- Item 2'));

    const result = await runCommand('propose', [
      filePath, '--old', '- Item 1\n', '--new', '', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    // Should NOT have triple-dash (---) which would be an unpadded delimiter collision
    expect(content).not.toMatch(/\{---/);
    // Should use space-padded delimiter
    expect(content).toMatch(/\{-- /);
  });
});

// ---------------------------------------------------------------------------
// Bug 8: insert-after newline
// ---------------------------------------------------------------------------

describe('Bug 8: insert-after newline via CLI', () => {
  it('insert-after a list item inserts on new line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('- Item 1\n- Item 2\n- Item 3'));

    const result = await runCommand('propose', [
      filePath, '--new', '- Item 4', '--insert-after', '- Item 3', '--author', 'ai:test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    // The insertion should be on a new line after Item 3
    expect(content).toContain('- Item 3\n{++');
    expect(content).not.toContain('- Item 3{++');
  });
});
