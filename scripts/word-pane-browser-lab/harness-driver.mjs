import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { installMockedRelayRoutes, relaySocketInitScript } from './relay-mock.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const wordAddinTestsRoot = path.join(repoRoot, 'packages/tests/word-addin');


export function assertPortAvailable(port) {
  if (!port) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`CDP port ${port} is already in use`)));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve());
    });
  });
}

export async function fetchCdpVersion(cdpPort) {
  if (!cdpPort) return undefined;
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${cdpPort}/json/version`, (res) => {
      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(chunks.join('')));
        } catch {
          resolve({ error: 'invalid-json', status: res.statusCode });
        }
      });
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.on('error', (err) => resolve({ error: err.message }));
  });
}

export function mapBrowserLabBackend(backend) {
  if (backend === 'real-local-mcp') return 'real';
  if (backend === 'mocked' || backend === 'mocked-relay') return 'mocked';
  throw new Error(`${backend} is not implemented in the browser harness driver yet`);
}

export function resolveCompiledHarnessPath() {
  return path.join(wordAddinTestsRoot, 'out/packages/tests/word-addin/journeys/wordHarness.js');
}

export function resolveCompiledFixturesPath() {
  return path.join(wordAddinTestsRoot, 'out/packages/tests/word-addin/fixtures/builders.js');
}

async function runSetupCommand({ name, command, args, cwd, artifacts }) {
  const started = Date.now();
  const result = await execFileAsync(command, args, {
    cwd,
    timeout: 90_000,
  });
  await artifacts?.writeJson?.(`00-setup/${name}.json`, {
    command: [command, ...args],
    cwd,
    durationMs: Date.now() - started,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
  });
}

export async function compileWordAddinHarness({ artifacts, includeRealMcp = false } = {}) {
  await runSetupCommand({ name: 'core-build', command: 'npm', args: ['run', 'build:core'], cwd: repoRoot, artifacts });
  await runSetupCommand({ name: 'docx-build', command: 'npm', args: ['run', 'build:docx'], cwd: repoRoot, artifacts });
  if (includeRealMcp) {
    await runSetupCommand({ name: 'cli-build', command: 'npm', args: ['run', 'build:cli'], cwd: repoRoot, artifacts });
    await runSetupCommand({ name: 'llm-jail-build', command: 'npm', args: ['run', 'build:llm-jail'], cwd: repoRoot, artifacts });
    await runSetupCommand({ name: 'plugin-build', command: 'npm', args: ['run', 'build:plugin'], cwd: repoRoot, artifacts });
  }
  await runSetupCommand({ name: 'word-addin-harness-compile', command: 'npm', args: ['run', 'compile'], cwd: wordAddinTestsRoot, artifacts });
}

export async function importWordHarness() {
  return require(resolveCompiledHarnessPath());
}

export async function importWordFixtures() {
  return require(resolveCompiledFixturesPath());
}

export function cdpLaunchArgs(cdpPort) {
  if (!cdpPort) return [];
  return [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
  ];
}

export async function launchBrowserHarness({ backend, headless, cdpPort, artifacts, beforeNavigate, initScripts, relayOptions, relaySocketMode } = {}) {
  await assertPortAvailable(cdpPort);
  await compileWordAddinHarness({ artifacts, includeRealMcp: backend === 'real-local-mcp' });
  const wordHarness = await importWordHarness();
  const browserLabInitScripts = [...(initScripts ?? [])];
  let relayMock;
  let beforeNavigateHook = beforeNavigate;
  if (backend === 'mocked-relay') {
    browserLabInitScripts.push(relaySocketInitScript({ mode: relaySocketMode }));
    beforeNavigateHook = async (page, context) => {
      relayMock = await installMockedRelayRoutes(page, { artifacts, ...(relayOptions ?? {}) });
      await beforeNavigate?.(page, context);
    };
  }
  const harness = await wordHarness.launchHarness({
    backend: mapBrowserLabBackend(backend),
    headless,
    launchArgs: cdpLaunchArgs(cdpPort),
    beforeNavigate: beforeNavigateHook,
    initScripts: browserLabInitScripts,
  });
  return {
    ...harness,
    relayMock,
    async shutdown() {
      try {
        await harness.shutdown();
      } finally {
        await wordHarness.tearDownAll?.();
      }
    },
  };
}
