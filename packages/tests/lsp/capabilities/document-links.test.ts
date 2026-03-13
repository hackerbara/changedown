import * as assert from 'assert';
import { createDocumentLinks } from '@changetracks/lsp-server/internals';

/**
 * Helper: decode the command target URI back into [uri, line, character].
 * The target format is:
 *   command:changetracks.goToPosition?<encoded JSON array>
 */
function decodeTarget(target: string): { uri: string; line: number; character: number } {
  const prefix = 'command:changetracks.goToPosition?';
  assert.ok(target.startsWith(prefix), `Expected target to start with "${prefix}", got: ${target}`);
  const json = decodeURIComponent(target.slice(prefix.length));
  const [uri, line, character] = JSON.parse(json);
  return { uri, line, character };
}

const TEST_URI = 'file:///test/doc.md';

describe('Document Links', () => {
  describe('createDocumentLinks', () => {

    it('inline ref links to footnote definition', () => {
      const text = [
        'Some text with a change[^ct-1] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // One link from inline ref → definition, one from definition → inline ref
      assert.strictEqual(links.length, 2);

      // Find the inline ref → definition link (range covers [^ct-1] on line 0)
      const refLink = links.find(l => l.range.start.line === 0);
      assert.ok(refLink, 'Expected a link on line 0 for the inline ref');

      // The inline ref [^ct-1] starts at column 23
      assert.strictEqual(refLink.range.start.character, 23);
      assert.strictEqual(refLink.range.end.character, 23 + '[^ct-1]'.length);
      assert.ok(refLink.tooltip?.includes('[^ct-1]'));

      // Target should point to the definition on line 2, column 0
      const refTarget = decodeTarget(refLink.target!);
      assert.strictEqual(refTarget.uri, TEST_URI);
      assert.strictEqual(refTarget.line, 2);
      assert.strictEqual(refTarget.character, 0);
    });

    it('footnote definition links back to inline ref', () => {
      const text = [
        'Some text with a change[^ct-1] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Find the definition → inline ref link (range covers [^ct-1]: on line 2)
      const defLink = links.find(l => l.range.start.line === 2);
      assert.ok(defLink, 'Expected a link on line 2 for the definition');

      assert.strictEqual(defLink.range.start.character, 0);
      assert.strictEqual(defLink.range.end.character, '[^ct-1]:'.length);
      assert.ok(defLink.tooltip?.includes('[^ct-1]'));

      // Target should point back to the inline ref on line 0
      const defTarget = decodeTarget(defLink.target!);
      assert.strictEqual(defTarget.uri, TEST_URI);
      assert.strictEqual(defTarget.line, 0);
      assert.strictEqual(defTarget.character, 23);
    });

    it('multiple inline refs to same footnote all get links', () => {
      const text = [
        'First ref[^ct-1] and second ref[^ct-1] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Both inline refs should have links to the definition
      const refLinks = links.filter(l => l.range.start.line === 0);
      assert.strictEqual(refLinks.length, 2, 'Both inline refs should produce links');

      // First ref at offset 9 ("First ref" = 9 chars)
      assert.strictEqual(refLinks[0].range.start.character, 9);
      // Second ref at offset 31 ("First ref[^ct-1] and second ref" = 31 chars)
      assert.strictEqual(refLinks[1].range.start.character, 31);

      // Both should target the definition on line 2
      for (const link of refLinks) {
        const target = decodeTarget(link.target!);
        assert.strictEqual(target.line, 2);
        assert.strictEqual(target.character, 0);
      }

      // Definition back-link should point to the FIRST inline ref
      const defLink = links.find(l => l.range.start.line === 2);
      assert.ok(defLink, 'Definition should have a back-link');
      const defTarget = decodeTarget(defLink.target!);
      assert.strictEqual(defTarget.character, 9, 'Definition back-link should target the first inline ref');
    });

    it('dotted IDs like [^ct-1.1] link correctly', () => {
      const text = [
        'A move operation[^ct-1.1] was tracked.',
        '',
        '[^ct-1.1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 2);

      // Inline ref → definition
      const refLink = links.find(l => l.range.start.line === 0);
      assert.ok(refLink);
      assert.strictEqual(refLink.range.start.character, 16);
      assert.strictEqual(refLink.range.end.character, 16 + '[^ct-1.1]'.length);

      const refTarget = decodeTarget(refLink.target!);
      assert.strictEqual(refTarget.line, 2);

      // Definition → inline ref
      const defLink = links.find(l => l.range.start.line === 2);
      assert.ok(defLink);
      assert.strictEqual(defLink.range.end.character, '[^ct-1.1]:'.length);

      const defTarget = decodeTarget(defLink.target!);
      assert.strictEqual(defTarget.line, 0);
      assert.strictEqual(defTarget.character, 16);
    });

    it('non-existent ref with no definition produces no link', () => {
      const text = [
        'A ref to nothing[^ct-99] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // [^ct-99] has no definition, so no link for it
      // [^ct-1] definition has no inline ref, so no back-link
      assert.strictEqual(links.length, 0);
    });

    it('orphan definition with no inline ref produces no back-link', () => {
      const text = [
        'Plain text with no inline refs.',
        '',
        '[^ct-5]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 0);
    });

    it('multiple independent footnotes produce correct links', () => {
      const text = [
        'Change one[^ct-1] and change two[^ct-2] here.',
        '',
        '[^ct-1]: status: proposed',
        '[^ct-2]: status: accepted',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // 2 inline ref → def links + 2 def → ref links = 4 total
      assert.strictEqual(links.length, 4);

      // Inline ref links (line 0)
      const refLinks = links.filter(l => l.range.start.line === 0);
      assert.strictEqual(refLinks.length, 2);

      // First ref [^ct-1] at column 10
      assert.strictEqual(refLinks[0].range.start.character, 10);
      const target1 = decodeTarget(refLinks[0].target!);
      assert.strictEqual(target1.line, 2); // definition line

      // Second ref [^ct-2] at column 32
      assert.strictEqual(refLinks[1].range.start.character, 32);
      const target2 = decodeTarget(refLinks[1].target!);
      assert.strictEqual(target2.line, 3); // definition line

      // Definition back-links
      const defLink1 = links.find(l => l.range.start.line === 2);
      assert.ok(defLink1);
      const defTarget1 = decodeTarget(defLink1.target!);
      assert.strictEqual(defTarget1.character, 10);

      const defLink2 = links.find(l => l.range.start.line === 3);
      assert.ok(defLink2);
      const defTarget2 = decodeTarget(defLink2.target!);
      assert.strictEqual(defTarget2.character, 32);
    });

    it('definition header is not treated as inline ref', () => {
      // The definition [^ct-1]: should not be counted as an inline ref
      const text = [
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Only a definition, no inline ref — no links in either direction
      assert.strictEqual(links.length, 0);
    });

    it('handles empty document', () => {
      const links = createDocumentLinks('', TEST_URI);
      assert.strictEqual(links.length, 0);
    });

    it('handles document with no footnotes', () => {
      const text = 'Just plain markdown text.\n\nNo CriticMarkup here.';
      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 0);
    });

    it('multi-line document with refs and defs on different lines', () => {
      const text = [
        'First paragraph with[^ct-1] a ref.',
        'Second paragraph with[^ct-2] another.',
        '',
        'More text.',
        '',
        '[^ct-1]: status: proposed',
        '[^ct-2]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 4);

      // Ref on line 0 → def on line 5
      const ref1 = links.find(l => l.range.start.line === 0);
      assert.ok(ref1);
      const ref1Target = decodeTarget(ref1.target!);
      assert.strictEqual(ref1Target.line, 5);

      // Ref on line 1 → def on line 6
      const ref2 = links.find(l => l.range.start.line === 1);
      assert.ok(ref2);
      const ref2Target = decodeTarget(ref2.target!);
      assert.strictEqual(ref2Target.line, 6);

      // Def on line 5 → ref on line 0
      const def1 = links.find(l => l.range.start.line === 5);
      assert.ok(def1);
      const def1Target = decodeTarget(def1.target!);
      assert.strictEqual(def1Target.line, 0);

      // Def on line 6 → ref on line 1
      const def2 = links.find(l => l.range.start.line === 6);
      assert.ok(def2);
      const def2Target = decodeTarget(def2.target!);
      assert.strictEqual(def2Target.line, 1);
    });

    it('inline ref mid-line with CriticMarkup around it', () => {
      // Realistic scenario: a change node followed by its footnote ref
      const text = [
        'Hello {++world++}[^ct-1] today.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 2);

      const refLink = links.find(l => l.range.start.line === 0);
      assert.ok(refLink);
      // {++world++} is 12 chars, then [^ct-1] starts at col 17
      assert.strictEqual(refLink.range.start.character, 17);
    });

    it('dotted ID with parent ID both present', () => {
      const text = [
        'Deleted here[^ct-1] and inserted there[^ct-1.1].',
        '',
        '[^ct-1]: status: proposed',
        '[^ct-1.1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // 2 inline refs + 2 defs = 4 links
      assert.strictEqual(links.length, 4);

      // [^ct-1] ref at column 12
      const ref1 = links.find(l => l.range.start.line === 0 && l.range.start.character === 12);
      assert.ok(ref1, 'Expected link for [^ct-1] at col 12');
      const ref1Target = decodeTarget(ref1.target!);
      assert.strictEqual(ref1Target.line, 2);

      // [^ct-1.1] ref at column 38
      const ref2 = links.find(l => l.range.start.line === 0 && l.range.start.character === 38);
      assert.ok(ref2, 'Expected link for [^ct-1.1] at col 38');
      const ref2Target = decodeTarget(ref2.target!);
      assert.strictEqual(ref2Target.line, 3);
    });

    it('URI is correctly embedded in link targets', () => {
      const customUri = 'file:///Users/test/project/notes.md';
      const text = [
        'Text[^ct-1] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, customUri);
      assert.strictEqual(links.length, 2);

      for (const link of links) {
        const target = decodeTarget(link.target!);
        assert.strictEqual(target.uri, customUri);
      }
    });

    it('ref inside footnote body does not create link to itself', () => {
      // A footnote body that mentions another footnote ref
      const text = [
        'Change here[^ct-1] relates to[^ct-2].',
        '',
        '[^ct-1]: Relates to [^ct-2]',
        '[^ct-2]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Inline refs on line 0: [^ct-1] and [^ct-2] → 2 ref links
      // Inline ref on line 2: [^ct-2] inside footnote body → 1 ref link
      // Definition back-links: [^ct-1]: → line 0 ref, [^ct-2]: → first ref on line 0
      // Total: 3 inline refs + 2 def back-links = 5
      const refLinks = links.filter(l => l.tooltip?.startsWith('Go to footnote definition'));
      const defLinks = links.filter(l => l.tooltip?.startsWith('Go to inline change'));

      assert.strictEqual(refLinks.length, 3, 'Three inline ref links (two on line 0, one on line 2)');
      assert.strictEqual(defLinks.length, 2, 'Two definition back-links');
    });

    it('handles high footnote numbers', () => {
      const text = [
        'Reference[^ct-999] here.',
        '',
        '[^ct-999]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      assert.strictEqual(links.length, 2);

      const refLink = links.find(l => l.range.start.line === 0);
      assert.ok(refLink);
      assert.strictEqual(refLink.range.end.character - refLink.range.start.character, '[^ct-999]'.length);
    });
  });
});
