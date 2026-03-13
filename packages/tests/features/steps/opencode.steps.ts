import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ChangeTracksWorld } from './world.js';

import {
  toolExecuteBeforeHook,
  toolExecuteAfterHook,
  stopHook,
  readPendingEdits,
  appendPendingEdit,
} from '@changetracks/opencode-plugin/internals';
import type { HookContext } from '@changetracks/opencode-plugin/internals';
import ChangeTracksPlugin from '@changetracks/opencode-plugin';

// =============================================================================
// Extend the world with OpenCode-specific state
// =============================================================================

declare module './world.js' {
  interface ChangeTracksWorld {
    // OC test state
    ocTmpDir: string | null;
    ocBatchFiles: Map<string, string>;
    ocBeforeError: Error | null;
    ocBeforeNoThrow: boolean;
    // OC2 config state
    ocPluginCtx: { directory: string; worktree: string; project?: { name: string; path: string } } | null;
    ocConfigInput: Record<string, any> | null;
    ocPluginHooks: any;
  }
}

// =============================================================================
// Lifecycle hooks
// =============================================================================

Before({ tags: '@OC1 or @OC2' }, function (this: ChangeTracksWorld) {
  this.ocTmpDir = null;
  this.ocBatchFiles = new Map();
  this.ocBeforeError = null;
  this.ocBeforeNoThrow = false;
  this.ocPluginCtx = null;
  this.ocConfigInput = null;
  this.ocPluginHooks = null;
});

After({ tags: '@OC1 or @OC2' }, async function (this: ChangeTracksWorld) {
  if (this.ocTmpDir) {
    await fs.rm(this.ocTmpDir, { recursive: true, force: true });
  }
});

// =============================================================================
// Helpers
// =============================================================================

function makeOcCtx(dir: string): HookContext {
  return {
    directory: dir,
    worktree: dir,
    sessionId: '',
  };
}

// =============================================================================
// OC1 — OpenCode Hooks steps
// =============================================================================

Given('a temporary OpenCode project directory', async function (this: ChangeTracksWorld) {
  this.ocTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-bdd-oc-'));
  const scDir = path.join(this.ocTmpDir, '.changetracks');
  await fs.mkdir(scDir, { recursive: true });
  // Also set batchTmpDir for shared steps (like "the batch file ... includes")
  this.batchTmpDir = this.ocTmpDir;
  this.batchFiles = new Map();
  this.batchOriginalContent = new Map();
});

Given(
  'an OpenCode config with enforcement {string}',
  async function (this: ChangeTracksWorld, enforcement: string) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    await fs.writeFile(
      path.join(this.ocTmpDir, '.changetracks', 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[hooks]\nenforcement = "${enforcement}"\n\n[author]\ndefault = "ai:opencode-test"\n`,
      'utf-8',
    );
  },
);

// "a tracked file" is already defined in hooks.steps.ts for batchTmpDir context.
// Since we set batchTmpDir = ocTmpDir, those steps work for OC1 too.

// --- tool.execute.before ---

When(
  'I call OpenCode tool.execute.before with tool {string} on file {string}',
  async function (this: ChangeTracksWorld, tool: string, fileName: string) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const filePath = path.join(this.ocTmpDir, fileName);
    try {
      await toolExecuteBeforeHook(
        { tool, args: { file: filePath } },
        {},
        makeOcCtx(this.ocTmpDir),
      );
      this.ocBeforeNoThrow = true;
      this.ocBeforeError = null;
    } catch (err: any) {
      this.ocBeforeError = err;
      this.ocBeforeNoThrow = false;
    }
  },
);

Then(
  'the OpenCode before hook throws with {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ocBeforeError, 'Expected tool.execute.before to throw but it did not');
    assert.ok(
      this.ocBeforeError.message.toLowerCase().includes(expected.toLowerCase()),
      `Expected error to contain "${expected}" but got: "${this.ocBeforeError.message}"`,
    );
  },
);

Then('the OpenCode before hook does not throw', function (this: ChangeTracksWorld) {
  assert.ok(
    this.ocBeforeNoThrow || this.ocBeforeError === null,
    `Expected tool.execute.before NOT to throw but it threw: "${this.ocBeforeError?.message}"`,
  );
});

// --- tool.execute.after ---

When(
  'I call OpenCode tool.execute.after with tool {string} on file {string} with old {string} and new {string}',
  async function (
    this: ChangeTracksWorld,
    tool: string,
    fileName: string,
    oldText: string,
    newText: string,
  ) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const filePath = path.join(this.ocTmpDir, fileName);
    await toolExecuteAfterHook(
      { tool, args: { file: filePath, old_text: oldText, new_text: newText }, result: {} },
      makeOcCtx(this.ocTmpDir),
    );
  },
);

Then(
  'the OpenCode pending edits contain an entry for {string}',
  async function (this: ChangeTracksWorld, fileName: string) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const edits = await readPendingEdits(this.ocTmpDir);
    const fullPath = path.join(this.ocTmpDir, fileName);
    const found = edits.some((e) => e.file === fullPath);
    assert.ok(
      found,
      `Expected pending edit for "${fileName}" but found: ${JSON.stringify(edits.map((e) => e.file))}`,
    );
  },
);

Then('the OpenCode pending edits file is empty', async function (this: ChangeTracksWorld) {
  assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
  const edits = await readPendingEdits(this.ocTmpDir);
  assert.equal(edits.length, 0, `Expected no pending edits but found ${edits.length}`);
});

// --- stop ---

Given(
  'an OpenCode pending edit from {string} to {string} for file {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, fileName: string) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const filePath = path.join(this.ocTmpDir, fileName);
    await appendPendingEdit(this.ocTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: '',
    });
  },
);

Given(
  'an OpenCode pending insertion of {string} for file {string} with context {string}',
  async function (this: ChangeTracksWorld, newText: string, fileName: string, contextBefore: string) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const filePath = path.join(this.ocTmpDir, fileName);
    const resolvedNew = newText.replace(/\\n/g, '\n');
    const resolvedCtx = contextBefore.replace(/\\n/g, '\n');
    await appendPendingEdit(this.ocTmpDir, {
      file: filePath,
      old_text: '',
      new_text: resolvedNew,
      timestamp: new Date().toISOString(),
      session_id: '',
      context_before: resolvedCtx,
    });
  },
);

When('I call OpenCode stop hook', async function (this: ChangeTracksWorld) {
  assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
  await stopHook({}, {}, makeOcCtx(this.ocTmpDir));
});

// =============================================================================
// OC2 — OpenCode Config Hook steps
// =============================================================================

type ConfigInput = { mcp?: Record<string, unknown>; skills?: { paths?: string[] }; instructions?: string[] };

Given(
  'an OpenCode plugin context for directory {string}',
  function (this: ChangeTracksWorld, directory: string) {
    this.ocPluginCtx = {
      directory,
      worktree: directory,
      project: undefined,
    };
  },
);

When(
  'I call the OpenCode config hook with empty config',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.ocPluginCtx, 'Need an OpenCode plugin context first');
    const plugin = await ChangeTracksPlugin({
      ...this.ocPluginCtx,
      client: undefined,
    });
    this.ocPluginHooks = plugin;
    this.ocConfigInput = {};
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(
      this.ocConfigInput as ConfigInput,
    );
  },
);

When(
  'I call the OpenCode config hook with existing changetracks MCP {string}',
  async function (this: ChangeTracksWorld, url: string) {
    assert.ok(this.ocPluginCtx, 'Need an OpenCode plugin context first');
    const plugin = await ChangeTracksPlugin({
      ...this.ocPluginCtx,
      client: undefined,
    });
    this.ocPluginHooks = plugin;
    this.ocConfigInput = {
      mcp: {
        changetracks: { type: 'remote', url },
      },
    };
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(
      this.ocConfigInput as ConfigInput,
    );
  },
);

Then('the config has a changetracks MCP server', function (this: ChangeTracksWorld) {
  assert.ok(this.ocConfigInput, 'No config input');
  assert.ok(this.ocConfigInput.mcp?.changetracks, 'No changetracks MCP server in config');
});

Then(
  'the MCP server type is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ocConfigInput, 'No config input');
    const server = this.ocConfigInput.mcp?.changetracks as Record<string, unknown>;
    assert.equal(server.type, expected);
  },
);

Then(
  'the MCP server environment has CHANGETRACKS_PROJECT_DIR {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ocConfigInput, 'No config input');
    const server = this.ocConfigInput.mcp?.changetracks as Record<string, unknown>;
    const env = server.environment as Record<string, string>;
    assert.equal(env.CHANGETRACKS_PROJECT_DIR, expected);
  },
);

Then(
  'the MCP server URL is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ocConfigInput, 'No config input');
    const server = this.ocConfigInput.mcp?.changetracks as Record<string, unknown>;
    assert.equal(server.url, expected);
  },
);

Then('the config has skills paths', function (this: ChangeTracksWorld) {
  assert.ok(this.ocConfigInput, 'No config input');
  assert.ok(this.ocConfigInput.skills?.paths, 'No skills paths in config');
  assert.ok(
    (this.ocConfigInput.skills.paths as string[]).length >= 1,
    'Skills paths array is empty',
  );
});

Then(
  'the skills path contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ocConfigInput, 'No config input');
    const paths = this.ocConfigInput.skills?.paths as string[];
    assert.ok(
      paths.some((p: string) => p.includes(expected)),
      `Expected a skills path containing "${expected}" but got: ${JSON.stringify(paths)}`,
    );
  },
);

Then('the config has no skills paths', function (this: ChangeTracksWorld) {
  assert.ok(this.ocConfigInput, 'No config input');
  const skills = this.ocConfigInput.skills;
  assert.ok(
    !skills || !skills.paths || (skills.paths as string[]).length === 0,
    `Expected no skills paths but got: ${JSON.stringify(skills)}`,
  );
});

Then('the config has instructions', function (this: ChangeTracksWorld) {
  assert.ok(this.ocConfigInput, 'No config input');
  const instructions = this.ocConfigInput.instructions;
  assert.ok(instructions !== undefined, 'Instructions field not set');
  assert.ok(
    Array.isArray(instructions) && (instructions as string[]).length > 0,
    `Expected non-empty instructions array but got: ${JSON.stringify(instructions)}`,
  );
});

Then('the config has no instructions', function (this: ChangeTracksWorld) {
  assert.ok(this.ocConfigInput, 'No config input');
  const instructions = this.ocConfigInput.instructions;
  assert.ok(
    !instructions || (instructions as string[]).length === 0,
    `Expected no instructions but got: ${JSON.stringify(instructions)}`,
  );
});

// --- Opt-out config ---

Given(
  'an OpenCode opt-out config with skills disabled',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const ocDir = path.join(this.ocTmpDir, '.opencode');
    await fs.mkdir(ocDir, { recursive: true });
    await fs.writeFile(
      path.join(ocDir, 'changetracks.json'),
      JSON.stringify({ skills: { enabled: false } }),
      'utf-8',
    );
  },
);

Given(
  'an OpenCode opt-out config with instructions disabled',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const ocDir = path.join(this.ocTmpDir, '.opencode');
    await fs.mkdir(ocDir, { recursive: true });
    await fs.writeFile(
      path.join(ocDir, 'changetracks.json'),
      JSON.stringify({ instructions: { enabled: false } }),
      'utf-8',
    );
  },
);

When(
  'I call the OpenCode config hook from temporary directory',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.ocTmpDir, 'Need a temporary OpenCode project directory first');
    const plugin = await ChangeTracksPlugin({
      directory: this.ocTmpDir,
      worktree: this.ocTmpDir,
      project: undefined,
      client: undefined,
    });
    this.ocPluginHooks = plugin;
    this.ocConfigInput = {};
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(
      this.ocConfigInput as ConfigInput,
    );
  },
);

// --- No plugin tools ---

When('I initialize the OpenCode plugin', async function (this: ChangeTracksWorld) {
  assert.ok(this.ocPluginCtx, 'Need an OpenCode plugin context first');
  const plugin = await ChangeTracksPlugin({
    ...this.ocPluginCtx,
    client: undefined,
  });
  this.ocPluginHooks = plugin;
});

Then('the plugin has no tool registrations', function (this: ChangeTracksWorld) {
  assert.ok(this.ocPluginHooks, 'No plugin hooks');
  assert.equal(this.ocPluginHooks.tool, undefined, 'Expected no tool registrations on plugin');
});
