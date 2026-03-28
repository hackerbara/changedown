import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { interpreterRecognizers } from '../../src/recognizers/interpreters.js';

function findRecognizer(name: string) {
  return interpreterRecognizers.find(r =>
    typeof r.command === 'string' ? r.command === name : r.command.test(name)
  )!;
}

describe('interpreter recognizers', () => {
  describe('python', () => {
    const r = interpreterRecognizers.find(r =>
      r.command instanceof RegExp && r.command.test('python3')
    )!;

    it('detects open() with write mode', () => {
      const result = r.extract(
        ['python3', '-c', "open('out.md', 'w').write('hello')"],
        "python3 -c \"open('out.md', 'w').write('hello')\"",
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].op, 'write');
      assert.equal(result[0].file, 'out.md');
    });

    it('detects Path.write_text', () => {
      const result = r.extract(
        ['python', '-c', "Path('out.md').write_text('hello')"],
        '',
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].file, 'out.md');
    });

    it('returns empty for read-only script', () => {
      const result = r.extract(
        ['python3', '-c', "print(open('file.md').read())"],
        '',
      );
      assert.equal(result.length, 0);
    });
  });

  describe('node', () => {
    const r = interpreterRecognizers.find(r =>
      r.command instanceof RegExp && r.command.test('node')
    )!;

    it('detects writeFileSync', () => {
      const result = r.extract(
        ['node', '-e', "fs.writeFileSync('out.md', 'data')"],
        '',
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].file, 'out.md');
    });

    it('detects writeFile', () => {
      const result = r.extract(
        ['node', '-e', "fs.writeFile('out.md', 'data', cb)"],
        '',
      );
      assert.equal(result.length, 1);
    });

    it('returns empty for read-only', () => {
      const result = r.extract(
        ['node', '-e', "console.log(fs.readFileSync('f.md'))"],
        '',
      );
      assert.equal(result.length, 0);
    });
  });

  describe('perl', () => {
    const r = findRecognizer('perl');

    it('detects perl -pi -e with file args', () => {
      const result = r.extract(['perl', '-pi', '-e', 's/old/new/g', 'file.md'], '');
      assert.equal(result.length, 1);
      assert.equal(result[0].op, 'write');
      assert.equal(result[0].file, 'file.md');
    });

    it('detects perl -i without -e (expression is first non-flag arg)', () => {
      const result = r.extract(['perl', '-i', 's/old/new/g', 'file.md'], '');
      assert.equal(result.length, 1);
      assert.equal(result[0].op, 'write');
      assert.equal(result[0].file, 'file.md');
    });

    it('ignores perl -e without -i', () => {
      const result = r.extract(['perl', '-e', 'print "hello"'], '');
      assert.equal(result.length, 0);
    });
  });

  describe('ruby', () => {
    const r = findRecognizer('ruby');

    it('detects File.write', () => {
      const result = r.extract(
        ['ruby', '-e', "File.write('out.md', 'data')"],
        '',
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].file, 'out.md');
    });

    it('returns empty for read-only', () => {
      const result = r.extract(
        ['ruby', '-e', "puts File.read('f.md')"],
        '',
      );
      assert.equal(result.length, 0);
    });
  });
});
