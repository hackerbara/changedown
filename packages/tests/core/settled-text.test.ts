import { strict as assert } from 'assert';
import {
  computeSettledText,
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
    assert.equal(settledContent, 'Hello beautiful [^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted');
    assert.deepEqual(settledIds, ['ct-1']);
  });

  it('settles two accepted substitutions on the same line without duplication', () => {
    const input = [
      '{~~256 bits for~>256-bit~~}[^ct-1] {~~ECDSA keys~>ECDSA~~}[^ct-2]',
      '',
      '[^ct-1]: @ai:test | 2026-02-27 | sub | accepted',
      '[^ct-2]: @ai:test | 2026-02-27 | sub | accepted',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChangesOnly(input);
    assert.ok(settledIds.includes('ct-1'));
    assert.ok(settledIds.includes('ct-2'));
    // No duplication — each substitution's new text appears exactly once
    assert.ok(settledContent.includes('256-bit[^ct-1] ECDSA[^ct-2]'));
    // Original text should NOT appear
    assert.ok(!settledContent.includes('256 bits for'));
    assert.ok(!settledContent.includes('ECDSA keys'));
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
    assert.ok(settledContent.includes('A B[^ct-1] C [^ct-2] E G[^ct-3] H'));
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
    assert.ok(settledIds.includes('ct-1'));
    assert.ok(settledIds.includes('ct-2'));
    // Reject restores original text
    assert.ok(settledContent.includes('old1[^ct-1] old2[^ct-2]'));
    // New text should NOT appear
    assert.ok(!settledContent.includes('new1'));
    assert.ok(!settledContent.includes('new2'));
  });
});

describe('computeSettledText', () => {
  it('returns unchanged text when no CriticMarkup present', () => {
    assert.equal(computeSettledText('Hello world'), 'Hello world');
  });

  it('absorbs accepted insertions', () => {
    const input = 'Hello {++beautiful ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted';
    assert.equal(computeSettledText(input), 'Hello beautiful world');
  });

  it('absorbs accepted deletions', () => {
    const input = 'Hello {--ugly --}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | accepted';
    assert.equal(computeSettledText(input), 'Hello world');
  });

  it('absorbs accepted substitutions', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | accepted';
    assert.equal(computeSettledText(input), 'Hello new world');
  });

  // Accept-all: rejected changes are still applied (settled = all proposals approved)
  it('applies rejected insertions (accept-all)', () => {
    const input = 'Hello {++bad ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | rejected';
    assert.equal(computeSettledText(input), 'Hello bad world');
  });

  it('applies rejected deletions (accept-all)', () => {
    const input = 'Hello {--good --}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | rejected';
    assert.equal(computeSettledText(input), 'Hello world');
  });

  it('applies rejected substitutions to new text (accept-all)', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | rejected';
    assert.equal(computeSettledText(input), 'Hello new world');
  });

  // Accept-all: proposed changes are applied (not reverted)
  it('applies proposed insertions (accept-all)', () => {
    const input = 'Hello {++maybe ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | proposed';
    assert.equal(computeSettledText(input), 'Hello maybe world');
  });

  it('applies proposed deletions (accept-all)', () => {
    const input = 'Hello {--keep me--}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | deletion | proposed';
    assert.equal(computeSettledText(input), 'Hello  world');
  });

  it('applies proposed substitutions to new text (accept-all)', () => {
    const input = 'Hello {~~old~>new~~}[^ct-1] world\n\n[^ct-1]: @alice | 2026-02-11 | sub | proposed';
    assert.equal(computeSettledText(input), 'Hello new world');
  });

  it('applies Level 0 changes (no footnote) via accept-all', () => {
    assert.equal(computeSettledText('Hello {++new ++}world'), 'Hello new world');
    assert.equal(computeSettledText('Hello {--keep--} world'), 'Hello  world');
  });

  it('strips highlights to plain text', () => {
    assert.equal(computeSettledText('Hello {==important==} world'), 'Hello important world');
  });

  it('strips comments entirely', () => {
    assert.equal(computeSettledText('Hello {>>note<<} world'), 'Hello  world');
  });

  it('strips footnote definitions', () => {
    const input = 'Hello world\n\n[^ct-1]: @alice | 2026-02-11 | insertion | accepted\n    reason: testing';
    assert.equal(computeSettledText(input), 'Hello world');
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
    assert.equal(computeSettledText(input), 'Start accepted proposed end');
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
    assert.equal(computeSettledText(input), ' ... moved text');
  });

  it('strips orphaned inline footnote refs', () => {
    // A [^ct-N] ref that appears outside of any markup (e.g., left behind after manual editing)
    const input = 'Some text[^ct-42] and more text';
    assert.equal(computeSettledText(input), 'Some text and more text');
  });

  it('handles highlight with attached comment', () => {
    const input = 'Check {==this text==}{>>important<<} carefully';
    assert.equal(computeSettledText(input), 'Check this text carefully');
  });

  it('handles empty document', () => {
    assert.equal(computeSettledText(''), '');
  });

  it('preserves whitespace-only text without markup', () => {
    assert.equal(computeSettledText('  \n  \n  '), '  \n  \n  ');
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
    assert.ok(result.includes('Proposed new line.'), 'proposed insertion should be kept');
    assert.ok(!result.includes('{++'), 'markup delimiters should be stripped');
  });

  it('accept-all: proposed substitution keeps new text', () => {
    const input = [
      '{~~old text~>new text~~}[^ct-2]',
      '',
      '[^ct-2]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: better wording',
    ].join('\n');

    const result = computeSettledText(input);
    assert.ok(result.includes('new text'), 'proposed substitution should keep new text');
    assert.ok(!result.includes('old text'), 'proposed substitution should not contain old text');
  });

  it('accept-all: proposed deletion removes text', () => {
    const input = [
      'Before {--remove me--}[^ct-3] after.',
      '',
      '[^ct-3]: @alice | 2026-02-24 | del | proposed',
      '    @alice 2026-02-24: redundant',
    ].join('\n');

    const result = computeSettledText(input);
    assert.ok(result.includes('Before  after.'), 'proposed deletion should remove text');
    assert.ok(!result.includes('remove me'), 'deleted text should not appear');
  });

  it('accept-all: Level 0 insertion (no footnote) is kept', () => {
    const result = computeSettledText('Hello {++new ++}world');
    assert.equal(result, 'Hello new world');
  });

  it('accept-all: Level 0 deletion (no footnote) removes text', () => {
    const result = computeSettledText('Hello {--old--} world');
    assert.equal(result, 'Hello  world');
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
    assert.ok(!settledContent.includes('const x = new[^ct-1];'), 'ref must not be placed inline inside code fence');
    // Ref should be at end of line, outside code content
    assert.ok(settledContent.includes('const x = new;[^ct-1]'), 'ref must be deferred to end of line');
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
    assert.ok(!settledContent.includes('`newFunc[^ct-1]()`'), 'ref must not be inside backtick span');
    // Ref at end of line
    assert.ok(settledContent.includes('`newFunc()` to call it.[^ct-1]'), 'ref must be deferred to end of line');
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
    assert.ok(settledContent.includes('GraphQL[^ct-1] queries.'), 'ref must be placed inline outside code zones');
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
    assert.ok(settledContent.includes('x = [^ct-1]'), 'deletion ref must be at end of line');
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
    assert.ok(settledContent.includes('let val = foo;[^ct-1]'), 'rejected ref must be deferred to end of line in code block');
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
    assert.ok(settledContent.includes('`{~~old~>new~~}`'), 'backtick-escaped examples must be preserved');
    assert.ok(settledContent.includes('`{++inserted++}`'), 'backtick-escaped insertions must be preserved');
    // Real change should be settled normally (outside code zone)
    assert.ok(settledContent.includes('GraphQL[^ct-1] queries.'), 'real change must settle normally');
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
    assert.ok(settledContent.includes('added text[^ct-1] here.'), 'ct-1 ref must be inline (outside code)');
    // ct-2: inside code fence, ref at end of line
    assert.ok(settledContent.includes('code new[^ct-2]'), 'ct-2 ref must be at end of line (inside code)');
    // ct-3: outside code, ref inline (deletion = content removed)
    assert.ok(settledContent.includes('[^ct-3] end.'), 'ct-3 ref must be inline (outside code)');
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
    assert.ok(after1.includes('text with new[^ct-1]'), 'cycle 1: substitution settled');
    assert.ok(!after1.includes('old'), 'cycle 1: old text removed');

    // Cycle 2: new substitution on the same line (now contains [^ct-1])
    const input2 = after1.replace(
      'text with new[^ct-1]',
      'text with {~~new~>newer~~}[^ct-2][^ct-1]',
    ) + '\n[^ct-2]: @bob | 2026-01-02 | sub | accepted\n    reason: second change';
    const { settledContent: after2 } = settleAcceptedChangesOnly(input2);
    assert.ok(after2.includes('text with newer[^ct-2][^ct-1]'), 'cycle 2: second substitution settled');
    // No duplication
    assert.equal(after2.match(/newer/g)?.length, 1, 'cycle 2: no duplication');
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
    assert.ok(afterAccept.includes('B[^ct-1]'), 'accept phase: B kept with ref');
    // Then settle rejected
    const { settledContent: afterReject } = settleRejectedChangesOnly(afterAccept);
    assert.ok(afterReject.includes('B[^ct-1] and [^ct-2]'), 'reject phase: C removed, ref preserved');
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
    assert.ok(r1.includes('value = beta[^ct-1]'), 'cycle 1');

    // Cycle 2
    const input2 = r1.replace('beta[^ct-1]', '{~~beta~>gamma~~}[^ct-2][^ct-1]')
      + '\n[^ct-2]: @b | 2026-01-02 | sub | accepted\n    r: c2';
    const { settledContent: r2 } = settleAcceptedChangesOnly(input2);
    assert.ok(r2.includes('gamma[^ct-2][^ct-1]'), 'cycle 2');

    // Cycle 3
    const input3 = r2.replace('gamma[^ct-2][^ct-1]', '{~~gamma~>delta~~}[^ct-3][^ct-2][^ct-1]')
      + '\n[^ct-3]: @c | 2026-01-03 | sub | accepted\n    r: c3';
    const { settledContent: r3 } = settleAcceptedChangesOnly(input3);
    assert.ok(r3.includes('delta[^ct-3][^ct-2][^ct-1]'), 'cycle 3');
    // Exactly one occurrence
    assert.equal(r3.match(/delta/g)?.length, 1, 'cycle 3: no duplication');
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

    assert.throws(
      () => computeSettledReplace(fakeNode),
      (err: Error) => {
        assert.ok(err.message.includes('Unknown ChangeType'), `Expected "Unknown ChangeType" in message, got: ${err.message}`);
        return true;
      },
    );
  });
});
