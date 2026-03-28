import { describe, it, expect } from 'vitest';
import {
  ChangeType,
  ChangeStatus,
  type ChangeNode,
  type ViewName,
  type DecorationIntent,
  buildDecorationIntents,
} from '@changedown/core';
import type { EditPendingOverlay } from '@changedown/core/edit-boundary';

// ── Test Helpers ──────────────────────────────────────────────────────

/** Create a minimal ChangeNode for testing. */
function makeNode(overrides: Partial<ChangeNode> & Pick<ChangeNode, 'type' | 'range' | 'contentRange'>): ChangeNode {
  return {
    id: 'cn-1',
    status: ChangeStatus.Proposed,
    level: 0 as const,
    anchored: false,
    ...overrides,
  };
}

/** Shorthand: create an insertion node for `{++text++}` at a given offset. */
function insertionNode(offset: number, text: string): ChangeNode {
  // {++ = 3 chars, ++} = 3 chars
  return makeNode({
    type: ChangeType.Insertion,
    range: { start: offset, end: offset + 3 + text.length + 3 },
    contentRange: { start: offset + 3, end: offset + 3 + text.length },
    modifiedText: text,
  });
}

/** Shorthand: create a deletion node for `{--text--}` at a given offset. */
function deletionNode(offset: number, text: string): ChangeNode {
  return makeNode({
    type: ChangeType.Deletion,
    range: { start: offset, end: offset + 3 + text.length + 3 },
    contentRange: { start: offset + 3, end: offset + 3 + text.length },
    originalText: text,
  });
}

/** Shorthand: create a substitution node for `{~~old~>new~~}` at a given offset. */
function substitutionNode(offset: number, oldText: string, newText: string): ChangeNode {
  // {~~ = 3, old, ~> = 2, new, ~~} = 3
  const origStart = offset + 3;
  const origEnd = origStart + oldText.length;
  const modStart = origEnd + 2; // after ~>
  const modEnd = modStart + newText.length;
  return makeNode({
    type: ChangeType.Substitution,
    range: { start: offset, end: modEnd + 3 },
    contentRange: { start: origStart, end: modEnd },
    originalRange: { start: origStart, end: origEnd },
    modifiedRange: { start: modStart, end: modEnd },
    originalText: oldText,
    modifiedText: newText,
  });
}

/** Shorthand: create a highlight node for `{==text==}` at a given offset. */
function highlightNode(offset: number, text: string): ChangeNode {
  return makeNode({
    type: ChangeType.Highlight,
    range: { start: offset, end: offset + 3 + text.length + 3 },
    contentRange: { start: offset + 3, end: offset + 3 + text.length },
  });
}

/** Shorthand: create a comment node for `{>>text<<}` at a given offset. */
function commentNode(offset: number, text: string): ChangeNode {
  return makeNode({
    type: ChangeType.Comment,
    range: { start: offset, end: offset + 3 + text.length + 3 },
    contentRange: { start: offset + 3, end: offset + 3 + text.length },
  });
}

/** Filter intents by kind. */
function byKind(intents: DecorationIntent[], kind: string): DecorationIntent[] {
  return intents.filter(i => i.kind === kind);
}

/** Filter intents by visibility. */
function byVis(intents: DecorationIntent[], vis: string): DecorationIntent[] {
  return intents.filter(i => i.visibility === vis);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('buildDecorationIntents', () => {

  // ── Raw view ──────────────────────────────────────────────────────

  describe('raw view', () => {
    it('returns empty array for any nodes', () => {
      const nodes = [insertionNode(0, 'hello'), deletionNode(20, 'world')];
      const result = buildDecorationIntents(nodes, 'raw');
      expect(result).toStrictEqual([]);
    });

    it('returns empty array with pending overlay', () => {
      const overlay: EditPendingOverlay = {
        anchorOffset: 5,
        currentLength: 3,
        currentText: 'abc',
        originalText: '',
        cursorOffset: 3,
      };
      const result = buildDecorationIntents([], 'raw', overlay);
      expect(result).toStrictEqual([]);
    });

    it('returns empty array with no nodes', () => {
      const result = buildDecorationIntents([], 'raw');
      expect(result).toStrictEqual([]);
    });
  });

  // ── Empty input ───────────────────────────────────────────────────

  describe('empty input', () => {
    for (const view of ['review', 'changes', 'settled'] as ViewName[]) {
      it(`returns empty array for ${view} with no nodes`, () => {
        expect(buildDecorationIntents([], view)).toStrictEqual([]);
      });
    }
  });

  // ── Insertion ─────────────────────────────────────────────────────

  describe('insertion', () => {
    // {++hello++} at offset 0 => range [0,11), content [3,8)
    const node = insertionNode(0, 'hello');

    describe('review mode', () => {
      it('produces visible delimiters and visible content', () => {
        const intents = buildDecorationIntents([node], 'review');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'insertion');

        expect(delimiters).toHaveLength(2);
        expect(content).toHaveLength(1);

        // Open delimiter {++ at [0,3)
        expect(delimiters[0].range).toStrictEqual({ start: 0, end: 3 });
        expect(delimiters[0].visibility).toBe('visible');

        // Content at [3,8)
        expect(content[0].range).toStrictEqual({ start: 3, end: 8 });
        expect(content[0].visibility).toBe('visible');

        // Close delimiter ++} at [8,11)
        expect(delimiters[1].range).toStrictEqual({ start: 8, end: 11 });
        expect(delimiters[1].visibility).toBe('visible');
      });

      it('includes metadata', () => {
        const n = insertionNode(0, 'x');
        n.metadata = { author: 'alice', status: 'proposed' };
        n.id = 'cn-42';
        const intents = buildDecorationIntents([n], 'review');
        const content = byKind(intents, 'insertion')[0];
        expect(content.metadata?.author).toBe('alice');
        expect(content.metadata?.scId).toBe('cn-42');
      });
    });

    describe('changes mode', () => {
      it('hides delimiters, shows content', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'insertion');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();

        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides delimiters, no content intent (renders as plain text)', () => {
        const intents = buildDecorationIntents([node], 'settled');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'insertion');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();

        // No insertion content intent — the text renders as plain
        expect(content).toHaveLength(0);
      });
    });
  });

  // ── Deletion ──────────────────────────────────────────────────────

  describe('deletion', () => {
    // {--removed--} at offset 0 => range [0,14), content [3,10)
    const node = deletionNode(0, 'removed');

    describe('review mode', () => {
      it('produces visible delimiters and visible deletion content', () => {
        const intents = buildDecorationIntents([node], 'review');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'deletion');

        expect(delimiters).toHaveLength(2);
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
        expect(content[0].range).toStrictEqual({ start: 3, end: 10 });
      });
    });

    describe('changes mode', () => {
      it('hides delimiters, shows deletion content', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'deletion');

        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides entire deletion range', () => {
        const intents = buildDecorationIntents([node], 'settled');
        // Entire range [0,14) is hidden
        expect(intents).toHaveLength(1);
        expect(intents[0].kind).toBe('deletion');
        expect(intents[0].visibility).toBe('hidden');
        expect(intents[0].range).toStrictEqual({ start: 0, end: 13 });
      });
    });
  });

  // ── Substitution ──────────────────────────────────────────────────

  describe('substitution', () => {
    // {~~old~>new~~} at offset 0
    // range [0,14), contentRange [3,11)
    // originalRange [3,6), modifiedRange [8,11)
    const node = substitutionNode(0, 'old', 'new');

    describe('review mode', () => {
      it('shows all parts visible', () => {
        const intents = buildDecorationIntents([node], 'review');
        const delimiters = byKind(intents, 'delimiter');
        const oldParts = byKind(intents, 'substitution-old');
        const newParts = byKind(intents, 'substitution-new');

        // 3 delimiters: {~~, ~>, ~~}
        expect(delimiters).toHaveLength(3);
        expect(delimiters.every(d => d.visibility === 'visible')).toBeTruthy();

        // Open delimiter {~~ at [0,3)
        expect(delimiters[0].range).toStrictEqual({ start: 0, end: 3 });
        // Separator ~> at [6,8)
        expect(delimiters[1].range).toStrictEqual({ start: 6, end: 8 });
        // Close delimiter ~~} at [11,14)
        expect(delimiters[2].range).toStrictEqual({ start: 11, end: 14 });

        expect(oldParts).toHaveLength(1);
        expect(oldParts[0].range).toStrictEqual({ start: 3, end: 6 });
        expect(oldParts[0].visibility).toBe('visible');

        expect(newParts).toHaveLength(1);
        expect(newParts[0].range).toStrictEqual({ start: 8, end: 11 });
        expect(newParts[0].visibility).toBe('visible');
      });
    });

    describe('changes mode', () => {
      it('hides delimiters and separator, shows old and new', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const oldParts = byKind(intents, 'substitution-old');
        const newParts = byKind(intents, 'substitution-new');

        expect(delimiters).toHaveLength(3);
        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();

        expect(oldParts).toHaveLength(1);
        expect(oldParts[0].visibility).toBe('visible');

        expect(newParts).toHaveLength(1);
        expect(newParts[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides old text + delimiters, shows new as plain text', () => {
        const intents = buildDecorationIntents([node], 'settled');

        // The range [0, 8) (open delimiter + old text + separator) is hidden as substitution-old
        const oldParts = byKind(intents, 'substitution-old');
        expect(oldParts).toHaveLength(1);
        expect(oldParts[0].range).toStrictEqual({ start: 0, end: 8 });
        expect(oldParts[0].visibility).toBe('hidden');

        // Close delimiter ~~} at [11,14) is hidden
        const delimiters = byKind(intents, 'delimiter');
        expect(delimiters).toHaveLength(1);
        expect(delimiters[0].range).toStrictEqual({ start: 11, end: 14 });
        expect(delimiters[0].visibility).toBe('hidden');

        // No substitution-new intent — new text renders as plain
        const newParts = byKind(intents, 'substitution-new');
        expect(newParts).toHaveLength(0);
      });
    });

    it('returns nothing when originalRange or modifiedRange is missing', () => {
      const broken = makeNode({
        type: ChangeType.Substitution,
        range: { start: 0, end: 14 },
        contentRange: { start: 3, end: 11 },
        // originalRange and modifiedRange omitted
      });
      const intents = buildDecorationIntents([broken], 'review');
      // Should produce nothing since the ranges are needed
      expect(byKind(intents, 'substitution-old')).toHaveLength(0);
      expect(byKind(intents, 'substitution-new')).toHaveLength(0);
    });
  });

  // ── Highlight ─────────────────────────────────────────────────────

  describe('highlight', () => {
    // {==marked==} at offset 0 => range [0,13), content [3,9)
    const node = highlightNode(0, 'marked');

    describe('review mode', () => {
      it('produces visible delimiters and visible content', () => {
        const intents = buildDecorationIntents([node], 'review');
        const content = byKind(intents, 'highlight');
        const delimiters = byKind(intents, 'delimiter');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'visible')).toBeTruthy();
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('changes mode', () => {
      it('hides delimiters, shows content', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'highlight');

        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides delimiters, no content intent (plain text)', () => {
        const intents = buildDecorationIntents([node], 'settled');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'highlight');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content).toHaveLength(0);
      });
    });
  });

  // ── Comment ───────────────────────────────────────────────────────

  describe('comment', () => {
    // {>>note<<} at offset 0 => range [0,11), content [3,7)
    const node = commentNode(0, 'note');

    describe('review mode', () => {
      it('produces visible delimiters and visible content', () => {
        const intents = buildDecorationIntents([node], 'review');
        const content = byKind(intents, 'comment');
        const delimiters = byKind(intents, 'delimiter');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'visible')).toBeTruthy();
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('changes mode', () => {
      it('hides delimiters, shows content', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'comment');

        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides entire comment range', () => {
        const intents = buildDecorationIntents([node], 'settled');
        expect(intents).toHaveLength(1);
        expect(intents[0].kind).toBe('comment');
        expect(intents[0].visibility).toBe('hidden');
        expect(intents[0].range).toStrictEqual({ start: 0, end: 10 });
      });
    });
  });

  // ── Move operations ───────────────────────────────────────────────

  describe('move source (deletion side)', () => {
    const node = deletionNode(0, 'moved');
    node.moveRole = 'from';
    node.groupId = 'cn-1.1';

    describe('review mode', () => {
      it('produces move-source kind with visible delimiters', () => {
        const intents = buildDecorationIntents([node], 'review');
        const content = byKind(intents, 'move-source');
        const delimiters = byKind(intents, 'delimiter');

        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'visible')).toBeTruthy();
      });
    });

    describe('changes mode', () => {
      it('hides delimiters, shows move-source content', () => {
        const intents = buildDecorationIntents([node], 'changes');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'move-source');

        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content[0].visibility).toBe('visible');
      });
    });

    describe('settled mode', () => {
      it('hides entire move source (deleted side disappears)', () => {
        const intents = buildDecorationIntents([node], 'settled');
        expect(intents).toHaveLength(1);
        expect(intents[0].kind).toBe('move-source');
        expect(intents[0].visibility).toBe('hidden');
      });
    });
  });

  describe('move target (insertion side)', () => {
    const node = insertionNode(0, 'moved');
    node.moveRole = 'to';
    node.groupId = 'cn-1.2';

    describe('review mode', () => {
      it('produces move-target kind with visible delimiters', () => {
        const intents = buildDecorationIntents([node], 'review');
        const content = byKind(intents, 'move-target');
        const delimiters = byKind(intents, 'delimiter');

        expect(content).toHaveLength(1);
        expect(content[0].visibility).toBe('visible');
        expect(delimiters).toHaveLength(2);
      });
    });

    describe('settled mode', () => {
      it('hides delimiters only (target text shown as plain)', () => {
        const intents = buildDecorationIntents([node], 'settled');
        const delimiters = byKind(intents, 'delimiter');
        const content = byKind(intents, 'move-target');

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
        expect(content).toHaveLength(0);
      });
    });
  });

  // ── Pending overlay ───────────────────────────────────────────────

  describe('pending overlay', () => {
    const overlay: EditPendingOverlay = {
      anchorOffset: 10,
      currentLength: 5,
      currentText: 'hello',
      originalText: '',
      cursorOffset: 5,
    };

    describe('review mode', () => {
      it('produces faded pending + two faded delimiters', () => {
        const intents = buildDecorationIntents([], 'review', overlay);
        const pending = byKind(intents, 'pending');
        const delimiters = byKind(intents, 'delimiter');

        expect(pending).toHaveLength(1);
        expect(pending[0].visibility).toBe('faded');
        expect(pending[0].range).toStrictEqual({ start: 10, end: 15 });

        expect(delimiters).toHaveLength(2);
        expect(delimiters.every(d => d.visibility === 'faded')).toBeTruthy();
        // Synthetic delimiters are zero-width markers at start/end
        expect(delimiters[0].range).toStrictEqual({ start: 10, end: 10 });
        expect(delimiters[1].range).toStrictEqual({ start: 15, end: 15 });
      });
    });

    describe('changes mode', () => {
      it('produces faded pending, no delimiters', () => {
        const intents = buildDecorationIntents([], 'changes', overlay);
        const pending = byKind(intents, 'pending');
        const delimiters = byKind(intents, 'delimiter');

        expect(pending).toHaveLength(1);
        expect(pending[0].visibility).toBe('faded');
        expect(delimiters).toHaveLength(0);
      });
    });

    describe('settled mode', () => {
      it('produces faded pending, no delimiters', () => {
        const intents = buildDecorationIntents([], 'settled', overlay);
        const pending = byKind(intents, 'pending');
        const delimiters = byKind(intents, 'delimiter');

        expect(pending).toHaveLength(1);
        expect(pending[0].visibility).toBe('faded');
        expect(delimiters).toHaveLength(0);
      });
    });

    describe('raw mode', () => {
      it('returns nothing', () => {
        const intents = buildDecorationIntents([], 'raw', overlay);
        expect(intents).toStrictEqual([]);
      });
    });

    it('handles null overlay gracefully', () => {
      const intents = buildDecorationIntents([], 'review', null);
      expect(intents).toStrictEqual([]);
    });

    it('handles undefined overlay gracefully', () => {
      const intents = buildDecorationIntents([], 'review', undefined);
      expect(intents).toStrictEqual([]);
    });
  });

  // ── Multiple nodes ────────────────────────────────────────────────

  describe('multiple nodes', () => {
    it('produces intents for all nodes, sorted by range.start', () => {
      // deletion at offset 20, insertion at offset 0
      const nodes = [
        deletionNode(20, 'bye'),
        insertionNode(0, 'hi'),
      ];
      const intents = buildDecorationIntents(nodes, 'review');
      // First intent should be from insertion (offset 0)
      expect(intents[0].range.start < intents[intents.length - 1].range.start).toBeTruthy();

      // Check that both types are present
      const insertions = byKind(intents, 'insertion');
      const deletions = byKind(intents, 'deletion');
      expect(insertions).toHaveLength(1);
      expect(deletions).toHaveLength(1);
    });

    it('includes pending overlay interleaved with committed nodes', () => {
      const node = insertionNode(0, 'committed');
      const overlay: EditPendingOverlay = {
        anchorOffset: 50,
        currentLength: 3,
        currentText: 'new',
        originalText: '',
        cursorOffset: 3,
      };
      const intents = buildDecorationIntents([node], 'review', overlay);
      const pending = byKind(intents, 'pending');
      const insertion = byKind(intents, 'insertion');

      expect(pending).toHaveLength(1);
      expect(insertion).toHaveLength(1);
      // Pending comes after insertion in sorted order
      expect(pending[0].range.start > insertion[0].range.start).toBeTruthy();
    });
  });

  // ── Metadata propagation ──────────────────────────────────────────

  describe('metadata propagation', () => {
    it('uses node.metadata fields when available', () => {
      const node = insertionNode(0, 'text');
      node.metadata = { author: 'alice', status: 'proposed' };
      node.id = 'cn-7';

      const intents = buildDecorationIntents([node], 'review');
      const content = byKind(intents, 'insertion')[0];
      expect(content.metadata?.author).toBe('alice');
      expect(content.metadata?.status).toBe('proposed');
      expect(content.metadata?.scId).toBe('cn-7');
    });

    it('falls back to inlineMetadata when metadata is absent', () => {
      const node = insertionNode(0, 'text');
      node.inlineMetadata = { raw: '@bob proposed', author: 'bob', status: 'proposed' };
      node.id = 'cn-3';

      const intents = buildDecorationIntents([node], 'review');
      const content = byKind(intents, 'insertion')[0];
      expect(content.metadata?.author).toBe('bob');
      expect(content.metadata?.scId).toBe('cn-3');
    });

    it('uses node.status as fallback for metadata.status', () => {
      const node = insertionNode(0, 'x');
      node.status = ChangeStatus.Accepted;
      node.id = 'cn-5';

      const intents = buildDecorationIntents([node], 'review');
      const content = byKind(intents, 'insertion')[0];
      expect(content.metadata?.status).toBe('Accepted');
    });

    it('delimiter intents also carry metadata', () => {
      const node = insertionNode(0, 'text');
      node.id = 'cn-9';
      node.metadata = { author: 'charlie' };

      const intents = buildDecorationIntents([node], 'review');
      const delimiters = byKind(intents, 'delimiter');
      expect(delimiters.length > 0).toBeTruthy();
      expect(delimiters[0].metadata?.scId).toBe('cn-9');
      expect(delimiters[0].metadata?.author).toBe('charlie');
    });
  });

  // ── View mode consistency checks ──────────────────────────────────

  describe('cross-view consistency', () => {
    const allNodes = [
      insertionNode(0, 'ins'),
      deletionNode(20, 'del'),
      substitutionNode(40, 'old', 'new'),
      highlightNode(70, 'mark'),
      commentNode(90, 'note'),
    ];

    it('review produces no hidden content intents (only delimiters hidden in other modes)', () => {
      const intents = buildDecorationIntents(allNodes, 'review');
      const nonDelimiter = intents.filter(i => i.kind !== 'delimiter');
      expect(nonDelimiter.every(i => i.visibility === 'visible')).toBeTruthy();
    });

    it('changes hides all delimiters', () => {
      const intents = buildDecorationIntents(allNodes, 'changes');
      const delimiters = byKind(intents, 'delimiter');
      expect(delimiters.length > 0).toBeTruthy();
      expect(delimiters.every(d => d.visibility === 'hidden')).toBeTruthy();
    });

    it('settled hides deletions and comments entirely', () => {
      const intents = buildDecorationIntents(allNodes, 'settled');
      const deletions = byKind(intents, 'deletion');
      const comments = byKind(intents, 'comment');

      expect(deletions.length > 0).toBeTruthy();
      expect(deletions.every(d => d.visibility === 'hidden')).toBeTruthy();
      expect(comments.length > 0).toBeTruthy();
      expect(comments.every(c => c.visibility === 'hidden')).toBeTruthy();
    });

    it('settled has no visible content intents (everything is either hidden or plain text)', () => {
      const intents = buildDecorationIntents(allNodes, 'settled');
      const visible = byVis(intents, 'visible');
      expect(visible).toHaveLength(0);
    });
  });

  // ── Sorting guarantee ─────────────────────────────────────────────

  describe('sorting', () => {
    it('output is sorted by range.start regardless of input order', () => {
      const nodes = [
        commentNode(100, 'z'),
        insertionNode(50, 'middle'),
        deletionNode(0, 'first'),
      ];
      const intents = buildDecorationIntents(nodes, 'review');
      for (let i = 1; i < intents.length; i++) {
        expect(intents[i].range.start >= intents[i - 1].range.start).toBeTruthy();
      }
    });
  });
});
