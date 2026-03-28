import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { redirectRecognizers } from '../../src/recognizers/redirects.js';

function findRecognizer(name: string) {
  return redirectRecognizers.find(r =>
    typeof r.command === 'string' ? r.command === name : r.command.test(name)
  )!;
}

describe('redirect-based recognizers', () => {
  it('echo: detected as write source when raw has redirect', () => {
    const r = findRecognizer('echo');
    const result = r.extract(['echo', 'hello', 'world'], 'echo hello world > file.md');
    assert.equal(result.length, 0);
  });

  it('printf: same as echo', () => {
    const r = findRecognizer('printf');
    const result = r.extract(['printf', '%s', 'hello'], 'printf "%s" hello > file.md');
    assert.equal(result.length, 0);
  });
});
