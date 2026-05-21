import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRegistry } from '@changedown/mcp/bridge/session-registry';

describe('SessionRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues opaque tokens of nontrivial entropy', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 60_000 });
    const a = reg.register({ tool: 'claude-code', pid: 100, sessionId: 's1' });
    const b = reg.register({ tool: 'claude-code', pid: 101, sessionId: 's2' });
    expect(a.token).not.toEqual(b.token);
    expect(a.token).toMatch(/^[a-f0-9]{32}$/);
  });

  it('lookup returns the registered metadata', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 60_000 });
    const { token } = reg.register({ tool: 'codex', pid: 200, sessionId: 'sx' });
    const found = reg.lookup(token);
    expect(found?.tool).toBe('codex');
    expect(found?.pid).toBe(200);
    expect(found?.sessionId).toBe('sx');
  });

  it('lookup returns null for unknown token', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 60_000 });
    expect(reg.lookup('not-a-token')).toBeNull();
  });

  it('lookup updates lastSeenAt to defer idle expiry', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 1000 });
    const { token } = reg.register({ tool: 't', pid: 1, sessionId: 's' });
    vi.advanceTimersByTime(900);
    expect(reg.lookup(token)).not.toBeNull(); // still alive
    vi.advanceTimersByTime(900);
    expect(reg.lookup(token)).not.toBeNull(); // refreshed by previous lookup
    vi.advanceTimersByTime(1100);
    expect(reg.lookup(token)).toBeNull(); // now expired
  });

  it('size() reports active session count, used by the idle reaper', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 60_000 });
    expect(reg.size()).toBe(0);
    reg.register({ tool: 't', pid: 1, sessionId: 'a' });
    reg.register({ tool: 't', pid: 2, sessionId: 'b' });
    expect(reg.size()).toBe(2);
  });

  it('size() does not count expired-but-never-looked-up sessions', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 1000 });
    reg.register({ tool: 't', pid: 1, sessionId: 'a' });
    expect(reg.size()).toBe(1);
    vi.advanceTimersByTime(1100);
    // Session is expired but lookup was never called — size() must purge it.
    expect(reg.size()).toBe(0);
  });

  it('unregister removes the session', () => {
    const reg = new SessionRegistry({ idleTimeoutMs: 60_000 });
    const { token } = reg.register({ tool: 't', pid: 1, sessionId: 's' });
    expect(reg.size()).toBe(1);
    reg.unregister(token);
    expect(reg.size()).toBe(0);
    expect(reg.lookup(token)).toBeNull();
  });
});
