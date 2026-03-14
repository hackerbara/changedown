import { describe, it, expect } from 'vitest';
import {
  computeAccept,
  computeReject,
  computeAcceptParts,
  computeRejectParts,
  computeFootnoteStatusEdits,
  computeApprovalLineEdit,
  ChangeNode,
  ChangeType,
  ChangeStatus,
  TextEdit,
  VirtualDocument,
  Workspace,
  CriticMarkupParser,
} from '@changetracks/core/internals';

/**
 * Apply a TextEdit to a source string, producing the resulting text.
 */
function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

/**
 * Factory for building ChangeNode fixtures with sensible defaults.
 */
function makeChange(overrides: Partial<ChangeNode> & { type: ChangeType }): ChangeNode {
  return {
    id: 'test-0',
    status: ChangeStatus.Proposed,
    range: { start: 0, end: 10 },
    contentRange: { start: 3, end: 7 },
    level: 0,
    anchored: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Accept for each of the 5 change types
// ---------------------------------------------------------------------------
describe('computeAccept', () => {
  it('Insertion: keeps the inserted text', () => {
    // {++hello++}  — positions 0..12
    const change = makeChange({
      type: ChangeType.Insertion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });

    const edit = computeAccept(change);
    expect(edit).toStrictEqual({ offset: 0, length: 12, newText: 'hello' });
  });

  it('Deletion: removes the deleted text entirely', () => {
    // {--world--}  — positions 0..12
    const change = makeChange({
      type: ChangeType.Deletion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      originalText: 'world',
    });

    const edit = computeAccept(change);
    expect(edit).toStrictEqual({ offset: 0, length: 12, newText: '' });
  });

  it('Substitution: keeps the modified (new) text', () => {
    // {~~old~>new~~}  — positions 0..15
    const change = makeChange({
      type: ChangeType.Substitution,
      range: { start: 0, end: 15 },
      contentRange: { start: 3, end: 12 },
      originalRange: { start: 3, end: 6 },
      modifiedRange: { start: 8, end: 11 },
      originalText: 'old',
      modifiedText: 'new',
    });

    const edit = computeAccept(change);
    expect(edit).toStrictEqual({ offset: 0, length: 15, newText: 'new' });
  });

  it('Highlight: keeps the highlighted text', () => {
    // {==text==}  — positions 0..10
    const change = makeChange({
      type: ChangeType.Highlight,
      range: { start: 0, end: 10 },
      contentRange: { start: 3, end: 7 },
      originalText: 'text',
    });

    const edit = computeAccept(change);
    expect(edit).toStrictEqual({ offset: 0, length: 10, newText: 'text' });
  });

  it('Comment: removes the comment entirely', () => {
    // {>>note<<}  — positions 0..10
    const change = makeChange({
      type: ChangeType.Comment,
      range: { start: 0, end: 10 },
      contentRange: { start: 3, end: 7 },
      metadata: { comment: 'note' },
    });

    const edit = computeAccept(change);
    expect(edit).toStrictEqual({ offset: 0, length: 10, newText: '' });
  });
});

// ---------------------------------------------------------------------------
// 2. Reject for each of the 5 change types
// ---------------------------------------------------------------------------
describe('computeReject', () => {
  it('Insertion: removes the inserted text', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });

    const edit = computeReject(change);
    expect(edit).toStrictEqual({ offset: 0, length: 12, newText: '' });
  });

  it('Deletion: restores the deleted text', () => {
    const change = makeChange({
      type: ChangeType.Deletion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      originalText: 'world',
    });

    const edit = computeReject(change);
    expect(edit).toStrictEqual({ offset: 0, length: 12, newText: 'world' });
  });

  it('Substitution: keeps the original (old) text', () => {
    const change = makeChange({
      type: ChangeType.Substitution,
      range: { start: 0, end: 15 },
      contentRange: { start: 3, end: 12 },
      originalRange: { start: 3, end: 6 },
      modifiedRange: { start: 8, end: 11 },
      originalText: 'old',
      modifiedText: 'new',
    });

    const edit = computeReject(change);
    expect(edit).toStrictEqual({ offset: 0, length: 15, newText: 'old' });
  });

  it('Highlight: keeps the highlighted text', () => {
    const change = makeChange({
      type: ChangeType.Highlight,
      range: { start: 0, end: 10 },
      contentRange: { start: 3, end: 7 },
      originalText: 'text',
    });

    const edit = computeReject(change);
    expect(edit).toStrictEqual({ offset: 0, length: 10, newText: 'text' });
  });

  it('Comment: removes the comment entirely', () => {
    const change = makeChange({
      type: ChangeType.Comment,
      range: { start: 0, end: 10 },
      contentRange: { start: 3, end: 7 },
      metadata: { comment: 'note' },
    });

    const edit = computeReject(change);
    expect(edit).toStrictEqual({ offset: 0, length: 10, newText: '' });
  });
});

// ---------------------------------------------------------------------------
// 3. Edge cases: empty content, undefined text fields
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  describe('empty content', () => {
    it('accept insertion with empty modifiedText', () => {
      // {++++}  — empty insertion
      const change = makeChange({
        type: ChangeType.Insertion,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        modifiedText: '',
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
      expect(edit).toHaveLength(6);
    });

    it('reject deletion with empty originalText', () => {
      // {----}  — empty deletion
      const change = makeChange({
        type: ChangeType.Deletion,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        originalText: '',
      });
      const edit = computeReject(change);
      expect(edit.newText).toBe('');
      expect(edit).toHaveLength(6);
    });

    it('accept highlight with empty originalText', () => {
      // {====}  — empty highlight
      const change = makeChange({
        type: ChangeType.Highlight,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        originalText: '',
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
    });

    it('accept substitution with empty modifiedText', () => {
      // {~~old~>~~} — substitution replacing old with nothing
      const change = makeChange({
        type: ChangeType.Substitution,
        range: { start: 0, end: 13 },
        contentRange: { start: 3, end: 10 },
        originalText: 'old',
        modifiedText: '',
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
    });

    it('reject substitution with empty originalText', () => {
      // {~~  ~>new~~} — substitution where original is empty
      const change = makeChange({
        type: ChangeType.Substitution,
        range: { start: 0, end: 13 },
        contentRange: { start: 3, end: 10 },
        originalText: '',
        modifiedText: 'new',
      });
      const edit = computeReject(change);
      expect(edit.newText).toBe('');
    });
  });

  describe('undefined text fields fall back to empty string', () => {
    it('accept insertion with undefined modifiedText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Insertion,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        // modifiedText intentionally omitted (undefined)
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
    });

    it('reject deletion with undefined originalText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Deletion,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        // originalText intentionally omitted (undefined)
      });
      const edit = computeReject(change);
      expect(edit.newText).toBe('');
    });

    it('accept highlight with undefined originalText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Highlight,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        // originalText intentionally omitted (undefined)
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
    });

    it('reject highlight with undefined originalText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Highlight,
        range: { start: 0, end: 6 },
        contentRange: { start: 3, end: 3 },
        // originalText intentionally omitted (undefined)
      });
      const edit = computeReject(change);
      expect(edit.newText).toBe('');
    });

    it('accept substitution with undefined modifiedText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Substitution,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        originalText: 'old',
        // modifiedText intentionally omitted
      });
      const edit = computeAccept(change);
      expect(edit.newText).toBe('');
    });

    it('reject substitution with undefined originalText returns empty string', () => {
      const change = makeChange({
        type: ChangeType.Substitution,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        modifiedText: 'new',
        // originalText intentionally omitted
      });
      const edit = computeReject(change);
      expect(edit.newText).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Verify offset and length match the range exactly
// ---------------------------------------------------------------------------
describe('Offset and length consistency', () => {
  it('edit offset matches range.start', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      range: { start: 42, end: 55 },
      contentRange: { start: 45, end: 52 },
      modifiedText: 'content',
    });

    const acceptEdit = computeAccept(change);
    const rejectEdit = computeReject(change);

    expect(acceptEdit.offset).toBe(42);
    expect(rejectEdit.offset).toBe(42);
  });

  it('edit length equals range.end - range.start', () => {
    const change = makeChange({
      type: ChangeType.Deletion,
      range: { start: 10, end: 25 },
      contentRange: { start: 13, end: 22 },
      originalText: 'some text',
    });

    const acceptEdit = computeAccept(change);
    const rejectEdit = computeReject(change);

    expect(acceptEdit).toHaveLength(15);
    expect(rejectEdit).toHaveLength(15);
  });

  it('length is consistent across all change types for same range', () => {
    const range = { start: 5, end: 20 };
    const expectedLength = 15;

    const types: Array<{ type: ChangeType; extra: Partial<ChangeNode> }> = [
      { type: ChangeType.Insertion, extra: { modifiedText: 'x' } },
      { type: ChangeType.Deletion, extra: { originalText: 'x' } },
      { type: ChangeType.Substitution, extra: { originalText: 'a', modifiedText: 'b' } },
      { type: ChangeType.Highlight, extra: { originalText: 'x' } },
      { type: ChangeType.Comment, extra: { metadata: { comment: 'x' } } },
    ];

    for (const { type, extra } of types) {
      const change = makeChange({
        type,
        range,
        contentRange: { start: 8, end: 17 },
        ...extra,
      });

      const acceptEdit = computeAccept(change);
      const rejectEdit = computeReject(change);

      expect(acceptEdit.offset).toBe(range.start);
      expect(acceptEdit.length).toBe(expectedLength);
      expect(rejectEdit.offset).toBe(range.start);
      expect(rejectEdit.length).toBe(expectedLength);
    }
  });

  it('non-zero offset is preserved correctly in the edit', () => {
    // Simulate: "prefix {++added++} suffix"
    //           0123456 7890123456 789...
    // {++ starts at 7, ++} ends at 18
    const change = makeChange({
      type: ChangeType.Insertion,
      range: { start: 7, end: 18 },
      contentRange: { start: 10, end: 15 },
      modifiedText: 'added',
    });

    const edit = computeAccept(change);
    expect(edit.offset).toBe(7);
    expect(edit).toHaveLength(11);
    expect(edit.newText).toBe('added');
  });
});

// ---------------------------------------------------------------------------
// 5. Integration: parse real markup, then accept/reject and verify the result
// ---------------------------------------------------------------------------
describe('Integration: parser + accept/reject', () => {
  const parser = new CriticMarkupParser();

  describe('Insertion', () => {
    it('accept insertion produces clean text with content kept', () => {
      const input = 'Hello {++beautiful ++}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Insertion);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Hello beautiful world');
    });

    it('reject insertion produces clean text with content removed', () => {
      const input = 'Hello {++beautiful ++}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Hello world');
    });
  });

  describe('Deletion', () => {
    it('accept deletion removes the text', () => {
      const input = 'Hello {--ugly --}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Deletion);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Hello world');
    });

    it('reject deletion restores the text', () => {
      const input = 'Hello {--ugly --}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Hello ugly world');
    });
  });

  describe('Substitution', () => {
    it('accept substitution keeps the new text', () => {
      const input = 'I like {~~cats~>dogs~~}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Substitution);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('I like dogs');
    });

    it('reject substitution keeps the old text', () => {
      const input = 'I like {~~cats~>dogs~~}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('I like cats');
    });
  });

  describe('Highlight', () => {
    it('accept highlight keeps the highlighted text without markup', () => {
      const input = 'This is {==important==} info';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Highlight);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('This is important info');
    });

    it('reject highlight keeps the highlighted text without markup', () => {
      const input = 'This is {==important==} info';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('This is important info');
    });
  });

  describe('Comment', () => {
    it('accept standalone comment removes it entirely', () => {
      const input = 'Some text{>>this is a note<<} more text';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Comment);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Some text more text');
    });

    it('reject standalone comment removes it entirely', () => {
      const input = 'Some text{>>this is a note<<} more text';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Some text more text');
    });
  });

  describe('Highlight with attached comment', () => {
    it('accept highlight+comment keeps the highlighted text, removes all markup and comment', () => {
      const input = 'Read {==this part==}{>>review needed<<} carefully';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      // The parser absorbs the attached comment into the highlight node
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Highlight);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Read this part carefully');
    });

    it('reject highlight+comment keeps the highlighted text, removes all markup and comment', () => {
      const input = 'Read {==this part==}{>>review needed<<} carefully';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Read this part carefully');
    });
  });

  describe('Multiple changes', () => {
    it('applying edits in reverse order handles multiple changes correctly', () => {
      const input = 'Hello {++beautiful ++}{--ugly --}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);

      // Accept both: keep "beautiful ", remove "ugly "
      // Process in reverse document order to preserve offsets
      const edits = changes.map(c => computeAccept(c));

      // Apply edits in reverse order (last change first)
      let result = input;
      for (let i = edits.length - 1; i >= 0; i--) {
        result = applyEdit(result, edits[i]);
      }
      expect(result).toBe('Hello beautiful world');
    });

    it('reject all changes in reverse order', () => {
      const input = 'Hello {++beautiful ++}{--ugly --}world';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edits = changes.map(c => computeReject(c));

      let result = input;
      for (let i = edits.length - 1; i >= 0; i--) {
        result = applyEdit(result, edits[i]);
      }
      expect(result).toBe('Hello ugly world');
    });
  });

  describe('Multi-line content', () => {
    it('accept multi-line insertion preserves line breaks', () => {
      const input = 'Start\n{++line one\nline two\n++}End';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Start\nline one\nline two\nEnd');
    });

    it('accept multi-line deletion removes all lines', () => {
      const input = 'Start\n{--line one\nline two\n--}End';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Start\nEnd');
    });

    it('accept multi-line substitution replaces with new text', () => {
      const input = 'Before {~~old line\nold line 2~>new line\nnew line 2~~} After';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Before new line\nnew line 2 After');
    });
  });

  describe('Change at document boundaries', () => {
    it('accept insertion at start of document', () => {
      const input = '{++First ++}rest of text';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('First rest of text');
    });

    it('accept insertion at end of document', () => {
      const input = 'Some text{++ last++}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Some text last');
    });

    it('accept deletion that is the entire document', () => {
      const input = '{--everything--}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('');
    });

    it('reject insertion that is the entire document', () => {
      const input = '{++everything++}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeReject(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('');
    });
  });

  describe('Special characters in content', () => {
    it('handles content with curly braces', () => {
      const input = '{++function() { return true; }++}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('function() { return true; }');
    });

    it('handles content with unicode', () => {
      const input = '{++Hello World++}';
      const doc = parser.parse(input);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Hello World');
    });

    it('handles content with markdown formatting', () => {
      const input = 'Text {++**bold** and _italic_++} end';
      const doc = parser.parse(input);
      const changes = doc.getChanges();

      const edit = computeAccept(changes[0]);
      const result = applyEdit(input, edit);
      expect(result).toBe('Text **bold** and _italic_ end');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. VirtualDocument.getGroupMembers()
// ---------------------------------------------------------------------------
describe('VirtualDocument.getGroupMembers', () => {
  it('returns all changes with matching groupId', () => {
    const changes: ChangeNode[] = [
      {
        id: 'ct-5.1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 0, end: 20 }, contentRange: { start: 3, end: 15 },
        originalText: 'moved', groupId: 'ct-5', moveRole: 'from', level: 0, anchored: false,
      },
      {
        id: 'ct-5.2', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 30, end: 50 }, contentRange: { start: 33, end: 45 },
        modifiedText: 'moved', groupId: 'ct-5', moveRole: 'to', level: 0, anchored: false,
      },
      {
        id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 60, end: 70 }, contentRange: { start: 63, end: 67 },
        modifiedText: 'other', level: 0, anchored: false,
      },
    ];
    const doc = new VirtualDocument(changes);
    const members = doc.getGroupMembers('ct-5');
    expect(members).toHaveLength(2);
    expect(members[0].id).toBe('ct-5.1');
    expect(members[1].id).toBe('ct-5.2');
  });

  it('returns empty array for unknown groupId', () => {
    const doc = new VirtualDocument([]);
    expect(doc.getGroupMembers('ct-99')).toStrictEqual([]);
  });

  it('does not return changes without groupId', () => {
    const changes: ChangeNode[] = [
      {
        id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 }, contentRange: { start: 3, end: 7 },
        modifiedText: 'text', level: 0, anchored: false,
      },
    ];
    const doc = new VirtualDocument(changes);
    expect(doc.getGroupMembers('ct-1')).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Workspace.acceptGroup() and rejectGroup()
// ---------------------------------------------------------------------------
describe('Workspace grouped accept/reject', () => {
  /**
   * Apply multiple TextEdits (assumed to be in reverse document order) to a string.
   */
  function applyEdits(text: string, edits: TextEdit[]): string {
    let result = text;
    for (const edit of edits) {
      result = result.substring(0, edit.offset) + edit.newText + result.substring(edit.offset + edit.length);
    }
    return result;
  }

  describe('acceptGroup', () => {
    it('accepts all members of a move group in reverse document order', () => {
      // Build a document with footnotes so the parser resolves the move group
      const text = [
        'Hello {--moved text--}[^ct-5.1] and then {++moved text++}[^ct-5.2] end',
        '',
        '[^ct-5]: @alice | 2026-02-10 | move | proposed',
        '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');

      const workspace = new Workspace();
      const doc = workspace.parse(text);

      // Verify parser resolved the group
      const changes = doc.getChanges();
      const groupMembers = changes.filter(c => c.groupId === 'ct-5');
      expect(groupMembers).toHaveLength(2);

      const edits = workspace.acceptGroup(doc, 'ct-5');
      expect(edits).toHaveLength(2);

      // Edits should be in reverse document order (higher offset first)
      expect(edits[0].offset > edits[1].offset).toBeTruthy();
    });

    it('accept move group: deletion removed, insertion kept', () => {
      const text = [
        'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
        '',
        '[^ct-5]: @alice | 2026-02-10 | move | proposed',
        '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');

      const workspace = new Workspace();
      const doc = workspace.parse(text);
      const edits = workspace.acceptGroup(doc, 'ct-5');

      // Apply edits to the inline content portion
      const inlinePart = 'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end';
      const result = applyEdits(inlinePart, edits);

      // Accept deletion = remove text, keep footnote ref (anchors footnote in document)
      // Accept insertion = keep the content ("moved") + footnote ref
      expect(result).toBe('Hello [^ct-5.1] and moved[^ct-5.2] end');
    });

    it('returns empty array when group has no members', () => {
      const workspace = new Workspace();
      const doc = workspace.parse('Hello {++world++}');
      const edits = workspace.acceptGroup(doc, 'ct-nonexistent');
      expect(edits).toStrictEqual([]);
    });
  });

  describe('rejectGroup', () => {
    it('rejects all members of a move group in reverse document order', () => {
      const text = [
        'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
        '',
        '[^ct-5]: @alice | 2026-02-10 | move | proposed',
        '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');

      const workspace = new Workspace();
      const doc = workspace.parse(text);
      const edits = workspace.rejectGroup(doc, 'ct-5');

      expect(edits).toHaveLength(2);
      expect(edits[0].offset > edits[1].offset).toBeTruthy();
    });

    it('reject move group: deletion restored, insertion removed', () => {
      const text = [
        'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
        '',
        '[^ct-5]: @alice | 2026-02-10 | move | proposed',
        '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');

      const workspace = new Workspace();
      const doc = workspace.parse(text);
      const edits = workspace.rejectGroup(doc, 'ct-5');

      const inlinePart = 'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end';
      const result = applyEdits(inlinePart, edits);

      // Reject deletion = restore original text ("moved") + footnote ref
      // Reject insertion = remove text, keep footnote ref (anchors footnote in document)
      expect(result).toBe('Hello moved[^ct-5.1] and [^ct-5.2] end');
    });

    it('returns empty array when group has no members', () => {
      const workspace = new Workspace();
      const doc = workspace.parse('Hello {++world++}');
      const edits = workspace.rejectGroup(doc, 'ct-nonexistent');
      expect(edits).toStrictEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. computeFootnoteStatusEdits
// ---------------------------------------------------------------------------

describe('computeFootnoteStatusEdits', () => {
  it('updates status from proposed to accepted for a single change', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-1'], 'accepted');
    expect(edits).toHaveLength(1);

    const result = applyEdit(text, edits[0]);
    expect(result.includes('| accepted')).toBeTruthy();
    expect(result.includes('| proposed')).toBeFalsy();
  });

  it('updates status from proposed to rejected', () => {
    const text = [
      'Hello {--gone--}[^ct-2] end',
      '',
      '[^ct-2]: @alice | 2026-02-10 | del | proposed',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-2'], 'rejected');
    expect(edits).toHaveLength(1);

    const result = applyEdit(text, edits[0]);
    expect(result.includes('| rejected')).toBeTruthy();
  });

  it('returns empty array for Level 0 changes (no footnote)', () => {
    const text = 'Hello {++world++} end';
    const edits = computeFootnoteStatusEdits(text, [''], 'accepted');
    expect(edits).toStrictEqual([]);
  });

  it('returns empty array when footnote definition not found', () => {
    const text = [
      'Hello {++world++}[^ct-99] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-99'], 'accepted');
    expect(edits).toStrictEqual([]);
  });

  it('handles multiple change IDs (move group)', () => {
    const text = [
      'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
      '',
      '[^ct-5]: @alice | 2026-02-10 | move | proposed',
      '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
      '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-5', 'ct-5.1', 'ct-5.2'], 'accepted');
    expect(edits).toHaveLength(3);

    // Apply all edits — since all are same-length replacements, apply in reverse offset order
    let result = text;
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    for (const edit of sorted) {
      result = applyEdit(result, edit);
    }
    expect(result.includes('| proposed')).toBeFalsy();
    expect((result.match(/\| accepted/g) || [])).toHaveLength(3);
  });

  it('skips IDs whose footnote is already at the target status', () => {
    const text = [
      'Hello world',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | accepted',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-1'], 'accepted');
    expect(edits).toStrictEqual([]);
  });

  it('preserves footnote body content (discussion, approvals)', () => {
    const text = [
      'Hello {~~old~>new~~}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | sub | proposed',
      '    approved: @eve 2026-02-11',
      '    @alice 2026-02-10: Better wording',
      '    @dave 2026-02-10: Looks good to me.',
      '      @alice 2026-02-10: Thanks!',
      '    resolved @dave 2026-02-10',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-1'], 'accepted');
    expect(edits).toHaveLength(1);

    const result = applyEdit(text, edits[0]);
    expect(result.includes('| accepted')).toBeTruthy();
    expect(result.includes('approved: @eve')).toBeTruthy();
    expect(result.includes('@alice 2026-02-10: Better wording')).toBeTruthy();
    expect(result.includes('@dave 2026-02-10: Looks good to me.')).toBeTruthy();
    expect(result.includes('resolved @dave')).toBeTruthy();
  });

  it('handles footnotes with AI authors', () => {
    const text = [
      'Text {++added++}[^ct-1]',
      '',
      '[^ct-1]: @ai:claude-opus-4.6 | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edits = computeFootnoteStatusEdits(text, ['ct-1'], 'accepted');
    expect(edits).toHaveLength(1);

    const result = applyEdit(text, edits[0]);
    expect(result.includes('| accepted')).toBeTruthy();
    expect(result.includes('@ai:claude-opus-4.6')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8b. computeApprovalLineEdit (attribution on accept/reject)
// ---------------------------------------------------------------------------

describe('computeApprovalLineEdit', () => {
  it('returns null when footnote for changeId is not found', () => {
    const text = [
      'Hello [^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-99', 'accepted', { author: 'alice', date: '2026-02-12' });
    expect(edit).toBeNull();
  });

  it('returns an edit that inserts approved: line after header when footnote has no body', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-1', 'accepted', { author: 'carol', date: '2026-02-12' });
    expect(edit !== null).toBeTruthy();
    const result = applyEdit(text, edit!);
    expect(result.includes('| proposed')).toBeTruthy();
    expect(result.includes('    approved: @carol 2026-02-12')).toBeTruthy();
  });

  it('inserts rejected: line for reject decision', () => {
    const text = [
      'Hello {--gone--}[^ct-2] end',
      '',
      '[^ct-2]: @alice | 2026-02-10 | del | proposed',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-2', 'rejected', { author: 'bob', date: '2026-02-12' });
    expect(edit !== null).toBeTruthy();
    const result = applyEdit(text, edit!);
    expect(result.includes('    rejected: @bob 2026-02-12')).toBeTruthy();
  });

  it('includes optional reason in quoted form', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-1', 'accepted', {
      author: 'carol',
      date: '2026-02-12',
      reason: 'Looks good',
    });
    expect(edit !== null).toBeTruthy();
    const result = applyEdit(text, edit!);
    expect(result.includes('    approved: @carol 2026-02-12 "Looks good"')).toBeTruthy();
  });

  it('inserts after existing approved/rejected lines and before resolution', () => {
    const text = [
      '[^ct-1]: @alice | 2026-02-10 | sub | proposed',
      '    approved: @eve 2026-02-11',
      '    resolved @eve 2026-02-11',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-1', 'accepted', { author: 'carol', date: '2026-02-12' });
    expect(edit !== null).toBeTruthy();
    const result = applyEdit(text, edit!);
    const approvedLines = result.split('\n').filter((l) => l.includes('approved:'));
    expect(approvedLines).toHaveLength(2);
    expect(approvedLines.some((l) => l.includes('@eve 2026-02-11'))).toBeTruthy();
    expect(approvedLines.some((l) => l.includes('@carol 2026-02-12'))).toBeTruthy();
    const carolIdx = result.split('\n').findIndex((l) => l.includes('@carol 2026-02-12'));
    const resolvedIdx = result.split('\n').findIndex((l) => l.includes('resolved'));
    expect(carolIdx < resolvedIdx, 'new approval must appear before resolution line').toBeTruthy();
  });

  it('inserts approval before bare "open" resolution (no reason)', () => {
    const text = [
      '[^ct-1]: @alice | 2026-02-10 | sub | proposed',
      '    @alice 2026-02-10: Initial change',
      '    open',
    ].join('\n');

    const edit = computeApprovalLineEdit(text, 'ct-1', 'accepted', { author: 'carol', date: '2026-02-12' });
    expect(edit !== null).toBeTruthy();
    const result = applyEdit(text, edit!);
    const lines = result.split('\n');
    const approvedIdx = lines.findIndex((l) => l.includes('approved:'));
    const openIdx = lines.findIndex((l) => l.trim() === 'open');
    expect(approvedIdx > -1, 'approved line must exist').toBeTruthy();
    expect(openIdx > -1, 'open resolution line must exist').toBeTruthy();
    expect(approvedIdx < openIdx, 'approval must appear before bare "open" resolution line').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 9. Workspace accept/reject with footnote status updates
// ---------------------------------------------------------------------------
describe('Workspace accept/reject updates footnote status', () => {
  function applyEdits(text: string, edits: TextEdit[]): string {
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    let result = text;
    for (const edit of sorted) {
      result = result.substring(0, edit.offset) + edit.newText + result.substring(edit.offset + edit.length);
    }
    return result;
  }

  it('acceptChange includes footnote status edit when text is provided', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);
    const change = doc.getChanges()[0];

    const edits = workspace.acceptChange(change, text);
    expect(edits).toHaveLength(2);

    const result = applyEdits(text, edits);
    expect(result.includes('Hello world[^ct-1] end')).toBeTruthy();
    expect(result.includes('| accepted')).toBeTruthy();
  });

  it('rejectChange includes footnote status edit when text is provided', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);
    const change = doc.getChanges()[0];

    const edits = workspace.rejectChange(change, text);
    expect(edits).toHaveLength(2);

    const result = applyEdits(text, edits);
    expect(result.includes('Hello [^ct-1] end')).toBeTruthy();
    expect(result.includes('| rejected')).toBeTruthy();
  });

  it('acceptChange without text returns only inline edit (backward compat)', () => {
    const text = 'Hello {++world++}[^ct-1] end';
    const workspace = new Workspace();
    const doc = workspace.parse(text);
    const change = doc.getChanges()[0];

    const edits = workspace.acceptChange(change);
    expect(edits).toHaveLength(1);
  });

  it('acceptAll updates all footnote statuses', () => {
    const text = [
      'Hello {++world++}[^ct-1] and {~~old~>new~~}[^ct-2] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
      '[^ct-2]: @bob | 2026-02-10 | sub | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);

    const edits = workspace.acceptAll(doc, text);
    const result = applyEdits(text, edits);

    expect(result.includes('| proposed')).toBeFalsy();
    expect((result.match(/\| accepted/g) || [])).toHaveLength(2);
  });

  it('rejectAll updates all footnote statuses to rejected', () => {
    const text = [
      'Hello {++world++}[^ct-1] end',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);

    const edits = workspace.rejectAll(doc, text);
    const result = applyEdits(text, edits);

    expect(result.includes('| rejected')).toBeTruthy();
  });

  it('acceptGroup updates parent + children footnote statuses', () => {
    const text = [
      'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
      '',
      '[^ct-5]: @alice | 2026-02-10 | move | proposed',
      '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
      '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);

    const edits = workspace.acceptGroup(doc, 'ct-5', text);
    const result = applyEdits(text, edits);

    expect(result.includes('| proposed')).toBeFalsy();
    expect((result.match(/\| accepted/g) || [])).toHaveLength(3);
  });

  it('rejectGroup updates parent + children footnote statuses', () => {
    const text = [
      'Hello {--moved--}[^ct-5.1] and {++moved++}[^ct-5.2] end',
      '',
      '[^ct-5]: @alice | 2026-02-10 | move | proposed',
      '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
      '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(text);

    const edits = workspace.rejectGroup(doc, 'ct-5', text);
    const result = applyEdits(text, edits);

    expect(result.includes('| proposed')).toBeFalsy();
    expect((result.match(/\| rejected/g) || [])).toHaveLength(3);
  });

  it('Level 0 change (no footnote) accepted without error', () => {
    const text = 'Hello {++world++} end';
    const workspace = new Workspace();
    const doc = workspace.parse(text);
    const change = doc.getChanges()[0];

    const edits = workspace.acceptChange(change, text);
    expect(edits).toHaveLength(1);

    const result = applyEdits(text, edits);
    expect(result).toBe('Hello world end');
  });
});

// ---------------------------------------------------------------------------
// 10. Full document round-trip: inline + footnote status
// ---------------------------------------------------------------------------
describe('Full document round-trip', () => {
  function applyAllEdits(text: string, edits: TextEdit[]): string {
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    let result = text;
    for (const edit of sorted) {
      result = result.substring(0, edit.offset) + edit.newText + result.substring(edit.offset + edit.length);
    }
    return result;
  }

  it('accept single change: inline resolved, footnote kept with accepted status', () => {
    const input = [
      '# Document',
      '',
      'The API uses {~~REST~>GraphQL~~}[^ct-1] for queries.',
      '',
      '[^ct-1]: @alice | 2026-02-10 | sub | proposed',
      '    @alice 2026-02-10: Better client ergonomics',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(input);
    const change = doc.getChanges()[0];
    const edits = workspace.acceptChange(change, input);

    const result = applyAllEdits(input, edits);

    const expected = [
      '# Document',
      '',
      'The API uses GraphQL[^ct-1] for queries.',
      '',
      '[^ct-1]: @alice | 2026-02-10 | sub | accepted',
      '    @alice 2026-02-10: Better client ergonomics',
    ].join('\n');

    expect(result).toBe(expected);
  });

  it('reject deletion: text restored, footnote kept with rejected status', () => {
    const input = [
      'Keep this. {--Remove this.--}[^ct-3] And this.',
      '',
      '[^ct-3]: @bob | 2026-02-10 | del | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(input);
    const change = doc.getChanges()[0];
    const edits = workspace.rejectChange(change, input);

    const result = applyAllEdits(input, edits);

    const expected = [
      'Keep this. Remove this.[^ct-3] And this.',
      '',
      '[^ct-3]: @bob | 2026-02-10 | del | rejected',
    ].join('\n');

    expect(result).toBe(expected);
  });

  it('acceptAll: multiple changes resolved, all footnotes accepted', () => {
    const input = [
      '{++New intro. ++}[^ct-1]Old {~~text~>content~~}[^ct-2].',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
      '[^ct-2]: @alice | 2026-02-10 | sub | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(input);
    const edits = workspace.acceptAll(doc, input);

    const result = applyAllEdits(input, edits);

    const expected = [
      'New intro. [^ct-1]Old content[^ct-2].',
      '',
      '[^ct-1]: @alice | 2026-02-10 | ins | accepted',
      '[^ct-2]: @alice | 2026-02-10 | sub | accepted',
    ].join('\n');

    expect(result).toBe(expected);
  });

  it('accept move group: deletion removed, insertion kept, all footnotes accepted', () => {
    const input = [
      'A {--moved--}[^ct-5.1] B {++moved++}[^ct-5.2] C',
      '',
      '[^ct-5]: @alice | 2026-02-10 | move | proposed',
      '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
      '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
    ].join('\n');

    const workspace = new Workspace();
    const doc = workspace.parse(input);
    const edits = workspace.acceptGroup(doc, 'ct-5', input);

    const result = applyAllEdits(input, edits);

    expect(result.startsWith('A [^ct-5.1] B moved[^ct-5.2] C')).toBeTruthy();
    expect(result.includes('| proposed')).toBeFalsy();
    expect((result.match(/\| accepted/g) || [])).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Footnote Reference Preservation
// ---------------------------------------------------------------------------
describe('footnote reference preservation', () => {
  describe('computeAccept unit tests', () => {
    it('Insertion: preserves footnote ref when accepting', () => {
      // {++text++}[^ct-1]  — positions 0..18
      const change = makeChange({
        type: ChangeType.Insertion,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 18 },
        contentRange: { start: 3, end: 7 },
        modifiedText: 'text',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 18, newText: 'text[^ct-1]' });
    });

    it('Deletion: preserves footnote ref when accepting (anchors footnote in document)', () => {
      // {--text--}[^ct-1]  — positions 0..18
      const change = makeChange({
        type: ChangeType.Deletion,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 18 },
        contentRange: { start: 3, end: 7 },
        originalText: 'text',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 18, newText: '[^ct-1]' });
    });

    it('Substitution: preserves footnote ref when accepting', () => {
      // {~~old~>new~~}[^ct-1]  — positions 0..24
      const change = makeChange({
        type: ChangeType.Substitution,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 24 },
        contentRange: { start: 3, end: 12 },
        originalRange: { start: 3, end: 6 },
        modifiedRange: { start: 8, end: 11 },
        originalText: 'old',
        modifiedText: 'new',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 24, newText: 'new[^ct-1]' });
    });

    it('Highlight: preserves footnote ref when accepting', () => {
      // {==text==}[^ct-1]  — positions 0..19
      const change = makeChange({
        type: ChangeType.Highlight,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 19 },
        contentRange: { start: 3, end: 7 },
        originalText: 'text',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 19, newText: 'text[^ct-1]' });
    });

    it('Comment: does not preserve footnote ref when accepting (comment removed)', () => {
      // {>>note<<}[^ct-1]  — positions 0..19
      const change = makeChange({
        type: ChangeType.Comment,
        id: 'ct-1',
        range: { start: 0, end: 19 },
        contentRange: { start: 3, end: 7 },
        metadata: { comment: 'note' },
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 19, newText: '' });
    });

    it('Dotted ID: preserves footnote ref for child change (ct-5.2)', () => {
      // {++text++}[^ct-5.2]
      const change = makeChange({
        type: ChangeType.Insertion,
        id: 'ct-5.2',
        level: 2,
        range: { start: 0, end: 20 },
        contentRange: { start: 3, end: 7 },
        modifiedText: 'text',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 20, newText: 'text[^ct-5.2]' });
    });

    it('Unanchored ct-N ID: does NOT preserve footnote ref (Level 0)', () => {
      // {++text++} (no footnote ref, parser assigns ct-1 but level stays 0)
      const change = makeChange({
        type: ChangeType.Insertion,
        id: 'ct-1',
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        modifiedText: 'text',
      });

      const edit = computeAccept(change);
      expect(edit).toStrictEqual({ offset: 0, length: 10, newText: 'text' });
    });
  });

  describe('computeReject unit tests', () => {
    it('Insertion: preserves footnote ref when rejecting (anchors footnote in document)', () => {
      // {++text++}[^ct-1]  — rejected insertion = text removed, ref kept for anchoring
      const change = makeChange({
        type: ChangeType.Insertion,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 18 },
        contentRange: { start: 3, end: 7 },
        modifiedText: 'text',
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 18, newText: '[^ct-1]' });
    });

    it('Deletion: preserves footnote ref when rejecting', () => {
      // {--text--}[^ct-1]  — rejected deletion = keep text
      const change = makeChange({
        type: ChangeType.Deletion,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 18 },
        contentRange: { start: 3, end: 7 },
        originalText: 'text',
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 18, newText: 'text[^ct-1]' });
    });

    it('Substitution: preserves footnote ref when rejecting', () => {
      // {~~old~>new~~}[^ct-1]  — rejected = keep old text
      const change = makeChange({
        type: ChangeType.Substitution,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 24 },
        contentRange: { start: 3, end: 12 },
        originalRange: { start: 3, end: 6 },
        modifiedRange: { start: 8, end: 11 },
        originalText: 'old',
        modifiedText: 'new',
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 24, newText: 'old[^ct-1]' });
    });

    it('Highlight: preserves footnote ref when rejecting', () => {
      // {==text==}[^ct-1]  — rejected = keep text
      const change = makeChange({
        type: ChangeType.Highlight,
        id: 'ct-1',
        level: 2,
        range: { start: 0, end: 19 },
        contentRange: { start: 3, end: 7 },
        originalText: 'text',
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 19, newText: 'text[^ct-1]' });
    });

    it('Comment: does not preserve footnote ref when rejecting (comment removed)', () => {
      // {>>note<<}[^ct-1]  — rejected comment = remove
      const change = makeChange({
        type: ChangeType.Comment,
        id: 'ct-1',
        range: { start: 0, end: 19 },
        contentRange: { start: 3, end: 7 },
        metadata: { comment: 'note' },
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 19, newText: '' });
    });

    it('Unanchored ct-N ID: does NOT preserve footnote ref (Level 0)', () => {
      // {--text--} (no footnote ref, parser assigns ct-1 but level stays 0)
      const change = makeChange({
        type: ChangeType.Deletion,
        id: 'ct-1',
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        originalText: 'text',
      });

      const edit = computeReject(change);
      expect(edit).toStrictEqual({ offset: 0, length: 10, newText: 'text' });
    });
  });

  describe('workspace integration tests', () => {
    it('acceptChange: preserves footnote ref in document', () => {
      const input = 'Before {++text++}[^ct-1] after.\n\n[^ct-1]: @alice | 2026-02-11 | ins | proposed';

      const workspace = new Workspace();
      const doc = workspace.parse(input);
      const change = doc.getChanges()[0];
      const edits = workspace.acceptChange(change, input);

      const result = applyAllEdits(input, edits);

      expect(result.includes('Before text[^ct-1] after.')).toBeTruthy();
      expect(result.includes('| accepted')).toBeTruthy();
    });

    it('rejectChange: preserves footnote ref when rejecting deletion', () => {
      const input = 'Before {--text--}[^ct-1] after.\n\n[^ct-1]: @alice | 2026-02-11 | del | proposed';

      const workspace = new Workspace();
      const doc = workspace.parse(input);
      const change = doc.getChanges()[0];
      const edits = workspace.rejectChange(change, input);

      const result = applyAllEdits(input, edits);

      expect(result.includes('Before text[^ct-1] after.')).toBeTruthy();
      expect(result.includes('| rejected')).toBeTruthy();
    });

    it('acceptChange: substitution preserves footnote ref', () => {
      const input = 'Use {~~old~>new~~}[^ct-1] method.\n\n[^ct-1]: @alice | 2026-02-11 | sub | proposed';

      const workspace = new Workspace();
      const doc = workspace.parse(input);
      const change = doc.getChanges()[0];
      const edits = workspace.acceptChange(change, input);

      const result = applyAllEdits(input, edits);

      expect(result.includes('Use new[^ct-1] method.')).toBeTruthy();
      expect(result.includes('| accepted')).toBeTruthy();
    });

    it('acceptAll: preserves footnote refs for multiple changes', () => {
      const input = [
        '{++New intro.++}[^ct-1] {~~Old~>Updated~~}[^ct-2] content.',
        '',
        '[^ct-1]: @alice | 2026-02-11 | ins | proposed',
        '[^ct-2]: @alice | 2026-02-11 | sub | proposed',
      ].join('\n');

      const workspace = new Workspace();
      const doc = workspace.parse(input);
      const edits = workspace.acceptAll(doc, input);

      const result = applyAllEdits(input, edits);

      expect(result.includes('New intro.[^ct-1] Updated[^ct-2] content.')).toBeTruthy();
      expect((result.match(/\| accepted/g) || [])).toHaveLength(2);
    });

    it('acceptChange: auto-generated ID does not add footnote ref', () => {
      const input = 'Before {++text++} after.';

      const workspace = new Workspace();
      const doc = workspace.parse(input);
      const change = doc.getChanges()[0];
      const edits = workspace.acceptChange(change, input);

      const result = applyAllEdits(input, edits);

      expect(result).toBe('Before text after.');
    });
  });
});

// ---------------------------------------------------------------------------
// computeAcceptParts / computeRejectParts — separated text + refId
// ---------------------------------------------------------------------------
describe('computeAcceptParts', () => {
  it('returns text and refId separately for insertion with ct- id', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      id: 'ct-1',
      level: 2,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const parts = computeAcceptParts(change);
    expect(parts.text).toBe('hello');
    expect(parts.refId).toBe('ct-1');
    expect(parts.offset).toBe(0);
    expect(parts).toHaveLength(12);
  });

  it('returns empty refId for non-sc id', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      id: 'test-0',
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const parts = computeAcceptParts(change);
    expect(parts.text).toBe('hello');
    expect(parts.refId).toBe('');
  });

  it('returns empty text for deletion with refId', () => {
    const change = makeChange({
      type: ChangeType.Deletion,
      id: 'ct-2',
      level: 2,
      range: { start: 0, end: 15 },
      contentRange: { start: 3, end: 12 },
      originalText: 'deleted',
    });
    const parts = computeAcceptParts(change);
    expect(parts.text).toBe('');
    expect(parts.refId).toBe('ct-2');
  });

  it('returns modifiedText for substitution with refId', () => {
    const change = makeChange({
      type: ChangeType.Substitution,
      id: 'ct-3',
      level: 2,
      range: { start: 0, end: 20 },
      contentRange: { start: 3, end: 17 },
      originalText: 'old',
      modifiedText: 'new',
    });
    const parts = computeAcceptParts(change);
    expect(parts.text).toBe('new');
    expect(parts.refId).toBe('ct-3');
  });

  it('is consistent with computeAccept (text + ref = newText)', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      id: 'ct-5',
      level: 2,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const parts = computeAcceptParts(change);
    const edit = computeAccept(change);
    const reconstructed = parts.text + (parts.refId ? `[^${parts.refId}]` : '');
    expect(reconstructed).toBe(edit.newText);
  });
});

describe('computeRejectParts', () => {
  it('returns empty text for rejected insertion with refId', () => {
    const change = makeChange({
      type: ChangeType.Insertion,
      id: 'ct-1',
      level: 2,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const parts = computeRejectParts(change);
    expect(parts.text).toBe('');
    expect(parts.refId).toBe('ct-1');
  });

  it('returns originalText for rejected deletion with refId', () => {
    const change = makeChange({
      type: ChangeType.Deletion,
      id: 'ct-2',
      level: 2,
      range: { start: 0, end: 15 },
      contentRange: { start: 3, end: 12 },
      originalText: 'deleted',
    });
    const parts = computeRejectParts(change);
    expect(parts.text).toBe('deleted');
    expect(parts.refId).toBe('ct-2');
  });

  it('returns originalText for rejected substitution with refId', () => {
    const change = makeChange({
      type: ChangeType.Substitution,
      id: 'ct-3',
      level: 2,
      range: { start: 0, end: 20 },
      contentRange: { start: 3, end: 17 },
      originalText: 'old',
      modifiedText: 'new',
    });
    const parts = computeRejectParts(change);
    expect(parts.text).toBe('old');
    expect(parts.refId).toBe('ct-3');
  });

  it('is consistent with computeReject (text + ref = newText)', () => {
    const change = makeChange({
      type: ChangeType.Substitution,
      id: 'ct-3',
      level: 2,
      range: { start: 0, end: 20 },
      contentRange: { start: 3, end: 17 },
      originalText: 'old',
      modifiedText: 'new',
    });
    const parts = computeRejectParts(change);
    const edit = computeReject(change);
    const reconstructed = parts.text + (parts.refId ? `[^${parts.refId}]` : '');
    expect(reconstructed).toBe(edit.newText);
  });
});

/**
 * Helper to apply multiple TextEdits in reverse order.
 */
function applyAllEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = applyEdit(result, edit);
  }
  return result;
}
