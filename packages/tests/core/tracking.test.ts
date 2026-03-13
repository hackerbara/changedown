import * as assert from 'assert';
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
    assert.strictEqual(edit.newText, '{++hello++}');
  });

  it('wraps multi-word text', () => {
    const edit = wrapInsertion('hello world foo', 0);
    assert.strictEqual(edit.newText, '{++hello world foo++}');
  });

  it('sets correct offset from argument', () => {
    const edit = wrapInsertion('text', 10);
    assert.strictEqual(edit.offset, 10);
  });

  it('sets length equal to the original inserted text length', () => {
    const edit = wrapInsertion('abcde', 0);
    assert.strictEqual(edit.length, 5);
  });

  it('produces correct result when applied to a string - insertion at beginning', () => {
    const original = 'hello world';
    // Simulate: user typed "new " at offset 0, so the document is now "new hello world"
    // We get an edit that replaces "new " (length 4) with "{++new ++}"
    const edit = wrapInsertion('new ', 0);
    const afterInsert = 'new hello world';
    const result = applyEdit(afterInsert, edit);
    assert.strictEqual(result, '{++new ++}hello world');
  });

  it('produces correct result when applied to a string - insertion in middle', () => {
    const afterInsert = 'hello beautiful world';
    // User typed "beautiful " starting at offset 6
    const edit = wrapInsertion('beautiful ', 6);
    const result = applyEdit(afterInsert, edit);
    assert.strictEqual(result, 'hello {++beautiful ++}world');
  });

  it('produces correct result when applied to a string - insertion at end', () => {
    const afterInsert = 'hello world!';
    // User typed "!" at offset 11
    const edit = wrapInsertion('!', 11);
    const result = applyEdit(afterInsert, edit);
    assert.strictEqual(result, 'hello world{++!++}');
  });

  it('handles single character insertion', () => {
    const edit = wrapInsertion('x', 5);
    assert.strictEqual(edit.offset, 5);
    assert.strictEqual(edit.length, 1);
    assert.strictEqual(edit.newText, '{++x++}');
  });

  it('handles empty string insertion', () => {
    const edit = wrapInsertion('', 0);
    assert.strictEqual(edit.length, 0);
    assert.strictEqual(edit.newText, '{++++}');
  });

  it('handles text with special characters', () => {
    const edit = wrapInsertion('a & b < c', 0);
    assert.strictEqual(edit.newText, '{++a & b < c++}');
  });

  it('handles text containing CriticMarkup-like syntax', () => {
    const edit = wrapInsertion('{--nested--}', 0);
    assert.strictEqual(edit.newText, '{++{--nested--}++}');
    assert.strictEqual(edit.length, 12);
  });

  it('handles multiline insertion', () => {
    const edit = wrapInsertion('line1\nline2', 0);
    assert.strictEqual(edit.newText, '{++line1\nline2++}');
    assert.strictEqual(edit.length, 11);
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapInsertion('text', 0, 'ct-5');
    assert.strictEqual(edit.newText, '{++text++}[^ct-5]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapInsertion('text', 0);
    assert.strictEqual(edit.newText, '{++text++}');
  });

  it('does not append footnote ref when scId is undefined', () => {
    const edit = wrapInsertion('text', 0, undefined);
    assert.strictEqual(edit.newText, '{++text++}');
  });
});

describe('Tracking - wrapDeletion with scId', () => {
  it('wraps deletion without scId (backward compatible)', () => {
    const edit = wrapDeletion('removed', 0);
    assert.strictEqual(edit.newText, '{--removed--}');
    assert.strictEqual(edit.offset, 0);
    assert.strictEqual(edit.length, 0);
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapDeletion('removed', 0, 'ct-6');
    assert.strictEqual(edit.newText, '{--removed--}[^ct-6]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapDeletion('removed', 5);
    assert.strictEqual(edit.newText, '{--removed--}');
  });
});

describe('Tracking - wrapSubstitution with scId', () => {
  it('wraps substitution without scId (backward compatible)', () => {
    const edit = wrapSubstitution('old', 'new', 0);
    assert.strictEqual(edit.newText, '{~~old~>new~~}');
    assert.strictEqual(edit.offset, 0);
    assert.strictEqual(edit.length, 3); // length of newText
  });

  it('appends footnote ref when scId is provided', () => {
    const edit = wrapSubstitution('old', 'new', 0, 'ct-7');
    assert.strictEqual(edit.newText, '{~~old~>new~~}[^ct-7]');
  });

  it('does not append footnote ref when scId is omitted', () => {
    const edit = wrapSubstitution('before', 'after', 10);
    assert.strictEqual(edit.newText, '{~~before~>after~~}');
  });

  it('handles dotted scId for grouped changes', () => {
    const edit = wrapSubstitution('old', 'new', 0, 'ct-3.1');
    assert.strictEqual(edit.newText, '{~~old~>new~~}[^ct-3.1]');
  });
});
