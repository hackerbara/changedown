import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { fileCommandRecognizers } from '../../src/recognizers/file-commands.js';

function findRecognizer(name: string) {
  return fileCommandRecognizers.find(r =>
    typeof r.command === 'string' ? r.command === name : r.command.test(name)
  )!;
}

describe('file command recognizers', () => {
  it('cp: detects write to destination', () => {
    const r = findRecognizer('cp');
    const result = r.extract(['cp', 'src.md', 'dest.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'write');
    assert.equal(result[0].file, 'dest.md');
  });

  it('mv: detects write to destination and delete of source', () => {
    const r = findRecognizer('mv');
    const result = r.extract(['mv', 'old.md', 'new.md'], '');
    assert.equal(result.length, 2);
    assert.equal(result[0].op, 'write');
    assert.equal(result[0].file, 'new.md');
    assert.equal(result[1].op, 'delete');
    assert.equal(result[1].file, 'old.md');
  });

  it('rm: detects delete', () => {
    const r = findRecognizer('rm');
    const result = r.extract(['rm', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'delete');
    assert.equal(result[0].file, 'file.md');
  });

  it('rm -rf: detects delete of multiple files', () => {
    const r = findRecognizer('rm');
    const result = r.extract(['rm', '-rf', 'a.md', 'b.md'], '');
    assert.equal(result.length, 2);
  });

  it('tee: detects write', () => {
    const r = findRecognizer('tee');
    const result = r.extract(['tee', 'output.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'write');
  });

  it('cat without redirect: detects read', () => {
    const r = findRecognizer('cat');
    const result = r.extract(['cat', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'read');
  });

  it('touch: detects write', () => {
    const r = findRecognizer('touch');
    const result = r.extract(['touch', 'new.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'write');
  });

  it('chmod: detects write on all non-flag args', () => {
    const r = findRecognizer('chmod');
    const result = r.extract(['chmod', '+x', 'script.sh'], '');
    // metaWriteRecognizer reports all non-flag args — +x is not a flag (no dash prefix)
    assert.equal(result.length, 2);
    assert.equal(result[0].op, 'write');
    assert.equal(result[1].file, 'script.sh');
  });

  it('chmod: detects write on multiple files', () => {
    const r = findRecognizer('chmod');
    const result = r.extract(['chmod', '+x', 'a.sh', 'b.sh'], '');
    assert.equal(result.length, 3); // +x, a.sh, b.sh
  });

  it('head: detects read', () => {
    const r = findRecognizer('head');
    const result = r.extract(['head', '-n', '10', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'read');
  });
});
