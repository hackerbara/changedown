// packages/tests/mcp-transport/devcerts-missing.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawnServer } from './spawn-server.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = 49996;

describe('Bug F — missing dev certs produce a clear startup error, not a hang', () => {
  let emptyDir: string | undefined;

  afterEach(() => {
    if (emptyDir) rmSync(emptyDir, { recursive: true, force: true });
    emptyDir = undefined;
  });

  it('exits within 500ms with HttpsRequiredError on stderr', async () => {
    emptyDir = mkdtempSync(join(tmpdir(), 'no-certs-'));

    const server = spawnServer({
      port: PORT,
      env: {
        // HTTPS is the default; no env var needed to force it.
        // Steer the cert loader at an empty directory.
        // The implementation reads from ~/.office-addin-dev-certs by default;
        // tests use CHANGEDOWN_DEV_CERT_DIR override (added as part of the fix).
        CHANGEDOWN_DEV_CERT_DIR: emptyDir,
      },
      // No readyPattern — the server exits before printing the running banner.
      // spawnServer rejects `ready` on process exit, which is what we assert.
    });

    const t0 = Date.now();
    await expect(server.ready).rejects.toThrow();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000);

    const stderrText = server.stderr.join('');
    expect(stderrText).toMatch(/HttpsRequiredError/);
  });
});
