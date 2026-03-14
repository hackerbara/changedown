import { describe, it, expect } from 'vitest';
import {
  wrapInsertion,
  wrapDeletion,
  wrapSubstitution,
  TextEdit,
} from '@changetracks/core/internals';

function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

describe('Tracking - wrapInsertion', () => {
  it('wraps simple text with insertion markup', () => {
    const edit = wrapInsertion('hello', 0);
    expect(edit.newText).toBe('{++hello++}');
  });

  it('wraps multi-word text', () => {
    const edit = wrapInsertion('hello world foo', 0);
    expect(edit.newText).toBe('{++hello world foo++}');
  });

  it('sets correct offset from argument', () => {
    const edit = wrapInsertion('text', 10);
    expect(edit.offset).toBe(10);
  });

  it('sets length equal to the original inserted text length', () => {
    const edit = wrapInsertion('abcde', 0);
    expect(edit.length).toBe(5);
  });

  it('produces correct result when applied to a string - insertion at beginning', () => {
    const original = 'hello world';
    // Simulate: user typed "new " at offset 0, so the document is now "new hello world"
    // We get an edit that replaces "new " (length 4) with "{++new ++}"
    const edit = wrapInsertion('new ', 0);
    const afterInsert = 'new hello world';
    const result = applyEdit(afterInsert, edit);
    expect(result).toBe('{++new ++}hello world');
  });

  it('produces correct result when applied to a string - insertion in middle', () => {
    const afterInsert = 'hello beautiful world';
    // User typed "beautiful " starting at offset 6
    const edit = wrapInsertion('beautiful ', 6);
    const result = applyEdit(afterInsert, edit);
    expect(result).toBe('hello {++beautiful ++}world');
  });

  it('produces correct result when applied to a string - insertion at end', () => {
    const afterInsert = 'hello world!';
    // User typed "!" at offset 11
    const edit = wrapInsertion('!', 11);
    const result = applyEdit(afterInsert, edit);
    expect(result).toBe('hello world{++!++}');
  });

  it('handles single character insertion', () => {
    const edit = wrapInsertion('x', 5);
    expect(edit.offset).toBe(5);
    expect(edit.length).toBe(1);
    expect(edit.newText).toBe('{++x++}');
  });

  it('handles empty string insertion', () => {
    const edit = wrapInsertion('', 0);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('{++++}');
  });

  it('handles text with special characters', () => {
    const edit = wrapInsertion('a & b < c', 0);
    expect(edit.newText).toBe('{++a & b < c++}');
  });

  it('handles text containing CriticMarkup-like syntax', () => {
    const edit = wrapInsertion('{--nested--}', 0);
    expect(edit.newText).toBe('{++{--nested--}++}');
    expect(edit.length).toBe(12);
  });

  it('handles multiline insertion', () => {
    const edit = wrapInsertion('line1\nline2', 0);
    expect(edit.newText).toBe('{++line1\nline2++}');
    expect(edit.length).toBe(11);
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapInsertion('text', 0, 'ct-5');
    expect(edit.newText).toBe('{++text++}[^ct-5]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapInsertion('text', 0);
    expect(edit.newText).toBe('{++text++}');
  });

  it('does not append footnote ref when scId is undefined', () => {
    const edit = wrapInsertion('text', 0, undefined);
    expect(edit.newText).toBe('{++text++}');
  });
});

describe('Tracking - wrapDeletion with scId', () => {
  it('wraps deletion without scId (backward compatible)', () => {
    const edit = wrapDeletion('removed', 0);
    expect(edit.newText).toBe('{--removed--}');
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(0);
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapDeletion('removed', 0, 'ct-6');
    expect(edit.newText).toBe('{--removed--}[^ct-6]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapDeletion('removed', 5);
    expect(edit.newText).toBe('{--removed--}');
  });
});

describe('Tracking - wrapSubstitution with scId', () => {
  it('wraps substitution without scId (backward compatible)', () => {
    const edit = wrapSubstitution('old', 'new', 0);
    expect(edit.newText).toBe('{~~old~>new~~}');
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(3); // length of newText
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapSubstitution('old', 'new', 0, 'ct-7');
    expect(edit.newText).toBe('{~~old~>new~~}[^ct-7]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapSubstitution('before', 'after', 10);
    expect(edit.newText).toBe('{~~before~>after~~}');
  });

  it('handles dotted scId for grouped changes', () => {
    const edit = wrapSubstitution('old', 'new', 0, 'ct-3.1');
    expect(edit.newText).toBe('{~~old~>new~~}[^ct-3.1]');
  });
});
