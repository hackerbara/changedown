import { describe, it, expect } from 'vitest';
import { createCodeLenses, Position, Range } from '@changetracks/lsp-server/internals';
import type { CodeLens, Command } from '@changetracks/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';

describe('Code Lens', () => {
  describe('createCodeLenses', () => {
    it('should return empty array for no changes', () => {
      const changes: ChangeNode[] = [];
      const text = 'Some text without changes';
      const result = createCodeLenses(changes, text);
      expect(result).toHaveLength(0);
    });

    it('should create per-change lenses for single insertion', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 15 }, // {++added text++}
          contentRange: { start: 3, end: 13 }, // added text,
          level: 0, anchored: false
        }
      ];
      const text = '{++added text++}';
      const result = createCodeLenses(changes, text);

      // Should have 2 document-level lenses + 2 per-change lenses = 4 total
      expect(result).toHaveLength(4);

      // Find per-change lenses
      const perChangeLenses = result.filter(lens =>
        lens.command?.command === 'changetracks.acceptChange' ||
        lens.command?.command === 'changetracks.rejectChange'
      );
      expect(perChangeLenses).toHaveLength(2);

      // Both per-change lenses should be positioned at line 0 (where the change is)
      expect(perChangeLenses[0].range.start.line).toBe(0);
      expect(perChangeLenses[0].range.start.character).toBe(0);
      expect(perChangeLenses[1].range.start.line).toBe(0);
      expect(perChangeLenses[1].range.start.character).toBe(0);

      // Check commands
      const acceptLens = perChangeLenses.find(l => l.command?.title === 'Accept');
      const rejectLens = perChangeLenses.find(l => l.command?.title === 'Reject');

      expect(acceptLens?.command?.command).toBe('changetracks.acceptChange');
      expect(acceptLens?.command?.arguments).toStrictEqual(['change-1']);

      expect(rejectLens?.command?.command).toBe('changetracks.rejectChange');
      expect(rejectLens?.command?.arguments).toStrictEqual(['change-1']);
    });

    it('should create per-change lenses for deletion', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 17 }, // {--removed text--}
          contentRange: { start: 3, end: 15 }, // removed text,
          level: 0, anchored: false
        }
      ];
      const text = '{--removed text--}';
      const result = createCodeLenses(changes, text);

      // Should have 2 document-level lenses + 2 per-change lenses = 4 total
      expect(result).toHaveLength(4);

      // Find per-change lenses
      const perChangeLenses = result.filter(lens =>
        lens.command?.arguments?.[0] === 'change-2'
      );
      expect(perChangeLenses).toHaveLength(2);
      expect(perChangeLenses[0].command?.title).toBe('Accept');
      expect(perChangeLenses[1].command?.title).toBe('Reject');
    });

    it('should position lenses on line before multi-line change', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-3',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 30 }, // Starts at offset 6 (line 1)
          contentRange: { start: 9, end: 26 },
          level: 0, anchored: false
        }
      ];
      const text = 'line1\n{++multi-line\ntext++}';
      const result = createCodeLenses(changes, text);

      // Find per-change lenses (not document-level)
      const perChangeLenses = result.filter(lens =>
        lens.command?.arguments?.[0] === 'change-3'
      );

      // Per-change lens should be at line 1 (where change starts), char 0
      expect(perChangeLenses[0].range.start.line).toBe(1);
      expect(perChangeLenses[0].range.start.character).toBe(0);
    });

    it('should create document-level lenses when changes exist', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 15 },
          contentRange: { start: 3, end: 13 },
          level: 0, anchored: false
        },
        {
          id: 'change-2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 16, end: 33 },
          contentRange: { start: 19, end: 31 },
          level: 0, anchored: false
        }
      ];
      const text = '{++added text++} {--removed text--}';
      const result = createCodeLenses(changes, text);

      // Should have 4 per-change lenses + 2 document-level lenses
      expect(result).toHaveLength(6);

      // Find document-level lenses (should be at line 0)
      const docLenses = result.filter(lens =>
        lens.command?.title.startsWith('Accept All') ||
        lens.command?.title.startsWith('Reject All')
      );
      expect(docLenses).toHaveLength(2);

      // Check document-level lens positions (both at line 0, char 0)
      expect(docLenses[0].range.start.line).toBe(0);
      expect(docLenses[0].range.start.character).toBe(0);
      expect(docLenses[1].range.start.line).toBe(0);
      expect(docLenses[1].range.start.character).toBe(0);

      // Check titles include count
      expect(docLenses[0].command?.title.includes('(2 changes)')).toBeTruthy();
      expect(docLenses[1].command?.title.includes('(2 changes)')).toBeTruthy();

      // Check commands
      const acceptAllLens = docLenses.find(l => l.command?.title.startsWith('Accept All'));
      const rejectAllLens = docLenses.find(l => l.command?.title.startsWith('Reject All'));
      expect(acceptAllLens?.command?.command).toBe('changetracks.acceptAll');
      expect(rejectAllLens?.command?.command).toBe('changetracks.rejectAll');
    });

    it('should not create document-level lenses when no changes exist', () => {
      const changes: ChangeNode[] = [];
      const text = 'No changes here';
      const result = createCodeLenses(changes, text);

      const docLenses = result.filter(lens =>
        lens.command?.title.startsWith('Accept All') ||
        lens.command?.title.startsWith('Reject All')
      );
      expect(docLenses).toHaveLength(0);
    });

    it('should handle multiple changes at different lines', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 }, // Line 0
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        },
        {
          id: 'change-2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 11, end: 21 }, // Line 1
          contentRange: { start: 14, end: 19 },
          level: 0, anchored: false
        },
        {
          id: 'change-3',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 22, end: 38 }, // Line 2
          contentRange: { start: 25, end: 36 },
          originalRange: { start: 25, end: 29 },
          modifiedRange: { start: 31, end: 36 },
          level: 0, anchored: false
        }
      ];
      const text = '{++text++}\n{--text--}\n{~~old~>new~~}';
      const result = createCodeLenses(changes, text);

      // 3 changes × 2 lenses per change + 2 document lenses = 8 total
      expect(result).toHaveLength(8);

      // Check that per-change lenses are at correct lines
      const change1Lenses = result.filter(l =>
        l.command?.arguments?.[0] === 'change-1'
      );
      expect(change1Lenses).toHaveLength(2);
      expect(change1Lenses[0].range.start.line).toBe(0);

      const change2Lenses = result.filter(l =>
        l.command?.arguments?.[0] === 'change-2'
      );
      expect(change2Lenses).toHaveLength(2);
      expect(change2Lenses[0].range.start.line).toBe(1);

      const change3Lenses = result.filter(l =>
        l.command?.arguments?.[0] === 'change-3'
      );
      expect(change3Lenses).toHaveLength(2);
      expect(change3Lenses[0].range.start.line).toBe(2);
    });

    it('should create lenses with singular change count', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        }
      ];
      const text = '{++text++}';
      const result = createCodeLenses(changes, text);

      const docLenses = result.filter(lens =>
        lens.command?.title.startsWith('Accept All') ||
        lens.command?.title.startsWith('Reject All')
      );

      expect(docLenses[0].command?.title.includes('(1 change)')).toBeTruthy();
      expect(docLenses[1].command?.title.includes('(1 change)')).toBeTruthy();
    });

    it('should handle change at offset 0 correctly', () => {
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        }
      ];
      const text = '{++text++}';
      const result = createCodeLenses(changes, text);

      // Per-change lenses should be at line 0, char 0
      const perChangeLenses = result.filter(l =>
        l.command?.command === 'changetracks.acceptChange' ||
        l.command?.command === 'changetracks.rejectChange'
      );
      expect(perChangeLenses[0].range.start.line).toBe(0);
      expect(perChangeLenses[0].range.start.character).toBe(0);
    });
  });
});
