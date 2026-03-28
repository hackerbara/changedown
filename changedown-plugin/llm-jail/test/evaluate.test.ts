// test/evaluate.test.ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { evaluate } from '../src/evaluate.js';
import type { Rule, ToolCall } from '../src/types.js';

describe('evaluate (pre-phase)', () => {
  const cwd = '/project';

  const denyMdWrites: Rule = {
    name: 'deny-md-writes',
    scope: (file) => file.endsWith('.md'),
    onWrite: () => ({ action: 'deny', reason: 'MD files are protected' }),
    onRead: () => ({ action: 'allow' }),
  };

  const warnOnWrites: Rule = {
    name: 'warn-writes',
    scope: (file) => file.endsWith('.md'),
    onWrite: () => ({ action: 'warn', agentHint: 'Write will be tracked' }),
  };

  it('denies write to in-scope file', async () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'deny');
  });

  it('allows write to out-of-scope file', async () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.ts' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'allow');
  });

  it('allows read on in-scope file when rule allows', async () => {
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'allow');
  });

  it('allows unknown tools (fail-open)', async () => {
    const call: ToolCall = { tool: 'propose_change', input: {}, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'allow');
  });

  it('first deny wins across stacked rules', async () => {
    const allowAll: Rule = {
      name: 'allow-all',
      scope: () => true,
      onWrite: () => ({ action: 'allow' }),
    };
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites, allowAll]);
    assert.equal(verdict.action, 'deny');
  });

  it('collects warn when no deny', async () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [warnOnWrites]);
    assert.equal(verdict.action, 'warn');
    assert.equal(verdict.agentHint, 'Write will be tracked');
  });

  it('deny takes precedence over warn', async () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [warnOnWrites, denyMdWrites]);
    assert.equal(verdict.action, 'deny');
  });

  it('handles bash commands', async () => {
    const call: ToolCall = { tool: 'bash', input: { command: 'sed -i s/a/b/ foo.md' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'deny');
  });

  it('allows bash commands on non-scoped files', async () => {
    const call: ToolCall = { tool: 'bash', input: { command: 'cat foo.ts' }, cwd };
    const verdict = await evaluate(call, [denyMdWrites]);
    assert.equal(verdict.action, 'allow');
  });

  it('supports async rule handlers', async () => {
    const asyncRule: Rule = {
      name: 'async-rule',
      scope: () => true,
      onWrite: async () => ({ action: 'deny', reason: 'async deny' }),
    };
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const verdict = await evaluate(call, [asyncRule]);
    assert.equal(verdict.action, 'deny');
  });

  it('onToolCall gate fires for MCP tools', async () => {
    const mcpGate: Rule = {
      name: 'mcp-gate',
      scope: () => true,
      onToolCall: (call) => {
        if (call.tool === 'propose_change' && !call.input.author) {
          return { action: 'deny', reason: 'Author required' };
        }
        return { action: 'allow' };
      },
    };
    const call: ToolCall = { tool: 'propose_change', input: { file: 'foo.md' }, cwd };
    const verdict = await evaluate(call, [mcpGate]);
    assert.equal(verdict.action, 'deny');
    assert.equal(verdict.reason, 'Author required');
  });
});
