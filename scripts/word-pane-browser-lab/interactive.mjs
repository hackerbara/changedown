import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fetchCdpVersion, importWordFixtures, launchBrowserHarness } from './harness-driver.mjs';
import { captureBrowserWitness, capturePaneState, installBrowserWitnesses } from './witnesses.mjs';

function displayArtifactDir(artifactDir) {
  const relative = path.relative(process.cwd(), artifactDir);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : artifactDir.replace(/^\/Users\/[^/]+/, '/Users/[redacted]');
}

export function parseInteractiveCommand(line) {
  const parts = String(line ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: 'help', args: [] };
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

export function renderBrowserLabHandoff({ pageUrl, cdpPort, cdpVersion, artifactDir, backend, fixture }) {
  return [
    '# Word Pane Browser Lab Handoff',
    '',
    'This is a browser-hosted Word pane Goblin lab. The owning CLI process is responsible for cleanup.',
    '',
    `- page URL: \`${pageUrl}\``,
    `- backend: \`${backend}\``,
    `- fixture: \`${fixture}\``,
    `- artifact dir: \`${artifactDir}\``,
    `- CDP endpoint: \`${cdpPort ? `http://127.0.0.1:${cdpPort}` : 'not enabled'}\``,
    `- CDP websocket: \`${cdpVersion?.webSocketDebuggerUrl ?? 'not available'}\``,
    '',
    'Use Playwright-owned commands in this terminal for repeatable evidence. Use CDP only for manual/agent inspection.',
    'Type `exit` or press Ctrl-C in the owning terminal to close Chromium and finish cleanup.',
    '',
  ].join('\n');
}

async function writeHandoff({ artifacts, harness, parsed, cdpVersion }) {
  const artifactDir = displayArtifactDir(artifacts.dir);
  const markdown = renderBrowserLabHandoff({
    pageUrl: harness.page.url(),
    cdpPort: parsed.cdpPort,
    cdpVersion,
    artifactDir,
    backend: parsed.backend,
    fixture: parsed.fixture,
  });
  await artifacts.writeText('browser-lab-handoff.md', markdown);
  await artifacts.writeJson('browser-lab-handoff.json', {
    pageUrl: harness.page.url(),
    cdpPort: parsed.cdpPort,
    cdpVersion,
    artifactDir,
    backend: parsed.backend,
    fixture: parsed.fixture,
  });
  return markdown;
}

async function bootInteractiveFixture({ harness, artifacts, fixtureName }) {
  const fixtures = await importWordFixtures();
  const fixture = fixtures[fixtureName];
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureName}`);
  await harness.bootWithFixture(fixture);
  await artifacts.writeJson('00-setup/fixture-boot.json', { fixture: fixtureName, loaded: true });
}

async function runCommand({ command, harness, artifacts, witness, parsed }) {
  if (command.name === 'help') return 'commands: help, status, screenshot [name], pane, browser, handoff, exit';
  if (command.name === 'status') return JSON.stringify({ pageUrl: harness.page.url(), backend: parsed.backend, fixture: parsed.fixture, artifacts: displayArtifactDir(artifacts.dir) }, null, 2);
  if (command.name === 'pane') {
    const state = await capturePaneState(harness.page);
    await artifacts.writeJson(`interactive/pane-${Date.now()}.json`, state);
    return JSON.stringify({ available: state.available, connection: state.state?.connection, cards: state.state?.cards?.length ?? 0 }, null, 2);
  }
  if (command.name === 'browser') {
    const state = witness.snapshot();
    await artifacts.writeJson(`interactive/browser-${Date.now()}.json`, state);
    return JSON.stringify({ consoleMessages: state.consoleMessages?.length ?? 0, pageErrors: state.pageErrors?.length ?? 0, requests: state.requests?.length ?? 0 }, null, 2);
  }
  if (command.name === 'screenshot') {
    const name = command.args[0] ?? `shot-${Date.now()}`;
    await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: `interactive/${name}` });
    return `wrote interactive/${name}`;
  }
  if (command.name === 'handoff') {
    const cdpVersion = await fetchCdpVersion(parsed.cdpPort);
    return await writeHandoff({ artifacts, harness, parsed, cdpVersion });
  }
  if (command.name === 'exit') return 'exit';
  return `unknown command: ${command.name}`;
}

export async function startInteractiveBrowserLab({ artifacts, ...parsed }) {
  let harness;
  let rl;
  let result = { classification: 'interactive-starting' };
  try {
    let witness;
    harness = await launchBrowserHarness({
      artifacts,
      ...parsed,
      headless: false,
      beforeNavigate: async (page) => {
        witness = installBrowserWitnesses(page);
      },
    });
    witness ??= installBrowserWitnesses(harness.page);
    await bootInteractiveFixture({ harness, artifacts, fixtureName: parsed.fixture });
    const cdpVersion = await fetchCdpVersion(parsed.cdpPort);
    const handoff = await writeHandoff({ artifacts, harness, parsed, cdpVersion });
    output.write(`${handoff}\n`);
    output.write('Type `help` for commands. Type `exit` to clean up.\n');
    rl = readline.createInterface({ input, output });
    for await (const line of rl) {
      const command = parseInteractiveCommand(line);
      let response;
      try {
        response = await runCommand({ command, harness, artifacts, witness, parsed });
      } catch (err) {
        response = `command failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (response === 'exit') break;
      output.write(`${response}\n`);
    }
    result = { classification: 'interactive-stopped', pageUrl: harness.page.url(), artifactDir: displayArtifactDir(artifacts.dir) };
    return result;
  } catch (err) {
    result = { classification: 'setup-failed', reason: err instanceof Error ? err.message : String(err) };
    return result;
  } finally {
    rl?.close();
    await harness?.shutdown?.();
  }
}
