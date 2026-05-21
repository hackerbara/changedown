// packages/tests/mcp-transport/shutdown-idempotent.test.ts
import { describe, it, expect } from 'vitest';
import { spawnServer } from './spawn-server.js';

const PORT = 49993;

describe('Bug C — shutdown is idempotent under racing signals', () => {
  it('stdin close + SIGINT in same tick exits cleanly with no uncaught exceptions', async () => {
    const server = spawnServer({ port: PORT, env: { CHANGEDOWN_MCP_USE_HTTP: 'true' } });
    await server.ready;

    // Trigger both teardown paths in the same tick.
    server.proc.stdin!.end();
    server.proc.kill('SIGINT');

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        const t = setTimeout(() => {
          server.proc.kill('SIGKILL');
        }, 3000);
        server.proc.once('exit', (code, sig) => {
          clearTimeout(t);
          resolve({ code, signal: sig });
        });
      },
    );

    expect(result.code).toBe(0);
    const stderrText = server.stderr.join('');
    expect(stderrText).not.toMatch(/UnhandledPromiseRejection|TypeError|uncaught/i);
  });
});
