import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleRawEdit } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';

describe('handleRawEdit', () => {
  let tmpDir: string;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-raw-edit-test-'));
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: true,
      },
      author: {
        default: 'ai:claude-opus-4.6',
        enforcement: 'optional',
      },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: false, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('missing reason: returns isError with message', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleRawEdit(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/reason|bypass/i);
  });

  it('empty reason: returns isError', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleRawEdit(
      { file: filePath, old_text: 'Hello', new_text: 'Hi', reason: '   ' },
      resolver
    );

    expect(result.isError).toBe(true);
  });

  it('missing file: returns isError', async () => {
    const result = await handleRawEdit(
      { old_text: 'a', new_text: 'b', reason: 'test' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/file/i);
  });

  it('file not found: returns isError', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleRawEdit(
      { file: filePath, old_text: 'a', new_text: 'b', reason: 'fixing corruption' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|ENOENT|unreadable/i);
  });

  it('old_text not found: returns isError', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleRawEdit(
      { file: filePath, old_text: 'xyz', new_text: 'replacement', reason: 'maintenance' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|ambiguous/i);
  });

  it('ambiguous old_text (multiple occurrences): returns isError', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'foo and foo');

    const result = await handleRawEdit(
      { file: filePath, old_text: 'foo', new_text: 'bar', reason: 'maintenance' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/multiple|ambiguous/i);
  });

  it('success: updates file and returns raw_edit result with warning', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await handleRawEdit(
      {
        file: filePath,
        old_text: 'quick brown',
        new_text: 'slow red',
        reason: 'fixing corrupted markup',
      },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.file).toBe(path.relative(tmpDir, filePath));
    expect(data.raw_edit).toBe(true);
    expect(data.reason).toBe('fixing corrupted markup');
    expect(data.warning).toBe('This edit is untracked.');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toBe('The slow red fox.');
  });

  it('success with no markup in old_text: warning is only untracked', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Plain text only.');

    const result = await handleRawEdit(
      {
        file: filePath,
        old_text: 'Plain text',
        new_text: 'Simple text',
        reason: 'maintenance',
      },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toBe('This edit is untracked.');
  });

  it('success with markup in old_text: warning includes removal of annotations and footnotes', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Before {++added++}[^ct-1] and {--removed--}[^ct-2] after.\n\n[^ct-1]: @a | 2026-02-11 | ins | proposed\n[^ct-2]: @a | 2026-02-11 | del | proposed';
    await fs.writeFile(filePath, content);

    const result = await handleRawEdit(
      {
        file: filePath,
        old_text: '{++added++}[^ct-1] and {--removed--}[^ct-2]',
        new_text: 'replaced',
        reason: 'cleanup',
      },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toContain('This edit is untracked.');
    expect(data.warning).toContain('WARNING:');
    expect(data.warning).toContain('2 CriticMarkup annotation(s)');
    expect(data.warning).toContain('2 footnote(s)');
    expect(data.warning).toContain("file's deliberation history");
  });

  it('success with only footnotes in old_text: warning mentions footnotes only', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Text [^ct-1] and [^ct-2] here.');

    const result = await handleRawEdit(
      {
        file: filePath,
        old_text: '[^ct-1] and [^ct-2]',
        new_text: '',
        reason: 'removing refs',
      },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toContain('0 CriticMarkup annotation(s)');
    expect(data.warning).toContain('2 footnote(s)');
    expect(data.warning).toContain("deliberation history");
  });

  it('success with only markup in old_text: warning mentions annotations only', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'A {~~old~>new~~} B.');

    const result = await handleRawEdit(
      {
        file: filePath,
        old_text: '{~~old~>new~~}',
        new_text: 'fixed',
        reason: 'fixing substitution',
      },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.warning).toContain('1 CriticMarkup annotation(s)');
    expect(data.warning).toContain('0 footnote(s)');
    expect(data.warning).toContain("deliberation history");
  });
});
