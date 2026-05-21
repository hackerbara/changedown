import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveManifestForDoctor: vi.fn(),
  resolveManifest: vi.fn(),
  probeMcpHealth: vi.fn(),
  preflightMcp: vi.fn(),
  preflightMcpFromOrigin: vi.fn(),
  detectAgents: vi.fn(),
}));

vi.mock('../../../packages/cli/src/word/manifest.js', () => ({
  resolveManifestForDoctor: mocks.resolveManifestForDoctor,
  resolveManifest: mocks.resolveManifest,
}));

vi.mock('../../../packages/cli/src/word/office-tools.js', () => ({
  resolveBin: vi.fn(() => undefined),
  resolvePackagedTool: vi.fn(() => ({ command: process.execPath, args: ['/repo/node_modules/office-tool/cli.js'] })),
  runTool: vi.fn(() => 0),
}));

vi.mock('@changedown/mcp/launcher', () => ({
  MCP_PORT: 39990,
  mcpStartGuidance: () => 'Start your configured agent to launch ChangeDown MCP.',
  preflightMcp: mocks.preflightMcp,
  preflightMcpFromOrigin: mocks.preflightMcpFromOrigin,
  probeMcpHealth: mocks.probeMcpHealth,
}));

vi.mock('../../../packages/cli/src/agents/setup.js', () => ({
  detectAgents: mocks.detectAgents,
}));

import { runWordDoctor } from '../../../packages/cli/src/word/doctor.js';

describe('word doctor hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveManifest.mockRejectedValue(Object.assign(new Error('unexpected old resolver'), { code: 'ERR_OLD_RESOLVER' }));
    mocks.resolveManifestForDoctor.mockRejectedValue(Object.assign(new Error('ENOENT: missing cache'), { code: 'ENOENT' }));
    mocks.probeMcpHealth.mockResolvedValue({ ok: false, error: 'connect ECONNREFUSED 127.0.0.1:39990' });
    mocks.preflightMcp.mockResolvedValue({});
    mocks.preflightMcpFromOrigin.mockResolvedValue({});
    mocks.detectAgents.mockReturnValue([
      { name: 'codex', detected: true, configured: false },
      { name: 'claude', detected: false, configured: true },
    ]);
  });

  it('reports missing no-download cache and absent MCP as non-fatal during dry-run doctor', async () => {
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };

    try {
      const code = await runWordDoctor({ cwd: '/repo' }, { dryRun: true, noDownload: true, paneMode: 'hosted' });

      expect(code).toBe(0);
      expect(mocks.resolveManifestForDoctor).toHaveBeenCalledWith(undefined, true);
      expect(mocks.probeMcpHealth).toHaveBeenCalledWith(1500, 'https');
      expect(mocks.probeMcpHealth).toHaveBeenCalledWith(800, 'http');
      expect(mocks.preflightMcp).not.toHaveBeenCalled();
      expect(mocks.preflightMcpFromOrigin).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('hosted manifest cache');
      expect(logs.join('\n')).toContain('missing cache');
      expect(logs.join('\n')).toContain('MCP loopback health');
      expect(logs.join('\n')).toContain('skipping MCP preflight checks');
      expect(logs.join('\n')).toContain('agent codex');
      expect(logs.join('\n')).toContain('agent claude');
    } finally {
      console.log = previousLog;
      vi.restoreAllMocks();
    }
  });

  it('checks hosted and hostile origins only when MCP is healthy', async () => {
    mocks.resolveManifestForDoctor.mockResolvedValue('/cache/manifest.hosted.xml');
    mocks.probeMcpHealth.mockResolvedValue({ ok: true, service: 'changedown-mcp' });
    mocks.preflightMcp.mockResolvedValue({
      'access-control-allow-origin': 'https://changedown.com',
      'access-control-allow-private-network': 'true',
    });
    mocks.preflightMcpFromOrigin.mockResolvedValue({});

    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };

    try {
      const code = await runWordDoctor({ cwd: '/repo' }, { dryRun: true, noDownload: true, paneMode: 'hosted' });

      expect(code).toBe(0);
      expect(mocks.preflightMcp).toHaveBeenCalledOnce();
      expect(mocks.preflightMcpFromOrigin).toHaveBeenCalledWith('https://evil.example', '/backend/register', 1500, 'https');
      expect(logs.join('\n')).toContain('MCP hostile-origin rejection');
    } finally {
      console.log = previousLog;
      vi.restoreAllMocks();
    }
  });

  it('fails doctor when HTTPS mode finds an old HTTP bridge on the fixed port', async () => {
    mocks.resolveManifestForDoctor.mockResolvedValue('/cache/manifest.hosted.xml');
    mocks.probeMcpHealth
      .mockResolvedValueOnce({ ok: false, error: 'wrong version number' })
      .mockResolvedValueOnce({ ok: true, service: 'changedown-mcp' });

    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };

    try {
      const code = await runWordDoctor({ cwd: '/repo' }, { dryRun: true, noDownload: true, paneMode: 'hosted' });

      expect(code).toBe(1);
      expect(logs.join('\n')).toContain('MCP HTTPS loopback');
      expect(logs.join('\n')).toContain('HTTP bridge');
    } finally {
      console.log = previousLog;
      vi.restoreAllMocks();
    }
  });
});

describe('resolveManifestForDoctor no-download manifest handling', () => {
  it('rejects HTTPS manifest input under noDownload before fetching or writing cache', async () => {
    vi.resetModules();
    const get = vi.fn(() => {
      throw new Error('network fetch should not be attempted');
    });
    const writeFile = vi.fn(() => {
      throw new Error('cache write should not be attempted');
    });
    vi.doMock('node:https', () => ({ get }));
    vi.doMock('node:fs/promises', () => ({
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile,
    }));

    try {
      const actual = await vi.importActual<typeof import('../../../packages/cli/src/word/manifest.js')>(
        '../../../packages/cli/src/word/manifest.js',
      );

      await expect(actual.resolveManifestForDoctor('https://example.invalid/manifest.xml', true))
        .rejects.toThrow(/--no-download.*HTTPS manifest/i);

      expect(get).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('node:https');
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
  });
});
