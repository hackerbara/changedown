import { afterEach, describe, expect, test, vi } from 'vitest';
import { computeLineHash, initHashline } from './hashline.js';

const HASHLINE_KEY = '__changedown_xxhash__';

function resetHashline(): void {
  delete (globalThis as Record<string, unknown>)[HASHLINE_KEY];
}

describe('hashline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetHashline();
  });

  test('computes stable xxHash-compatible 2-character line hashes', async () => {
    resetHashline();
    await initHashline();

    expect(computeLineHash(0, '')).toBe('05');
    expect(computeLineHash(0, 'abc')).toBe('ff');
    expect(computeLineHash(0, 'hello')).toBe('f9');
    expect(computeLineHash(0, 'alpha beta')).toBe('06');
    expect(computeLineHash(0, 'Line with [^cn-1] footnote')).toBe('95');
  });

  test('falls back when WebAssembly code generation is unavailable', async () => {
    resetHashline();
    vi.spyOn((globalThis as any).WebAssembly, 'instantiate').mockImplementation(() => {
      throw new Error('WebAssembly.instantiate(): Wasm code generation disallowed by embedder');
    });

    await initHashline();

    expect(computeLineHash(0, '')).toBe('05');
    expect(computeLineHash(0, 'abc')).toBe('ff');
    expect(computeLineHash(0, 'hello')).toBe('f9');
    expect(computeLineHash(0, 'alpha beta')).toBe('06');
    expect(computeLineHash(0, 'Line with [^cn-1] footnote')).toBe('95');
  });
});
