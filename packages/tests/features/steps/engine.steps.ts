import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ChangeTracksWorld } from './world.js';
import {
  loadConfig,
  resolveAuthor,
  resolveTrackingStatus,
} from 'changetracks/engine';
import type { ChangeTracksConfig } from 'changetracks/engine';
import type { ResolveAuthorResult } from 'changetracks/engine';

// =============================================================================
// E1 – Config Resolution steps
// =============================================================================

/** Temp directory and loaded config, stored on the world for E1 scenarios */
interface E1State {
  tmpDir: string;
  loadedConfig: ChangeTracksConfig | null;
}

const e1Key = Symbol('e1');

function getE1(world: ChangeTracksWorld): E1State {
  if (!(world as any)[e1Key]) {
    (world as any)[e1Key] = { tmpDir: '', loadedConfig: null };
  }
  return (world as any)[e1Key];
}

After(async function (this: ChangeTracksWorld) {
  const e1 = (this as any)[e1Key] as E1State | undefined;
  if (e1?.tmpDir) {
    await fs.rm(e1.tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

Given(
  'a fresh ScenarioContext',
  async function (this: ChangeTracksWorld) {
    const e1 = getE1(this);
    e1.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-e1-'));
  },
);

Given(
  'a config.toml with:',
  async function (this: ChangeTracksWorld, content: string) {
    const e1 = getE1(this);
    const configDir = path.join(e1.tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.toml'), content, 'utf-8');
  },
);

When(
  'I load config from an empty directory',
  async function (this: ChangeTracksWorld) {
    const e1 = getE1(this);
    e1.loadedConfig = await loadConfig(e1.tmpDir);
  },
);

When(
  'I load config from the project directory',
  async function (this: ChangeTracksWorld) {
    const e1 = getE1(this);
    e1.loadedConfig = await loadConfig(e1.tmpDir);
  },
);

// --- Generic config assertion helpers ---

function getConfigValue(config: ChangeTracksConfig, path: string): unknown {
  const parts = path.split('.');
  let obj: unknown = config;
  for (const p of parts) {
    if (obj == null || typeof obj !== 'object') return undefined;
    obj = (obj as Record<string, unknown>)[p];
  }
  return obj;
}

Then(
  'the config {word}.{word} is {string}',
  function (this: ChangeTracksWorld, section: string, key: string, expected: string) {
    const e1 = getE1(this);
    assert.ok(e1.loadedConfig, 'No config loaded');
    const actual = getConfigValue(e1.loadedConfig, `${section}.${key}`);
    if (expected === 'true') {
      assert.strictEqual(actual, true);
    } else if (expected === 'false') {
      assert.strictEqual(actual, false);
    } else {
      assert.strictEqual(actual, expected);
    }
  },
);

Then(
  /^the config (\w+)\.(\w+) equals JSON (.+)$/,
  function (this: ChangeTracksWorld, section: string, key: string, jsonStr: string) {
    const e1 = getE1(this);
    assert.ok(e1.loadedConfig, 'No config loaded');
    const actual = getConfigValue(e1.loadedConfig, `${section}.${key}`);
    const expected = JSON.parse(jsonStr);
    assert.deepStrictEqual(actual, expected);
  },
);

Then(
  'the config {word}.{word} is true',
  function (this: ChangeTracksWorld, section: string, key: string) {
    const e1 = getE1(this);
    assert.ok(e1.loadedConfig, 'No config loaded');
    const actual = getConfigValue(e1.loadedConfig, `${section}.${key}`);
    assert.strictEqual(actual, true);
  },
);

Then(
  'the config {word}.{word} is false',
  function (this: ChangeTracksWorld, section: string, key: string) {
    const e1 = getE1(this);
    assert.ok(e1.loadedConfig, 'No config loaded');
    const actual = getConfigValue(e1.loadedConfig, `${section}.${key}`);
    assert.strictEqual(actual, false);
  },
);

Then(
  'the config {word}.{word} contains {string}',
  function (this: ChangeTracksWorld, section: string, key: string, expected: string) {
    const e1 = getE1(this);
    assert.ok(e1.loadedConfig, 'No config loaded');
    const actual = getConfigValue(e1.loadedConfig, `${section}.${key}`);
    assert.ok(Array.isArray(actual), `Expected ${section}.${key} to be an array`);
    assert.ok(
      (actual as string[]).includes(expected),
      `Expected ${section}.${key} to contain "${expected}" but got ${JSON.stringify(actual)}`,
    );
  },
);

// =============================================================================
// E2 – Scope Tracking steps
// =============================================================================

interface E2State {
  trackingResult: {
    status: 'tracked' | 'untracked';
    source: 'file_header' | 'project_config' | 'global_default';
    header_present: boolean;
    project_default: 'tracked' | 'untracked';
    auto_header: boolean;
  } | null;
}

const e2Key = Symbol('e2');

function getE2(world: ChangeTracksWorld): E2State {
  if (!(world as any)[e2Key]) {
    (world as any)[e2Key] = { trackingResult: null };
  }
  return (world as any)[e2Key];
}

When(
  'I resolve tracking status for {string}',
  async function (this: ChangeTracksWorld, name: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}" in this scenario`);
    const { config, projectDir } = await this.ctx.resolver.forFile(filePath);
    const e2 = getE2(this);
    e2.trackingResult = await resolveTrackingStatus(filePath, config, projectDir);
  },
);

Then(
  'the tracking status is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const e2 = getE2(this);
    assert.ok(e2.trackingResult, 'No tracking result available');
    assert.strictEqual(e2.trackingResult.status, expected);
  },
);

Then(
  'the tracking source is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const e2 = getE2(this);
    assert.ok(e2.trackingResult, 'No tracking result available');
    assert.strictEqual(e2.trackingResult.source, expected);
  },
);

Then(
  'the tracking header_present is true',
  function (this: ChangeTracksWorld) {
    const e2 = getE2(this);
    assert.ok(e2.trackingResult, 'No tracking result available');
    assert.strictEqual(e2.trackingResult.header_present, true);
  },
);

Then(
  'the tracking header_present is false',
  function (this: ChangeTracksWorld) {
    const e2 = getE2(this);
    assert.ok(e2.trackingResult, 'No tracking result available');
    assert.strictEqual(e2.trackingResult.header_present, false);
  },
);

// =============================================================================
// E3 – Author Identity steps
// =============================================================================

interface E3State {
  authorResult: ResolveAuthorResult | null;
}

const e3Key = Symbol('e3');

function getE3(world: ChangeTracksWorld): E3State {
  if (!(world as any)[e3Key]) {
    (world as any)[e3Key] = { authorResult: null };
  }
  return (world as any)[e3Key];
}

/** Build a full ChangeTracksConfig from accumulated configOverrides */
function buildAuthorConfig(world: ChangeTracksWorld): ChangeTracksConfig {
  const overrides = world.configOverrides;
  return {
    tracking: { include: ['**/*.md'], exclude: ['node_modules/**'], default: 'tracked', auto_header: true },
    author: {
      default: overrides.author?.default ?? 'ai:claude-opus-4.6',
      enforcement: overrides.author?.enforcement ?? 'optional',
    },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: false, auto_remap: true },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };
}

When(
  'I resolve author {string} for tool {string}',
  function (this: ChangeTracksWorld, author: string, toolName: string) {
    const e3 = getE3(this);
    e3.authorResult = resolveAuthor(author, buildAuthorConfig(this), toolName);
  },
);

When(
  'I resolve author without explicit value for tool {string}',
  function (this: ChangeTracksWorld, toolName: string) {
    const e3 = getE3(this);
    e3.authorResult = resolveAuthor(undefined, buildAuthorConfig(this), toolName);
  },
);

Then(
  'the resolved author is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const e3 = getE3(this);
    assert.ok(e3.authorResult, 'No author result available');
    assert.strictEqual(e3.authorResult.author, expected);
  },
);

Then(
  'there is no author error',
  function (this: ChangeTracksWorld) {
    const e3 = getE3(this);
    assert.ok(e3.authorResult, 'No author result available');
    assert.strictEqual(e3.authorResult.error, undefined);
  },
);

Then(
  'there is an author error',
  function (this: ChangeTracksWorld) {
    const e3 = getE3(this);
    assert.ok(e3.authorResult, 'No author result available');
    assert.ok(e3.authorResult.error, 'Expected an author error but got none');
  },
);

Then(
  'the author error message contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const e3 = getE3(this);
    assert.ok(e3.authorResult, 'No author result available');
    assert.ok(e3.authorResult.error, 'Expected an author error');
    assert.ok(
      e3.authorResult.error.message.includes(expected),
      `Expected error message to contain "${expected}" but got: ${e3.authorResult.error.message}`,
    );
  },
);

// =============================================================================
// E4 – Session State steps
// =============================================================================

When(
  'I call read_tracked_file for {string} with view = {string}',
  async function (this: ChangeTracksWorld, name: string, view: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}" in this scenario`);
    try {
      this.lastResult = await this.ctx.read(filePath, { view });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

Then(
  'the session records lastReadView {string} for {string}',
  function (this: ChangeTracksWorld, expectedView: string, name: string) {
    assert.ok(this.ctx, 'No context initialized');
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}"`);
    const actual = this.ctx.state.getLastReadView(filePath);
    assert.strictEqual(actual, expectedView);
  },
);

Then(
  'the session is not stale for {string}',
  async function (this: ChangeTracksWorld, name: string) {
    assert.ok(this.ctx, 'No context initialized');
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}"`);
    const diskContent = await this.ctx.readDisk(filePath);
    assert.strictEqual(this.ctx.state.isStale(filePath, diskContent), false);
  },
);

Then(
  'the session teardown completes without error',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.ctx, 'No context initialized');
    // Teardown should complete without throwing
    await this.ctx.teardown();
    // Mark as torn down so After hook skips double teardown
    this.tornDown = true;
  },
);

// =============================================================================
// E5 – Guide Composer steps
// =============================================================================

Given(
  'guide delivery is enabled',
  function (this: ChangeTracksWorld) {
    this.showGuide = true;
  },
);

Then(
  'the response has {int} content items total',
  function (this: ChangeTracksWorld, count: number) {
    assert.ok(this.lastResult, 'No MCP result available');
    assert.strictEqual(
      this.lastResult.content.length,
      count,
      `Expected ${count} content items but got ${this.lastResult.content.length}`,
    );
  },
);

Then(
  'the first content item contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    assert.ok(this.lastResult.content.length > 0, 'No content items in result');
    const firstText = this.lastResult.content[0].text;
    assert.ok(
      firstText.includes(expected),
      `Expected first content item to contain "${expected}" but got:\n${firstText.substring(0, 300)}`,
    );
  },
);
