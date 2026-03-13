import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ChangeTracksWorld } from './world.js';

// --- Imports from hooks-impl via package internals barrel ---
import {
  evaluateRawEdit,
  evaluateRawRead,
  evaluateMcpCall,
  DEFAULT_CONFIG,
  scanMaxId,
  allocateIds,
  classifyEdit,
  shouldLogEdit,
  applyPendingEdits,
  appendPendingEdit,
  readPendingEdits,
  formatReadRedirect,
  handlePreToolUse,
  handlePostToolUse,
} from 'changetracks-hooks/internals';
import type { ChangeTracksConfig } from 'changetracks-hooks/internals';
import type { CreationTracking } from 'changetracks-hooks/internals';
// PolicyDecision is used as a type — import from internals barrel
import type { PolicyDecision } from 'changetracks-hooks/internals';

// =============================================================================
// Shared state stored on the World instance via attached properties
// =============================================================================

// Extend the world with hooks-specific state
declare module './world.js' {
  interface ChangeTracksWorld {
    hooksConfig: ChangeTracksConfig;
    hooksProjectDir: string;
    policyResult: PolicyDecision | null;
    // ID allocator state
    scannedMaxId: number;
    allocatedIds: string[];
    inputText: string;
    // Edit tracker state
    editClass: string;
    editLoggingEnabled: boolean;
    // Batch wrapper state
    batchTmpDir: string | null;
    batchFiles: Map<string, string>;
    batchResult: { editsApplied: number; changeIds: string[]; message: string } | null;
    batchOriginalContent: Map<string, string>;
    // H5 - Read interception state
    readRedirectResult: string | null;
    hookOutput: any;
    auditLogged: boolean;
  }
}

// =============================================================================
// Lifecycle hooks
// =============================================================================

Before({ tags: '' }, function (this: ChangeTracksWorld) {
  this.hooksConfig = structuredClone(DEFAULT_CONFIG);
  this.hooksProjectDir = '/project';
  this.policyResult = null;
  this.scannedMaxId = 0;
  this.allocatedIds = [];
  this.inputText = '';
  this.editClass = '';
  this.editLoggingEnabled = false;
  this.batchTmpDir = null;
  this.batchFiles = new Map();
  this.batchResult = null;
  this.batchOriginalContent = new Map();
  this.readRedirectResult = null;
  this.hookOutput = null;
  this.auditLogged = false;
});

After(async function (this: ChangeTracksWorld) {
  if (this.batchTmpDir) {
    await fs.rm(this.batchTmpDir, { recursive: true, force: true });
  }
});

// =============================================================================
// H1 - Policy Engine steps
// =============================================================================

Given('a project directory', function (this: ChangeTracksWorld) {
  this.hooksProjectDir = '/project';
});

Given(
  'the policy mode is {string}',
  function (this: ChangeTracksWorld, mode: string) {
    this.hooksConfig.policy.mode = mode as 'strict' | 'safety-net' | 'permissive';
  },
);

Given(
  'the hooks exclude pattern is {string}',
  function (this: ChangeTracksWorld, pattern: string) {
    this.hooksConfig.hooks.exclude = [pattern];
  },
);

Given(
  'the author enforcement is {string}',
  function (this: ChangeTracksWorld, enforcement: string) {
    this.hooksConfig.author.enforcement = enforcement as 'optional' | 'required';
  },
);

Given('hashline is enabled', function (this: ChangeTracksWorld) {
  this.hooksConfig.hashline.enabled = true;
});

When(
  'I evaluate a raw edit to a tracked file {string}',
  function (this: ChangeTracksWorld, filePath: string) {
    const fullPath = path.join(this.hooksProjectDir, filePath);
    this.policyResult = evaluateRawEdit(fullPath, this.hooksConfig, this.hooksProjectDir);
  },
);

When(
  'I evaluate a raw edit to an untracked file {string}',
  function (this: ChangeTracksWorld, filePath: string) {
    const fullPath = path.join(this.hooksProjectDir, filePath);
    this.policyResult = evaluateRawEdit(fullPath, this.hooksConfig, this.hooksProjectDir);
  },
);

When(
  'I evaluate a raw read to a tracked file {string}',
  function (this: ChangeTracksWorld, filePath: string) {
    const fullPath = path.join(this.hooksProjectDir, filePath);
    this.policyResult = evaluateRawRead(fullPath, this.hooksConfig, this.hooksProjectDir);
  },
);

When(
  'I evaluate a raw read to an untracked file {string}',
  function (this: ChangeTracksWorld, filePath: string) {
    const fullPath = path.join(this.hooksProjectDir, filePath);
    this.policyResult = evaluateRawRead(fullPath, this.hooksConfig, this.hooksProjectDir);
  },
);

When(
  'I evaluate an MCP call {string} with no author',
  function (this: ChangeTracksWorld, toolName: string) {
    this.policyResult = evaluateMcpCall(toolName, { file: 'test.md' }, this.hooksConfig);
  },
);

When(
  'I evaluate an MCP call {string} with author {string}',
  function (this: ChangeTracksWorld, toolName: string, author: string) {
    this.policyResult = evaluateMcpCall(
      toolName,
      { file: 'test.md', op: '{~~old~>new~~}', author },
      this.hooksConfig,
    );
  },
);

Then(
  'the policy action is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.policyResult, 'No policy result available');
    assert.equal(this.policyResult.action, expected);
  },
);

Then(
  'the policy hint contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.policyResult, 'No policy result available');
    assert.ok(
      this.policyResult.agentHint?.includes(expected),
      `Expected agentHint to contain "${expected}" but got: "${this.policyResult.agentHint}"`,
    );
  },
);

Then(
  'the policy reason contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.policyResult, 'No policy result available');
    assert.ok(
      this.policyResult.reason?.includes(expected),
      `Expected reason to contain "${expected}" but got: "${this.policyResult.reason}"`,
    );
  },
);

// =============================================================================
// H2 - Batch Wrapper steps
// =============================================================================

Given('a temporary project directory', async function (this: ChangeTracksWorld) {
  this.batchTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-bdd-hooks-'));
  const scDir = path.join(this.batchTmpDir, '.changetracks');
  await fs.mkdir(scDir, { recursive: true });
});

Given(
  'a file {string} with content {string}',
  async function (this: ChangeTracksWorld, name: string, content: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    // Unescape literal \n in the Gherkin string
    const resolved = content.replace(/\\n/g, '\n');
    const filePath = path.join(this.batchTmpDir, name);
    await fs.writeFile(filePath, resolved, 'utf-8');
    this.batchFiles.set(name, filePath);
    this.batchOriginalContent.set(name, resolved);
  },
);

Given(
  'a pending substitution from {string} to {string} in session {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
    });
  },
);

Given(
  'a pending insertion of {string} in session {string}',
  async function (this: ChangeTracksWorld, newText: string, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    const resolved = newText.replace(/\\n/g, '\n');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: '',
      new_text: resolved,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
    });
  },
);

Given(
  'a pending deletion of {string} with context {string} and {string} in session {string}',
  async function (
    this: ChangeTracksWorld,
    oldText: string,
    ctxBefore: string,
    ctxAfter: string,
    sessionId: string,
  ) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: '',
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      context_before: ctxBefore,
      context_after: ctxAfter,
    });
  },
);

Given(
  'a pending creation of the entire file in session {string}',
  async function (this: ChangeTracksWorld, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    const content = await fs.readFile(filePath, 'utf-8');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: '',
      new_text: content,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      tool_name: 'Write',
      edit_class: 'creation',
    });
  },
);

Given(
  'a pending substitution from {string} to {string} with context {string} and {string} in session {string}',
  async function (
    this: ChangeTracksWorld,
    oldText: string,
    newText: string,
    ctxBefore: string,
    ctxAfter: string,
    sessionId: string,
  ) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    const resolvedBefore = ctxBefore.replace(/\\n/g, '\n');
    const resolvedAfter = ctxAfter.replace(/\\n/g, '\n');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      context_before: resolvedBefore,
      context_after: resolvedAfter,
    });
  },
);

Given(
  'a pending substitution from {string} to {string} in session {string} for file {string}',
  async function (
    this: ChangeTracksWorld,
    oldText: string,
    newText: string,
    sessionId: string,
    fileName: string,
  ) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = this.batchFiles.get(fileName);
    assert.ok(filePath, `No batch file named "${fileName}" in this scenario`);
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
    });
  },
);

Given(
  'a pending substitution from {string} to {string} with context {string} and {string} in session {string} for file {string}',
  async function (
    this: ChangeTracksWorld,
    oldText: string,
    newText: string,
    ctxBefore: string,
    ctxAfter: string,
    sessionId: string,
    fileName: string,
  ) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = this.batchFiles.get(fileName);
    assert.ok(filePath, `No batch file named "${fileName}" in this scenario`);
    const resolvedBefore = ctxBefore.replace(/\\n/g, '\n');
    const resolvedAfter = ctxAfter.replace(/\\n/g, '\n');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      context_before: resolvedBefore,
      context_after: resolvedAfter,
    });
  },
);

Given(
  'a pending insertion of {string} with context {string} and {string} in session {string}',
  async function (
    this: ChangeTracksWorld,
    newText: string,
    ctxBefore: string,
    ctxAfter: string,
    sessionId: string,
  ) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    const resolved = newText.replace(/\\n/g, '\n');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: '',
      new_text: resolved,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      context_before: ctxBefore,
      context_after: ctxAfter,
    });
  },
);

Given(
  'a pending substitution from {string} to {string} for a deleted file in session {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const deletedPath = path.join(this.batchTmpDir, 'deleted.md');
    // Do not create the file -- it has been deleted
    await appendPendingEdit(this.batchTmpDir, {
      file: deletedPath,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
    });
  },
);

Given(
  'a pending large insertion covering the entire file in session {string}',
  async function (this: ChangeTracksWorld, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const filePath = [...this.batchFiles.values()].pop()!;
    const content = await fs.readFile(filePath, 'utf-8');
    await appendPendingEdit(this.batchTmpDir, {
      file: filePath,
      old_text: '',
      new_text: content,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      tool_name: 'Edit',
      edit_class: 'insertion',
    });
  },
);

When(
  'I apply pending edits for session {string}',
  async function (this: ChangeTracksWorld, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    this.batchResult = await applyPendingEdits(this.batchTmpDir, sessionId, {
      author: { default: 'ai:claude-opus-4.6' },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' as CreationTracking },
    });
  },
);

When(
  'I apply pending edits for session {string} with creation_tracking {string}',
  async function (this: ChangeTracksWorld, sessionId: string, tracking: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    this.batchResult = await applyPendingEdits(this.batchTmpDir, sessionId, {
      author: { default: 'ai:claude-opus-4.6' },
      policy: { mode: 'safety-net', creation_tracking: tracking as CreationTracking },
    });
  },
);

// Use unique step names to avoid collision with common.steps.ts
Then(
  'the batch file {string} includes {string}',
  async function (this: ChangeTracksWorld, name: string, expected: string) {
    const filePath = this.batchFiles.get(name);
    assert.ok(filePath, `No batch file named "${name}" in this scenario`);
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(
      content.includes(expected),
      `Expected batch file "${name}" to contain "${expected}" but got:\n${content}`,
    );
  },
);

Then(
  'the batch file {string} excludes {string}',
  async function (this: ChangeTracksWorld, name: string, unexpected: string) {
    const filePath = this.batchFiles.get(name);
    assert.ok(filePath, `No batch file named "${name}" in this scenario`);
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(
      !content.includes(unexpected),
      `Expected batch file "${name}" NOT to contain "${unexpected}" but it does:\n${content}`,
    );
  },
);

Then(
  'the batch result applied {int} edit(s)',
  function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.batchResult, 'No batch result available');
    assert.equal(this.batchResult.editsApplied, expected);
  },
);

Then(
  'the batch result change IDs include {string}',
  function (this: ChangeTracksWorld, expectedId: string) {
    assert.ok(this.batchResult, 'No batch result available');
    assert.ok(
      this.batchResult.changeIds.includes(expectedId),
      `Expected changeIds to include "${expectedId}" but got: ${JSON.stringify(this.batchResult.changeIds)}`,
    );
  },
);

Then(
  'the pending edits file is empty',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const remaining = await readPendingEdits(this.batchTmpDir);
    assert.equal(remaining.length, 0, `Expected no pending edits but found ${remaining.length}`);
  },
);

Then(
  'the batch file {string} has unchanged content',
  async function (this: ChangeTracksWorld, name: string) {
    const filePath = this.batchFiles.get(name);
    assert.ok(filePath, `No file named "${name}" in this scenario`);
    const current = await fs.readFile(filePath, 'utf-8');
    const original = this.batchOriginalContent.get(name);
    assert.ok(original !== undefined, `No original content recorded for "${name}"`);
    assert.equal(current, original);
  },
);

Then(
  'the batch file {string} has no triple newlines',
  async function (this: ChangeTracksWorld, name: string) {
    const filePath = this.batchFiles.get(name);
    assert.ok(filePath, `No batch file named "${name}" in this scenario`);
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(
      !/\n\n\n/.test(content),
      `Expected no triple newlines in "${name}" but found them:\n${content}`,
    );
  },
);

Then(
  'the pending edits for session {string} still exist',
  async function (this: ChangeTracksWorld, sessionId: string) {
    assert.ok(this.batchTmpDir, 'No temporary project directory');
    const remaining = await readPendingEdits(this.batchTmpDir);
    const sessionEdits = remaining.filter((e) => e.session_id === sessionId);
    assert.ok(
      sessionEdits.length > 0,
      `Expected pending edits for session "${sessionId}" but found none`,
    );
  },
);

Then(
  'the batch file {string} has exactly {int} tracking header(s)',
  async function (this: ChangeTracksWorld, name: string, expected: number) {
    const filePath = this.batchFiles.get(name);
    assert.ok(filePath, `No batch file named "${name}" in this scenario`);
    const content = await fs.readFile(filePath, 'utf-8');
    const count = (content.match(/ctrcks.com\/v1/g) || []).length;
    assert.equal(
      count,
      expected,
      `Expected ${expected} tracking header(s) but found ${count} in "${name}":\n${content}`,
    );
  },
);

// =============================================================================
// H3 - ID Allocator steps
// =============================================================================

Given(
  'text containing {string}',
  function (this: ChangeTracksWorld, text: string) {
    this.inputText = text;
  },
);

Given(
  'a max existing ID of {int}',
  function (this: ChangeTracksWorld, maxId: number) {
    this.scannedMaxId = maxId;
  },
);

When(
  'I scan for the max SC-ID',
  function (this: ChangeTracksWorld) {
    this.scannedMaxId = scanMaxId(this.inputText);
  },
);

Then(
  'the max ID is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    assert.equal(this.scannedMaxId, expected);
  },
);

When(
  'I allocate IDs for {int} edit',
  function (this: ChangeTracksWorld, count: number) {
    this.allocatedIds = allocateIds(count, this.scannedMaxId);
  },
);

Then(
  'the allocated IDs are {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const expectedIds = expected.split(',').map((s) => s.trim());
    assert.deepEqual(this.allocatedIds, expectedIds);
  },
);

Then(
  'the allocated IDs are empty',
  function (this: ChangeTracksWorld) {
    assert.deepEqual(this.allocatedIds, []);
  },
);

// =============================================================================
// H4 - Edit Tracker steps
// =============================================================================

When(
  'I classify an edit with tool {string} old {string} new {string}',
  function (this: ChangeTracksWorld, toolName: string, oldText: string, newText: string) {
    this.editClass = classifyEdit(toolName, oldText, newText);
  },
);

Then(
  'the edit class is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.equal(this.editClass, expected);
  },
);

When(
  'I check if edits should be logged in {string} mode',
  function (this: ChangeTracksWorld, mode: string) {
    this.editLoggingEnabled = shouldLogEdit(mode as 'strict' | 'safety-net' | 'permissive');
  },
);

Then(
  'edit logging is enabled',
  function (this: ChangeTracksWorld) {
    assert.equal(this.editLoggingEnabled, true);
  },
);

Then(
  'edit logging is disabled',
  function (this: ChangeTracksWorld) {
    assert.equal(this.editLoggingEnabled, false);
  },
);

// =============================================================================
// H5 - Read Interception steps
// =============================================================================

Given('the default view is {string}', function (this: ChangeTracksWorld, view: string) {
  this.hooksConfig.policy.default_view = view as 'review' | 'changes' | 'settled';
});

Given('a strict mode config', async function (this: ChangeTracksWorld) {
  assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
  const scDir = path.join(this.batchTmpDir, '.changetracks');
  await fs.mkdir(scDir, { recursive: true });
  await fs.writeFile(
    path.join(scDir, 'config.toml'),
    '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:test"\n',
    'utf-8',
  );
});

Given('a safety-net mode config', async function (this: ChangeTracksWorld) {
  assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
  const scDir = path.join(this.batchTmpDir, '.changetracks');
  await fs.mkdir(scDir, { recursive: true });
  await fs.writeFile(
    path.join(scDir, 'config.toml'),
    '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "safety-net"\n\n[author]\ndefault = "ai:test"\n',
    'utf-8',
  );
});

Given(
  'a tracked file {string} with content {string}',
  async function (this: ChangeTracksWorld, name: string, content: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const filePath = path.join(this.batchTmpDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  },
);

When(
  'I format a read redirect for {string}',
  function (this: ChangeTracksWorld, filePath: string) {
    this.readRedirectResult = formatReadRedirect(filePath, {
      policy: this.hooksConfig.policy,
    });
  },
);

Then(
  'the redirect contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.readRedirectResult, 'No redirect result available');
    assert.ok(
      this.readRedirectResult.includes(expected),
      `Expected redirect to contain "${expected}" but got: "${this.readRedirectResult}"`,
    );
  },
);

When(
  'I call PreToolUse with Read on {string}',
  async function (this: ChangeTracksWorld, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    this.hookOutput = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: path.join(this.batchTmpDir, fileName) },
      cwd: this.batchTmpDir,
    });
  },
);

Then(
  'the hook decision is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.hookOutput, 'No hook output available');
    assert.equal(this.hookOutput.hookSpecificOutput?.permissionDecision, expected);
  },
);

Then(
  'the hook reason contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.hookOutput, 'No hook output available');
    const reason = this.hookOutput.hookSpecificOutput?.permissionDecisionReason ?? '';
    assert.ok(
      reason.includes(expected),
      `Expected hook reason to contain "${expected}" but got: "${reason}"`,
    );
  },
);

Then('the hook returns empty', function (this: ChangeTracksWorld) {
  assert.deepStrictEqual(this.hookOutput, {});
});

When(
  'I call PostToolUse with Read on {string}',
  async function (this: ChangeTracksWorld, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: path.join(this.batchTmpDir, fileName) },
      session_id: 'bdd-ses',
      cwd: this.batchTmpDir,
    });
    this.auditLogged = result.logged;
  },
);

Then(
  'the audit log contains a read entry for {string}',
  function (this: ChangeTracksWorld, _fileName: string) {
    assert.ok(this.auditLogged, 'Expected audit log entry but none was logged');
  },
);

Then('no audit entry is logged', function (this: ChangeTracksWorld) {
  assert.ok(!this.auditLogged, 'Expected no audit log entry but one was logged');
});
