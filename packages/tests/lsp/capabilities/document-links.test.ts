import { describe, it, expect } from 'vitest';
import { createDocumentLinks } from '@changetracks/lsp-server/internals';

/**
 * Helper: decode the command target URI back into [uri, line, character].
 * The target format is:
 *   command:changetracks.goToPosition?<encoded JSON array>
 */
function decodeTarget(target: string): { uri: string; line: number; character: number } {
  const prefix = 'command:changetracks.goToPosition?';
  expect(target.startsWith(prefix)).toBeTruthy();
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
      expect(links).toHaveLength(2);

      // Find the inline ref → definition link (range covers [^ct-1] on line 0)
      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();

      // The inline ref [^ct-1] starts at column 23
      expect(refLink.range.start.character).toBe(23);
      expect(refLink.range.end.character).toBe(23 + '[^ct-1]'.length);
      expect(refLink.tooltip?.includes('[^ct-1]')).toBeTruthy();

      // Target should point to the definition on line 2, column 0
      const refTarget = decodeTarget(refLink.target!);
      expect(refTarget.uri).toBe(TEST_URI);
      expect(refTarget.line).toBe(2);
      expect(refTarget.character).toBe(0);
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
      expect(defLink).toBeTruthy();

      expect(defLink.range.start.character).toBe(0);
      expect(defLink.range.end.character).toBe('[^ct-1]:'.length);
      expect(defLink.tooltip?.includes('[^ct-1]')).toBeTruthy();

      // Target should point back to the inline ref on line 0
      const defTarget = decodeTarget(defLink.target!);
      expect(defTarget.uri).toBe(TEST_URI);
      expect(defTarget.line).toBe(0);
      expect(defTarget.character).toBe(23);
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
      expect(refLinks).toHaveLength(2);

      // First ref at offset 9 ("First ref" = 9 chars)
      expect(refLinks[0].range.start.character).toBe(9);
      // Second ref at offset 31 ("First ref[^ct-1] and second ref" = 31 chars)
      expect(refLinks[1].range.start.character).toBe(31);

      // Both should target the definition on line 2
      for (const link of refLinks) {
        const target = decodeTarget(link.target!);
        expect(target.line).toBe(2);
        expect(target.character).toBe(0);
      }

      // Definition back-link should point to the FIRST inline ref
      const defLink = links.find(l => l.range.start.line === 2);
      expect(defLink).toBeTruthy();
      const defTarget = decodeTarget(defLink.target!);
      expect(defTarget.character).toBe(9);
    });

    it('dotted IDs like [^ct-1.1] link correctly', () => {
      const text = [
        'A move operation[^ct-1.1] was tracked.',
        '',
        '[^ct-1.1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      // Inline ref → definition
      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      expect(refLink.range.start.character).toBe(16);
      expect(refLink.range.end.character).toBe(16 + '[^ct-1.1]'.length);

      const refTarget = decodeTarget(refLink.target!);
      expect(refTarget.line).toBe(2);

      // Definition → inline ref
      const defLink = links.find(l => l.range.start.line === 2);
      expect(defLink).toBeTruthy();
      expect(defLink.range.end.character).toBe('[^ct-1.1]:'.length);

      const defTarget = decodeTarget(defLink.target!);
      expect(defTarget.line).toBe(0);
      expect(defTarget.character).toBe(16);
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
      expect(links).toHaveLength(0);
    });

    it('orphan definition with no inline ref produces no back-link', () => {
      const text = [
        'Plain text with no inline refs.',
        '',
        '[^ct-5]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(0);
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
      expect(links).toHaveLength(4);

      // Inline ref links (line 0)
      const refLinks = links.filter(l => l.range.start.line === 0);
      expect(refLinks).toHaveLength(2);

      // First ref [^ct-1] at column 10
      expect(refLinks[0].range.start.character).toBe(10);
      const target1 = decodeTarget(refLinks[0].target!);
      expect(target1.line).toBe(2); // definition line

      // Second ref [^ct-2] at column 32
      expect(refLinks[1].range.start.character).toBe(32);
      const target2 = decodeTarget(refLinks[1].target!);
      expect(target2.line).toBe(3); // definition line

      // Definition back-links
      const defLink1 = links.find(l => l.range.start.line === 2);
      expect(defLink1).toBeTruthy();
      const defTarget1 = decodeTarget(defLink1.target!);
      expect(defTarget1.character).toBe(10);

      const defLink2 = links.find(l => l.range.start.line === 3);
      expect(defLink2).toBeTruthy();
      const defTarget2 = decodeTarget(defLink2.target!);
      expect(defTarget2.character).toBe(32);
    });

    it('definition header is not treated as inline ref', () => {
      // The definition [^ct-1]: should not be counted as an inline ref
      const text = [
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Only a definition, no inline ref — no links in either direction
      expect(links).toHaveLength(0);
    });

    it('handles empty document', () => {
      const links = createDocumentLinks('', TEST_URI);
      expect(links).toHaveLength(0);
    });

    it('handles document with no footnotes', () => {
      const text = 'Just plain markdown text.\n\nNo CriticMarkup here.';
      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(0);
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
      expect(links).toHaveLength(4);

      // Ref on line 0 → def on line 5
      const ref1 = links.find(l => l.range.start.line === 0);
      expect(ref1).toBeTruthy();
      const ref1Target = decodeTarget(ref1.target!);
      expect(ref1Target.line).toBe(5);

      // Ref on line 1 → def on line 6
      const ref2 = links.find(l => l.range.start.line === 1);
      expect(ref2).toBeTruthy();
      const ref2Target = decodeTarget(ref2.target!);
      expect(ref2Target.line).toBe(6);

      // Def on line 5 → ref on line 0
      const def1 = links.find(l => l.range.start.line === 5);
      expect(def1).toBeTruthy();
      const def1Target = decodeTarget(def1.target!);
      expect(def1Target.line).toBe(0);

      // Def on line 6 → ref on line 1
      const def2 = links.find(l => l.range.start.line === 6);
      expect(def2).toBeTruthy();
      const def2Target = decodeTarget(def2.target!);
      expect(def2Target.line).toBe(1);
    });

    it('inline ref mid-line with CriticMarkup around it', () => {
      // Realistic scenario: a change node followed by its footnote ref
      const text = [
        'Hello {++world++}[^ct-1] today.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      // {++world++} is 12 chars, then [^ct-1] starts at col 17
      expect(refLink.range.start.character).toBe(17);
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
      expect(links).toHaveLength(4);

      // [^ct-1] ref at column 12
      const ref1 = links.find(l => l.range.start.line === 0 && l.range.start.character === 12);
      expect(ref1).toBeTruthy();
      const ref1Target = decodeTarget(ref1.target!);
      expect(ref1Target.line).toBe(2);

      // [^ct-1.1] ref at column 38
      const ref2 = links.find(l => l.range.start.line === 0 && l.range.start.character === 38);
      expect(ref2).toBeTruthy();
      const ref2Target = decodeTarget(ref2.target!);
      expect(ref2Target.line).toBe(3);
    });

    it('URI is correctly embedded in link targets', () => {
      const customUri = 'file:///Users/test/project/notes.md';
      const text = [
        'Text[^ct-1] here.',
        '',
        '[^ct-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, customUri);
      expect(links).toHaveLength(2);

      for (const link of links) {
        const target = decodeTarget(link.target!);
        expect(target.uri).toBe(customUri);
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

      expect(refLinks).toHaveLength(3);
      expect(defLinks).toHaveLength(2);
    });

    it('handles high footnote numbers', () => {
      const text = [
        'Reference[^ct-999] here.',
        '',
        '[^ct-999]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      expect(refLink.range.end.character - refLink.range.start.character).toBe('[^ct-999]'.length);
    });
  });
});
