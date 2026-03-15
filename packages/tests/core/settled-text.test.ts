import { describe, it, expect } from 'vitest';
import {
  computeSettledText,
  computeOriginalText,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  computeSettledReplace,
  ChangeType,
  ChangeStatus,
  ChangeNode,
} from '@changetracks/core/internals';

describe('settleAcceptedChangesOnly', () => {
  it('settles single accepted insertion to clean text and returns its id', () => {
    const input = 'Hello {++beautiful ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted';
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    // Layer 1 settlement: markup removed but footnote ref and definition preserved
    expect(settledContent).toBe('Hello beautiful [^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted');
    expect(settledIds).toEqual(['ct-1']);
  });

  it('settles two accepted substitutions on the same line without duplication', () => {
    const input = [
      '{~~256 bits for~>256-bit~~}[^ct-1] {~~ECDSA keys~>ECDSA~~}[^ct-2]',
      '',
      '[^ct-1]: @ai:test | 2026-02-27 | sub | accepted',
      '[^ct-2]: @ai:test | 2026-02-27 | sub | accepted',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    expect(settledIds.includes('ct-1')).toBeTruthy();
    expect(settledIds.includes('ct-2')).toBeTruthy();
    // No duplication — each substitution's new text appears exactly once
    expect(settledContent.includes('256-bit[^ct-1] ECDSA[^ct-2]')).toBeTruthy();
    // Original text should NOT appear
    expect(!settledContent.includes('256 bits for')).toBeTruthy();
    expect(!settledContent.includes('ECDSA keys')).toBeTruthy();
  });

  it('settles three accepted changes on the same line in correct order', () => {
    const input = [
      'A {++B++}[^ct-1] C {--D--}[^ct-2] E {~~F~>G~~}[^ct-3] H',
      '',
      '[^ct-1]: @a | 2026-02-27 | ins | accepted',
      '[^ct-2]: @a | 2026-02-27 | del | accepted',
      '[^ct-3]: @a | 2026-02-27 | sub | accepted',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // Insertion kept, deletion removed, substitution uses new text
    expect(settledContent.includes('A B[^ct-1] C [^ct-2] E G[^ct-3] H')).toBeTruthy();
  });
});

describe('settleRejectedChangesOnly', () => {
  it('settles two rejected substitutions on the same line without duplication', () => {
    const input = [
      '{~~old1~>new1~~}[^ct-1] {~~old2~>new2~~}[^ct-2]',
      '',
      '[^ct-1]: @ai:test | 2026-02-27 | sub | rejected',
      '[^ct-2]: @ai:test | 2026-02-27 | sub | rejected',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChangesOnly(input);
    expect(settledIds.includes('ct-1')).toBeTruthy();
    expect(settledIds.includes('ct-2')).toBeTruthy();
    // Reject restores original text
    expect(settledContent.includes('old1[^ct-1] old2[^ct-2]')).toBeTruthy();
    // New text should NOT appear
    expect(!settledContent.includes('new1')).toBeTruthy();
    expect(!settledContent.includes('new2')).toBeTruthy();
  });
});

describe('computeSettledText', () => {
  it('returns unchanged text when no CriticMarkup present', () => {
    expect(computeSettledText('Hello world')).toBe('Hello world');
  });

  it('absorbs accepted insertions', () => {
    const input = 'Hello {++beautiful ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted';
    expect(computeSettledText(input)).toBe('Hello beautiful world');
  });

  it('absorbs accepted deletions', () => {
    const input = 'Hello {--ugly --}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | accepted';
    expect(computeSettledText(input)).toBe('Hello world');
  });

  it('absorbs accepted substitutions', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | accepted';
    expect(computeSettledText(input)).toBe('Hello new world');
  });

  // Accept-all: rejected changes are still applied (settled = all proposals approved)
  it('applies rejected insertions (accept-all)', () => {
    const input = 'Hello {++bad ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | rejected';
    expect(computeSettledText(input)).toBe('Hello bad world');
  });

  it('applies rejected deletions (accept-all)', () => {
    const input = 'Hello {--good --}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | rejected';
    expect(computeSettledText(input)).toBe('Hello world');
  });

  it('applies rejected substitutions to new text (accept-all)', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | rejected';
    expect(computeSettledText(input)).toBe('Hello new world');
  });

  // Accept-all: proposed changes are applied (not reverted)
  it('applies proposed insertions (accept-all)', () => {
    const input = 'Hello {++maybe ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | proposed';
    expect(computeSettledText(input)).toBe('Hello maybe world');
  });

  it('applies proposed deletions (accept-all)', () => {
    const input = 'Hello {--keep me--}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | proposed';
    expect(computeSettledText(input)).toBe('Hello  world');
  });

  it('applies proposed substitutions to new text (accept-all)', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | proposed';
    expect(computeSettledText(input)).toBe('Hello new world');
  });

  it('applies Level 0 changes (no footnote) via accept-all', () => {
    expect(computeSettledText('Hello {++new ++}world')).toBe('Hello new world');
    expect(computeSettledText('Hello {--keep--} world')).toBe('Hello  world');
  });

  it('strips highlights to plain text', () => {
    expect(computeSettledText('Hello {==important==} world')).toBe('Hello important world');
  });

  it('strips comments entirely', () => {
    expect(computeSettledText('Hello {>>note<<} world')).toBe('Hello  world');
  });

  it('strips footnote definitions', () => {
    const input = 'Hello world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted\n    reason: testing';
    expect(computeSettledText(input)).toBe('Hello world');
  });

  it('handles multiple changes with mixed statuses (accept-all)', () => {
    const input = [
      'Start {++accepted ++}[^ct-1]{++proposed ++}[^ct-2]{--rejected --}[^ct-3]end',
      '',
      '[^ct-1]: @a | 2026-02-11 | ins | accepted',
      '[^ct-2]: @a | 2026-02-11 | ins | proposed',
      '[^ct-3]: @a | 2026-02-11 | del | rejected',
    ].join('\n');
    // Accept-all: both insertions kept, deletion applied (text removed)
    expect(computeSettledText(input)).toBe('Start accepted proposed end');
  });

  it('handles move groups (dotted IDs) with accept-all', () => {
    const input = [
      '{--moved text--}[^ct-1.1] ... {++moved text++}[^ct-1.2]',
      '',
      '[^ct-1]: @a | 2026-02-11 | move | proposed',
      '[^ct-1.1]: @a | 2026-02-11 | del | proposed',
      '[^ct-1.2]: @a | 2026-02-11 | ins | proposed',
    ].join('\n');
    // Accept-all: deletion removes text, insertion keeps text
    expect(computeSettledText(input)).toBe(' ... moved text');
  });

  it('strips orphaned inline footnote refs', () => {
    // A [^ct-N] ref that appears outside of any markup (e.g., left behind after manual editing)
    const input = 'Some text[^ct-42] and more text';
    expect(computeSettledText(input)).toBe('Some text and more text');
  });

  it('handles highlight with attached comment', () => {
    const input = 'Check {==this text==}{>>important<<} carefully';
    expect(computeSettledText(input)).toBe('Check this text carefully');
  });

  it('handles empty document', () => {
    expect(computeSettledText('')).toBe('');
  });

  it('preserves whitespace-only text without markup', () => {
    expect(computeSettledText('  \n  \n  ')).toBe('  \n  \n  ');
  });

  // ─── Accept-all semantics ──────────────────────────────────────────────
  // Settled view = "document as it would be if all proposals were approved"

  it('accept-all: proposed insertion is kept in settled text', () => {
    const input = [
      'Line one.',
      '{++Proposed new line.++}[^ct-1]',
      'Line three.',
      '',
      '[^ct-1]: @alice | 2026-02-24 | ins | proposed',
      '    @alice 2026-02-24: adding context',
    ].join('\n');

    const result = computeSettledText(input);
    expect(result.includes('Proposed new line.')).toBeTruthy();
    expect(!result.includes('{++')).toBeTruthy();
  });

  it('accept-all: proposed substitution keeps new text', () => {
    const input = [
      '{~~old text~>new text~~}[^ct-2]',
      '',
      '[^ct-2]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: better wording',
    ].join('\n');

    const result = computeSettledText(input);
    expect(result.includes('new text')).toBeTruthy();
    expect(!result.includes('old text')).toBeTruthy();
  });

  it('accept-all: proposed deletion removes text', () => {
    const input = [
      'Before {--remove me--}[^ct-3] after.',
      '',
      '[^ct-3]: @alice | 2026-02-24 | del | proposed',
      '    @alice 2026-02-24: redundant',
    ].join('\n');

    const result = computeSettledText(input);
    expect(result.includes('Before  after.')).toBeTruthy();
    expect(!result.includes('remove me')).toBeTruthy();
  });

  it('accept-all: Level 0 insertion (no footnote) is kept', () => {
    const result = computeSettledText('Hello {++new ++}world');
    expect(result).toBe('Hello new world');
  });

  it('accept-all: Level 0 deletion (no footnote) removes text', () => {
    const result = computeSettledText('Hello {--old--} world');
    expect(result).toBe('Hello  world');
  });
});

describe('code-zone-aware ref placement', () => {
  it('places ref at end of line when substitution is inside fenced code block', () => {
    const input = [
      '# Doc',
      '```js',
      'const x = {~~old~>new~~}[^ct-1];',
      '```',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: update variable',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // Ref should NOT be inside the code fence
    expect(!settledContent.includes('const x = new[^ct-1];')).toBeTruthy();
    // Ref should be at end of line, outside code content
    expect(settledContent.includes('const x = new;[^ct-1]')).toBeTruthy();
  });

  it('places ref at end of line when substitution is inside inline backtick span', () => {
    const input = [
      'Use `{~~oldFunc~>newFunc~~}[^ct-1]()` to call it.',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: rename function',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // Ref must not be inside backticks
    expect(!settledContent.includes('`newFunc[^ct-1]()`')).toBeTruthy();
    // Ref at end of line
    expect(settledContent.includes('`newFunc()` to call it.[^ct-1]')).toBeTruthy();
  });

  it('places ref normally when substitution is outside code zones', () => {
    const input = [
      'The API uses {~~REST~>GraphQL~~}[^ct-1] queries.',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: paradigm shift',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // Normal inline placement (no code zone)
    expect(settledContent.includes('GraphQL[^ct-1] queries.')).toBeTruthy();
  });

  it('handles deletion inside code block with ref at end of line', () => {
    const input = [
      '```python',
      'x = {--removed_call()--}[^ct-1]',
      '```',
      '',
      '[^ct-1]: @alice | 2026-01-01 | del | accepted',
      '    reason: dead code',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    expect(settledContent.includes('x = [^ct-1]')).toBeTruthy();
  });

  it('handles rejected substitution inside code block', () => {
    const input = [
      '```',
      'let val = {~~foo~>bar~~}[^ct-1];',
      '```',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | rejected',
      '    reason: keep original name',
    ].join('\n');
    const { settledContent } = settleRejectedChangesOnly(input);
    // Rejected = restore original; ref at end of line (inside code block)
    expect(settledContent.includes('let val = foo;[^ct-1]')).toBeTruthy();
  });

  it('does not corrupt content when literal CriticMarkup examples appear in backticks', () => {
    // Backtick-escaped delimiter examples should not be parsed as real changes
    const input = [
      'Use `{~~old~>new~~}` syntax for substitutions.',
      'And `{++inserted++}` for insertions.',
      '',
      'Real change: {~~REST~>GraphQL~~}[^ct-1] queries.',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: paradigm shift',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // Literal examples in backticks must be preserved untouched
    expect(settledContent.includes('`{~~old~>new~~}`')).toBeTruthy();
    expect(settledContent.includes('`{++inserted++}`')).toBeTruthy();
    // Real change should be settled normally (outside code zone)
    expect(settledContent.includes('GraphQL[^ct-1] queries.')).toBeTruthy();
  });

  it('handles multiple changes, some inside code zones and some outside', () => {
    const input = [
      'Intro {++added text++}[^ct-1] here.',
      '```',
      'code {~~old~>new~~}[^ct-2]',
      '```',
      'Outro {--removed--}[^ct-3] end.',
      '',
      '[^ct-1]: @alice | 2026-01-01 | ins | accepted',
      '    reason: intro addition',
      '[^ct-2]: @alice | 2026-01-01 | sub | accepted',
      '    reason: code update',
      '[^ct-3]: @alice | 2026-01-01 | del | accepted',
      '    reason: cleanup',
    ].join('\n');
    const { settledContent } = settleAcceptedChangesOnly(input);
    // ct-1: outside code, ref inline
    expect(settledContent.includes('added text[^ct-1] here.')).toBeTruthy();
    // ct-2: inside code fence, ref at end of line
    expect(settledContent.includes('code new[^ct-2]')).toBeTruthy();
    // ct-3: outside code, ref inline (deletion = content removed)
    expect(settledContent.includes('[^ct-3] end.')).toBeTruthy();
  });
});

describe('sequential settlement stability', () => {
  it('handles two sequential accepts on the same line without duplication', () => {
    // Cycle 1: accept a substitution
    const input1 = [
      'text with {~~old~>new~~}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: first change',
    ].join('\n');
    const { settledContent: after1 } = settleAcceptedChangesOnly(input1);
    expect(after1.includes('text with new[^ct-1]')).toBeTruthy();
    expect(!after1.includes('old')).toBeTruthy();

    // Cycle 2: new substitution on the same line (now contains [^ct-1])
    const input2 = after1.replace(
      'text with new[^ct-1]',
      'text with {~~new~>newer~~}[^ct-2][^ct-1]',
    ) + '\n[^ct-2]: @bob | 2026-01-02 | sub | accepted\n    reason: second change';
    const { settledContent: after2 } = settleAcceptedChangesOnly(input2);
    expect(after2.includes('text with newer[^ct-2][^ct-1]')).toBeTruthy();
    // No duplication
    expect(after2.match(/newer/g)?.length).toBe(1);
  });

  it('handles accept + reject on same line', () => {
    const input = [
      '{~~A~>B~~}[^ct-1] and {++C++}[^ct-2]',
      '',
      '[^ct-1]: @alice | 2026-01-01 | sub | accepted',
      '    reason: keep B',
      '[^ct-2]: @bob | 2026-01-02 | ins | rejected',
      '    reason: no thanks',
    ].join('\n');
    // Settle accepted first
    const { settledContent: afterAccept } = settleAcceptedChangesOnly(input);
    expect(afterAccept.includes('B[^ct-1]')).toBeTruthy();
    // Then settle rejected
    const { settledContent: afterReject } = settleRejectedChangesOnly(afterAccept);
    expect(afterReject.includes('B[^ct-1] and [^ct-2]')).toBeTruthy();
  });

  it('handles three-cycle stress test on same line', () => {
    // Cycle 1
    const input1 = [
      'value = {~~alpha~>beta~~}[^ct-1]',
      '',
      '[^ct-1]: @a | 2026-01-01 | sub | accepted',
      '    r: c1',
    ].join('\n');
    const { settledContent: r1 } = settleAcceptedChangesOnly(input1);
    expect(r1.includes('value = beta[^ct-1]')).toBeTruthy();

    // Cycle 2
    const input2 = r1.replace('beta[^ct-1]', '{~~beta~>gamma~~}[^ct-2][^ct-1]')
      + '\n[^ct-2]: @b | 2026-01-02 | sub | accepted\n    r: c2';
    const { settledContent: r2 } = settleAcceptedChangesOnly(input2);
    expect(r2.includes('gamma[^ct-2][^ct-1]')).toBeTruthy();

    // Cycle 3
    const input3 = r2.replace('gamma[^ct-2][^ct-1]', '{~~gamma~>delta~~}[^ct-3][^ct-2][^ct-1]')
      + '\n[^ct-3]: @c | 2026-01-03 | sub | accepted\n    r: c3';
    const { settledContent: r3 } = settleAcceptedChangesOnly(input3);
    expect(r3.includes('delta[^ct-3][^ct-2][^ct-1]')).toBeTruthy();
    // Exactly one occurrence
    expect(r3.match(/delta/g)?.length).toBe(1);
  });
});

describe('computeOriginalText', () => {
  it('removes insertions entirely', () => {
    const input = 'Hello {++beautiful ++}world';
    expect(computeOriginalText(input)).toBe('Hello world');
  });

  it('keeps deletion content without delimiters', () => {
    const input = 'Hello {--cruel --}world';
    expect(computeOriginalText(input)).toBe('Hello cruel world');
  });

  it('shows original side of substitutions', () => {
    const input = 'Hello {~~cruel~>beautiful~~} world';
    expect(computeOriginalText(input)).toBe('Hello cruel world');
  });

  it('strips footnote refs and definitions', () => {
    const input = 'Hello {++world++}[^ct-1]\n\n[^ct-1]: @author | 2026-03-14 | ins | proposed';
    expect(computeOriginalText(input)).toBe('Hello ');
  });

  it('handles multiple changes', () => {
    const input = 'A {++B ++}C {--D --}E';
    expect(computeOriginalText(input)).toBe('A C D E');
  });

  it('handles highlights by keeping content', () => {
    const input = 'Some {==highlighted==} text';
    expect(computeOriginalText(input)).toBe('Some highlighted text');
  });

  it('handles comments by removing them', () => {
    const input = 'Some text{>>a comment<<}';
    expect(computeOriginalText(input)).toBe('Some text');
  });

  it('handles document with no changes', () => {
    const input = 'Plain text with no markup';
    expect(computeOriginalText(input)).toBe('Plain text with no markup');
  });
});

describe('computeSettledReplace', () => {
  it('throws on unknown ChangeType', () => {
    const fakeNode: ChangeNode = {
      id: 'ct-999',
      type: 999 as unknown as ChangeType,
      status: ChangeStatus.Proposed,
      range: { start: 0, end: 10 },
      contentRange: { start: 3, end: 7 },
      level: 0,
      anchored: false,
    };

    expect(
      () => computeSettledReplace(fakeNode),
    ).toThrow(/Unknown ChangeType/);
  });
});
