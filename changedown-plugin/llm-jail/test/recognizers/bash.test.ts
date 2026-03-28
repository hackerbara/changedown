// test/recognizers/bash.test.ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { splitCommand, extractRedirect } from '../../src/recognizers/bash.js';

describe('bash command splitter', () => {
  it('splits on &&', () => {
    const segments = splitCommand('echo hello && cat foo.md');
    assert.deepEqual(segments, ['echo hello', 'cat foo.md']);
  });

  it('splits on ||', () => {
    const segments = splitCommand('test -f x || echo missing');
    assert.deepEqual(segments, ['test -f x', 'echo missing']);
  });

  it('splits on ;', () => {
    const segments = splitCommand('cd /tmp; ls');
    assert.deepEqual(segments, ['cd /tmp', 'ls']);
  });

  it('splits on |', () => {
    const segments = splitCommand('cat file.md | grep test');
    assert.deepEqual(segments, ['cat file.md', 'grep test']);
  });

  it('respects double quotes', () => {
    const segments = splitCommand('echo "hello && world" && cat foo');
    assert.deepEqual(segments, ['echo "hello && world"', 'cat foo']);
  });

  it('respects single quotes', () => {
    const segments = splitCommand("echo 'hello; world' ; cat foo");
    assert.deepEqual(segments, ["echo 'hello; world'", 'cat foo']);
  });

  it('respects backslash escapes', () => {
    const segments = splitCommand('echo hello\\;world ; cat foo');
    assert.deepEqual(segments, ['echo hello\\;world', 'cat foo']);
  });

  it('handles empty input', () => {
    assert.deepEqual(splitCommand(''), []);
  });

  it('handles single command', () => {
    assert.deepEqual(splitCommand('ls -la'), ['ls -la']);
  });

  it('trims segments', () => {
    const segments = splitCommand('echo a  &&  echo b');
    assert.deepEqual(segments, ['echo a', 'echo b']);
  });
});

describe('redirect detection', () => {
  it('detects > redirect', () => {
    const result = extractRedirect('echo hello > output.txt');
    assert.ok(result);
    assert.equal(result!.file, 'output.txt');
    assert.equal(result!.command, 'echo hello');
  });

  it('detects >> append redirect', () => {
    const result = extractRedirect('echo hello >> output.txt');
    assert.ok(result);
    assert.equal(result!.file, 'output.txt');
    assert.equal(result!.command, 'echo hello');
  });

  it('returns null when no redirect', () => {
    assert.equal(extractRedirect('cat foo.txt'), null);
  });

  it('ignores > inside quotes', () => {
    assert.equal(extractRedirect('echo "foo > bar"'), null);
  });

  it('handles spaces around >', () => {
    const result = extractRedirect('cat foo.txt >  output.md');
    assert.ok(result);
    assert.equal(result!.file, 'output.md');
  });
});
