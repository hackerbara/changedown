import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateLocalManifestText: vi.fn(),
  probeMcpHealth: vi.fn(async () => ({ ok: false, error: 'not running' })),
  detectAgents: vi.fn(() => []),
  resolveBin: vi.fn(() => undefined),
  resolvePackagedTool: vi.fn(() => ({ command: process.execPath, args: ['/p/cli.js'] })),
  runTool: vi.fn(() => 0),
  resolveManifestForDoctor: vi.fn(),
  readdir: vi.fn(async () => [
    'taskpane.html', 'commands.html', 'taskpane.js', 'polyfill.js',
    '189.js', 'df384c34b33d80a81ac4.css', 'manifest.xml',
  ] as unknown as import('node:fs').Dirent[]),
}));

vi.mock('../../../packages/cli/src/word/manifest.js', () => ({
  resolveManifestForDoctor: mocks.resolveManifestForDoctor,
  resolveManifest: vi.fn(),
  validateLocalManifestText: mocks.validateLocalManifestText,
  PACKAGED_LOCAL_MANIFEST_PATH: '/cli/word-pane/manifest.xml',
}));

vi.mock('../../../packages/cli/src/word/pane-server.js', () => ({
  PACKAGED_WORD_PANE_DIR: '/cli/word-pane',
  PACKAGED_LOCAL_MANIFEST_PATH: '/cli/word-pane/manifest.xml',
  LOCAL_PANE_ORIGIN: 'https://127.0.0.1:3000',
}));

vi.mock('../../../packages/cli/src/word/office-tools.js', () => ({
  resolveBin: mocks.resolveBin,
  resolvePackagedTool: mocks.resolvePackagedTool,
  runTool: mocks.runTool,
}));

vi.mock('@changedown/mcp/launcher', () => ({
  MCP_PORT: 39990,
  mcpStartGuidance: () => 'start mcp',
  preflightMcp: vi.fn(),
  preflightMcpFromOrigin: vi.fn(),
  probeMcpHealth: mocks.probeMcpHealth,
}));

vi.mock('../../../packages/cli/src/agents/setup.js', () => ({
  detectAgents: mocks.detectAgents,
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(async (p: string) => {
      if (String(p).endsWith('manifest.xml')) return '<OfficeApp>...</OfficeApp>';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    access: vi.fn(async () => {}),
    readdir: mocks.readdir,
  };
});

describe('word doctor — local pane mode coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default readdir returns a healthy set of files (entries + chunk + css).
    mocks.readdir.mockResolvedValue([
      'taskpane.html', 'commands.html', 'taskpane.js', 'polyfill.js',
      '189.js', 'df384c34b33d80a81ac4.css', 'manifest.xml',
    ] as unknown as import('node:fs').Dirent[]);
  });


  it('uses hosted manifest diagnostics by default', async () => {
    mocks.resolveManifestForDoctor.mockResolvedValue('/cached/hosted.xml');
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    await runWordDoctor({ cwd: '/repo' }, {});
    expect(mocks.resolveManifestForDoctor).toHaveBeenCalled();
    expect(mocks.validateLocalManifestText).not.toHaveBeenCalled();
  });

  it('validates the packaged local manifest when paneMode=local', async () => {
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runWordDoctor({ cwd: '/repo' }, { paneMode: 'local' });
      expect(mocks.validateLocalManifestText).toHaveBeenCalledWith(expect.stringContaining('OfficeApp'));
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('packaged local manifest'))).toBe(true);
      expect(lines.some((l) => l.includes('packaged word-pane assets'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('does NOT download the hosted manifest in local mode', async () => {
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    await runWordDoctor({ cwd: '/repo' }, { paneMode: 'local' });
    expect(mocks.resolveManifestForDoctor).not.toHaveBeenCalled();
  });

  it('flags missing webpack chunks (no .js beyond entry files)', async () => {
    mocks.readdir.mockResolvedValue([
      'taskpane.html', 'commands.html', 'taskpane.js', 'polyfill.js', 'manifest.xml',
    ] as unknown as import('node:fs').Dirent[]);
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = await runWordDoctor({ cwd: '/repo' }, { paneMode: 'local' });
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('✗') && l.includes('chunk'))).toBe(true);
      expect(code).not.toBe(0);
    } finally { log.mockRestore(); }
  });

  it('flags missing CSS file', async () => {
    mocks.readdir.mockResolvedValue([
      'taskpane.html', 'commands.html', 'taskpane.js', 'polyfill.js', '189.js', 'manifest.xml',
    ] as unknown as import('node:fs').Dirent[]);
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = await runWordDoctor({ cwd: '/repo' }, { paneMode: 'local' });
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('✗') && l.toLowerCase().includes('css'))).toBe(true);
      expect(code).not.toBe(0);
    } finally { log.mockRestore(); }
  });

  it('uses hosted branch when --manifest is passed without explicit --pane', async () => {
    mocks.resolveManifestForDoctor.mockResolvedValue('/cached/hosted.xml');
    const { runWordDoctor } = await import('../../../packages/cli/src/word/doctor.js');
    await runWordDoctor({ cwd: '/repo' }, { manifest: 'https://cdn.example/manifest.xml' });
    expect(mocks.resolveManifestForDoctor).toHaveBeenCalled();
    expect(mocks.validateLocalManifestText).not.toHaveBeenCalled();
  });
});
