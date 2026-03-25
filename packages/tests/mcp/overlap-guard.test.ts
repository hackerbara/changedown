import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { applyProposeChange, checkCriticMarkupOverlap, guardOverlap } from '@changetracks/mcp/internals';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';

describe('checkCriticMarkupOverlap', () => {
  it('returns null when match is outside all CriticMarkup', () => {
    const text = 'Hello {~~old~>new~~}[^ct-1] world.';
    // "world" starts at position 28
    const worldIdx = text.indexOf('world');
    const result = checkCriticMarkupOverlap(text, worldIdx, 5);
    expect(result).toBeNull();
  });

  it('returns null when match is before all CriticMarkup', () => {
    const text = 'Hello {~~old~>new~~}[^ct-1] world.';
    // "Hello" starts at position 0
    const result = checkCriticMarkupOverlap(text, 0, 5);
    expect(result).toBeNull();
  });

  it('detects overlap with substitution', () => {
    const text = 'Some text {~~old content~>new content~~}[^ct-1] here.';
    // "old content" exists inside the substitution
    const oldIdx = text.indexOf('old content');
    const result = checkCriticMarkupOverlap(text, oldIdx, 'old content'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-1');
    expect(result!.changeType).toBe('sub');
  });

  it('detects overlap with insertion', () => {
    const text = 'Before {++inserted text++}[^ct-2] after.';
    // "inserted text" exists inside the insertion
    const insIdx = text.indexOf('inserted text');
    const result = checkCriticMarkupOverlap(text, insIdx, 'inserted text'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-2');
    expect(result!.changeType).toBe('ins');
  });

  it('detects overlap with deletion', () => {
    const text = 'Before {--deleted text--}[^ct-3] after.';
    // "deleted text" exists inside the deletion
    const delIdx = text.indexOf('deleted text');
    const result = checkCriticMarkupOverlap(text, delIdx, 'deleted text'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-3');
    expect(result!.changeType).toBe('del');
  });

  it('detects overlap with highlight', () => {
    const text = 'Before {==highlighted==}[^ct-4] after.';
    // "highlighted" exists inside the highlight
    const hlIdx = text.indexOf('highlighted');
    const result = checkCriticMarkupOverlap(text, hlIdx, 'highlighted'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-4');
    expect(result!.changeType).toBe('highlight');
  });

  it('detects overlap spanning across markup boundary', () => {
    const text = 'Hello {~~old~>new~~}[^ct-1] world.';
    // "Hello {~~old" spans from outside into the markup
    const result = checkCriticMarkupOverlap(text, 0, 'Hello {~~old'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-1');
  });

  it('detects overlap at opening delimiter', () => {
    const text = 'Test {++added++}[^ct-1] end.';
    // Match starts exactly at the opening delimiter
    const braceIdx = text.indexOf('{++');
    const result = checkCriticMarkupOverlap(text, braceIdx, 3);
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('ins');
  });

  it('allows text adjacent to but not inside markup', () => {
    const text = 'Before {~~old~>new~~}[^ct-1] after here.';
    // "after" is right after the markup (after the space)
    const afterIdx = text.indexOf('after');
    const result = checkCriticMarkupOverlap(text, afterIdx, 'after'.length);
    expect(result).toBeNull();
  });

  it('allows text on a line with markup but outside it', () => {
    const text = 'The quick {~~brown~>red~~}[^ct-1] fox jumps.';
    // "fox jumps" is on the same line but outside the markup
    const foxIdx = text.indexOf('fox jumps');
    const result = checkCriticMarkupOverlap(text, foxIdx, 'fox jumps'.length);
    expect(result).toBeNull();
  });

  it('handles multiple CriticMarkup spans on the same line', () => {
    const text = 'The {++quick++}[^ct-1] {~~brown~>red~~}[^ct-2] fox.';
    // Target "brown" inside the second markup
    const brownIdx = text.indexOf('brown');
    const result = checkCriticMarkupOverlap(text, brownIdx, 'brown'.length);
    expect(result).not.toBeNull();
    expect(result!.changeId).toBe('ct-2');
    expect(result!.changeType).toBe('sub');
  });

  it('handles Level 1 markup (no footnote ref)', () => {
    const text = 'Text {++added++}{>>@ai:test|2026-02-20|ins|proposed<<} end.';
    const addedIdx = text.indexOf('added');
    const result = checkCriticMarkupOverlap(text, addedIdx, 'added'.length);
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('ins');
  });

  it('returns null for text in a file with no CriticMarkup', () => {
    const text = 'Just plain text with no markup at all.';
    const result = checkCriticMarkupOverlap(text, 5, 5);
    expect(result).toBeNull();
  });
});

describe('guardOverlap', () => {
  it('throws when match overlaps CriticMarkup', () => {
    const text = 'Before {~~old~>new~~}[^ct-1] after.';
    const oldIdx = text.indexOf('old');
    expect(() => guardOverlap(text, oldIdx, 3)).toThrow(/overlaps with proposed change/);
    expect(() => guardOverlap(text, oldIdx, 3)).toThrow(/ct-1/);
    expect(() => guardOverlap(text, oldIdx, 3)).toThrow(/amend_change/);
  });

  it('does not throw when match is outside CriticMarkup', () => {
    const text = 'Before {~~old~>new~~}[^ct-1] after.';
    const afterIdx = text.indexOf('after');
    expect(() => guardOverlap(text, afterIdx, 5)).not.toThrow();
  });
});

describe('applyProposeChange — overlap guard integration', () => {
  it('rejects substitution targeting text inside existing substitution', async () => {
    // File has an existing substitution: {~~old content~>new content~~}[^ct-1]
    // Agent tries to change "old content" which exists verbatim inside the markup
    const text = 'Intro {~~old content~>new content~~}[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    await expect(async () =>
      applyProposeChange({
        text,
        oldText: 'old content',
        newText: 'replaced',
        changeId: 'ct-2',
        author: 'ai:test',
      })
    ).rejects.toThrow(/overlaps with proposed change/);
  });

  it('rejects substitution targeting text inside existing insertion', async () => {
    const text = 'Intro {++some new text++}[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | proposed';
    await expect(async () =>
      applyProposeChange({
        text,
        oldText: 'some new text',
        newText: 'replaced',
        changeId: 'ct-2',
        author: 'ai:test',
      })
    ).rejects.toThrow(/overlaps with proposed change/);
  });

  it('rejects deletion targeting text inside existing deletion', async () => {
    const text = 'Intro {--removed text--}[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | del | proposed';
    await expect(async () =>
      applyProposeChange({
        text,
        oldText: 'removed text',
        newText: '',
        changeId: 'ct-2',
        author: 'ai:test',
      })
    ).rejects.toThrow(/overlaps with proposed change/);
  });

  it('rejects substitution spanning across markup boundary', async () => {
    // The text "Intro {~~old" spans from outside into the markup
    const text = 'Intro {~~old~>new~~}[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    await expect(async () =>
      applyProposeChange({
        text,
        oldText: 'Intro {~~old',
        newText: 'replaced',
        changeId: 'ct-2',
        author: 'ai:test',
      })
    ).rejects.toThrow(/overlaps with proposed change/);
  });

  it('allows changes on text adjacent to but NOT inside markup', async () => {
    const text = 'Hello world {~~old~>new~~}[^ct-1] goodbye.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    // "Hello world" is before the markup, should succeed
    const result = await applyProposeChange({
      text,
      oldText: 'Hello world',
      newText: 'Greetings earth',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    expect(result.changeType).toBe('sub');
    expect(result.modifiedText).toContain('{~~Hello world~>Greetings earth~~}[^ct-2]');
  });

  it('allows changes on text after markup', async () => {
    const text = 'Hello {~~old~>new~~}[^ct-1] goodbye world.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    // "goodbye world" is after the markup, should succeed
    const result = await applyProposeChange({
      text,
      oldText: 'goodbye world',
      newText: 'farewell earth',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    expect(result.changeType).toBe('sub');
    expect(result.modifiedText).toContain('{~~goodbye world~>farewell earth~~}[^ct-2]');
  });

  it('rejects insertion with anchor inside existing markup', async () => {
    const text = 'Before {++inserted text++}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | proposed';
    await expect(async () =>
      applyProposeChange({
        text,
        oldText: '',
        newText: 'more text',
        changeId: 'ct-2',
        author: 'ai:test',
        insertAfter: 'inserted',
      })
    ).rejects.toThrow(/overlaps with proposed change/);
  });

  it('error message includes the change ID', async () => {
    const text = 'Intro {~~old~>new~~}[^ct-5] end.\n\n[^ct-5]: @ai:test | 2026-02-20 | sub | proposed';
    try {
      await applyProposeChange({
        text,
        oldText: 'old',
        newText: 'replaced',
        changeId: 'ct-6',
        author: 'ai:test',
      });
      expect.fail('Should have thrown');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('ct-5');
      expect(msg).toContain('sub');
      expect(msg).toContain('amend_change');
    }
  });

  it('error message is actionable (mentions settled view)', async () => {
    const text = 'Intro {++added text++}[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | proposed';
    try {
      await applyProposeChange({
        text,
        oldText: 'added text',
        newText: 'replaced',
        changeId: 'ct-2',
        author: 'ai:test',
      });
      expect.fail('Should have thrown');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('amend_change');
      expect(msg).toContain('review_changes');
    }
  });
});

describe('BUG-2: Overlapping CriticMarkup — settled text matching', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: any;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-overlap-'));
    state = new SessionState();
    const config = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked' as const, auto_header: true },
      author: { default: 'ai:test', enforcement: 'optional' as const },
      hooks: { enforcement: 'warn' as const, exclude: [] },
      matching: { mode: 'normalized' as const },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      policy: { mode: 'safety-net' as const, creation_tracking: 'footnote' as const },
      protocol: { mode: 'classic' as const, level: 2 as const, reasoning: 'optional' as const, batch_reasoning: 'optional' as const },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('substitution on line with existing substitution matches settled text', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // File already has an existing substitution
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      '',
      'The {~~quick~>slow~~}[^ct-1] brown fox jumps over the lazy dog.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | sub | proposed',
      '    @ai:test 2026-02-20: Speed correction',
    ].join('\n'));

    // Propose a change targeting "slow brown fox" (the settled text of that line)
    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'slow brown fox',
        new_text: 'slow red fox',
        author: 'ai:test',
        reason: 'Color correction on settled text',
      },
      resolver,
      state,
    );

    // Should succeed by matching against settled text
    expect(result.isError).toBeUndefined();

    const fileContent = await fs.readFile(filePath, 'utf-8');
    // Should NOT contain nested/malformed CriticMarkup
    expect(fileContent).not.toContain('{~~{~~');
    expect(fileContent).not.toContain('~~}~~}');
    // Should contain valid CriticMarkup substitution covering the settled-text match
    // The settled text "slow brown fox" (resolved from {~~quick~>slow~~}) is replaced with "slow red fox",
    // so the output wraps the full settled span in the new sub.
    expect(fileContent).toContain('{~~slow brown fox~>slow red fox~~}');
  });

  it('deletion on line with existing insertion matches settled text', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      '',
      'The quick {++very ++}[^ct-1]brown fox.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | ins | proposed',
      '    @ai:test 2026-02-20: Emphasis',
    ].join('\n'));

    // Target "very brown" — settled text includes the insertion
    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'very brown',
        new_text: '',
        author: 'ai:test',
        reason: 'Remove redundancy',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(fileContent).not.toContain('{--{++');
  });

  it('rejects when settled text produces ambiguous match', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      'The {~~quick~>slow~~}[^ct-1] fox and the {~~quick~>slow~~}[^ct-2] cat.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | sub | proposed',
      '[^ct-2]: @ai:test | 2026-02-20 | sub | proposed',
    ].join('\n'));

    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'slow',
        new_text: 'fast',
        author: 'ai:test',
        reason: 'Ambiguous target',
      },
      resolver,
      state,
    );

    // Should fail with ambiguity error
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('ambiguous');
  });
});

describe('Semantic guard — settled refs do not block edits', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: any;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-semantic-'));
    state = new SessionState();
    const config = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked' as const, auto_header: true },
      author: { default: 'ai:test', enforcement: 'optional' as const },
      hooks: { enforcement: 'warn' as const, exclude: [] },
      matching: { mode: 'normalized' as const },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      policy: { mode: 'safety-net' as const, creation_tracking: 'footnote' as const },
      protocol: { mode: 'classic' as const, level: 2 as const, reasoning: 'optional' as const, batch_reasoning: 'optional' as const },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('propose_change succeeds on line with settled (accepted) footnote ref', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Benchmark Results',
      '',
      '| Task | Status | Notes |',
      '| --- | --- | --- |',
      '| G-task1 | **RUNNING** | Variance check |[^ct-1]',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | sub | accepted',
      '    @ai:test 2026-02-20: Updated status',
    ].join('\n'));

    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: '**RUNNING**',
        new_text: '**DONE** 95%',
        author: 'ai:test',
        reason: 'Benchmark completed',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~**RUNNING**~>**DONE** 95%~~}');
    expect(content).toContain('[^ct-1]');
  });

  it('propose_change still blocks on line with proposed inline CriticMarkup', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      'The {++quick++}[^ct-1] brown fox.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | ins | proposed',
    ].join('\n'));

    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'quick',
        new_text: 'slow',
        author: 'ai:test',
        reason: 'test',
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('overlaps with proposed change');
  });
});
