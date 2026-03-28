import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from 'changedown-hooks/internals';

describe('loadConfig - policy section', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-hooks-shared-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    configPath = path.join(scDir, 'config.toml');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults to safety-net when [policy] is absent', async () => {
    await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('safety-net');
  });

  it('parses policy.mode = "strict"', async () => {
    await fs.writeFile(configPath, '[policy]\nmode = "strict"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('strict');
  });

  it('parses policy.mode = "permissive"', async () => {
    await fs.writeFile(configPath, '[policy]\nmode = "permissive"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('permissive');
  });

  it('parses policy.mode = "safety-net"', async () => {
    await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('safety-net');
  });

  it('falls back to safety-net for invalid mode', async () => {
    await fs.writeFile(configPath, '[policy]\nmode = "garbage"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('safety-net');
  });

  it('derives strict from legacy hooks.enforcement = "block" when no [policy]', async () => {
    await fs.writeFile(configPath, '[hooks]\nenforcement = "block"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('strict');
  });

  it('derives safety-net from legacy hooks.enforcement = "warn" when no [policy]', async () => {
    await fs.writeFile(configPath, '[hooks]\nenforcement = "warn"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('safety-net');
  });

  it('policy.mode takes precedence over hooks.enforcement', async () => {
    await fs.writeFile(configPath, '[policy]\nmode = "permissive"\n\n[hooks]\nenforcement = "block"\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.policy.mode).toBe('permissive');
  });

  it('parses creation_tracking from policy section', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[policy]\nmode = "safety-net"\ncreation_tracking = "footnote"\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.policy.creation_tracking).toBe('footnote');
  });

  it('defaults creation_tracking to "footnote" when not specified', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[policy]\nmode = "safety-net"\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.policy.creation_tracking).toBe('footnote');
  });

  it('accepts creation_tracking = "none"', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[policy]\nmode = "safety-net"\ncreation_tracking = "none"\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.policy.creation_tracking).toBe('none');
  });

  it('accepts creation_tracking = "inline"', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[policy]\nmode = "safety-net"\ncreation_tracking = "inline"\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.policy.creation_tracking).toBe('inline');
  });
});
