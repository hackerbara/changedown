// packages/tests/mcp-transport/heartbeat-promotion-race.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __testHooks__,
  bindOrForward,
} from '../../../changedown-plugin/mcp-server/src/transport/fixed-port-leader.js';

const PORT = 49994;

describe('Bug D — heartbeat promotion handles double bindOrForward failure', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (err: unknown) => unhandled.push(err);

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    __testHooks__.resetBindOverride();
  });

  it('does not emit unhandledRejection when both promotion attempts fail', async () => {
    // Inject a bind function that fails on every call. Heartbeat will
    // detect host died, then attempt bindOrForward (fails), then retry
    // inside catch (also fails). The fix logs and returns; the bug emits
    // an unhandled rejection.
    let calls = 0;
    __testHooks__.overrideBindForTests(async () => {
      calls++;
      throw new Error(`mock bind failure #${calls}`);
    });

    // Pretend we already lost the host and need to promote.
    // makeHeartbeat is internal; we exercise it via the public client-result
    // returned by bindOrForward when the port is held. To make the port
    // "held" without a real server, mock probeHealth too (via env hook).
    process.env.CHANGEDOWN_MCP_TEST_FAKE_HEALTH = '1';
    process.env.CHANGEDOWN_MCP_REQUIRE_HTTPS = '0';

    const result = await bindOrForward(PORT, {});
    expect(result.mode).toBe('client');
    if (result.mode !== 'client') return;

    // Trigger promotion: heartbeat with very short interval, threshold 1.
    // probeHealth will fail (no real server), heartbeat will go to threshold,
    // call our mocked bindOrForward, throw, catch handler retries, throws again.
    const promotion = result.startHeartbeat({ intervalMs: 50, failThreshold: 1 });
    // The promotion promise should NEVER resolve when both binds fail —
    // but the process must not emit unhandledRejection.
    await Promise.race([
      promotion,
      new Promise((r) => setTimeout(r, 1000)),
    ]);

    expect(unhandled).toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(2); // both promotion attempts were made

    delete process.env.CHANGEDOWN_MCP_TEST_FAKE_HEALTH;
  });
});
