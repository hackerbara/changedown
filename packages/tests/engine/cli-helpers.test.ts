import { describe, it, expect } from 'vitest';
import { tryParseArgs, parseIntFlag, usageError, invalidJsonError, hasHelpFlag, helpResult } from 'changetracks/cli-helpers';

describe('CLI helpers', () => {
  it('tryParseArgs returns null on unknown flags', () => {
    const result = tryParseArgs({ args: ['--bogus'], options: {} });
    expect(result).toBeNull();
  });

  it('tryParseArgs returns parsed result on valid flags', () => {
    const result = tryParseArgs({
      args: ['--name', 'test'],
      options: { name: { type: 'string' } },
    });
    expect(result).not.toBeNull();
    expect(result!.values.name).toBe('test');
  });

  it('parseIntFlag returns number for valid string', () => {
    expect(parseIntFlag('42')).toBe(42);
  });

  it('parseIntFlag returns undefined for NaN', () => {
    expect(parseIntFlag('abc')).toBeUndefined();
  });

  it('parseIntFlag returns undefined for undefined input', () => {
    expect(parseIntFlag(undefined)).toBeUndefined();
  });

  it('usageError creates proper CliResult', () => {
    const result = usageError('bad args');
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toBe('bad args');
  });

  it('invalidJsonError creates proper CliResult', () => {
    const result = invalidJsonError('parse failed');
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_JSON');
  });

  it('hasHelpFlag detects --help', () => {
    expect(hasHelpFlag(['file.md', '--help'])).toBe(true);
    expect(hasHelpFlag(['-h'])).toBe(true);
    expect(hasHelpFlag(['file.md', '--old', 'x'])).toBe(false);
  });

  it('helpResult returns successful result with rawText', () => {
    const result = helpResult('Usage: sc foo');
    expect(result.success).toBe(true);
    expect(result.rawText).toBe('Usage: sc foo');
  });
});
