import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { ChangeTracksWorld } from './world.js';
import { runInit, type ClackAdapter } from 'changetracks/init/runner';
import { MockClack, responseMapHandler } from './mock-clack.js';

// Import the init module (will fail during RED phase — that's expected)
import {
  resolveIdentity,
} from 'changetracks/init/identity';
import {
  generateDefaultConfig,
  parseConfigSummary,
  type InitConfigOptions,
  type ConfigSummary,
} from 'changetracks/init/config';
import {
  copyExamples,
} from 'changetracks/init/examples';
import {
  detectAgents,
  type AgentStatus,
} from 'changetracks/init/agents';
import {
  ensureGitignoreEntries,
  createGitignore,
  hasGitignore,
  type GitignoreResult,
} from 'changetracks/init/gitignore';
import {
  detectEnvironment,
  type EnvironmentInfo,
  type DetectEnvironmentOptions,
} from 'changetracks/init/environment';

// =============================================================================
// Shared state per scenario
// =============================================================================

interface InitState {
  tmpDir: string;
  resolvedIdentity: string;
  generatedConfig: string;
  detectedAgents: AgentStatus[];
  savedEnv: Record<string, string | undefined>;
  gitignoreResult: GitignoreResult | null;
  envOptions: DetectEnvironmentOptions;
  environmentResult: EnvironmentInfo | null;
  configSummary: ConfigSummary | null;
  // I9/I10 additions
  consoleOutput: string[];
  exitCode: number | null;
  mockClack: MockClack | null;
  promptResponses: Map<string, string | boolean | symbol>;
  envOverride: EnvironmentInfo | null;
}

const initKey = Symbol('init');

function getInit(world: ChangeTracksWorld): InitState {
  if (!(world as any)[initKey]) {
    (world as any)[initKey] = {
      tmpDir: '',
      resolvedIdentity: '',
      generatedConfig: '',
      detectedAgents: [],
      savedEnv: {},
      gitignoreResult: null,
      envOptions: {},
      environmentResult: null,
      configSummary: null,
      consoleOutput: [],
      exitCode: null,
      mockClack: null,
      promptResponses: new Map(),
      envOverride: null,
    };
  }
  return (world as any)[initKey];
}

After(async function (this: ChangeTracksWorld) {
  const state = (this as any)[initKey] as InitState | undefined;
  if (state?.tmpDir) {
    fs.rmSync(state.tmpDir, { recursive: true, force: true });
  }
  // Restore environment variables
  if (state?.savedEnv) {
    for (const [key, val] of Object.entries(state.savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  }
});

// =============================================================================
// I1 – Identity Resolution steps
// =============================================================================

Given(
  'a temporary directory with git initialized',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i1-'));
    execSync('git init', { cwd: state.tmpDir, stdio: 'pipe' });
  },
);

Given(
  'git config user.name is set to {string}',
  function (this: ChangeTracksWorld, name: string) {
    const state = getInit(this);
    execSync(`git config user.name "${name}"`, { cwd: state.tmpDir, stdio: 'pipe' });
  },
);

Given(
  'git config user.name is not set',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    try {
      execSync('git config --unset user.name', { cwd: state.tmpDir, stdio: 'pipe' });
    } catch {
      // Already not set
    }
  },
);

Given(
  'a temporary directory without git',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i1-nogit-'));
    // No git init — this directory has no git
  },
);

Given(
  'the system username environment variables are cleared',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.savedEnv.USER = process.env.USER;
    state.savedEnv.USERNAME = process.env.USERNAME;
    delete process.env.USER;
    delete process.env.USERNAME;
  },
);

When(
  'I resolve identity in that directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.resolvedIdentity = resolveIdentity(state.tmpDir);
  },
);

Then(
  'the resolved identity is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.equal(state.resolvedIdentity, expected);
  },
);

Then(
  'the resolved identity is the system username',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    const expected = os.userInfo().username;
    assert.equal(state.resolvedIdentity, expected);
  },
);

Then(
  'the resolved identity is not empty',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    assert.ok(state.resolvedIdentity.length > 0, 'Expected non-empty identity');
    assert.notEqual(state.resolvedIdentity, 'unknown');
  },
);

// =============================================================================
// I2 – Config Generation steps
// =============================================================================

When(
  'I generate config with author {string}',
  function (this: ChangeTracksWorld, author: string) {
    const state = getInit(this);
    state.generatedConfig = generateDefaultConfig({ author });
  },
);

When(
  'I generate config with author {string} and custom include patterns',
  function (this: ChangeTracksWorld, author: string, table: any) {
    const state = getInit(this);
    const include = table.hashes().map((row: { pattern: string }) => row.pattern);
    state.generatedConfig = generateDefaultConfig({ author, trackingInclude: include });
  },
);

When(
  'I generate config with author {string} and enforcement {string}',
  function (this: ChangeTracksWorld, author: string, enforcement: string) {
    const state = getInit(this);
    state.generatedConfig = generateDefaultConfig({
      author,
      authorEnforcement: enforcement as 'optional' | 'required',
    });
  },
);

When(
  'I generate config with author {string} and custom exclude patterns',
  function (this: ChangeTracksWorld, author: string, table: any) {
    const state = getInit(this);
    const exclude = table.hashes().map((row: { pattern: string }) => row.pattern);
    state.generatedConfig = generateDefaultConfig({ author, trackingExclude: exclude });
  },
);

When(
  'I generate config with author {string} and policyMode {string}',
  function (this: ChangeTracksWorld, author: string, policyMode: string) {
    const state = getInit(this);
    state.generatedConfig = generateDefaultConfig({
      author,
      policyMode: policyMode as InitConfigOptions['policyMode'],
    });
  },
);

When(
  'I generate config with author {string} and protocolMode {string} and reasoning {string}',
  function (this: ChangeTracksWorld, author: string, protocolMode: string, reasoning: string) {
    const state = getInit(this);
    state.generatedConfig = generateDefaultConfig({
      author,
      protocolMode: protocolMode as InitConfigOptions['protocolMode'],
      protocolReasoning: reasoning as InitConfigOptions['protocolReasoning'],
    });
  },
);

When(
  'I generate config with author {string} and autoSettleOnReject {word}',
  function (this: ChangeTracksWorld, author: string, value: string) {
    const state = getInit(this);
    state.generatedConfig = generateDefaultConfig({
      author,
      autoSettleOnReject: value === 'true',
    });
  },
);

Then(
  'the generated config contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(
      state.generatedConfig.includes(expected),
      `Expected config to contain "${expected}", got:\n${state.generatedConfig}`,
    );
  },
);

// =============================================================================
// I3 – Examples steps
// =============================================================================

Given(
  'a temporary empty directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i3-'));
  },
);

Given(
  'the file {string} already exists with content {string}',
  function (this: ChangeTracksWorld, relativePath: string, content: string) {
    const state = getInit(this);
    const fullPath = path.join(state.tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  },
);

When(
  'I copy examples to that directory',
  async function (this: ChangeTracksWorld) {
    const state = getInit(this);
    await copyExamples(state.tmpDir);
  },
);

Then(
  'the file {string} exists in that directory',
  function (this: ChangeTracksWorld, relativePath: string) {
    const state = getInit(this);
    const fullPath = path.join(state.tmpDir, relativePath);
    assert.ok(fs.existsSync(fullPath), `Expected file ${fullPath} to exist`);
  },
);

Then(
  'the example file contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    const examplesDir = path.join(state.tmpDir, 'examples');
    const gettingStarted = path.join(examplesDir, 'getting-started.md');
    const content = fs.readFileSync(gettingStarted, 'utf8');
    assert.ok(
      content.includes(expected),
      `Expected file to contain "${expected}"`,
    );
  },
);

Then(
  'the init file {string} contains {string}',
  function (this: ChangeTracksWorld, relativePath: string, expected: string) {
    const state = getInit(this);
    const fullPath = path.join(state.tmpDir, relativePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(
      content.includes(expected),
      `Expected ${relativePath} to contain "${expected}", got: ${content}`,
    );
  },
);

Then(
  'the directory {string} exists in that directory',
  function (this: ChangeTracksWorld, dirName: string) {
    const state = getInit(this);
    const fullPath = path.join(state.tmpDir, dirName);
    assert.ok(fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory(),
      `Expected directory ${fullPath} to exist`,
    );
  },
);

// =============================================================================
// I4 – Agent Detection steps
// =============================================================================

When(
  'I detect agents',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.detectedAgents = detectAgents();
  },
);

Then(
  'the agent list includes an entry for {string}',
  function (this: ChangeTracksWorld, agentName: string) {
    const state = getInit(this);
    const found = state.detectedAgents.find(a => a.name === agentName);
    assert.ok(found, `Expected agent list to include "${agentName}"`);
  },
);

Then(
  'each agent entry has a {string} boolean',
  function (this: ChangeTracksWorld, field: string) {
    const state = getInit(this);
    for (const agent of state.detectedAgents) {
      assert.equal(typeof (agent as any)[field], 'boolean',
        `Expected agent "${agent.name}" to have boolean field "${field}"`);
    }
  },
);

Then(
  'each agent has name, detected, and configured fields',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    for (const agent of state.detectedAgents) {
      assert.ok(typeof agent.name === 'string', 'Expected name to be a string');
      assert.ok(typeof agent.detected === 'boolean', 'Expected detected to be a boolean');
      assert.ok(typeof agent.configured === 'boolean', 'Expected configured to be a boolean');
    }
  },
);

// =============================================================================
// I5 – Environment Detection steps
// =============================================================================

Given(
  'the environment variable {word} is set to {string}',
  function (this: ChangeTracksWorld, varName: string, value: string) {
    const state = getInit(this);
    if (!state.envOptions.env) state.envOptions.env = { ...process.env };
    state.envOptions.env[varName] = value;
    if (state.envOptions.isTTY === undefined) state.envOptions.isTTY = true;
  },
);

Given(
  'the environment variable {word} is not set',
  function (this: ChangeTracksWorld, varName: string) {
    const state = getInit(this);
    if (!state.envOptions.env) state.envOptions.env = { ...process.env };
    delete state.envOptions.env[varName];
    if (state.envOptions.isTTY === undefined) state.envOptions.isTTY = true;
  },
);

Given(
  'the command {string} is available on PATH',
  function (this: ChangeTracksWorld, cmd: string) {
    const state = getInit(this);
    const previousChecker = state.envOptions.commandChecker;
    state.envOptions.commandChecker = (c: string) =>
      c === cmd || (previousChecker ? previousChecker(c) : false);
    if (state.envOptions.isTTY === undefined) state.envOptions.isTTY = true;
  },
);

Given(
  'no agent commands are available on PATH',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.envOptions.commandChecker = () => false;
    if (state.envOptions.isTTY === undefined) state.envOptions.isTTY = true;
  },
);

Given(
  'stdout is not a TTY',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.envOptions.isTTY = false;
  },
);

When(
  'I call detectEnvironment',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.environmentResult = detectEnvironment(state.envOptions);
  },
);

Then(
  'the environment type is {string}',
  function (this: ChangeTracksWorld, expectedType: string) {
    const state = getInit(this);
    assert.ok(state.environmentResult, 'Expected environmentResult to be set');
    assert.equal(state.environmentResult!.type, expectedType);
  },
);

// =============================================================================
// I6 – Gitignore Handling steps
// =============================================================================

Given(
  'a project directory with a .gitignore containing {string}',
  function (this: ChangeTracksWorld, content: string) {
    const state = getInit(this);
    if (!state.tmpDir) {
      state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i6-'));
    }
    fs.writeFileSync(path.join(state.tmpDir, '.gitignore'), content + '\n', 'utf8');
  },
);

Given(
  'a project directory with no .gitignore',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    if (!state.tmpDir) {
      state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i6-'));
    }
    const gitignorePath = path.join(state.tmpDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) fs.unlinkSync(gitignorePath);
  },
);

When(
  'I call ensureGitignoreEntries on the project directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.gitignoreResult = ensureGitignoreEntries(state.tmpDir);
  },
);

When(
  'I call createGitignore on the project directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.gitignoreResult = createGitignore(state.tmpDir);
  },
);

Then(
  'the .gitignore contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    const content = fs.readFileSync(path.join(state.tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes(expected), `Expected .gitignore to contain "${expected}", got:\n${content}`);
  },
);

Then(
  'the .gitignore still contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    const content = fs.readFileSync(path.join(state.tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes(expected), `Expected .gitignore to still contain "${expected}", got:\n${content}`);
  },
);

Then(
  'the .gitignore contains exactly {int} line matching {string}',
  function (this: ChangeTracksWorld, count: number, pattern: string) {
    const state = getInit(this);
    const content = fs.readFileSync(path.join(state.tmpDir, '.gitignore'), 'utf8');
    const matches = content.split('\n').filter(line => line.includes(pattern));
    assert.equal(matches.length, count, `Expected ${count} line(s) matching "${pattern}", found ${matches.length}`);
  },
);

Then(
  'a .gitignore file exists',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    assert.ok(fs.existsSync(path.join(state.tmpDir, '.gitignore')), '.gitignore should exist');
  },
);

Then(
  'the result action is {string}',
  function (this: ChangeTracksWorld, expectedAction: string) {
    const state = getInit(this);
    assert.ok(state.gitignoreResult, 'Expected gitignoreResult to be set');
    assert.equal(state.gitignoreResult!.action, expectedAction);
  },
);

// =============================================================================
// I7 – Setup Project Integration steps
// =============================================================================

When(
  'I run the setupProject flow in that directory',
  async function (this: ChangeTracksWorld) {
    const state = getInit(this);
    const dir = state.tmpDir;

    // This mirrors the exact sequence in extension.ts setupProject command:
    // 1. Resolve identity
    const author = resolveIdentity(dir);

    // 2. Generate config
    const configToml = generateDefaultConfig({ author });

    // 3. Write config
    const configDir = path.join(dir, '.changetracks');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.toml'), configToml, 'utf8');

    // 4. Copy examples
    await copyExamples(dir);

    // 5. Handle gitignore
    if (hasGitignore(dir)) {
      state.gitignoreResult = ensureGitignoreEntries(dir);
    } else {
      state.gitignoreResult = createGitignore(dir);
    }
  },
);

// =============================================================================
// I8 – Config Summary steps
// =============================================================================

When(
  'I parse the config summary in that directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.configSummary = parseConfigSummary(state.tmpDir);
  },
);

When(
  'I write the generated config to that directory',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    const configDir = path.join(state.tmpDir, '.changetracks');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.toml'), state.generatedConfig, 'utf8');
  },
);

Then(
  'the config summary author is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.configSummary, 'Expected configSummary to be set');
    assert.equal(state.configSummary!.author, expected);
  },
);

Then(
  'the config summary tracking is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.configSummary, 'Expected configSummary to be set');
    assert.equal(state.configSummary!.tracking, expected);
  },
);

Then(
  'the config summary policy is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.configSummary, 'Expected configSummary to be set');
    assert.equal(state.configSummary!.policy, expected);
  },
);

Then(
  'the config summary protocol is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.configSummary, 'Expected configSummary to be set');
    assert.equal(state.configSummary!.protocol, expected);
  },
);

Then(
  'the config summary is null',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    assert.equal(state.configSummary, null);
  },
);

// =============================================================================
// I9 – CLI Non-Interactive Mode steps
// =============================================================================

When(
  'I run runInit with args {string}',
  async function (this: ChangeTracksWorld, argsStr: string) {
    const state = getInit(this);
    const args = argsStr.split(/\s+/).filter(Boolean);
    state.consoleOutput = [];
    state.exitCode = null;

    // Create a no-op ClackAdapter for non-interactive tests
    const noopClack: ClackAdapter = {
      intro: () => {},
      outro: () => {},
      cancel: () => {},
      text: async () => '',
      select: async () => '' as any,
      confirm: async () => false,
      log: { info: () => {}, success: () => {}, warn: () => {} },
      note: () => {},
      isCancel: (v: unknown): v is symbol => false,
    };

    await runInit({
      args,
      projectDir: state.tmpDir,
      clack: noopClack,
      exit: (code) => { state.exitCode = code; },
      log: (msg) => { state.consoleOutput.push(msg); },
    });
  },
);

Then(
  'the console output contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    const all = state.consoleOutput.join('\n');
    assert.ok(
      all.includes(expected),
      `Expected console output to contain "${expected}", got:\n${all}`,
    );
  },
);

// =============================================================================
// I10 – CLI Interactive Mode steps
// =============================================================================

Given(
  'the user answers {string} with {string}',
  function (this: ChangeTracksWorld, promptSubstr: string, answer: string) {
    const state = getInit(this);
    state.promptResponses.set(promptSubstr, answer);
  },
);

Given(
  'the user selects {string} as {string}',
  function (this: ChangeTracksWorld, promptSubstr: string, value: string) {
    const state = getInit(this);
    state.promptResponses.set(promptSubstr, value);
  },
);

Given(
  'the user confirms {string} with {string}',
  function (this: ChangeTracksWorld, promptSubstr: string, yesNo: string) {
    const state = getInit(this);
    state.promptResponses.set(promptSubstr, yesNo === 'yes');
  },
);

Given(
  'the user cancels at {string}',
  function (this: ChangeTracksWorld, promptSubstr: string) {
    const state = getInit(this);
    state.promptResponses.set(promptSubstr, MockClack.CANCEL);
  },
);

Given(
  'the user answers all basic prompts with defaults',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    // All handled by responseMapHandler's initialValue fallback.
    // No explicit entries needed.
  },
);

Given(
  'the detected environment is {string}',
  function (this: ChangeTracksWorld, envType: string) {
    const state = getInit(this);
    state.envOverride = {
      type: envType as any,
      detectedAgents: [],
      isInteractive: true,
    };
  },
);

Given(
  'the detected environment is {string} with agent {string}',
  function (this: ChangeTracksWorld, envType: string, agent: string) {
    const state = getInit(this);
    state.envOverride = {
      type: envType as any,
      detectedAgents: [agent],
      isInteractive: true,
    };
  },
);

When(
  'I run runInit interactively',
  async function (this: ChangeTracksWorld) {
    const state = getInit(this);
    state.consoleOutput = [];
    state.exitCode = null;

    const handler = responseMapHandler(state.promptResponses);
    state.mockClack = new MockClack(handler);

    const envOverride = state.envOverride;
    const detectFn = envOverride
      ? () => envOverride
      : undefined;

    await runInit({
      args: [],  // No --yes → interactive mode
      projectDir: state.tmpDir,
      clack: state.mockClack,
      exit: (code) => { state.exitCode = code; },
      log: (msg) => { state.consoleOutput.push(msg); },
      detectEnvironmentFn: detectFn,
    });
  },
);

Then(
  'the prompt {string} was shown',
  function (this: ChangeTracksWorld, promptSubstr: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    assert.ok(
      state.mockClack!.hasPrompt(promptSubstr),
      `Expected prompt containing "${promptSubstr}" to be shown. Prompts: ${
        state.mockClack!.prompts.map(p => p.message).join(', ')
      }`,
    );
  },
);

Then(
  'the outro contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    const all = state.mockClack!.outros.join('\n');
    assert.ok(
      all.includes(expected),
      `Expected outro to contain "${expected}", got: ${all}`,
    );
  },
);

Then(
  'the intro was shown',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    assert.ok(
      state.mockClack!.intros.length > 0,
      'Expected at least one intro call',
    );
  },
);

Then(
  'the clack log contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    assert.ok(
      state.mockClack!.hasLog(expected),
      `Expected clack log to contain "${expected}". Logs: ${
        state.mockClack!.logs.map(l => l.text).join(' | ')
      }`,
    );
  },
);

Then(
  'a {string} note was shown',
  function (this: ChangeTracksWorld, titleSubstr: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    assert.ok(
      state.mockClack!.hasNote(titleSubstr),
      `Expected note containing "${titleSubstr}" to be shown. Notes: ${
        state.mockClack!.notes.map(n => n.title || n.text).join(', ')
      }`,
    );
  },
);

Then(
  'the {string} note contains {string}',
  function (this: ChangeTracksWorld, titleSubstr: string, contentSubstr: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    const note = state.mockClack!.notes.find(
      n => (n.title?.includes(titleSubstr) || n.text.includes(titleSubstr)),
    );
    assert.ok(note, `No note found containing "${titleSubstr}"`);
    assert.ok(
      note!.text.includes(contentSubstr),
      `Expected note text to contain "${contentSubstr}", got: ${note!.text}`,
    );
  },
);

Then(
  'exit was called with code {int}',
  function (this: ChangeTracksWorld, expected: number) {
    const state = getInit(this);
    assert.equal(state.exitCode, expected,
      `Expected exit code ${expected}, got ${state.exitCode}`,
    );
  },
);

Then(
  'the cancel message contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const state = getInit(this);
    assert.ok(state.mockClack, 'MockClack not initialized');
    const all = state.mockClack!.cancels.join('\n');
    assert.ok(
      all.includes(expected),
      `Expected cancel message to contain "${expected}", got: ${all}`,
    );
  },
);

Then(
  'no config was created',
  function (this: ChangeTracksWorld) {
    const state = getInit(this);
    const configPath = path.join(state.tmpDir, '.changetracks', 'config.toml');
    assert.ok(
      !fs.existsSync(configPath),
      `Expected no config at ${configPath}, but it exists`,
    );
  },
);
