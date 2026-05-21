// packages/tests/core/host/adapters/local-format-adapter.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LocalFormatAdapter } from '@changedown/core/host';
import { parseL2, parseL3, serializeL2, serializeL3 } from '@changedown/core';
import { initHashline } from '@changedown/core/internals';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../core/src/test/fixtures/l2-with-changes.md',
);
let L2_FIXTURE_TEXT: string;

beforeAll(async () => {
  await initHashline();
  L2_FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf-8');
});

const L3_DOC_TEXT = [
  'Hello world.[^cn-1]',
  '',
  '[^cn-1]: @ai:test | 2026-01-01 | ins | proposed',
  '    1:ab world',
  '',
].join('\n');

describe('LocalFormatAdapter (typed)', () => {
  const adapter = new LocalFormatAdapter();

  it('promote: typed L2Document in, typed L3Document out', async () => {
    const l2 = parseL2(L2_FIXTURE_TEXT);
    const l3 = await adapter.promote(l2);
    expect(l3.format).toBe('L3');
    expect(l3.body).toBeTruthy();
    // The body should have no inline CriticMarkup.
    expect(l3.body).not.toMatch(/\{\+\+|\{--|\{~~/);
  });

  it('promote: preserves footnote definitions', async () => {
    const l2 = parseL2(L2_FIXTURE_TEXT);
    const l3 = await adapter.promote(l2);
    expect(l3.footnotes.length).toBeGreaterThan(0);
    // Re-serialize to confirm the converted L3 is valid L3 text.
    const l3Text = serializeL3(l3);
    expect(l3Text).toContain('[^cn-1]:');
  });

  it('demote: typed L3Document in, typed L2Document out', async () => {
    const l3 = parseL3(L3_DOC_TEXT);
    const l2 = await adapter.demote(l3);
    expect(l2.format).toBe('L2');
    const l2Text = serializeL2(l2);
    expect(l2Text.length).toBeGreaterThan(0);  // demote produced some L2 text
  });

  it('round-trips: L2 → L3 → L2 preserves active proposed changes and decided audit records', async () => {
    const l2 = parseL2(L2_FIXTURE_TEXT);
    const l3 = await adapter.promote(l2);
    const roundTripped = await adapter.demote(l3);
    const { parseForFormat } = await import('@changedown/core');
    const originalChanges = parseForFormat(L2_FIXTURE_TEXT).getChanges();
    const roundTrippedText = serializeL2(roundTripped);
    const roundTrippedChanges = parseForFormat(roundTrippedText).getChanges();
    const originalProposedIds = originalChanges
      .filter((change) => String(change.status) === 'Proposed')
      .map((change) => change.id);
    const roundTrippedProposedIds = roundTrippedChanges
      .filter((change) => String(change.status) === 'Proposed')
      .map((change) => change.id);

    expect(roundTrippedProposedIds).toEqual(originalProposedIds);
    expect(roundTrippedText).toContain('[^cn-3]: @bob | 2026-03-16 | sub | accepted');
    expect(roundTrippedText).toContain('    8:f6 {~~provides~>delivers~~} excellent');
    expect(roundTrippedChanges.some((change) => change.id === 'cn-3')).toBe(false);
  });
});
