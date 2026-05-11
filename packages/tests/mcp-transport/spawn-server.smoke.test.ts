import { describe, it, expect } from 'vitest';
import { spawnServer, isPortListening } from './spawn-server.js';

const PORT = 49990;

describe('spawnServer helper', () => {
  it('spawns a host that binds the port and stops cleanly on SIGTERM', async () => {
    const server = spawnServer({ port: PORT, env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' } });
    await server.ready;
    expect(await isPortListening(PORT)).toBe(true);
    const result = await server.stop('SIGTERM');
    expect(result.signal === 'SIGTERM' || result.code === 0).toBe(true);
  });
});
