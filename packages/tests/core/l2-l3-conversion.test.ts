import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core/internals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { convertL2ToL3, convertL3ToL2, ChangeType, ChangeStatus, FootnoteNativeParser, CriticMarkupParser } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('L2 to L3 conversion', () => {
  const l2 = readFileSync(
    resolve(__dirname, '../../core/src/test/fixtures/l2-with-changes.md'),
    'utf-8'
  );

  it('strips CriticMarkup delimiters from body', async () => {
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).not.toMatch(/\{\+\+|\{\-\-|\{~~|~>|\+\+\}|\-\-\}|~~\}/);
  });

  it('preserves footnote definitions', async () => {
    const result = await convertL2ToL3(l2);
    expect(result).toMatch(/\[\^ct-\d+\]:/);
  });

  it('adds line-hash + edit-op to footnote body', async () => {
    const result = await convertL2ToL3(l2);
    expect(result).toMatch(/^ {4}\d+:[a-f0-9]{2} \{/m);
  });

  it('keeps insertion text in body', async () => {
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).toContain('new ');
  });

  it('removes deleted text from body', async () => {
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).not.toContain('old ');
  });

  it('keeps substitution modified text in body', async () => {
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).toContain('delivers');
    expect(body).not.toContain('provides');
  });

  it('strips inline footnote refs from body', async () => {
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).not.toMatch(/\[\^ct-\d+\]/);
  });

  it('produces insertion edit-op in ct-1 footnote', async () => {
    const result = await convertL2ToL3(l2);
    expect(result).toMatch(/\[\^ct-1\]:[^\n]*\n {4}\d+:[a-f0-9]{2} \{\+\+new \+\+\}/);
  });

  it('produces deletion edit-op in ct-2 footnote', async () => {
    const result = await convertL2ToL3(l2);
    // Contextual format: the deletion op is embedded with surrounding context chars.
    // Allow optional context before/after the {--old --} op.
    expect(result).toMatch(/\[\^ct-2\]:[^\n]*\n {4}\d+:[a-f0-9]{2} .*\{--old --\}/);
  });

  it('produces substitution edit-op in ct-3 footnote', async () => {
    const result = await convertL2ToL3(l2);
    expect(result).toMatch(/\[\^ct-3\]:[^\n]*\n {4}\d+:[a-f0-9]{2} \{~~provides~>delivers~~\}/);
  });

  it('preserves existing footnote body lines (author comment, approval)', async () => {
    const result = await convertL2ToL3(l2);
    // The existing "@ai:..." discussion line should still be present
    expect(result).toContain('@ai:claude-opus-4.6');
    // The approval line on ct-3 should be preserved
    expect(result).toContain('approved: @alice');
  });

  it('returns valid L3 that round-trips through FootnoteNativeParser', async () => {

    const result = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(result);
    const changes = doc.getChanges();
    expect(changes.length).toBeGreaterThan(0);
  });
});

describe('contextual edit-op emission for deletions', () => {
  it('emits contextual format for deletions (no @ctx:)', async () => {
    const l2 = `# Test\n\nBut {--most --}[^ct-1]contact center leaders.\n\n[^ct-1]: @alice | 2026-03-16 | del | proposed\n    @alice 2026-03-16: remove most`;
    const l3 = await convertL2ToL3(l2);
    // The deletion of "most " should be emitted as a contextual opString
    // (context chars around the {--...--} op), not @ctx: annotation
    expect(l3).toContain('{--most --}');
    // @ctx: is no longer emitted — context is embedded in the opString line
    expect(l3).not.toMatch(/@ctx:/);
    // The opString line must contain the deletion AND surrounding context text
    // Extract the edit-op line from the footnote section
    const editOpLineMatch = l3.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLineMatch).toBeTruthy();
    const opString = editOpLineMatch![1];
    expect(opString).toContain('{--most --}');
    // Context must be present: opString must be longer than just "{--most --}"
    expect(opString.trim().length).toBeGreaterThan('{--most --}'.length);
    // The context before the deletion should include chars from "But "
    // and the context after should include chars from "contact"
    const delIdx = opString.indexOf('{--most --}');
    const contextBefore = opString.substring(0, delIdx);
    const contextAfter = opString.substring(delIdx + '{--most --}'.length);
    // At least one of the context sides must be non-empty
    expect(contextBefore.length + contextAfter.length).toBeGreaterThan(0);
  });

  it('does not emit @ctx: for any changes', async () => {
    const l2 = `# Test\n\nSome {++added ++}[^ct-1]text.\n\n[^ct-1]: @alice | 2026-03-16 | ins | proposed`;
    const l3 = await convertL2ToL3(l2);
    expect(l3).not.toContain('@ctx:');
  });
});

describe('L2→L3 line anchoring: shiftedLineNum correctness', () => {
  it('records correct line number when short text also appears in HTML comment header (line 1)', async () => {
    // Bug scenario: old findLineForText did bodyStr.indexOf("c") and found "c" inside
    // "<!-- ctrcks.com/v1: tracked -->" on line 1, producing "1:hash". shiftedLineNum
    // computes the actual offset and lands on line 3 (the paragraph line).
    const l2 = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Doc',
      '',
      'Note: consider {++c++}[^ct-1] carefully.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The edit-op line must say "4:..." (the paragraph is line 4 in the clean body)
    expect(footnoteSection).toMatch(/^ {4}4:[a-f0-9]{2} /m);
    // Must NOT say "1:..." (which is the HTML comment line where "c" first appears)
    expect(footnoteSection).not.toMatch(/^ {4}1:[a-f0-9]{2} /m);
  });

  it('picks correct line when same short text appears on multiple lines', async () => {
    // "x" appears on line 2 and line 4. The change (insertion of "x") is on line 4.
    // shiftedLineNum must pick line 4, not line 2.
    const l2 = [
      '# Doc',
      '',
      'First x occurrence here.',
      '',
      'Second {++x++}[^ct-1] occurrence here.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The change is on line 5 of the clean body (# Doc, blank, First..., blank, Second...)
    expect(footnoteSection).toMatch(/^ {4}5:[a-f0-9]{2} /m);
    // Must NOT point to line 3 (where "First x occurrence" is)
    expect(footnoteSection).not.toMatch(/^ {4}3:[a-f0-9]{2} /m);
  });

  it('records correct line number for multi-line insertion', async () => {
    // Insertion is on line 3. The body has 5 lines total.
    // Verify the anchor line is 3, not 1.
    const l2 = [
      '# Doc',
      '',
      'The team {++added this new sentence ++}[^ct-1]here.',
      '',
      'Another paragraph.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The insertion is on line 3 of the clean body
    expect(footnoteSection).toMatch(/^ {4}3:[a-f0-9]{2} /m);
    // Must NOT point to line 1 (# Doc)
    expect(footnoteSection).not.toMatch(/^ {4}1:[a-f0-9]{2} /m);
  });
});

describe('L2→L3 edge cases', () => {
  it('returns unchanged text when no CriticMarkup found', async () => {
    const plain = '# Plain doc\n\nNo changes here.\n';
    const result = await convertL2ToL3(plain);
    expect(result).toBe(plain);
  });

  it('handles rejected insertion: strips text from body', async () => {
    const l2 = `<!-- ctrcks.com/v1: tracked -->\n# Doc\n\nSome {++extra ++}[^ct-1]text.\n\n[^ct-1]: @alice | 2026-03-16 | ins | rejected\n`;
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).not.toContain('extra');
    expect(body).toContain('Some text.');
  });

  it('handles rejected deletion: keeps text in body', async () => {
    const l2 = `<!-- ctrcks.com/v1: tracked -->\n# Doc\n\nSome {--old --}[^ct-1]text.\n\n[^ct-1]: @alice | 2026-03-16 | del | rejected\n`;
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).toContain('old ');
    expect(body).toContain('Some old text.');
  });

  it('handles rejected substitution: keeps original text in body', async () => {
    const l2 = `<!-- ctrcks.com/v1: tracked -->\n# Doc\n\nThe {~~fast~>slow~~}[^ct-1] system.\n\n[^ct-1]: @alice | 2026-03-16 | sub | rejected\n`;
    const result = await convertL2ToL3(l2);
    const body = result.substring(0, result.indexOf('[^ct-'));
    expect(body).toContain('fast');
    expect(body).not.toContain('slow');
  });
});

describe('L3 to L2 conversion', () => {
  const l3 = readFileSync(
    resolve(__dirname, '../../core/src/test/fixtures/l3-sample.md'),
    'utf-8'
  );

  it('inserts insertion CriticMarkup delimiters in body', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toMatch(/\{\+\+/);
  });

  it('inserts deletion markup in body', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toMatch(/\{--/);
  });

  it('inserts substitution markup in body', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toMatch(/\{~~.*~>.*~~\}/);
  });

  it('adds [^ct-N] refs after markup', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toMatch(/\[\^ct-\d+\]/);
  });

  it('strips LINE:HASH edit-op lines for proposed changes; keeps them for decided changes', async () => {
    const l2 = await convertL3ToL2(l3);
    // Proposed changes (ct-1 ins, ct-2 del, ct-5 highlight, ct-6 comment) get inline
    // CriticMarkup and have their edit-op lines removed from their footnotes.
    // Verify ct-1 footnote has no edit-op line (it is proposed).
    const ct1Block = l2.slice(l2.indexOf('[^ct-1]:'), l2.indexOf('[^ct-2]:'));
    expect(ct1Block).not.toMatch(/^ {4}\d+:[a-f0-9]{2,}\s+\{/m);
    // Decided changes (ct-3 accepted, ct-4 rejected) keep their edit-op lines.
    expect(l2).toMatch(/^ {4}8:[a-f0-9]{2,}\s+\{~~provides~>delivers~~\}/m); // ct-3 accepted
    expect(l2).toMatch(/^ {4}4:[a-f0-9]{2,}\s+\{.*\}/m);                    // ct-4 rejected
  });

  it('preserves footnote definition headers', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toMatch(/\[\^ct-1\]: @alice \| 2026-03-16 \| ins \| proposed/);
    expect(l2).toMatch(/\[\^ct-2\]: @alice \| 2026-03-16 \| del \| proposed/);
    expect(l2).toMatch(/\[\^ct-3\]: @bob \| 2026-03-16 \| sub \| accepted/);
  });

  it('preserves approval metadata lines in footnotes', async () => {
    const l2 = await convertL3ToL2(l3);
    expect(l2).toContain('approved: @alice 2026-03-16 "Verified the change"');
  });

  it('inserts insertion text wrapped in {++...++} with ref', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-1 is an insertion of "new " into the body
    expect(l2).toMatch(/\{\+\+new \+\+\}\[\^ct-1\]/);
  });

  it('inserts deletion markup with original text at anchor', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-2 is a deletion of "old "
    expect(l2).toMatch(/\{--old --\}\[\^ct-2\]/);
  });

  it('skips inline CriticMarkup for accepted substitution (ct-3); keeps edit-op in footnote', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-3 is an accepted sub — no inline CriticMarkup in body.
    const bodyPart = l2.slice(0, l2.indexOf('[^ct-1]:'));
    expect(bodyPart).not.toMatch(/\{~~provides~>delivers~~\}/);
    // But the edit-op line IS preserved in the ct-3 footnote.
    expect(l2).toContain('[^ct-3]:');
    expect(l2).toMatch(/\{~~provides~>delivers~~\}/); // inside the footnote
  });

  it('skips inline CriticMarkup for rejected insertion (ct-4); keeps edit-op in footnote', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-4 is a rejected insertion — no inline CriticMarkup in body.
    const bodyPart = l2.slice(0, l2.indexOf('[^ct-1]:'));
    expect(bodyPart).not.toMatch(/\{\+\+experimental /);
    // But the edit-op line IS preserved in the ct-4 footnote.
    expect(l2).toContain('[^ct-4]:');
    expect(l2).toMatch(/\{.*experimental.*\}/); // inside the footnote
  });

  it('inserts highlight markup with comment', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-5 is a highlight of "excellent results" with comment
    expect(l2).toMatch(/\{==excellent results==\}/);
    expect(l2).toContain('[^ct-5]');
  });

  it('inserts comment markup at anchor', async () => {
    const l2 = await convertL3ToL2(l3);
    // ct-6 is a comment
    expect(l2).toMatch(/\{>>.*<<\}\[\^ct-6\]/);
  });

  it('returns unchanged if no footnote-native changes', async () => {
    const plain = '# Plain doc\n\nNo changes here.\n';
    const result = await convertL3ToL2(plain);
    expect(result).toBe(plain);
  });
});

describe('L2 ↔ L3 round trip', () => {
  it('L2 → L3 → L2 preserves proposed changes as inline CriticMarkup; decided changes in footnotes', async () => {
    const originalL2 = readFileSync(
      resolve(__dirname, '../../core/src/test/fixtures/l2-with-changes.md'),
      'utf-8'
    );

    const l3 = await convertL2ToL3(originalL2);
    const roundTrippedL2 = await convertL3ToL2(l3);

    // l2-with-changes.md has ct-1 (ins proposed), ct-2 (del proposed), ct-3 (sub accepted).
    // After round-trip, proposed changes survive as inline CriticMarkup in the body.
    // Extract the document body (before the first footnote definition line, `[^ct-N]:`).
    const footnoteDef = roundTrippedL2.match(/^\[\^ct-/m);
    const bodyPart = footnoteDef ? roundTrippedL2.slice(0, footnoteDef.index) : roundTrippedL2;
    const cmParser = new CriticMarkupParser();
    const bodyDoc = cmParser.parse(bodyPart);
    // Only 2 proposed changes have inline markup in the body (ct-1 ins, ct-2 del).
    expect(bodyDoc.getChanges().length).toBe(2);
    expect(bodyDoc.getChanges()[0].type).toBe(ChangeType.Insertion);
    expect(bodyDoc.getChanges()[1].type).toBe(ChangeType.Deletion);

    // Accepted change (ct-3 sub) is a decided change — no inline CriticMarkup in body.
    // Its edit-op line is preserved in the footnote. Use FootnoteNativeParser to find it.
    const fnParser = new FootnoteNativeParser();
    const fnDoc = fnParser.parse(roundTrippedL2);
    const acceptedChanges = fnDoc.getChanges().filter(c => c.status === ChangeStatus.Accepted);
    expect(acceptedChanges.length).toBe(1); // ct-3 sub
    expect(acceptedChanges[0].type).toBe(ChangeType.Substitution);
  });

  it('L2 → L3 → L2 keeps proposed insertion and deletion markup in body', async () => {
    const originalL2 = readFileSync(
      resolve(__dirname, '../../core/src/test/fixtures/l2-with-changes.md'),
      'utf-8'
    );
    const l3 = await convertL2ToL3(originalL2);
    const roundTrippedL2 = await convertL3ToL2(l3);
    // Proposed changes (ct-1 ins, ct-2 del) round-trip to inline CriticMarkup.
    expect(roundTrippedL2).toMatch(/\{\+\+new \+\+\}/);
    expect(roundTrippedL2).toMatch(/\{--old --\}/);
    // Accepted change (ct-3 sub) does NOT produce inline markup — it is a decided change.
    const bodyPart = roundTrippedL2.slice(0, roundTrippedL2.indexOf('[^ct-'));
    expect(bodyPart).not.toMatch(/\{~~provides~>delivers~~\}/);
  });
});

// ─── Expansion of ambiguous op text during L2→L3 conversion ──────────────────

describe('L2→L3 unique-span expansion for non-deletion ops', () => {
  it('emits contextual opString for ambiguous insertion (context provides uniqueness)', async () => {
    // "the " appears twice in the body line after accepting the insertion.
    // Body after stripping CriticMarkup: "the cat and the dog"
    // The new format embeds the exact op text ({++the ++}) with surrounding context
    // chars on the opString line so that the full opString is unique on the body line.
    const l2 = [
      '# Test',
      '',
      'the cat and {++the ++}[^ct-1]dog',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
      '    @alice 2026-03-16: add "the"',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The insertion op must still use the exact insertion text inside {++...++}
    const editOpMatch = footnoteSection.match(/\{\+\+([^+]+)\+\+\}/);
    expect(editOpMatch).toBeTruthy();
    const opText = editOpMatch![1];
    expect(opText).toContain('the ');
    // Extract the full opString from the edit-op line
    const editOpLineMatch = footnoteSection.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLineMatch).toBeTruthy();
    const opString = editOpLineMatch![1];
    // The full opString (contextBefore + insertionText + contextAfter) must be
    // unique on the body line — this is the key property of the contextual format.
    const bodyLine = 'the cat and the dog';
    // Build the body-match: contextBefore + insertion text + contextAfter
    const insIdx = opString.indexOf('{++');
    const insEnd = opString.indexOf('++}') + '++}'.length;
    const contextBefore = opString.substring(0, insIdx);
    const contextAfter = opString.substring(insEnd);
    const bodyMatch = contextBefore + opText + contextAfter;
    const occurrences = (bodyLine.split(bodyMatch).length - 1);
    expect(occurrences).toBe(1);
  });

  it('does not expand insertion text that is already unique', async () => {
    // "added " appears only once in the body after accepting
    const l2 = [
      '# Test',
      '',
      'This is some {++added ++}[^ct-1]text.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The edit-op text should remain "added " (already unique)
    expect(footnoteSection).toMatch(/\{\+\+added \+\+\}/);
  });

  it('emits contextual opString for ambiguous highlight (context provides uniqueness)', async () => {
    // "good" appears twice in the body line.
    // Body after stripping CriticMarkup: "good work produces good results."
    // The contextual format embeds exact highlight text with surrounding context chars.
    const l2 = [
      '# Test',
      '',
      'good work produces {==good==}[^ct-1] results.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | highlight | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // The highlight op must use exact text inside {==...==}
    const editOpMatch = footnoteSection.match(/\{==([^=]+)==\}/);
    expect(editOpMatch).toBeTruthy();
    const opText = editOpMatch![1];
    expect(opText).toContain('good');
    // Extract the full opString from the edit-op line
    const editOpLineMatch = footnoteSection.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLineMatch).toBeTruthy();
    const opString = editOpLineMatch![1];
    // Build the body-match: contextBefore + highlightText + contextAfter
    const hiIdx = opString.indexOf('{==');
    const hiEnd = opString.indexOf('==}') + '==}'.length;
    const contextBefore = opString.substring(0, hiIdx);
    const contextAfter = opString.substring(hiEnd);
    const bodyMatch = contextBefore + opText + contextAfter;
    const bodyLine = 'good work produces good results.';
    const occurrences = (bodyLine.split(bodyMatch).length - 1);
    expect(occurrences).toBe(1);
  });

  it('does not emit @ctx: for non-deletion changes after expansion', async () => {
    const l2 = [
      '# Test',
      '',
      'the cat and {++the ++}[^ct-1]dog',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    expect(l3).not.toContain('@ctx:');
  });

  it('emits contextual opString for ambiguous substitution (context provides uniqueness)', async () => {
    // Body after accepting sub: "You can do it, I can do this."
    // "can do" appears twice on this line.
    // The contextual format embeds the exact sub op with surrounding context chars
    // so the full opString uniquely identifies the substitution location.
    const l2 = [
      '# Test',
      '',
      'You {~~could do~>can do~~}[^ct-1] it, I can do this.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const footnoteSection = l3.slice(l3.indexOf('[^ct-1]'));
    // Should have a substitution edit-op with exact texts
    expect(footnoteSection).toMatch(/\{~~.*~>.*~~\}/);
    const subMatch = footnoteSection.match(/\{~~([^~]+)~>([^~]+)~~\}/);
    expect(subMatch).toBeTruthy();
    const newText = subMatch![2];
    expect(newText).toContain('can do');
    // Extract the full opString from the edit-op line
    const editOpLineMatch = footnoteSection.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLineMatch).toBeTruthy();
    const opString = editOpLineMatch![1];
    // Build the body-match: contextBefore + newText + contextAfter
    const subIdx = opString.indexOf('{~~');
    const subEnd = opString.indexOf('~~}') + '~~}'.length;
    const contextBefore = opString.substring(0, subIdx);
    const contextAfter = opString.substring(subEnd);
    const bodyMatch = contextBefore + newText + contextAfter;
    const bodyLine = 'You can do it, I can do this.';
    const occurrences = (bodyLine.split(bodyMatch).length - 1);
    expect(occurrences).toBe(1);
  });

  it('adjacent change pair (title-case scenario) — insertion and deletion on same line have distinct context', async () => {
    // Simulates the title-case scenario: an insertion of "o" and a deletion of "O"
    // on the same body line. Each must get correct context so both are uniquely anchored.
    // Body after accepting ins + deletion: "Protocol overview and Practical Guidelines"
    // - insertion of "o" at col 9 (after "Protocol ")
    // - deletion of "O" — absent from the body
    const l2 = [
      '# Title',
      '',
      'Protocol {++o++}[^ct-1]{--O--}[^ct-2]verview and Practical Guidelines',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
      '[^ct-2]: @alice | 2026-03-16 | del | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);

    // Both ct-1 and ct-2 footnotes must appear
    expect(l3).toContain('[^ct-1]');
    expect(l3).toContain('[^ct-2]');

    // ct-1 (insertion): must have {++o++} in its edit-op line
    const ct1Section = l3.slice(l3.indexOf('[^ct-1]'), l3.indexOf('[^ct-2]'));
    expect(ct1Section).toMatch(/\{[+][+]o[+][+]\}/);

    // ct-2 (deletion): must have {--O--} in its edit-op line
    const ct2Section = l3.slice(l3.indexOf('[^ct-2]'));
    expect(ct2Section).toMatch(/\{--O--\}/);

    // Neither should emit @ctx:
    expect(l3).not.toContain('@ctx:');

    // The body line should contain the accepted text: "Protocol overview and Practical Guidelines"
    const bodyEnd = l3.indexOf('[^ct-1]');
    const body = l3.substring(0, bodyEnd);
    expect(body).toContain('overview');
    expect(body).not.toContain('Overview');
  });
});

// Shared fixture: title-case adjacent ins+del pair (used across word-boundary and round-trip tests)
const titleCaseAdjacentL2 = [
  '# Protocol Overview and Practical Guidelines',
  '',
  'Protocol {++o++}[^ct-1]{--O--}[^ct-2]verview and Practical Guidelines',
  '',
  '[^ct-1]: @copy-editor | 2026-03-15 | ins | proposed',
  '[^ct-2]: @copy-editor | 2026-03-15 | del | proposed',
].join('\n');

describe('word-boundary context expansion', () => {
  it('snaps insertion context to word boundaries (title-case case)', async () => {
    const l3 = await convertL2ToL3(titleCaseAdjacentL2);
    const ct1Section = l3.slice(l3.indexOf('[^ct-1]'), l3.indexOf('[^ct-2]'));
    // Must contain the insertion op with right-side context ("verview")
    expect(ct1Section).toMatch(/\{\+\+o\+\+\}verview/);
    // Must NOT have context starting with whitespace
    const editOpLine = ct1Section.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    expect(editOpLine![1]).not.toMatch(/^\s/); // context must not start with space
  });

  it('snaps deletion context to word boundaries (title-case case)', async () => {
    const l3 = await convertL2ToL3(titleCaseAdjacentL2);
    const ct2Section = l3.slice(l3.indexOf('[^ct-2]'));
    // Deletion context should span word boundaries — the deletion is within
    // the word "Overview", so context includes surrounding chars of that word
    expect(ct2Section).toMatch(/o\{--O--\}verview/);
    // Must NOT have context starting with whitespace
    const editOpLine = ct2Section.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    expect(editOpLine![1]).not.toMatch(/^\s/);
  });

  it('snaps substitution context to word boundaries', async () => {
    const l2 = [
      '# Test',
      '',
      'You {~~could do~>can do~~}[^ct-1] it, I can do this.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const editOpLine = l3.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    const opString = editOpLine![1];
    // Context must not start with whitespace (word-boundary snapped)
    expect(opString).not.toMatch(/^\s/);
    // Must contain the substitution op
    expect(opString).toMatch(/\{~~could do~>can do~~\}/);
  });

  it('snaps highlight context to word boundaries', async () => {
    const l2 = [
      '# Test',
      '',
      'good work produces {==good==}[^ct-1] results.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | highlight | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const editOpLine = l3.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    const opString = editOpLine![1];
    // Context must not start with whitespace
    expect(opString).not.toMatch(/^\s/);
    // Must contain the highlight op
    expect(opString).toMatch(/\{==good==\}/);
  });

  it('unique op always includes context (never bare)', async () => {
    const l2 = [
      '# Test',
      '',
      'This is some {++added ++}[^ct-1]text.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const editOpLine = l3.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    // buildContextualL3EditOp always adds context — op is never emitted bare
    const opString = editOpLine![1];
    expect(opString).toContain('{++added ++}');
    expect(opString.length).toBeGreaterThan('{++added ++}'.length);
  });

  it('context at column 0 has no contextBefore', async () => {
    const l2 = [
      '# Test',
      '',
      '{++the ++}[^ct-1]cat and the dog',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');
    const l3 = await convertL2ToL3(l2);
    const editOpLine = l3.match(/^ {4}\d+:[a-f0-9]{2} (.+)$/m);
    expect(editOpLine).toBeTruthy();
    const opString = editOpLine![1];
    // Must start with {++ (no contextBefore at column 0)
    expect(opString).toMatch(/^\{\+\+the \+\+\}/);
  });
});

describe('contextual edit-op end-to-end round-trip', () => {
  it('title-case adjacent changes — both resolve to correct positions', async () => {
    const l3 = await convertL2ToL3(titleCaseAdjacentL2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const changes = doc.getChanges();

    const ct1 = changes.find(c => c.id === 'ct-1');
    const ct2 = changes.find(c => c.id === 'ct-2');
    expect(ct1).toBeDefined();
    expect(ct2).toBeDefined();
    expect(ct1!.anchored).toBe(true);
    expect(ct2!.anchored).toBe(true);

    // Both must resolve to different positions on line 3
    expect(ct1!.range.start).not.toBe(ct2!.range.start);

    // ct-1 (insertion of "o"): spans 1 character
    expect(ct1!.range.end - ct1!.range.start).toBe(1);
    expect(ct1!.modifiedText).toBe('o');

    // ct-2 (deletion of "O"): zero-width
    expect(ct2!.range.start).toBe(ct2!.range.end);
    expect(ct2!.originalText).toBe('O');

    // ct-1 insertion position < ct-2 deletion position
    expect(ct1!.range.start).toBeLessThan(ct2!.range.start);
  });

  it('substitution round-trip — resolves to correct range', async () => {
    const l2 = [
      '# Test',
      '',
      'You {~~could do~>can do~~}[^ct-1] it, I can do this.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
    ].join('\n');

    const l3 = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const sub = doc.getChanges().find(c => c.id === 'ct-1');
    expect(sub).toBeDefined();
    expect(sub!.anchored).toBe(true);
    expect(sub!.type).toBe(ChangeType.Substitution);
    // "can do" is at position 4 ("You " = 4 chars) on body line "You can do it, I can do this."
    // Line offset: "# Test\n\n".length = 8
    expect(sub!.range.start).toBe(8 + 4);
    expect(sub!.range.end).toBe(8 + 4 + 'can do'.length);
    expect(sub!.originalText).toBe('could do');
    expect(sub!.modifiedText).toBe('can do');
  });

  it('highlight round-trip — resolves to correct range', async () => {
    const l2 = [
      '# Test',
      '',
      'good work produces {==good==}[^ct-1] results.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | highlight | proposed',
    ].join('\n');

    const l3 = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const hi = doc.getChanges().find(c => c.id === 'ct-1');
    expect(hi).toBeDefined();
    expect(hi!.anchored).toBe(true);
    expect(hi!.type).toBe(ChangeType.Highlight);
    // Body line: "good work produces good results."
    // The SECOND "good" (position 19) is the highlighted one.
    // Line offset: "# Test\n\n".length = 8
    expect(hi!.range.start).toBe(8 + 19);
    expect(hi!.range.end).toBe(8 + 19 + 'good'.length);
  });

  it('rejected insertion round-trip — zero-width range at correct position', async () => {
    const l2 = [
      '# Protocol Overview and Practical Guidelines',
      '',
      'Protocol {++o++}[^ct-1]verview and Practical Guidelines',
      '',
      '[^ct-1]: @copy-editor | 2026-03-15 | ins | rejected',
    ].join('\n');

    const l3 = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const ins = doc.getChanges().find(c => c.id === 'ct-1');
    expect(ins).toBeDefined();
    // Rejected insertion: text is NOT in body, zero-width range
    expect(ins!.range.start).toBe(ins!.range.end);
    expect(ins!.modifiedText).toBe('o');
  });
});

const introFixturePath = resolve(
  __dirname,
  '../../../docs/test-fixtures/changetracks-intro-changetracks.md',
);

describe('Intro doc fixture integration', () => {
  it('Intro document L2→L3→parser: all changes resolve as anchored', async () => {

    const l2 = readFileSync(
      introFixturePath,
      'utf-8',
    );
    const l3 = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const changes = doc.getChanges();

    // Must have a substantial number of changes
    expect(changes.length).toBeGreaterThan(50);

    // Every non-comment change must be anchored (resolved to a deterministic position)
    const nonCommentChanges = changes.filter(c => c.type !== ChangeType.Comment);
    const unanchored = nonCommentChanges.filter(c => !c.anchored);
    if (unanchored.length > 0) {
      const ids = unanchored.map(c => c.id).join(', ');
      throw new Error(`Unanchored changes: ${ids}`);
    }
    expect(unanchored.length).toBe(0);
  });

  it('intro doc ct-1/ct-2 pair resolves to distinct positions', async () => {

    const l2 = readFileSync(
      introFixturePath,
      'utf-8',
    );
    const l3 = await convertL2ToL3(l2);
    const parser = new FootnoteNativeParser();
    const doc = parser.parse(l3);
    const changes = doc.getChanges();

    const ct1 = changes.find(c => c.id === 'ct-1');
    const ct2 = changes.find(c => c.id === 'ct-2');
    expect(ct1).toBeDefined();
    expect(ct2).toBeDefined();
    expect(ct1!.anchored).toBe(true);
    expect(ct2!.anchored).toBe(true);
    // ct-1 (sub, accepted) and ct-2 (ins, accepted) must have distinct positions
    expect(ct1!.range.start).not.toBe(ct2!.range.start);
    // Both are accepted/settled — zero-width anchors
    expect(ct1!.range.start).toBe(ct1!.range.end);
    expect(ct2!.range.start).toBe(ct2!.range.end);
  });

  it('L3 output contains no @ctx: annotations', async () => {
    const l2 = readFileSync(
      introFixturePath,
      'utf-8',
    );
    const l3 = await convertL2ToL3(l2);
    // All changes should use contextual format, not legacy @ctx:
    expect(l3).not.toContain('@ctx:');
  });
});
