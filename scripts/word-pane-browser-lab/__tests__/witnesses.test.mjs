import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { classifyPaneConnectionState, installBrowserWitnesses } from '../witnesses.mjs';

test('installBrowserWitnesses captures and redacts browser events', () => {
  const page = new EventEmitter();
  const witness = installBrowserWitnesses(page);
  page.emit('console', { type: () => 'log', text: () => 'Authorization: Bearer abc.def' });
  page.emit('pageerror', new Error('boom'));
  page.emit('request', { method: () => 'GET', url: () => 'https://relay.test/?token=secret', resourceType: () => 'fetch' });
  page.emit('response', { status: () => 200, url: () => 'https://relay.test/?token=secret' });

  const snapshot = witness.snapshot();
  assert.equal(snapshot.consoleMessages.length, 1);
  assert.equal(snapshot.pageErrors.length, 1);
  assert.equal(snapshot.requests[0].url, 'https://relay.test/?token=%5Bredacted%5D');
  assert.equal(snapshot.responses[0].url, 'https://relay.test/?token=%5Bredacted%5D');
  assert.doesNotMatch(JSON.stringify(snapshot), /secret|abc\.def/);
});


test('classifyPaneConnectionState compares harness connection state', () => {
  assert.equal(classifyPaneConnectionState({ state: { connection: 'connected' } }, 'connected'), 'converged');
  assert.equal(classifyPaneConnectionState({ state: { connection: 'failed' } }, 'connected'), 'ui-only');
});
