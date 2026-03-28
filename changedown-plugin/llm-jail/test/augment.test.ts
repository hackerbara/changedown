// test/augment.test.ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { augment } from '../src/augment.js';
import type { Rule, ToolCall, ToolResult } from '../src/types.js';

describe('augment (post-phase)', () => {
  const cwd = '/project';
  const result: ToolResult = { tool_response: 'file content here' };

  it('returns additionalContext from afterRead', async () => {
    const rule: Rule = {
      name: 'metadata',
      scope: (f) => f.endsWith('.md'),
      afterRead: () => 'hashline metadata here',
    };
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/foo.md' }, cwd };
    const ctx = await augment(call, result, [rule]);
    assert.equal(ctx, 'hashline metadata here');
  });

  it('returns null for out-of-scope files', async () => {
    const rule: Rule = {
      name: 'metadata',
      scope: (f) => f.endsWith('.md'),
      afterRead: () => 'metadata',
    };
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/foo.ts' }, cwd };
    const ctx = await augment(call, result, [rule]);
    assert.equal(ctx, null);
  });

  it('runs void handlers (side effects) without short-circuiting', async () => {
    let sideEffectRan = false;
    const sideEffectRule: Rule = {
      name: 'logger',
      scope: () => true,
      afterWrite: () => { sideEffectRan = true; },
    };
    const contextRule: Rule = {
      name: 'context',
      scope: () => true,
      afterWrite: () => 'additional context',
    };
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const ctx = await augment(call, result, [sideEffectRule, contextRule]);
    assert.ok(sideEffectRan, 'side effect handler should have run');
    assert.equal(ctx, 'additional context');
  });

  it('string handler short-circuits further evaluation', async () => {
    let secondRan = false;
    const first: Rule = {
      name: 'first',
      scope: () => true,
      afterRead: () => 'first context',
    };
    const second: Rule = {
      name: 'second',
      scope: () => true,
      afterRead: () => { secondRan = true; return 'second context'; },
    };
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/foo.md' }, cwd };
    const ctx = await augment(call, result, [first, second]);
    assert.equal(ctx, 'first context');
    assert.ok(!secondRan, 'second handler should not run after string return');
  });

  it('returns null for unknown tools', async () => {
    const rule: Rule = { name: 'r', scope: () => true, afterRead: () => 'ctx' };
    const call: ToolCall = { tool: 'propose_change', input: {}, cwd };
    assert.equal(await augment(call, result, [rule]), null);
  });

  it('supports async handlers', async () => {
    const rule: Rule = {
      name: 'async',
      scope: () => true,
      afterRead: async () => 'async context',
    };
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/foo.md' }, cwd };
    const ctx = await augment(call, result, [rule]);
    assert.equal(ctx, 'async context');
  });
});
