import { describe, it, expect } from 'vitest';
import { parseGlobalArgs } from 'changedown/cli-parse';

describe('parseGlobalArgs', () => {
  it('extracts command and subargs from argv', () => {
    const result = parseGlobalArgs(['propose', '--file', 'foo.md', '--old', 'hello']);
    expect(result.command).toBe('propose');
    expect(result.subArgs).toEqual(['--file', 'foo.md', '--old', 'hello']);
  });

  it('defaults to json output format', () => {
    const result = parseGlobalArgs(['read', 'file.md']);
    expect(result.outputFormat).toBe('json');
  });

  it('--pretty sets output format (flag before command)', () => {
    const result = parseGlobalArgs(['--pretty', 'read', 'file.md']);
    expect(result.outputFormat).toBe('pretty');
    expect(result.command).toBe('read');
    expect(result.subArgs).toEqual(['file.md']);
  });

  it('--quiet sets output format', () => {
    const result = parseGlobalArgs(['--quiet', 'propose', '--file', 'x.md']);
    expect(result.outputFormat).toBe('quiet');
    expect(result.command).toBe('propose');
    expect(result.subArgs).toEqual(['--file', 'x.md']);
  });

  it('--project-dir is extracted', () => {
    const result = parseGlobalArgs(['--project-dir', '/tmp/myproject', 'status']);
    expect(result.projectDir).toBe('/tmp/myproject');
    expect(result.command).toBe('status');
    expect(result.subArgs).toEqual([]);
  });

  it('--help returns help command', () => {
    const result = parseGlobalArgs(['--help']);
    expect(result.command).toBe('help');
  });

  it('no args returns help command', () => {
    const result = parseGlobalArgs([]);
    expect(result.command).toBe('help');
  });

  // ── Flexible flag ordering (Phase 3) ──────────────────────────

  it('--pretty after command is hoisted', () => {
    const result = parseGlobalArgs(['propose', 'file.md', '--old', 'x', '--pretty']);
    expect(result.outputFormat).toBe('pretty');
    expect(result.command).toBe('propose');
    expect(result.subArgs).toEqual(['file.md', '--old', 'x']);
  });

  it('--json between command and subargs is hoisted', () => {
    const result = parseGlobalArgs(['read', '--json', 'file.md']);
    expect(result.outputFormat).toBe('json');
    expect(result.command).toBe('read');
    expect(result.subArgs).toEqual(['file.md']);
  });

  it('--project-dir after command is hoisted', () => {
    const result = parseGlobalArgs(['status', '--project-dir', '/tmp/p']);
    expect(result.projectDir).toBe('/tmp/p');
    expect(result.command).toBe('status');
    expect(result.subArgs).toEqual([]);
  });

  it('--help after command stays in subArgs for per-command help', () => {
    const result = parseGlobalArgs(['propose', '--help']);
    expect(result.command).toBe('propose');
    expect(result.subArgs).toContain('--help');
  });

  it('--help before command triggers global help', () => {
    const result = parseGlobalArgs(['--help', 'propose']);
    expect(result.command).toBe('help');
  });

  it('multiple trailing flags all hoisted', () => {
    const result = parseGlobalArgs(['list', 'docs/', '--quiet', '--project-dir', '/tmp']);
    expect(result.outputFormat).toBe('quiet');
    expect(result.projectDir).toBe('/tmp');
    expect(result.command).toBe('list');
    expect(result.subArgs).toEqual(['docs/']);
  });
});
