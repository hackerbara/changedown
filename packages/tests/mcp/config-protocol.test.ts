import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, type ChangeTracksConfig } from '@changetracks/mcp/internals';

describe('protocol config section', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-config-protocol-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults to classic mode when [protocol] section is absent', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n',
    );
    const config = await loadConfig(tmpDir);
    expect(config.protocol.mode).toBe('classic');
    expect(config.protocol.level).toBe(2);
    expect(config.protocol.reasoning).toBe('optional');
    expect(config.protocol.batch_reasoning).toBe('optional');
  });

  it('parses compact mode from TOML', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[protocol]\nmode = "compact"\nlevel = 1\nreasoning = "optional"\n',
    );
    const config = await loadConfig(tmpDir);
    expect(config.protocol.mode).toBe('compact');
    expect(config.protocol.level).toBe(1);
    expect(config.protocol.reasoning).toBe('optional');
  });

  it('rejects invalid mode values, falls back to default', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[protocol]\nmode = "invalid"\n',
    );
    const config = await loadConfig(tmpDir);
    expect(config.protocol.mode).toBe('classic');
  });
});

// Task 2: Environment variable override
import { resolveProtocolMode } from '@changetracks/mcp/internals';

describe('resolveProtocolMode', () => {
  const originalEnv = process.env['CHANGETRACKS_PROTOCOL_MODE'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['CHANGETRACKS_PROTOCOL_MODE'];
    } else {
      process.env['CHANGETRACKS_PROTOCOL_MODE'] = originalEnv;
    }
  });

  it('returns config value when env var is not set', () => {
    delete process.env['CHANGETRACKS_PROTOCOL_MODE'];
    expect(resolveProtocolMode('compact')).toBe('compact');
  });

  it('env var overrides config value', () => {
    process.env['CHANGETRACKS_PROTOCOL_MODE'] = 'compact';
    expect(resolveProtocolMode('classic')).toBe('compact');
  });

  it('ignores invalid env var values', () => {
    process.env['CHANGETRACKS_PROTOCOL_MODE'] = 'invalid';
    expect(resolveProtocolMode('classic')).toBe('classic');
  });
});
