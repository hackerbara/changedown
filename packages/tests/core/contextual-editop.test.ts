import { describe, it, expect } from 'vitest';
import { buildContextualL3EditOp, ChangeType } from '@changedown/core/internals';

describe('buildContextualL3EditOp', () => {
  it('produces contextual insertion on a simple line', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Insertion,
      originalText: '',
      currentText: 'beautiful ',
      lineContent: 'Hello beautiful world',
      lineNumber: 2,
      hash: 'b4',
      column: 6,
      anchorLen: 10, // 'beautiful '.length
    });
    // Must be a formatted L3 edit-op line
    expect(result).toMatch(/^ {4}2:b4 /);
    // Must contain the CriticMarkup op
    expect(result).toContain('{++beautiful ++}');
    // Must have context (not bare)
    expect(result).not.toBe('    2:b4 {++beautiful ++}');
  });

  it('produces contextual deletion with surrounding context', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Deletion,
      originalText: 'most',
      currentText: '',
      lineContent: 'But contact center leaders face a familiar challenge',
      lineNumber: 15,
      hash: 'bb',
      column: 4,
      anchorLen: 0, // deletions have zero body-side text
    });
    expect(result).toMatch(/^ {4}15:bb /);
    expect(result).toContain('{--most--}');
    // Must have context around the deletion point
    expect(result.length).toBeGreaterThan('    15:bb {--most--}'.length);
  });

  it('produces contextual substitution', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Substitution,
      originalText: 'old',
      currentText: 'new',
      lineContent: 'Hello new world',
      lineNumber: 1,
      hash: 'a3',
      column: 6,
      anchorLen: 3, // 'new'.length
    });
    expect(result).toMatch(/^ {4}1:a3 /);
    expect(result).toContain('{~~old~>new~~}');
  });

  it('always adds context even when body text is unique', () => {
    // "Introduction" is unique on the line, but we still want context
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Deletion,
      originalText: 'Introduction',
      currentText: '',
      lineContent: '## ',
      lineNumber: 11,
      hash: 'f8',
      column: 3,
      anchorLen: 0,
    });
    expect(result).toMatch(/^ {4}11:f8 /);
    expect(result).toContain('{--Introduction--}');
    // Context: "## " before the deletion point
    expect(result).toContain('## {--Introduction--}');
  });

  it('snaps to word boundaries', () => {
    // 'c' at column 8 in "# Protocol conversational AI" — inside "conversational"
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Insertion,
      originalText: '',
      currentText: 'c',
      lineContent: '# Protocol conversational AI',
      lineNumber: 2,
      hash: '8d',
      column: 8,
      anchorLen: 1,
    });
    // Should snap to word boundaries: "Protocol {++c++}onversational" or wider
    // Context must start at a word boundary (after a space or at line start)
    const afterPrefix = result.replace(/^ {4}2:8d /, '');
    // contextBefore should end at the change column — verify no mid-word truncation
    expect(afterPrefix).toMatch(/^(|.*\s)\S*\{\+\+c\+\+\}/); // starts at word boundary
    // contextAfter should extend to a word boundary
    expect(afterPrefix).toMatch(/\{\+\+c\+\+\}\S*($|\s)/); // ends at word boundary
  });

  it('left-snap extends to word start, producing non-empty contextBefore', () => {
    // Expansion pulls spanStart left past a word boundary — left-snap should
    // extend to the start of that word, not trim it away.
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Deletion,
      originalText: 'x',
      currentText: '',
      lineContent: 'foo contact baz contact end',
      lineNumber: 3,
      hash: 'ab',
      column: 4, // deletion point is at the first 'c' of first "contact"
      anchorLen: 0,
    });
    const afterPrefix = result.replace(/^ {4}3:ab /, '');
    // contextBefore must be non-empty and word-aligned (starts at word boundary)
    expect(afterPrefix).toContain('foo {--x--}');
    // Full context should be unique on the line
    const withoutOp = afterPrefix.replace(/\{--x--\}/, '');
    const line = 'foo contact baz contact end';
    const first = line.indexOf(withoutOp);
    const second = line.indexOf(withoutOp, first + 1);
    expect(second).toBe(-1);
  });

  it('re-checks uniqueness after word-boundary snap', () => {
    // Pathological case: word-boundary snap could break uniqueness
    const line = 'abc def ghi abc def jkl';
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Insertion,
      originalText: '',
      currentText: 'x',
      lineContent: line,
      lineNumber: 1,
      hash: 'aa',
      column: 4, // in first "def"
      anchorLen: 1,
    });
    // The context string (without the op) must be unique on the line
    const afterPrefix = result.replace(/^ {4}1:aa /, '');
    const withoutOp = afterPrefix.replace(/\{\+\+x\+\+\}/, 'x');
    const first = line.indexOf(withoutOp);
    const second = line.indexOf(withoutOp, first + 1);
    expect(second).toBe(-1); // unique
  });

  it('handles empty line — bare op only option', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Insertion,
      originalText: '',
      currentText: 'text',
      lineContent: '',
      lineNumber: 5,
      hash: 'ff',
      column: 0,
      anchorLen: 4,
    });
    expect(result).toBe('    5:ff {++text++}');
  });

  it('handles highlight change type', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Highlight,
      originalText: 'CriticMarkup',
      currentText: '',
      lineContent: 'readable by any tool that understands CriticMarkup.',
      lineNumber: 6,
      hash: '63',
      column: 38,
      anchorLen: 12,
    });
    expect(result).toMatch(/^ {4}6:63 /);
    expect(result).toContain('{==CriticMarkup==}');
  });

  it('handles comment change type (zero anchor length)', () => {
    const result = buildContextualL3EditOp({
      changeType: ChangeType.Comment,
      originalText: 'review this',
      currentText: '',
      lineContent: 'The protocol defines three enforcement modes',
      lineNumber: 37,
      hash: '9d',
      column: 20,
      anchorLen: 0,
    });
    expect(result).toMatch(/^ {4}37:9d /);
    expect(result).toContain('{>>review this<<}');
  });
});
