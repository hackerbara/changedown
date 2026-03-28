import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { analyzeEditWriteRead } from '../../src/recognizers/edit-write-read.js';
import type { ToolCall } from '../../src/types.js';

describe('edit-write-read analyzer', () => {
  const cwd = '/project';

  it('extracts write from Edit tool', () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: '/project/foo.md' }, cwd };
    const ops = analyzeEditWriteRead(call);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'write');
    assert.equal(ops[0].file, '/project/foo.md');
  });

  it('extracts write from Write tool', () => {
    const call: ToolCall = { tool: 'write', input: { file_path: '/project/bar.md' }, cwd };
    const ops = analyzeEditWriteRead(call);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'write');
    assert.equal(ops[0].file, '/project/bar.md');
  });

  it('extracts read from Read tool', () => {
    const call: ToolCall = { tool: 'read', input: { file_path: '/project/baz.md' }, cwd };
    const ops = analyzeEditWriteRead(call);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'read');
    assert.equal(ops[0].file, '/project/baz.md');
  });

  it('returns empty for missing file_path', () => {
    const call: ToolCall = { tool: 'edit', input: {}, cwd };
    assert.equal(analyzeEditWriteRead(call).length, 0);
  });

  it('resolves relative paths against cwd', () => {
    const call: ToolCall = { tool: 'edit', input: { file_path: 'src/foo.ts' }, cwd };
    const ops = analyzeEditWriteRead(call);
    assert.equal(ops[0].file, '/project/src/foo.ts');
  });

  it('returns empty for unrecognized tool', () => {
    const call: ToolCall = { tool: 'bash', input: { file_path: '/foo' }, cwd };
    assert.equal(analyzeEditWriteRead(call).length, 0);
  });
});
