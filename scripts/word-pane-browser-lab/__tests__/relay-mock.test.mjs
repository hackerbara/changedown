import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimResponse, buildReleaseResponse, relaySocketInitScriptSource, roomIdFromClaimUrl } from '../relay-mock.mjs';

test('roomIdFromClaimUrl extracts public room id', () => {
  assert.equal(roomIdFromClaimUrl('https://relay.test/room/public-1/claim'), 'public-1');
  assert.equal(roomIdFromClaimUrl('https://relay.test/room/not-public/claim'), 'not-public');
});

test('buildClaimResponse mints cdr2 token shape', () => {
  const claim = buildClaimResponse({ roomId: 'public-1', relayBaseUrl: 'https://relay.test' });
  assert.equal(claim.roomId, 'public-1');
  assert.equal(claim.state, 'waiting_for_pane');
  assert.equal(claim.relayUrl, 'https://relay.test/pane');
  assert.match(claim.token, /^cdr2\.public-1\./);
  assert.equal(typeof claim.expiresAt, 'number');
});

test('buildReleaseResponse marks room available', () => {
  assert.deepEqual(buildReleaseResponse({ roomId: 'public-1' }), { roomId: 'public-1', state: 'available' });
});

test('relaySocketInitScriptSource contains backendOperation support', () => {
  const source = relaySocketInitScriptSource();
  assert.match(source, /backendOperation/);
  assert.match(source, /__cdRelaySocketControl/);
});
