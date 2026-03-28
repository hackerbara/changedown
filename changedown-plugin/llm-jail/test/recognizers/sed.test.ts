import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { sedRecognizer } from '../../src/recognizers/sed.js';

describe('sed recognizer', () => {
  it('detects sed -i with file arg', () => {
    const result = sedRecognizer.extract(['sed', '-i', 's/old/new/', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].op, 'write');
    assert.equal(result[0].file, 'file.md');
  });

  it('detects sed -i with backup suffix', () => {
    const result = sedRecognizer.extract(['sed', '-i.bak', 's/old/new/', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].file, 'file.md');
  });

  it('detects multiple file args', () => {
    const result = sedRecognizer.extract(['sed', '-i', 's/old/new/', 'a.md', 'b.md'], '');
    assert.equal(result.length, 2);
    assert.equal(result[0].file, 'a.md');
    assert.equal(result[1].file, 'b.md');
  });

  it('ignores sed without -i (read-only)', () => {
    const result = sedRecognizer.extract(['sed', 's/old/new/', 'file.md'], '');
    assert.equal(result.length, 0);
  });

  it('detects -i with -e flag', () => {
    const result = sedRecognizer.extract(['sed', '-i', '-e', 's/old/new/', 'file.md'], '');
    assert.equal(result.length, 1);
    assert.equal(result[0].file, 'file.md');
  });
});
