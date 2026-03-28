import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changedown/core';
import { runCommand } from 'changedown/cli-runner';
import { formatResult } from 'changedown/cli-output';

describe('CLI end-to-end workflow', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-e2e-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n[author]\ndefault = "ai:e2e-test"\n[hashline]\nenabled = true\n[settlement]\nauto_on_approve = false\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('full agent workflow: read → propose → list → respond → review', async () => {
    const filePath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(filePath, '# API Spec\n\ntimeout = 30\nretry = false\n');

    // 1. Read file
    const readResult = await runCommand('read', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(readResult.success).toBe(true);
    expect(readResult.rawText).toContain('timeout = 30');

    // 2. Propose a change
    const proposeResult = await runCommand('propose', [
      filePath,
      '--old', 'timeout = 30',
      '--new', 'timeout = 60',
      '--reason', 'increase for slow networks',
    ], { outputFormat: 'json', projectDir: tmpDir });
    expect(proposeResult.success).toBe(true);
    expect(proposeResult.data.change_id).toBe('cn-1');

    // 3. List open threads
    const listResult = await runCommand('list', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(listResult.success).toBe(true);

    // 4. Respond to thread
    const respondResult = await runCommand('respond', [
      filePath, 'cn-1', 'Verified: 60s handles 99th percentile latency',
    ], { outputFormat: 'json', projectDir: tmpDir });
    expect(respondResult.success).toBe(true);

    // 5. Review (approve)
    const reviewResult = await runCommand('review', [
      filePath,
      '--reviews', JSON.stringify([
        { change_id: 'cn-1', decision: 'approve', reason: 'verified by load test' },
      ]),
    ], { outputFormat: 'json', projectDir: tmpDir });
    expect(reviewResult.success).toBe(true);

    // 6. Verify file state — CriticMarkup still present (auto_on_approve = false)
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('timeout = 60');
    expect(finalContent).toContain('increase for slow networks');
    // The approval should be recorded in the footnote
    expect(finalContent).toContain('approved:');
  });

  it('output formats produce valid output', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'hello world');

    const result = await runCommand('propose', [
      filePath, '--old', 'hello', '--new', 'goodbye', '--reason', 'test',
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(true);

    // JSON format: parseable
    const jsonOut = formatResult(result, 'json');
    expect(() => JSON.parse(jsonOut)).not.toThrow();

    // Pretty format: human readable
    const prettyOut = formatResult(result, 'pretty');
    expect(prettyOut).toContain('cn-1');

    // Quiet format: minimal
    const quietOut = formatResult(result, 'quiet');
    expect(quietOut.trim()).toBe('cn-1');
  });

  it('error propagation: missing file returns error', async () => {
    const result = await runCommand('read', [
      path.join(tmpDir, 'nonexistent.md'),
    ], { outputFormat: 'json', projectDir: tmpDir });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it('unknown command returns UNKNOWN_COMMAND', async () => {
    const result = await runCommand('foobar', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('UNKNOWN_COMMAND');
  });

  it('per-command --help returns usage text without executing', async () => {
    // propose --help should return usage text, not attempt to run the command
    const proposeHelp = await runCommand('propose', ['--help'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(proposeHelp.success).toBe(true);
    expect(proposeHelp.rawText).toContain('Usage: sc propose');
    expect(proposeHelp.rawText).toContain('--old TEXT');

    // status --help
    const statusHelp = await runCommand('status', ['--help'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(statusHelp.success).toBe(true);
    expect(statusHelp.rawText).toContain('Usage: sc status');

    // group --help
    const groupHelp = await runCommand('group', ['--help'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(groupHelp.success).toBe(true);
    expect(groupHelp.rawText).toContain('Usage: sc group');
    expect(groupHelp.rawText).toContain('begin');
    expect(groupHelp.rawText).toContain('end');
  });
});
