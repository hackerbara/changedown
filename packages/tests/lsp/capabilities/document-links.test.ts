import { describe, it, expect } from 'vitest';
import { createDocumentLinks } from '@changedown/lsp-server/internals';

/**
 * Helper: decode the command target URI back into [uri, line, character].
 * The target format is:
 *   command:changedown.goToPosition?<encoded JSON array>
 */
function decodeTarget(target: string): { uri: string; line: number; character: number } {
  const prefix = 'command:changedown.goToPosition?';
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
        'Some text with a change[^cn-1] here.',
        '',
        '[^cn-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // One link from inline ref → definition, one from definition → inline ref
      expect(links).toHaveLength(2);

      // Find the inline ref → definition link (range covers [^cn-1] on line 0)
      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();

      // The inline ref [^cn-1] starts at column 23
      expect(refLink.range.start.character).toBe(23);
      expect(refLink.range.end.character).toBe(23 + '[^cn-1]'.length);
      expect(refLink.tooltip?.includes('[^cn-1]')).toBeTruthy();

      // Target should point to the definition on line 2, column 0
      const refTarget = decodeTarget(refLink.target!);
      expect(refTarget.uri).toBe(TEST_URI);
      expect(refTarget.line).toBe(2);
      expect(refTarget.character).toBe(0);
    });

    it('footnote definition links back to inline ref', () => {
      const text = [
        'Some text with a change[^cn-1] here.',
        '',
        '[^cn-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Find the definition → inline ref link (range covers [^cn-1]: on line 2)
      const defLink = links.find(l => l.range.start.line === 2);
      expect(defLink).toBeTruthy();

      expect(defLink.range.start.character).toBe(0);
      expect(defLink.range.end.character).toBe('[^cn-1]:'.length);
      expect(defLink.tooltip?.includes('[^cn-1]')).toBeTruthy();

      // Target should point back to the inline ref on line 0
      const defTarget = decodeTarget(defLink.target!);
      expect(defTarget.uri).toBe(TEST_URI);
      expect(defTarget.line).toBe(0);
      expect(defTarget.character).toBe(23);
    });

    it('multiple inline refs to same footnote all get links', () => {
      const text = [
        'First ref[^cn-1] and second ref[^cn-1] here.',
        '',
        '[^cn-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Both inline refs should have links to the definition
      const refLinks = links.filter(l => l.range.start.line === 0);
      expect(refLinks).toHaveLength(2);

      // First ref at offset 9 ("First ref" = 9 chars)
      expect(refLinks[0].range.start.character).toBe(9);
      // Second ref at offset 31 ("First ref[^cn-1] and second ref" = 31 chars)
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

    it('dotted IDs like [^cn-1.1] link correctly', () => {
      const text = [
        'A move operation[^cn-1.1] was tracked.',
        '',
        '[^cn-1.1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      // Inline ref → definition
      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      expect(refLink.range.start.character).toBe(16);
      expect(refLink.range.end.character).toBe(16 + '[^cn-1.1]'.length);

      const refTarget = decodeTarget(refLink.target!);
      expect(refTarget.line).toBe(2);

      // Definition → inline ref
      const defLink = links.find(l => l.range.start.line === 2);
      expect(defLink).toBeTruthy();
      expect(defLink.range.end.character).toBe('[^cn-1.1]:'.length);

      const defTarget = decodeTarget(defLink.target!);
      expect(defTarget.line).toBe(0);
      expect(defTarget.character).toBe(16);
    });

    it('non-existent ref with no definition produces no link', () => {
      const text = [
        'A ref to nothing[^cn-99] here.',
        '',
        '[^cn-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // [^cn-99] has no definition, so no link for it
      // [^cn-1] definition has no inline ref, so no back-link
      expect(links).toHaveLength(0);
    });

    it('orphan definition with no inline ref produces no back-link', () => {
      const text = [
        'Plain text with no inline refs.',
        '',
        '[^cn-5]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(0);
    });

    it('multiple independent footnotes produce correct links', () => {
      const text = [
        'Change one[^cn-1] and change two[^cn-2] here.',
        '',
        '[^cn-1]: status: proposed',
        '[^cn-2]: status: accepted',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // 2 inline ref → def links + 2 def → ref links = 4 total
      expect(links).toHaveLength(4);

      // Inline ref links (line 0)
      const refLinks = links.filter(l => l.range.start.line === 0);
      expect(refLinks).toHaveLength(2);

      // First ref [^cn-1] at column 10
      expect(refLinks[0].range.start.character).toBe(10);
      const target1 = decodeTarget(refLinks[0].target!);
      expect(target1.line).toBe(2); // definition line

      // Second ref [^cn-2] at column 32
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
      // The definition [^cn-1]: should not be counted as an inline ref
      const text = [
        '[^cn-1]: status: proposed',
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
        'First paragraph with[^cn-1] a ref.',
        'Second paragraph with[^cn-2] another.',
        '',
        'More text.',
        '',
        '[^cn-1]: status: proposed',
        '[^cn-2]: status: proposed',
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
        'Hello {++world++}[^cn-1] today.',
        '',
        '[^cn-1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      // {++world++} is 12 chars, then [^cn-1] starts at col 17
      expect(refLink.range.start.character).toBe(17);
    });

    it('dotted ID with parent ID both present', () => {
      const text = [
        'Deleted here[^cn-1] and inserted there[^cn-1.1].',
        '',
        '[^cn-1]: status: proposed',
        '[^cn-1.1]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // 2 inline refs + 2 defs = 4 links
      expect(links).toHaveLength(4);

      // [^cn-1] ref at column 12
      const ref1 = links.find(l => l.range.start.line === 0 && l.range.start.character === 12);
      expect(ref1).toBeTruthy();
      const ref1Target = decodeTarget(ref1.target!);
      expect(ref1Target.line).toBe(2);

      // [^cn-1.1] ref at column 38
      const ref2 = links.find(l => l.range.start.line === 0 && l.range.start.character === 38);
      expect(ref2).toBeTruthy();
      const ref2Target = decodeTarget(ref2.target!);
      expect(ref2Target.line).toBe(3);
    });

    it('URI is correctly embedded in link targets', () => {
      const customUri = 'file:///Users/test/project/notes.md';
      const text = [
        'Text[^cn-1] here.',
        '',
        '[^cn-1]: status: proposed',
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
        'Change here[^cn-1] relates to[^cn-2].',
        '',
        '[^cn-1]: Relates to [^cn-2]',
        '[^cn-2]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);

      // Inline refs on line 0: [^cn-1] and [^cn-2] → 2 ref links
      // Inline ref on line 2: [^cn-2] inside footnote body → 1 ref link
      // Definition back-links: [^cn-1]: → line 0 ref, [^cn-2]: → first ref on line 0
      // Total: 3 inline refs + 2 def back-links = 5
      const refLinks = links.filter(l => l.tooltip?.startsWith('Go to footnote definition'));
      const defLinks = links.filter(l => l.tooltip?.startsWith('Go to inline change'));

      expect(refLinks).toHaveLength(3);
      expect(defLinks).toHaveLength(2);
    });

    it('handles high footnote numbers', () => {
      const text = [
        'Reference[^cn-999] here.',
        '',
        '[^cn-999]: status: proposed',
      ].join('\n');

      const links = createDocumentLinks(text, TEST_URI);
      expect(links).toHaveLength(2);

      const refLink = links.find(l => l.range.start.line === 0);
      expect(refLink).toBeTruthy();
      expect(refLink.range.end.character - refLink.range.start.character).toBe('[^cn-999]'.length);
    });
  });
});
