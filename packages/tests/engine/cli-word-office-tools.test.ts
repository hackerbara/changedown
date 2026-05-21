import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const officeDebugging = vi.hoisted(() => ({
  startDebugging: vi.fn(async () => {}),
  stopDebugging: vi.fn(async () => {}),
}));

vi.mock('office-addin-debugging', () => ({
  AppType: { Desktop: 'desktop' },
  startDebugging: officeDebugging.startDebugging,
  stopDebugging: officeDebugging.stopDebugging,
}));

import {
  fallbackCommand,
  pathCandidates,
  resolvePackagedTool,
  runOfficeDebugStart,
  runTool,
} from '../../../packages/cli/src/word/office-tools.js';

describe('Word office tool command resolution', () => {
  it('includes Windows npm .cmd shims for local bins and PATH bins', () => {
    const candidates = pathCandidates('npx', 'C:\\repo', 'C:\\Users\\me\\AppData\\Roaming\\npm', 'win32');

    expect(candidates[0]).toBe(path.join('C:\\repo', 'node_modules', '.bin', 'npx.cmd'));
    expect(candidates).toContain(path.join('C:\\Users\\me\\AppData\\Roaming\\npm', 'npx.cmd'));
  });

  it('falls back to npx.cmd on Windows when no npx executable is resolved', () => {
    expect(fallbackCommand('npx', 'win32')).toBe('npx.cmd');
  });

  it('keeps Unix fallback command extensionless', () => {
    expect(fallbackCommand('npx', 'darwin')).toBe('npx');
  });

  it('resolves bundled Office add-in tools through node instead of nested npx', () => {
    const tool = resolvePackagedTool('office-addin-manifest');

    expect(tool?.command).toBe(process.execPath);
    expect(tool?.args[0]).toMatch(/office-addin-manifest[/\\]cli\.js$/);
  });

  it('prefers the bundled Office add-in CLI over npm shims', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runTool('office-addin-manifest', ['--version'], { cwd: process.cwd(), dryRun: true });
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0]?.[0]);
      expect(line).toContain(process.execPath);
      expect(line).toMatch(/office-addin-manifest[/\\]cli\.js --version/);
      expect(line).not.toContain('node_modules/.bin/office-addin-manifest');
      expect(line).not.toContain('node_modules\\.bin\\office-addin-manifest');
    } finally {
      log.mockRestore();
    }
  });

  it('surfaces Word sideload failures from the Office debugging library', async () => {
    const err = new Error('Unable to sideload the Office Add-in');
    officeDebugging.startDebugging.mockRejectedValueOnce(err);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = await runOfficeDebugStart('C:\\manifest.xml', { cwd: 'C:\\repo' });

      expect(code).toBe(1);
      expect(officeDebugging.startDebugging).toHaveBeenCalledWith('C:\\manifest.xml', expect.objectContaining({
        appType: 'desktop',
        enableLiveReload: false,
        enableSideload: true,
      }));
      expect(String(error.mock.calls[0]?.[0])).toContain('Unable to start Word sideload');
    } finally {
      error.mockRestore();
    }
  });
});
