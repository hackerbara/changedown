import { describe, it, expect, beforeAll } from 'vitest';
import { settleAcceptedChangesOnly, settleRejectedChangesOnly, initHashline, computeSettledView } from '@changedown/core/internals';

beforeAll(async () => {
  await initHashline();
});

// Helper: build L3 document with one insertion
function l3WithInsertion(status: string) {
  return [
    '<!-- changedown.com/v1: tracked -->',
    'Hello beautiful world',
    '',
    `[^cn-1]: @alice | 2026-03-18 | ins | ${status}`,
    '    2:b4 {++beautiful ++}',
  ].join('\n');
}

// Helper: build L3 document with one deletion
function l3WithDeletion(status: string) {
  return [
    '<!-- changedown.com/v1: tracked -->',
    'Hello world',
    '',
    `[^cn-1]: @alice | 2026-03-18 | del | ${status}`,
    '    2:b4 {--beautiful --} @ctx:"Hello "||" world"',
  ].join('\n');
}

// Helper: build L3 document with one substitution
function l3WithSubstitution(status: string) {
  return [
    '<!-- changedown.com/v1: tracked -->',
    'Hello new world',
    '',
    `[^cn-1]: @alice | 2026-03-18 | sub | ${status}`,
    '    2:b4 {~~old~>new~~}',
  ].join('\n');
}

describe('settleAcceptedChangesOnly on L3', () => {
  it('accept insertion: L3 no-op — text unchanged, edit-op preserved', () => {
    const input = l3WithInsertion('accepted');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    expect(settledIds).toEqual([]);
    expect(settledContent).toBe(input);
    expect(settledContent).toContain('{++beautiful ++}');
    expect(settledContent).not.toContain('settled:');
    expect(settledContent).toContain('[^cn-1]:');
  });

  it('accept deletion: L3 no-op — text unchanged, edit-op preserved', () => {
    const input = l3WithDeletion('accepted');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    expect(settledIds).toEqual([]);
    expect(settledContent).toBe(input);
    expect(settledContent).toContain('{--beautiful --}');
    expect(settledContent).not.toContain('settled:');
  });

  it('accept substitution: L3 no-op — text unchanged, edit-op preserved', () => {
    const input = l3WithSubstitution('accepted');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    expect(settledIds).toEqual([]);
    expect(settledContent).toBe(input);
    expect(settledContent).toContain('{~~old~>new~~}');
    expect(settledContent).not.toContain('settled:');
  });

  it('skips proposed changes in L3', () => {
    const { settledContent, settledIds } = settleAcceptedChangesOnly(l3WithInsertion('proposed'));
    expect(settledIds).toEqual([]);
    expect(settledContent).toContain('{++beautiful ++}');
  });

  it('does NOT inject [^cn-N] refs into L3 body lines', () => {
    const input = l3WithInsertion('accepted');
    const { settledContent } = settleAcceptedChangesOnly(input);
    const bodyLines = settledContent.split('\n').slice(0, 2);
    for (const line of bodyLines) {
      expect(line).not.toMatch(/\[\^cn-\d+\]/);
    }
  });
});

describe('settleRejectedChangesOnly on L3', () => {
  it('reject insertion: text removed from body, edit-op preserved', () => {
    const { settledContent, settledIds } = settleRejectedChangesOnly(l3WithInsertion('rejected'));
    expect(settledIds).toEqual(['cn-1']);
    const bodyLine = settledContent.split('\n')[1];
    expect(bodyLine).toBe('Hello world');
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('{++beautiful ++}');
    expect(settledContent).not.toContain('settled:');
  });

  it('reject deletion: text restored to body, edit-op preserved', () => {
    const { settledContent, settledIds } = settleRejectedChangesOnly(l3WithDeletion('rejected'));
    expect(settledIds).toEqual(['cn-1']);
    expect(settledContent).toContain('beautiful');
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('{--beautiful --}');
    expect(settledContent).not.toContain('settled:');
  });

  it('reject substitution: reverted to original, edit-op preserved', () => {
    const { settledContent, settledIds } = settleRejectedChangesOnly(l3WithSubstitution('rejected'));
    expect(settledIds).toEqual(['cn-1']);
    expect(settledContent).toContain('old');
    expect(settledContent).not.toContain('new world');
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('{~~old~>new~~}');
    expect(settledContent).not.toContain('settled:');
  });

  it('does NOT inject [^cn-N] refs into L3 body lines', () => {
    const { settledContent } = settleRejectedChangesOnly(l3WithInsertion('rejected'));
    const bodyLines = settledContent.split('\n').slice(0, 2);
    for (const line of bodyLines) {
      expect(line).not.toMatch(/\[\^cn-\d+\]/);
    }
  });
});

describe('computeSettledView on L3', () => {
  it('produces correct line mappings for L3 text', () => {
    const l3 = [
      '<!-- changedown.com/v1: tracked -->',
      'Hello beautiful world',
      'Second line',
      '',
      '[^cn-1]: @alice | 2026-03-18 | ins | proposed',
      '    1:b4 beautiful ',
    ].join('\n');
    const result = computeSettledView(l3);
    expect(result.lines.length).toBeGreaterThan(0);
    // Settled view strips footnotes from output lines
    const fullText = result.lines.map(l => l.text).join('\n');
    expect(fullText).not.toContain('[^cn-1]');
    expect(fullText).toContain('Hello beautiful world');
  });
});

describe('mixed-status L3 settlement', () => {
  it('settles only accepted changes, leaves proposed and rejected', () => {
    const l3 = [
      '<!-- changedown.com/v1: tracked -->',
      'Hello beautiful new world today',
      '',
      '[^cn-1]: @alice | 2026-03-18 | ins | accepted',
      '    2:b4 {++beautiful ++}',
      '[^cn-2]: @bob | 2026-03-18 | ins | proposed',
      '    2:b4 {++new ++}',
      '[^cn-3]: @carol | 2026-03-18 | ins | rejected',
      '    2:b4 {++today++}',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(l3);
    expect(settledIds).toEqual([]);
    expect(settledContent).toContain('{++beautiful ++}');
    expect(settledContent).not.toContain('settled:');
    expect(settledContent).toContain('{++new ++}');
    expect(settledContent).toContain('{++today++}');
  });
});

describe('L3 settlement round-trip', () => {
  it('settle in L3 preserves edit-op, preserves footnote header', () => {
    const l3 = [
      '<!-- changedown.com/v1: tracked -->',
      'Hello beautiful world',
      '',
      '[^cn-1]: @alice | 2026-03-18 | ins | accepted',
      '    2:b4 {++beautiful ++}',
      '[^cn-2]: @bob | 2026-03-18 | ins | proposed',
      '    2:b4 {++world++}',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(l3);
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('{++beautiful ++}');
    expect(settledContent).not.toContain('settled:');
    expect(settledContent).toContain('{++world++}');
  });
});
