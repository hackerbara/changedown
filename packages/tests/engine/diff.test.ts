import { describe, it, expect } from 'vitest';
import { isGitDiffDriverInvocation } from 'changedown/internals';

describe('isGitDiffDriverInvocation', () => {
  it('returns true for a valid 7-arg invocation with 40-char hex SHA', () => {
    const args = [
      'node', 'sc',
      'abc123def456789012345678901234567890abcd',
      'old-mode', '/tmp/old-file', 'old-hex', 'old-mode2',
    ];
    expect(isGitDiffDriverInvocation(args)).toBe(true);
  });

  it('returns false when arg count is not 7', () => {
    expect(isGitDiffDriverInvocation(['node', 'sc', 'abc'])).toBe(false);
    expect(isGitDiffDriverInvocation([])).toBe(false);
  });

  it('returns false when position 2 is not a 40-char hex string', () => {
    const args = [
      'node', 'sc',
      'not-a-sha',
      'old-mode', '/tmp/old-file', 'old-hex', 'old-mode2',
    ];
    expect(isGitDiffDriverInvocation(args)).toBe(false);
  });

  it('returns false when SHA is 40 chars but contains non-hex', () => {
    const args = [
      'node', 'sc',
      'xyz123def456789012345678901234567890abcd', // 'x','y','z' not hex
      'old-mode', '/tmp/old-file', 'old-hex', 'old-mode2',
    ];
    expect(isGitDiffDriverInvocation(args)).toBe(false);
  });
});
