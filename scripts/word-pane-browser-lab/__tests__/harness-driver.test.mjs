import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { assertPortAvailable, cdpLaunchArgs, mapBrowserLabBackend, resolveCompiledHarnessPath } from '../harness-driver.mjs';

test('mapBrowserLabBackend maps browser lab names to existing word harness names', () => {
  assert.equal(mapBrowserLabBackend('mocked'), 'mocked');
  assert.equal(mapBrowserLabBackend('mocked-relay'), 'mocked');
  assert.equal(mapBrowserLabBackend('real-local-mcp'), 'real');
  assert.throws(() => mapBrowserLabBackend('local-worker-relay'), /not implemented/);
});

test('cdpLaunchArgs exposes CDP on loopback only when requested', () => {
  assert.deepEqual(cdpLaunchArgs(undefined), []);
  assert.deepEqual(cdpLaunchArgs(9223), [
    '--remote-debugging-port=9223',
    '--remote-debugging-address=127.0.0.1',
  ]);
});

test('resolveCompiledHarnessPath points at the tsc rootDirs output shape', () => {
  assert.match(resolveCompiledHarnessPath(), /packages\/tests\/word-addin\/out\/packages\/tests\/word-addin\/journeys\/wordHarness\.js$/);
});


test('assertPortAvailable rejects occupied ports', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await assert.rejects(() => assertPortAvailable(port), /already in use/);
  await new Promise((resolve) => server.close(resolve));
});
