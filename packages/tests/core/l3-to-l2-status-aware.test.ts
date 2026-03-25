import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, convertL3ToL2, isL3Format } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('status-aware L3→L2 demotion', () => {
  it('inserts CriticMarkup for proposed changes', async () => {
    const l3 = [
      'The very lazy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b The {++very ++}lazy dog.',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Proposed change: body should have inline CriticMarkup
    expect(l2).toContain('{++');
    expect(l2).toContain('[^ct-1]');
  });

  it('skips CriticMarkup insertion for accepted changes', async () => {
    const l3 = [
      'The very lazy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:7b The {++very ++}lazy dog.',
      '    approved: @bob 2026-03-21 "Looks good"',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Extract the document body (before the first footnote definition).
    // The edit-op line inside the footnote DOES contain {++ — that is intentional.
    // We only care that the body itself has no inline CriticMarkup.
    const bodyPart = l2.slice(0, l2.indexOf('[^ct-1]:'));
    expect(bodyPart).not.toMatch(/\{\+\+/);
    // Footnote should KEEP the edit-op line
    expect(l2).toMatch(/\d+:[a-f0-9]+/);
    // Footnote header should be preserved
    expect(l2).toContain('[^ct-1]:');
  });

  it('skips CriticMarkup insertion for rejected changes', async () => {
    const l3 = [
      'The lazy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | rejected',
      '    1:a1 The {++very ++}lazy dog.',
      '    rejected: @bob 2026-03-21 "Not needed"',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Extract body only — the edit-op in the footnote keeps {++ intentionally.
    const bodyPart = l2.slice(0, l2.indexOf('[^ct-1]:'));
    expect(bodyPart).not.toMatch(/\{\+\+/);
    // Edit-op line preserved in the footnote
    expect(l2).toMatch(/\d+:[a-f0-9]+/);
  });

  it('handles mixed proposed and decided changes', async () => {
    const l3 = [
      'The very lazy brown dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:7b The {++very ++}lazy brown dog.',
      '    approved: @bob 2026-03-21 "OK"',
      '',
      '[^ct-2]: @carol | 2026-03-21 | ins | proposed',
      '    1:7b The very lazy {++brown ++}dog.',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // ct-2 (proposed) should have CriticMarkup in body
    expect(l2).toContain('{++');
    expect(l2).toContain('[^ct-2]');
    // ct-1 (accepted) should NOT add CriticMarkup
    // But ct-1's footnote should keep its edit-op line
    expect(l2).toContain('[^ct-1]:');
  });

  it('isL3Format returns false for hybrid output with proposed changes', async () => {
    const l3 = [
      'The very lazy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b The {++very ++}lazy dog.',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // After demotion, the output has inline CriticMarkup → not L3
    expect(isL3Format(l2)).toBe(false);
  });

  it('returns input unchanged when all changes are decided (no proposed)', async () => {
    const l3 = [
      'The very lazy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:7b The {++very ++}lazy dog.',
      '    approved: @bob 2026-03-21 "OK"',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // No proposed changes → no demotion needed → returns input as-is
    expect(l2).toBe(l3);
    // Still valid L3
    expect(isL3Format(l2)).toBe(true);
  });
});
