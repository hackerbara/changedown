// test/analyzer.test.ts
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import { analyze, addRecognizer, resetRecognizers } from '../src/analyzer.js';
// ToolCall type used inline via object literals

describe('analyzer orchestrator', () => {
  beforeEach(() => resetRecognizers());

  const cwd = '/project';

  it('routes Edit to edit-write-read analyzer', () => {
    const ops = analyze({ tool: 'edit', input: { file_path: '/project/foo.md' }, cwd });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'write');
  });

  it('routes Read to edit-write-read analyzer', () => {
    const ops = analyze({ tool: 'read', input: { file_path: '/project/foo.md' }, cwd });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'read');
  });

  it('routes Bash to bash analyzer', () => {
    const ops = analyze({ tool: 'bash', input: { command: 'sed -i s/a/b/ foo.md' }, cwd });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'write');
  });

  it('returns empty for unknown tools (fail-open)', () => {
    const ops = analyze({ tool: 'propose_change', input: { file: 'foo.md' }, cwd });
    assert.equal(ops.length, 0);
  });

  it('bash with redirect detects write', () => {
    const ops = analyze({ tool: 'bash', input: { command: 'echo hello > output.md' }, cwd });
    assert.ok(ops.some(o => o.op === 'write' && o.file.endsWith('output.md')));
  });

  it('addRecognizer extends bash analysis', () => {
    addRecognizer({
      command: 'deploy-docs',
      extract: (argv) => [{ op: 'write', file: argv[1] ?? '' }],
    });
    const ops = analyze({ tool: 'bash', input: { command: 'deploy-docs target.md' }, cwd });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].file, '/project/target.md');
  });
});
