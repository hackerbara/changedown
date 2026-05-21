import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../packages/cli/src/word/manifest.js', () => ({
  resolveManifest: vi.fn(async () => '/tmp/manifest.xml'),
}));

vi.mock('../../../packages/cli/src/word/office-tools.js', () => ({
  runTool: vi.fn(() => 0),
  runOfficeDebugStart: vi.fn(async () => 0),
  runOfficeDebugStop: vi.fn(async () => 0),
}));

vi.mock('../../../packages/cli/src/word/state.js', () => ({
  writeWordSession: vi.fn(async () => {}),
  clearWordSession: vi.fn(async () => {}),
}));

vi.mock('../../../packages/cli/src/agents/setup.js', () => ({
  setupAgentIntegrations: vi.fn(async () => [
    { agent: 'codex', status: 'manual-action', message: 'Codex needs manual setup' },
  ]),
}));

vi.mock('@changedown/mcp/launcher', () => ({
  MCP_HEALTH_URL: 'https://127.0.0.1:39990/health',
  MCP_PORT: 39990,
  probeMcpHealth: vi.fn(async () => ({ ok: false, error: 'connect ECONNREFUSED 127.0.0.1:39990' })),
  preflightMcp: vi.fn(),
  startMcpIfNeeded: vi.fn(async () => ({ owned: false })),
  mcpStartGuidance: () => [
    'Start your configured agent to launch ChangeDown MCP;',
    'the Word pane can load now and will auto-connect when the agent starts MCP.',
  ].join(' '),
}));

import { setupAgentIntegrations } from '../../../packages/cli/src/agents/setup.js';
import { resolveManifest } from '../../../packages/cli/src/word/manifest.js';
import { runTool } from '../../../packages/cli/src/word/office-tools.js';
import { runWordStart } from '../../../packages/cli/src/word/start.js';
import { probeMcpHealth, startMcpIfNeeded } from '@changedown/mcp/launcher';
import { clearWordSession, writeWordSession } from '../../../packages/cli/src/word/state.js';

describe('word start MCP and agent setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not own MCP and configures detected agents during dry-run startup', async () => {
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };
    try {
      const code = await runWordStart(
        { cwd: '/repo' },
        { dryRun: true, noValidate: true, noSideload: true },
      );

      expect(code).toBe(0);
      expect(resolveManifest).toHaveBeenCalledWith(undefined, true, { mcpScheme: 'https', paneMode: 'hosted' });
      expect(probeMcpHealth).toHaveBeenCalledWith(1500, 'https');
      expect(runTool).toHaveBeenCalledWith('office-addin-dev-certs', ['install'], expect.objectContaining({
        cwd: '/repo',
        dryRun: true,
      }));
      expect(startMcpIfNeeded).not.toHaveBeenCalled();
      expect(setupAgentIntegrations).toHaveBeenCalledWith(expect.objectContaining({
        cwd: '/repo',
        mode: 'word',
        include: 'detected',
        dryRun: true,
      }));
      expect(writeWordSession).not.toHaveBeenCalled();
      expect(clearWordSession).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('ChangeDown MCP bridge is not running yet. Start your configured agent');
      expect(logs.join('\n')).toContain('○ Codex needs manual setup');
    } finally {
      console.log = previousLog;
    }
  });

  it('does not register process signal handlers during dry-run startup', async () => {
    const sigintBefore = process.listenerCount('SIGINT');
    const sigtermBefore = process.listenerCount('SIGTERM');

    const code = await runWordStart(
      { cwd: '/repo' },
      { dryRun: true, noValidate: true, noSideload: true, noAgents: true },
    );

    expect(code).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
  });

  it('skips agent setup with --no-agents', async () => {
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };
    try {
      const code = await runWordStart(
        { cwd: '/repo' },
        { dryRun: true, noValidate: true, noSideload: true, noAgents: true },
      );

      expect(code).toBe(0);
      expect(setupAgentIntegrations).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('Skipping agent setup (--no-agents).');
    } finally {
      console.log = previousLog;
    }
  });


  it('uses HTTPS dev cert mode by default', async () => {
    const code = await runWordStart(
      { cwd: '/repo' },
      { dryRun: true, noValidate: true, noSideload: true, noAgents: true },
    );

    expect(code).toBe(0);
    expect(resolveManifest).toHaveBeenCalledWith(undefined, true, { mcpScheme: 'https', paneMode: 'hosted' });
    expect(runTool).toHaveBeenCalledWith('office-addin-dev-certs', ['install'], expect.objectContaining({
      cwd: '/repo',
      dryRun: true,
    }));
    expect(probeMcpHealth).toHaveBeenCalledWith(1500, 'https');
  });


  it('still supports the packaged local pane when requested explicitly', async () => {
    const code = await runWordStart(
      { cwd: '/repo' },
      { dryRun: true, noValidate: true, noSideload: true, noAgents: true, paneMode: 'local' },
    );

    expect(code).toBe(0);
    expect(resolveManifest).toHaveBeenCalledWith(undefined, true, { mcpScheme: 'https', paneMode: 'local' });
  });

  it('uses HTTP loopback only with --no-dev-certs diagnostic mode', async () => {
    const code = await runWordStart(
      { cwd: '/repo' },
      { dryRun: true, noValidate: true, noSideload: true, noAgents: true, noDevCerts: true },
    );

    expect(code).toBe(0);
    expect(resolveManifest).toHaveBeenCalledWith(undefined, true, { mcpScheme: 'http', paneMode: 'hosted' });
    expect(runTool).not.toHaveBeenCalledWith('office-addin-dev-certs', expect.anything(), expect.anything());
    expect(probeMcpHealth).toHaveBeenCalledWith(1500, 'http');
  });

  it('fails early when an old HTTP MCP bridge owns the HTTPS Word port', async () => {
    vi.mocked(probeMcpHealth)
      .mockResolvedValueOnce({ ok: false, error: 'wrong version number' })
      .mockResolvedValueOnce({ ok: true, service: 'changedown-mcp' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = await runWordStart(
        { cwd: '/repo' },
        { dryRun: true, noValidate: true, noSideload: true, noAgents: true },
      );

      expect(code).toBe(1);
      expect(probeMcpHealth).toHaveBeenCalledWith(1500, 'https');
      expect(probeMcpHealth).toHaveBeenCalledWith(800, 'http');
      expect(String(error.mock.calls[0]?.[0])).toContain('using HTTP');
    } finally {
      error.mockRestore();
    }
  });

  it('fails require-agents when detected setup needs manual action', async () => {
    const code = await runWordStart(
      { cwd: '/repo' },
      { dryRun: true, noValidate: true, noSideload: true, requireAgents: true },
    );

    expect(code).toBe(1);
  });
});
