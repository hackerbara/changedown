// packages/tests/mcp/signals-resume-race.test.ts
// Regression test for F-1: signals.ts must NOT call process.stdin.resume()
// before the transport attaches its data listener.
import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { installSignalHandlers } from '@changedown/mcp/transport/signals';

describe('stdin resume invariant', () => {
  it('installSignalHandlers leaves stdin paused for the MCP transport to consume', () => {
    const originalSigint = process.listeners('SIGINT');
    const originalSigterm = process.listeners('SIGTERM');
    const originalEnd = process.stdin.listeners('end');
    const originalError = process.stdin.listeners('error');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.stdin.removeAllListeners('end');
    process.stdin.removeAllListeners('error');

    const resumeSpy = vi.spyOn(process.stdin, 'resume');
    const stack = new AsyncDisposableStack();

    try {
      installSignalHandlers(stack);
      expect(resumeSpy).not.toHaveBeenCalled();
    } finally {
      resumeSpy.mockRestore();
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
      for (const listener of originalSigint) process.on('SIGINT', listener as (...args: unknown[]) => void);
      for (const listener of originalSigterm) process.on('SIGTERM', listener as (...args: unknown[]) => void);
      for (const listener of originalEnd) process.stdin.on('end', listener as (...args: unknown[]) => void);
      for (const listener of originalError) process.stdin.on('error', listener as (...args: unknown[]) => void);
    }
  });

  it('a stream that does NOT resume() before attaching a data listener preserves bytes', () => {
    const stream = new PassThrough();
    stream.write('hello\n');

    const received: string[] = [];
    stream.on('data', (chunk: Buffer) => received.push(chunk.toString()));
    stream.end();

    expect(received.join('')).toBe('hello\n');
  });
});
