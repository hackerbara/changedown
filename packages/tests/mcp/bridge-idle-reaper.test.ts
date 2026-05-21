import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdleReaper } from '@changedown/mcp/bridge/idle-reaper';

describe('IdleReaper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire while there are active sessions', () => {
    const onIdle = vi.fn();
    const reaper = new IdleReaper({
      idleTimeoutMs: 1000,
      checkIntervalMs: 100,
      onIdle,
      isActive: () => true,
    });
    reaper.start();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
    reaper.stop();
  });

  it('fires after idleTimeoutMs of inactivity', () => {
    const onIdle = vi.fn();
    let active = false;
    const reaper = new IdleReaper({
      idleTimeoutMs: 1000,
      checkIntervalMs: 100,
      onIdle,
      isActive: () => active,
    });
    reaper.start();

    // 500ms idle so far — not yet triggered.
    vi.advanceTimersByTime(500);
    expect(onIdle).not.toHaveBeenCalled();

    // Activity arrives — resets the idle clock.
    active = true;
    vi.advanceTimersByTime(200);
    expect(onIdle).not.toHaveBeenCalled();

    // Activity ends — clock starts over.
    active = false;
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200); // 1800ms wall clock — reaper saw idle start at t=800ms, so 1000ms idle elapses now and onIdle fires
    expect(onIdle).toHaveBeenCalledTimes(1);
    reaper.stop();
  });

  it('stop() prevents further callbacks', () => {
    const onIdle = vi.fn();
    const reaper = new IdleReaper({
      idleTimeoutMs: 100,
      checkIntervalMs: 50,
      onIdle,
      isActive: () => false,
    });
    reaper.start();
    reaper.stop();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
