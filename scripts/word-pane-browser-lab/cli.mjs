import { createBrowserLabArtifacts } from './artifacts.mjs';
import { startInteractiveBrowserLab } from './interactive.mjs';
import { latestReport } from './report.mjs';
import { SCENARIOS } from './scenarios.mjs';

const BACKEND_FLAG = '--backend';
const FIXTURE_FLAG = '--fixture';
const CDP_PORT_FLAG = '--cdp-port';
const HOLD_OPEN_MS_FLAG = '--hold-open-ms';
const ALLOW_LIVE_RELAY_FLAG = '--allow-live-relay';
const PRESERVE_ON_FAILURE_FLAG = '--preserve-on-failure';
const VALUE_FLAGS = new Set([BACKEND_FLAG, FIXTURE_FLAG, CDP_PORT_FLAG, HOLD_OPEN_MS_FLAG]);

export const BACKENDS = new Set(['mocked', 'real-local-mcp', 'mocked-relay', 'local-worker-relay', 'staging-relay']);

export function usage() {
  return `Usage:
  node scripts/word-pane-browser-lab.mjs run <scenario...> [--backend mocked|real-local-mcp|mocked-relay]
  node scripts/word-pane-browser-lab.mjs quick <scenario> [--backend mocked|mocked-relay]
  node scripts/word-pane-browser-lab.mjs lab [--fixture threeParasClean] [--backend mocked|mocked-relay] [--cdp-port 9223]
  node scripts/word-pane-browser-lab.mjs report latest

Browser-hosted Word pane Goblin lab. Raw artifacts are written under docs/findings/word-pane-browser-harness/ and must stay untracked.

Optional:
  ${BACKEND_FLAG} <name>             Backend mode. Defaults to mocked.
  ${FIXTURE_FLAG} <name>             Fixture builder name. Defaults to threeParasClean.
  ${CDP_PORT_FLAG} <port>            Lab mode only. Exposes Chromium CDP on 127.0.0.1:<port>.
  ${HOLD_OPEN_MS_FLAG} <ms>          Keep browser open after run/quick before cleanup.
  ${PRESERVE_ON_FAILURE_FLAG}        Keep browser open after a non-converged run until interrupted.
  ${ALLOW_LIVE_RELAY_FLAG}           Required for staging-relay.
`;
}

export function valueAfterFlag(argv, flag) {
  const equalsPrefix = `${flag}=`;
  const equalsArg = argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) {
    const value = equalsArg.slice(equalsPrefix.length);
    if (!value) throw new Error(`Missing value for ${flag}`);
    return value;
  }
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parseNonNegativeInteger(value, flag, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid ${flag}: expected a non-negative integer`);
  return parsed;
}

function parseCdpPort(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error('Invalid --cdp-port: expected an integer from 1024 to 65535');
  }
  return parsed;
}

function scenarioArgs(argv) {
  const out = [];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      if (VALUE_FLAGS.has(arg) && i + 1 < argv.length) i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}


export function classificationExitCode(classification) {
  return classification === 'converged' ? 0 : 1;
}

export function parseArgs(argv) {
  const mode = argv[0];
  if (!['run', 'quick', 'lab', 'report'].includes(mode)) throw new Error('Unknown mode');
  const backend = valueAfterFlag(argv, BACKEND_FLAG) ?? 'mocked';
  if (!BACKENDS.has(backend)) throw new Error(`Unknown backend: ${backend}`);
  const fixture = valueAfterFlag(argv, FIXTURE_FLAG) ?? 'threeParasClean';
  const cdpPort = parseCdpPort(valueAfterFlag(argv, CDP_PORT_FLAG));
  const holdOpenMs = parseNonNegativeInteger(valueAfterFlag(argv, HOLD_OPEN_MS_FLAG), HOLD_OPEN_MS_FLAG, 0);
  const allowLiveRelay = argv.includes(ALLOW_LIVE_RELAY_FLAG);
  const preserveOnFailure = argv.includes(PRESERVE_ON_FAILURE_FLAG);
  if (backend === 'staging-relay' && !allowLiveRelay) {
    throw new Error('staging-relay requires --allow-live-relay');
  }
  return {
    mode,
    backend,
    fixture,
    scenarioNames: mode === 'lab' ? [] : scenarioArgs(argv),
    cdpPort,
    headless: mode !== 'lab',
    allowLiveRelay,
    preserveOnFailure,
    holdOpenMs,
  };
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(usage());
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
    return;
  }

  if (parsed.mode === 'lab') {
    const artifacts = await createBrowserLabArtifacts({ mode: parsed.mode, scenario: 'interactive-browser-lab' });
    await artifacts.writeJson('run-config.json', { argv, ...parsed });
    const result = await startInteractiveBrowserLab({ artifacts, ...parsed });
    await artifacts.writeSummary({ classification: result.classification, details: result });
    console.log(`Word pane browser lab: ${result.classification}`);
    console.log(`Artifacts: ${artifacts.dir}`);
    return;
  }

  if (parsed.mode === 'report') {
    if (parsed.scenarioNames[0] !== 'latest') {
      console.error(usage());
      console.error('Unknown report command. Expected: report latest');
      process.exitCode = 2;
      return;
    }
    const report = await latestReport();
    console.log(report.text.trimEnd());
    if (!report.privacy.ok) process.exitCode = 1;
    return;
  }

  if (parsed.scenarioNames.length === 0) {
    console.error(usage());
    console.error('Missing scenario name.');
    process.exitCode = 2;
    return;
  }

  const names = parsed.mode === 'quick' ? [parsed.scenarioNames[0]] : parsed.scenarioNames;
  for (const name of names) {
    const scenario = SCENARIOS.get(name);
    if (!scenario) {
      console.error(`Unknown scenario: ${name}`);
      console.error(`Available scenarios: ${[...SCENARIOS.keys()].join(', ')}`);
      process.exitCode = 2;
      return;
    }
    const artifacts = await createBrowserLabArtifacts({ mode: parsed.mode, scenario: name });
    await artifacts.writeJson('run-config.json', { argv, scenario: name, ...parsed });
    await artifacts.appendTranscript({ event: 'scenario-start', scenario: name });
    const result = await scenario({ artifacts, scenario: name, ...parsed });
    await artifacts.appendTranscript({ event: 'scenario-end', scenario: name, result });
    await artifacts.writeSummary({ classification: result.classification, details: result });
    console.log(`Word pane browser lab ${name}: ${result.classification}`);
    console.log(`Artifacts: ${artifacts.dir}`);
    if (classificationExitCode(result.classification) !== 0) process.exitCode = 1;
  }
}
