// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { patchWorkbench, unpatchWorkbench, isPatchInstalled, PATCH_MARKER } from '../installer.js';

describe('workbench patcher', () => {
  let tempDir: string;
  let workbenchPath: string;
  const originalContent = '/* workbench CSS content */\n.some-class { color: red; }';

  beforeEach(async () => {
    tempDir = join(tmpdir(), `ct-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    workbenchPath = join(tempDir, 'workbench.desktop.main.js');
    await fs.writeFile(workbenchPath, originalContent);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects unpatched workbench', async () => {
    expect(await isPatchInstalled(workbenchPath)).toBe(false);
  });

  it('patches workbench with script and CSS imports', async () => {
    await patchWorkbench(workbenchPath, '/ext/dist/lexical-bridge.js', '/ext/css/lexical.css');
    const content = await fs.readFile(workbenchPath, 'utf8');
    expect(content).toContain(PATCH_MARKER);
    expect(content).toContain('/ext/dist/lexical-bridge.js');
    expect(content).toContain('/ext/css/lexical.css');
    expect(await isPatchInstalled(workbenchPath)).toBe(true);
  });

  it('creates a backup before patching', async () => {
    await patchWorkbench(workbenchPath, '/ext/dist/lexical-bridge.js', '/ext/css/lexical.css');
    const backupPath = workbenchPath + '.ct-backup';
    const backup = await fs.readFile(backupPath, 'utf8');
    expect(backup).toBe(originalContent);
  });

  it('unpatches workbench and restores original', async () => {
    await patchWorkbench(workbenchPath, '/ext/dist/lexical-bridge.js', '/ext/css/lexical.css');
    await unpatchWorkbench(workbenchPath);
    const content = await fs.readFile(workbenchPath, 'utf8');
    expect(content).not.toContain(PATCH_MARKER);
    expect(content).toBe(originalContent);
    expect(await isPatchInstalled(workbenchPath)).toBe(false);
  });

  it('re-patches when already patched (idempotent)', async () => {
    await patchWorkbench(workbenchPath, '/old/bridge.js', '/old/lexical.css');
    await patchWorkbench(workbenchPath, '/new/bridge.js', '/new/lexical.css');
    const content = await fs.readFile(workbenchPath, 'utf8');
    expect(content).toContain('/new/bridge.js');
    expect(content).not.toContain('/old/bridge.js');
  });
});
