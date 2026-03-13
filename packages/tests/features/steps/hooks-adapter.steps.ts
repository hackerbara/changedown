import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ChangeTracksWorld } from './world.js';

import {
  handlePreToolUse,
  handlePostToolUse,
  handleStop,
  readPendingEdits,
  appendPendingEdit,
  cursorPreToolUse,
  handleAfterFileEdit,
  handleBeforeMcpExecution,
  handleBeforeReadFile,
  handleCursorStop,
} from 'changetracks-hooks/internals';
import type { HookInput } from 'changetracks-hooks/internals';

// =============================================================================
// Extend the world with adapter-specific state
// =============================================================================

declare module './world.js' {
  interface ChangeTracksWorld {
    // Adapter test state
    adapterTmpDir: string | null;
    adapterBatchFiles: Map<string, string>;
    // Claude Code adapter state
    ccPreResult: any;
    ccPostResult: any;
    ccStopResult: any;
    // Cursor adapter state
    cursorPreResult: any;
    cursorAfterResult: any;
    cursorMcpResult: any;
    cursorReadResult: any;
    cursorStopResult: any;
  }
}

// =============================================================================
// Lifecycle hooks
// =============================================================================

Before({ tags: '@H6 or @H7' }, function (this: ChangeTracksWorld) {
  this.adapterTmpDir = null;
  this.adapterBatchFiles = new Map();
  this.ccPreResult = null;
  this.ccPostResult = null;
  this.ccStopResult = null;
  this.cursorPreResult = null;
  this.cursorAfterResult = null;
  this.cursorMcpResult = null;
  this.cursorReadResult = null;
  this.cursorStopResult = null;
});

After({ tags: '@H6 or @H7' }, async function (this: ChangeTracksWorld) {
  if (this.adapterTmpDir) {
    await fs.rm(this.adapterTmpDir, { recursive: true, force: true });
  }
});

// =============================================================================
// Shared Given steps (reuse existing "a temporary project directory" from hooks.steps.ts
// which sets batchTmpDir; here we alias for adapter-specific usage)
// =============================================================================

// NOTE: "a temporary project directory" and "a tracked file" and config steps
// already exist in hooks.steps.ts and set batchTmpDir. These features reuse them.

// =============================================================================
// H6 — Claude Code Adapter steps
// =============================================================================

When(
  'I call Claude Code PreToolUse with tool {string} on file {string}',
  async function (this: ChangeTracksWorld, toolName: string, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_input: fileName
        ? { file_path: path.join(this.batchTmpDir, fileName), old_string: 'old', new_string: 'new' }
        : {},
      cwd: this.batchTmpDir,
    };
    // For read_tracked_file, use file param instead of file_path
    if (toolName === 'read_tracked_file') {
      input.tool_input = { file: path.join(this.batchTmpDir, fileName) };
    }
    // For Read tool, only pass file_path
    if (toolName === 'Read') {
      input.tool_input = fileName ? { file_path: path.join(this.batchTmpDir, fileName) } : {};
    }
    this.ccPreResult = await handlePreToolUse(input);
  },
);

Then('the Claude Code hook returns empty', function (this: ChangeTracksWorld) {
  assert.ok(this.ccPreResult !== undefined, 'No Claude Code PreToolUse result');
  assert.deepStrictEqual(this.ccPreResult, {});
});

Then(
  'the Claude Code hook decision is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ccPreResult, 'No Claude Code PreToolUse result');
    assert.ok(this.ccPreResult.hookSpecificOutput, 'No hookSpecificOutput in result');
    assert.equal(this.ccPreResult.hookSpecificOutput.permissionDecision, expected);
  },
);

Then('the Claude Code hook has additional context', function (this: ChangeTracksWorld) {
  assert.ok(this.ccPreResult, 'No Claude Code PreToolUse result');
  assert.ok(this.ccPreResult.hookSpecificOutput, 'No hookSpecificOutput in result');
  assert.ok(
    typeof this.ccPreResult.hookSpecificOutput.additionalContext === 'string',
    'Expected additionalContext to be a string',
  );
});

Then(
  'the Claude Code hook reason contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ccPreResult, 'No Claude Code PreToolUse result');
    assert.ok(this.ccPreResult.hookSpecificOutput, 'No hookSpecificOutput in result');
    const reason = this.ccPreResult.hookSpecificOutput.permissionDecisionReason ?? '';
    assert.ok(
      reason.includes(expected),
      `Expected reason to contain "${expected}" but got: "${reason}"`,
    );
  },
);

// --- PostToolUse ---

When(
  'I call Claude Code PostToolUse with tool {string} on file {string} with old {string} and new {string}',
  async function (
    this: ChangeTracksWorld,
    toolName: string,
    fileName: string,
    oldText: string,
    newText: string,
  ) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const filePath = fileName ? path.join(this.batchTmpDir, fileName) : '';
    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: toolName,
      tool_input: filePath
        ? { file_path: filePath, old_string: oldText, new_string: newText }
        : { command: 'ls' },
      session_id: 'ses_bdd',
      cwd: this.batchTmpDir,
    };
    this.ccPostResult = await handlePostToolUse(input);
  },
);

Then(
  'the Claude Code post hook logged is {word}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.ccPostResult !== undefined, 'No Claude Code PostToolUse result');
    assert.equal(this.ccPostResult.logged, expected === 'true');
  },
);

Then(
  'the pending edits contain an entry for {string}',
  async function (this: ChangeTracksWorld, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const edits = await readPendingEdits(this.batchTmpDir);
    const fullPath = path.join(this.batchTmpDir, fileName);
    const found = edits.some((e) => e.file === fullPath);
    assert.ok(found, `Expected pending edit for "${fileName}" but found: ${JSON.stringify(edits.map((e) => e.file))}`);
  },
);

// --- Stop ---

Given(
  'a Claude Code pending substitution from {string} to {string} in session {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, sessionId: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
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

When(
  'I call Claude Code Stop for session {string}',
  async function (this: ChangeTracksWorld, sessionId: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    this.ccStopResult = await handleStop({
      hook_event_name: 'Stop',
      session_id: sessionId,
      cwd: this.batchTmpDir,
      stop_hook_active: true,
    });
  },
);

// =============================================================================
// H7 — Cursor Adapter steps
// =============================================================================

When(
  'I call Cursor preToolUse with tool {string} on file {string}',
  async function (this: ChangeTracksWorld, toolName: string, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'preToolUse',
      tool_name: toolName,
      tool_input: {
        file_path: path.join(this.batchTmpDir, fileName),
        old_string: 'old',
        new_string: 'new',
      },
      workspace_roots: [this.batchTmpDir],
    };
    this.cursorPreResult = await cursorPreToolUse(input);
  },
);

Then(
  'the Cursor decision is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.cursorPreResult, 'No Cursor preToolUse result');
    assert.equal(this.cursorPreResult.decision, expected);
  },
);

Then(
  'the Cursor reason contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.cursorPreResult, 'No Cursor preToolUse result');
    assert.ok(
      (this.cursorPreResult.reason ?? '').includes(expected),
      `Expected Cursor reason to contain "${expected}" but got: "${this.cursorPreResult.reason}"`,
    );
  },
);

// --- afterFileEdit ---

When(
  'I call Cursor afterFileEdit on {string} with old {string} and new {string} in conversation {string}',
  async function (
    this: ChangeTracksWorld,
    fileName: string,
    oldText: string,
    newText: string,
    conversationId: string,
  ) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: path.join(this.batchTmpDir, fileName),
      edits: [{ old_string: oldText, new_string: newText }],
      workspace_roots: [this.batchTmpDir],
      conversation_id: conversationId,
    };
    this.cursorAfterResult = await handleAfterFileEdit(input);
  },
);

Then(
  'the pending edits contain an entry for {string} with session {string}',
  async function (this: ChangeTracksWorld, fileName: string, sessionId: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const edits = await readPendingEdits(this.batchTmpDir);
    const fullPath = path.join(this.batchTmpDir, fileName);
    const found = edits.some((e) => e.file === fullPath && e.session_id === sessionId);
    assert.ok(
      found,
      `Expected pending edit for "${fileName}" with session "${sessionId}" but found: ${JSON.stringify(edits)}`,
    );
  },
);

// --- beforeMCPExecution ---

Given(
  'a Cursor config with author enforcement {string}',
  async function (this: ChangeTracksWorld, enforcement: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    await fs.writeFile(
      path.join(this.batchTmpDir, '.changetracks', 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude"\nenforcement = "${enforcement}"\n`,
      'utf-8',
    );
  },
);

When(
  'I call Cursor beforeMCPExecution with tool {string}',
  async function (this: ChangeTracksWorld, toolName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: toolName,
      tool_input: { file: 'readme.md' },
      workspace_roots: [this.batchTmpDir],
    };
    this.cursorMcpResult = await handleBeforeMcpExecution(input);
  },
);

When(
  'I call Cursor beforeMCPExecution with tool {string} without author',
  async function (this: ChangeTracksWorld, toolName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: toolName,
      tool_input: { file: 'readme.md', old_text: 'old', new_text: 'new' },
      workspace_roots: [this.batchTmpDir],
    };
    this.cursorMcpResult = await handleBeforeMcpExecution(input);
  },
);

Then('the Cursor MCP response continues', function (this: ChangeTracksWorld) {
  assert.ok(this.cursorMcpResult, 'No Cursor MCP result');
  assert.equal(this.cursorMcpResult.continue, true);
});

Then('the Cursor MCP response blocks', function (this: ChangeTracksWorld) {
  assert.ok(this.cursorMcpResult, 'No Cursor MCP result');
  assert.equal(this.cursorMcpResult.continue, false);
});

Then(
  'the Cursor MCP permission is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.cursorMcpResult, 'No Cursor MCP result');
    assert.equal(this.cursorMcpResult.permission, expected);
  },
);

Then(
  'the Cursor MCP message contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.cursorMcpResult, 'No Cursor MCP result');
    assert.ok(
      (this.cursorMcpResult.agentMessage ?? '').includes(expected),
      `Expected Cursor MCP message to contain "${expected}" but got: "${this.cursorMcpResult.agentMessage}"`,
    );
  },
);

// --- beforeReadFile ---

When(
  'I call Cursor beforeReadFile on {string}',
  async function (this: ChangeTracksWorld, fileName: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: path.join(this.batchTmpDir, fileName),
      workspace_roots: [this.batchTmpDir],
    };
    this.cursorReadResult = await handleBeforeReadFile(input);
  },
);

Then('the Cursor read response continues', function (this: ChangeTracksWorld) {
  assert.ok(this.cursorReadResult, 'No Cursor read result');
  assert.equal(this.cursorReadResult.continue, true);
});

Then('the Cursor read response blocks', function (this: ChangeTracksWorld) {
  assert.ok(this.cursorReadResult, 'No Cursor read result');
  assert.equal(this.cursorReadResult.continue, false);
});

Then(
  'the Cursor read permission is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.cursorReadResult, 'No Cursor read result');
    assert.equal(this.cursorReadResult.permission, expected);
  },
);

// --- Cursor stop ---

Given(
  'a Cursor pending substitution from {string} to {string} in conversation {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, conversationId: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const filePath = [...this.batchFiles.values()].pop();
    // If no file registered in batchFiles, create a placeholder entry
    const targetFile = filePath ?? path.join(this.batchTmpDir, 'readme.md');
    const pendingPath = path.join(this.batchTmpDir, '.changetracks', 'pending.json');
    const existing = await readPendingEdits(this.batchTmpDir);
    existing.push({
      file: targetFile,
      old_text: oldText,
      new_text: newText,
      timestamp: new Date().toISOString(),
      session_id: conversationId,
      edit_class: 'substitution',
      tool_name: 'Edit',
    } as any);
    await fs.writeFile(pendingPath, JSON.stringify(existing), 'utf-8');
  },
);

When(
  'I call Cursor stop for conversation {string}',
  async function (this: ChangeTracksWorld, conversationId: string) {
    assert.ok(this.batchTmpDir, 'Need a temporary project directory first');
    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [this.batchTmpDir],
      conversation_id: conversationId,
    };
    this.cursorStopResult = await handleCursorStop(input);
  },
);
