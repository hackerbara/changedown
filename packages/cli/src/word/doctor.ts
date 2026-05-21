import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WordCommandContext, WordCommandOptions } from './types.js';
import { resolveManifestForDoctor, validateLocalManifestText } from './manifest.js';
import { resolveBin, resolvePackagedTool, runTool } from './office-tools.js';
import { MCP_PORT, mcpStartGuidance, preflightMcp, preflightMcpFromOrigin, probeMcpHealth } from '@changedown/mcp/launcher';
import { detectAgents } from '../agents/setup.js';
import { PACKAGED_WORD_PANE_DIR, PACKAGED_LOCAL_MANIFEST_PATH } from './pane-server.js';

function line(ok: boolean, label: string, detail?: string): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

export async function runWordDoctor(ctx: WordCommandContext, options: WordCommandOptions): Promise<number> {
  const useDevCerts = options.noDevCerts ? false : true;
  let failures = 0;
  const fail = (label: string, detail?: string) => { failures++; line(false, label, detail); };
  const pass = (label: string, detail?: string) => line(true, label, detail);

  pass('platform', `${process.platform}/${process.arch}`);

  const paneMode = options.paneMode ?? 'hosted';

  if (paneMode === 'local') {
    try {
      const text = await fs.readFile(PACKAGED_LOCAL_MANIFEST_PATH, 'utf8');
      validateLocalManifestText(text);
      pass('packaged local manifest', PACKAGED_LOCAL_MANIFEST_PATH);
    } catch (err) {
      fail('packaged local manifest', err instanceof Error ? err.message : String(err));
    }
    // Confirm static assets the manifest references are actually shipped.
    const required = ['taskpane.html', 'commands.html', 'taskpane.js', 'polyfill.js'];
    const missing: string[] = [];
    for (const f of required) {
      try { await fs.access(path.join(PACKAGED_WORD_PANE_DIR, f)); }
      catch (e) { missing.push(`${f} (${(e as NodeJS.ErrnoException).code ?? 'ERR'})`); }
    }
    if (missing.length === 0) pass('packaged word-pane assets', `under ${PACKAGED_WORD_PANE_DIR}`);
    else fail('packaged word-pane assets', `missing: ${missing.join(', ')}`);
    // Verify webpack chunks and hash-named CSS exist (names change on every rebuild so
    // we cannot list them statically; check by extension instead).
    try {
      const entries = await fs.readdir(PACKAGED_WORD_PANE_DIR);
      const jsChunks = entries.filter((e) => e.endsWith('.js') && e !== 'taskpane.js' && e !== 'polyfill.js');
      const cssFiles = entries.filter((e) => e.endsWith('.css'));
      if (jsChunks.length === 0) fail('packaged word-pane chunks', 'no webpack chunk .js files found');
      else pass('packaged word-pane chunks', `${jsChunks.length} chunk file(s)`);
      if (cssFiles.length === 0) fail('packaged word-pane css', 'no .css file found');
      else pass('packaged word-pane css', cssFiles.join(', '));
    } catch (err) {
      fail('packaged word-pane directory', err instanceof Error ? err.message : String(err));
    }
  } else {
    try {
      const manifest = await resolveManifestForDoctor(options.manifest, options.noDownload);
      pass(options.noDownload && !options.manifest ? 'hosted manifest cache' : 'hosted manifest', manifest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as NodeJS.ErrnoException).code;
      if (options.noDownload && options.manifest && code === 'ERR_NO_DOWNLOAD_NETWORK_MANIFEST') {
        line(true, 'hosted manifest', `${message}; skipping network fetch because --no-download was set`);
      } else if (options.noDownload && !options.manifest && code === 'ENOENT') {
        line(true, 'hosted manifest cache', `missing cache (${message}); skipping refresh because --no-download was set`);
      } else {
        fail(options.noDownload && !options.manifest ? 'hosted manifest cache' : 'hosted manifest', message);
      }
    }
  }

  const toolBins = useDevCerts
    ? ['office-addin-dev-certs', 'office-addin-manifest', 'office-addin-debugging']
    : ['office-addin-manifest', 'office-addin-debugging'];
  for (const bin of toolBins) {
    const packaged = resolvePackagedTool(bin);
    const resolved = packaged ? undefined : resolveBin(bin, ctx.cwd);
    line(Boolean(packaged || resolved), bin, packaged?.args[0] ?? resolved ?? 'will use npx fallback');
  }

  if (useDevCerts) {
    if (!options.dryRun) {
      const verify = runTool('office-addin-dev-certs', ['verify'], { cwd: ctx.cwd, stdio: 'pipe' });
      if (verify === 0) pass('office dev cert verification');
      else fail('office dev cert verification', `exit ${verify}`);
    }
  } else {
    pass('office dev certs', 'skipped because --no-dev-certs selected diagnostic HTTP loopback mode');
  }

  const scheme = useDevCerts ? 'https' : 'http';
  const healthUrl = `${scheme}://127.0.0.1:${MCP_PORT}/health`;
  const health = await probeMcpHealth(1500, scheme);
  if (health.ok) {
    pass('MCP loopback health', healthUrl);
    try {
      const headers = await preflightMcp('/backend/register', 1500, scheme);
      if (headers['access-control-allow-origin'] === 'https://changedown.com') pass('MCP hosted-origin CORS');
      else fail('MCP hosted-origin CORS', String(headers['access-control-allow-origin']));
      if (headers['access-control-allow-private-network'] === 'true') pass('MCP PNA preflight');
      else fail('MCP PNA preflight', String(headers['access-control-allow-private-network']));
    } catch (err) {
      fail('MCP preflight', err instanceof Error ? err.message : String(err));
    }

    try {
      const hostile = await preflightMcpFromOrigin('https://evil.example', '/backend/register', 1500, scheme);
      if (hostile['access-control-allow-origin']) fail('MCP hostile-origin rejection', String(hostile['access-control-allow-origin']));
      else pass('MCP hostile-origin rejection');
    } catch (err) {
      fail('MCP hostile-origin preflight', err instanceof Error ? err.message : String(err));
    }
  } else {
    if (useDevCerts) {
      const httpHealth = await probeMcpHealth(800, 'http');
      if (httpHealth.ok) {
        fail(
          'MCP HTTPS loopback',
          `port ${MCP_PORT} is occupied by a ChangeDown HTTP bridge. Stop/restart old agent sessions so the updated plugin can bind HTTPS.`,
        );
      } else {
        line(true, 'MCP loopback health', `${health.error ?? 'not running'}; skipping MCP preflight checks. ${mcpStartGuidance(scheme)}`);
      }
    } else {
      line(true, 'MCP loopback health', `${health.error ?? 'not running'}; skipping MCP preflight checks. ${mcpStartGuidance(scheme)}`);
    }
  }

  for (const agent of detectAgents()) {
    line(true, `agent ${agent.name}`, `${agent.detected ? 'detected' : 'not detected'}, ${agent.configured ? 'configured' : 'not configured'}`);
  }

  return failures === 0 ? 0 : 1;
}
