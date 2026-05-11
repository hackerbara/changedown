import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocalBridgeState, classifyPaneLoadHarness } from '../scenarios.mjs';

test('classifyPaneLoadHarness requires a usable connection and no page errors', () => {
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'connected' } }, 0), 'converged');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'unknown' }, connectionDotClass: 'cd-header__dot cd-header__dot--connected' }, 0), 'inconclusive');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'reconnecting' } }, 0), 'loaded-reconnecting');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'unknown' } }, 0), 'inconclusive');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'idle' } }, 0), 'inconclusive');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'failed' } }, 0), 'inconclusive');
  assert.equal(classifyPaneLoadHarness({ available: true, state: { connection: 'connected' } }, 1), 'inconclusive');
  assert.equal(classifyPaneLoadHarness({ available: false, state: { connection: 'connected' } }, 0), 'inconclusive');
});


test('classifyLocalBridgeState only converges healthy local bridge states', () => {
  assert.equal(classifyLocalBridgeState({ state: { connection: 'connected' } }), 'converged');
  assert.equal(classifyLocalBridgeState({ state: { connection: 'reconnecting' } }), 'bridge-reconnecting');
  assert.equal(classifyLocalBridgeState({ state: { connection: 'failed' } }), 'bridge-failed');
  assert.equal(classifyLocalBridgeState({ state: { connection: 'idle' } }), 'ui-only');
  assert.equal(classifyLocalBridgeState({ state: { connection: 'unknown' } }), 'ui-only');
});
