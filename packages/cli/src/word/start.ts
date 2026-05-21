import { setupAgentIntegrations } from '../agents/setup.js';
import type { WordCommandContext, WordCommandOptions } from './types.js';
import { resolveManifest } from './manifest.js';
import { runOfficeDebugStart, runOfficeDebugStop, runTool } from './office-tools.js';
import { MCP_PORT, mcpStartGuidance, probeMcpHealth } from '@changedown/mcp/launcher';
import { clearWordSession, writeWordSession } from './state.js';
import { startLocalPaneServer, type LocalPaneServerHandle } from './pane-server.js';

function shouldUseDevCerts(options: WordCommandOptions): boolean {
  return options.noDevCerts ? false : true;
}

function mcpHealthUrl(useDevCerts: boolean): string {
  const scheme = useDevCerts ? 'https' : 'http';
  return `${scheme}://127.0.0.1:${MCP_PORT}/health`;
}

export async function runWordStart(ctx: WordCommandContext, options: WordCommandOptions): Promise<number> {
  const useDevCerts = shouldUseDevCerts(options);
  const paneMode = options.paneMode ?? 'hosted';
  const manifestPath = await resolveManifest(options.manifest, options.dryRun, {
    mcpScheme: useDevCerts ? 'https' : 'http',
    paneMode,
  });
  console.log(`${paneMode === 'local' ? 'Local' : 'Hosted'} Word manifest: ${manifestPath}`);

  if (!options.noValidate) {
    const validateCode = runTool('office-addin-manifest', ['validate', manifestPath], {
      cwd: ctx.cwd,
      dryRun: options.dryRun,
    });
    if (validateCode !== 0) return validateCode;
  }

  if (useDevCerts) {
    const certCode = runTool('office-addin-dev-certs', ['install'], {
      cwd: ctx.cwd,
      dryRun: options.dryRun,
    });
    if (certCode !== 0) return certCode;
  } else {
    console.log('Skipping Office dev certificates; using diagnostic HTTP loopback mode. Hosted Word panes normally require HTTPS loopback.');
  }

  const healthUrl = mcpHealthUrl(useDevCerts);
  const health = await probeMcpHealth(1500, useDevCerts ? 'https' : 'http');
  if (health.ok) {
    console.log(`ChangeDown MCP bridge is already running at ${healthUrl}.`);
  } else {
    if (useDevCerts) {
      const httpHealth = await probeMcpHealth(800, 'http');
      if (httpHealth.ok) {
        console.error(
          `ChangeDown MCP is already running on port ${MCP_PORT}, but it is using HTTP. ` +
          'The Word pane now requires HTTPS loopback. Stop/restart old agent sessions so the updated ChangeDown MCP plugin can bind HTTPS, then rerun this command.',
        );
        return 1;
      }
    }
    console.log(`ChangeDown MCP bridge is not running yet. ${mcpStartGuidance(useDevCerts ? 'https' : 'http')}`);
  }

  if (!options.noAgents) {
    const results = await setupAgentIntegrations({
      cwd: ctx.cwd,
      mode: 'word',
      include: 'detected',
      dryRun: options.dryRun,
      verbose: options.verbose,
      log: options.verbose ? console.log : () => {},
    });
    let hasStrictFailure = false;
    for (const result of results) {
      const prefix = result.status === 'failed' ? '✗' : result.status === 'manual-action' ? '○' : '✓';
      console.log(`${prefix} ${result.message}`);
      if (result.repairCommand) console.log(`  Repair: ${result.repairCommand}`);
      if (result.status === 'failed' || (options.requireAgents && result.status === 'manual-action')) {
        hasStrictFailure = true;
      }
    }
    if (hasStrictFailure && options.requireAgents) return 1;
  } else {
    console.log('Skipping agent setup (--no-agents).');
  }

  if (options.dryRun) {
    if (paneMode === 'local' && !options.manifest) {
      await startLocalPaneServer(true);
    }
    if (!options.noSideload) {
      const startCode = await runOfficeDebugStart(manifestPath, {
        cwd: ctx.cwd,
        dryRun: true,
      });
      if (startCode !== 0) return startCode;
    } else {
      console.log('Skipping Word sideload (--no-sideload).');
    }
    return 0;
  }

  const startPid = process.pid;
  await writeWordSession({
    manifestPath,
    startedAt: new Date().toISOString(),
    startPid,
    paneMode,
  });

  let paneServer: LocalPaneServerHandle | undefined;
  if (paneMode === 'local' && !options.manifest) {
    try {
      paneServer = await startLocalPaneServer(false);
      await writeWordSession({
        manifestPath,
        startedAt: new Date().toISOString(),
        startPid,
        paneMode,
        panePort: 3000,
      });
    } catch (err) {
      await clearWordSession();
      console.error(`Failed to start local Word pane server: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Try the hosted pane fallback: npx @changedown/cli@latest word start --pane hosted');
      return 1;
    }
  }

  let stopping = false;
  let handlersRegistered = false;
  let cleanup: () => Promise<void>;
  const unregisterSignalHandlers = (): void => {
    if (!handlersRegistered) return;
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
    handlersRegistered = false;
  };
  cleanup = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      if (!options.noSideload) {
        await runOfficeDebugStop(manifestPath, { cwd: ctx.cwd });
      }
      if (paneServer) await paneServer.close();
      await clearWordSession();
    } finally {
      unregisterSignalHandlers();
    }
  };
  function handleSigint(): void {
    void cleanup().finally(() => process.exit(130));
  }
  function handleSigterm(): void {
    void cleanup().finally(() => process.exit(143));
  }

  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);
  handlersRegistered = true;

  if (!options.noSideload) {
    const startCode = await runOfficeDebugStart(manifestPath, {
      cwd: ctx.cwd,
    });
    if (startCode !== 0) {
      await cleanup();
      return startCode;
    }
  } else {
    console.log('Skipping Word sideload (--no-sideload).');
  }

  console.log('ChangeDown Word pane is ready. Press Ctrl-C here to stop the sideload session.');
  await new Promise<void>(() => {});
  return 0;
}
