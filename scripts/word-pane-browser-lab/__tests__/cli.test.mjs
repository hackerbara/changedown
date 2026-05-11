import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationExitCode, parseArgs, valueAfterFlag } from '../cli.mjs';

test('valueAfterFlag reads --flag value and --flag=value', () => {
  assert.equal(valueAfterFlag(['lab', '--fixture', 'threeParasClean'], '--fixture'), 'threeParasClean');
  assert.equal(valueAfterFlag(['lab', '--fixture=threeParasClean'], '--fixture'), 'threeParasClean');
});

test('valueAfterFlag throws on missing flag value', () => {
  assert.throws(() => valueAfterFlag(['lab', '--fixture'], '--fixture'), /Missing value/);
});

test('parseArgs defaults to lab-safe mocked backend', () => {
  assert.deepEqual(parseArgs(['lab']), {
    mode: 'lab',
    backend: 'mocked',
    fixture: 'threeParasClean',
    scenarioNames: [],
    cdpPort: undefined,
    headless: false,
    allowLiveRelay: false,
    preserveOnFailure: false,
    holdOpenMs: 0,
  });
});

test('parseArgs supports latest report mode', () => {
  assert.deepEqual(parseArgs(['report', 'latest']), {
    mode: 'report',
    backend: 'mocked',
    fixture: 'threeParasClean',
    scenarioNames: ['latest'],
    cdpPort: undefined,
    headless: true,
    allowLiveRelay: false,
    preserveOnFailure: false,
    holdOpenMs: 0,
  });
});

test('parseArgs parses run scenarios and backend', () => {
  assert.deepEqual(parseArgs(['run', 'pane-loads-harness', 'remote-claim-waiting', '--backend', 'mocked-relay']), {
    mode: 'run',
    backend: 'mocked-relay',
    fixture: 'threeParasClean',
    scenarioNames: ['pane-loads-harness', 'remote-claim-waiting'],
    cdpPort: undefined,
    headless: true,
    allowLiveRelay: false,
    preserveOnFailure: false,
    holdOpenMs: 0,
  });
});

test('parseArgs requires --allow-live-relay for staging-relay', () => {
  assert.throws(() => parseArgs(['run', 'remote-apply-loop', '--backend', 'staging-relay']), /--allow-live-relay/);
});

test('parseArgs validates cdp port', () => {
  assert.equal(parseArgs(['lab', '--cdp-port', '9223']).cdpPort, 9223);
  assert.throws(() => parseArgs(['lab', '--cdp-port', 'abc']), /Invalid --cdp-port/);
  assert.throws(() => parseArgs(['lab', '--cdp-port', '80']), /Invalid --cdp-port/);
});


test('parseArgs keeps --flag=value values out of scenario names', () => {
  assert.deepEqual(parseArgs(['run', 'pane-loads-harness', '--backend=mocked-relay']).scenarioNames, ['pane-loads-harness']);
});


test('classificationExitCode fails non-converged run classifications', () => {
  assert.equal(classificationExitCode('converged'), 0);
  assert.equal(classificationExitCode('inconclusive'), 1);
  assert.equal(classificationExitCode('not-implemented'), 1);
});
