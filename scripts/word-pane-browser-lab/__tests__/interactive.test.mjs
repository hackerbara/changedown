import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInteractiveCommand, renderBrowserLabHandoff } from '../interactive.mjs';

test('parseInteractiveCommand defaults to help', () => {
  assert.deepEqual(parseInteractiveCommand(''), { name: 'help', args: [] });
  assert.deepEqual(parseInteractiveCommand('  screenshot after-load  '), { name: 'screenshot', args: ['after-load'] });
});

test('renderBrowserLabHandoff includes CDP and cleanup instructions', () => {
  const handoff = renderBrowserLabHandoff({
    pageUrl: 'https://localhost:3001/harness.html?harness=1',
    cdpPort: 9223,
    cdpVersion: { webSocketDebuggerUrl: 'ws://127.0.0.1:9223/devtools/browser/abc' },
    artifactDir: '/tmp/artifacts',
    backend: 'mocked',
    fixture: 'threeParasClean',
  });
  assert.match(handoff, /CDP endpoint/);
  assert.match(handoff, /9223/);
  assert.match(handoff, /Type `exit`/);
});
