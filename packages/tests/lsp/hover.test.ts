import { describe, it, expect } from 'vitest';
import { ChangeNode, ChangeType, ChangeStatus, VirtualDocument } from '@changedown/core';
import { createHover, Position } from '@changedown/lsp-server/internals';

describe('Hover Capability', () => {
  describe('createHover', () => {
    it('should return null for position not in any change', () => {
      const text = 'Hello {++world++}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: false
        }
      ];

      // Position at offset 0 (before any change)
      const position = Position.create(0, 0);
      const hover = createHover(position, changes, text);

      expect(hover).toBeNull();
    });

    it('should return null for position in insertion', () => {
      const text = 'Hello {++world++}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: false
        }
      ];

      // Position at offset 10 (inside "world")
      const position = Position.create(0, 10);
      const hover = createHover(position, changes, text);

      expect(hover).toBeNull();
    });

    it('should return null for position in deletion', () => {
      const text = 'Hello {--world--}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: false
        }
      ];

      // Position at offset 10 (inside "world")
      const position = Position.create(0, 10);
      const hover = createHover(position, changes, text);

      expect(hover).toBeNull();
    });

    it('should return null for position in substitution', () => {
      const text = 'Hello {~~old~>new~~}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 20 },
          contentRange: { start: 9, end: 17 },
          originalRange: { start: 9, end: 12 },
          modifiedRange: { start: 14, end: 17 },
          level: 0, anchored: false
        }
      ];

      // Position at offset 10 (inside "old")
      const position = Position.create(0, 10);
      const hover = createHover(position, changes, text);

      expect(hover).toBeNull();
    });

    it('should return hover for standalone comment', () => {
      const text = 'Hello {>>This is a comment<<}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 29 },
          contentRange: { start: 9, end: 27 },
          metadata: {
            comment: 'This is a comment'
          },
          level: 0, anchored: false
        }
      ];

      // Position at offset 15 (inside comment content)
      const position = Position.create(0, 15);
      const hover = createHover(position, changes, text);

      expect(hover).toBeTruthy();
      expect(hover.contents).toBeTruthy();
      expect(typeof hover.contents === 'object' && 'value' in hover.contents).toBeTruthy();
      expect(hover.contents.value.includes('This is a comment')).toBeTruthy();
      expect(hover.contents.value.includes('**Comment:**')).toBeTruthy();
    });

    it('should return hover for highlight with attached comment', () => {
      const text = 'Hello {==world==}{>>note<<}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          metadata: {
            comment: 'note'
          },
          level: 0, anchored: false
        },
        {
          id: '2',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 17, end: 27 },
          contentRange: { start: 20, end: 24 },
          metadata: {
            comment: 'note'
          },
          level: 0, anchored: false
        }
      ];

      // Position at offset 10 (inside "world")
      const position = Position.create(0, 10);
      const hover = createHover(position, changes, text);

      expect(hover).toBeTruthy();
      expect(hover.contents).toBeTruthy();
      expect(typeof hover.contents === 'object' && 'value' in hover.contents).toBeTruthy();
      expect(hover.contents.value.includes('note')).toBeTruthy();
      expect(hover.contents.value.includes('**Comment:**')).toBeTruthy();
    });

    it('should return hover for highlight without attached comment', () => {
      const text = 'Hello {==world==}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: false
        }
      ];

      // Position at offset 10 (inside "world")
      const position = Position.create(0, 10);
      const hover = createHover(position, changes, text);

      // No comment metadata, so should return null
      expect(hover).toBeNull();
    });

    it('should handle multi-line comment', () => {
      const text = 'Hello {>>This is a\nmulti-line\ncomment<<}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 41 },
          contentRange: { start: 9, end: 38 },
          metadata: {
            comment: 'This is a\nmulti-line\ncomment'
          },
          level: 0, anchored: false
        }
      ];

      // Position at line 1, character 0 (inside "multi-line")
      const position = Position.create(1, 0);
      const hover = createHover(position, changes, text);

      expect(hover).toBeTruthy();
      expect(hover.contents).toBeTruthy();
      expect(typeof hover.contents === 'object' && 'value' in hover.contents).toBeTruthy();
      expect(hover.contents.value.includes('This is a')).toBeTruthy();
      expect(hover.contents.value.includes('multi-line')).toBeTruthy();
      expect(hover.contents.value.includes('comment')).toBeTruthy();
    });

    it('should handle position at delimiter edges', () => {
      const text = 'Hello {>>comment<<}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 19 },
          contentRange: { start: 9, end: 16 },
          metadata: {
            comment: 'comment'
          },
          level: 0, anchored: false
        }
      ];

      // Position at opening delimiter
      let position = Position.create(0, 6);
      let hover = createHover(position, changes, text);
      expect(hover).toBeTruthy();

      // Position at closing delimiter
      position = Position.create(0, 18);
      hover = createHover(position, changes, text);
      expect(hover).toBeTruthy();

      // Position just before range
      position = Position.create(0, 5);
      hover = createHover(position, changes, text);
      expect(hover).toBeNull();

      // Position just after range
      position = Position.create(0, 19);
      hover = createHover(position, changes, text);
      expect(hover).toBeNull();
    });

    it('should return null for empty comment text', () => {
      const text = 'Hello {>><<}';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 12 },
          contentRange: { start: 9, end: 9 },
          metadata: {
            comment: ''
          },
          level: 0, anchored: false
        }
      ];

      const position = Position.create(0, 8);
      const hover = createHover(position, changes, text);

      // Empty comment should not show hover
      expect(hover).toBeNull();
    });
  });
});
