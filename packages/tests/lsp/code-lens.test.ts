import { describe, it, expect } from 'vitest';
import { createCodeLenses, Position, Range } from '@changedown/lsp-server/internals';
import type { CodeLens, Command } from '@changedown/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changedown/core';

describe('Code Lens', () => {
  describe('createCodeLenses', () => {
    it('should return empty array for no changes', () => {
      const changes: ChangeNode[] = [];
      const text = 'Some text without changes';
      const result = createCodeLenses(changes, text, undefined, 'always');
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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // Should have 2 per-change lenses (Accept + Reject)
      expect(result).toHaveLength(2);

      // Both per-change lenses should be positioned at line 0 (where the change is)
      expect(result[0].range.start.line).toBe(0);
      expect(result[0].range.start.character).toBe(0);
      expect(result[1].range.start.line).toBe(0);
      expect(result[1].range.start.character).toBe(0);

      // Check commands
      const acceptLens = result.find(l => l.command?.title === 'Accept');
      const rejectLens = result.find(l => l.command?.title === 'Reject');

      expect(acceptLens?.command?.command).toBe('changedown.acceptChange');
      expect(acceptLens?.command?.arguments).toStrictEqual(['change-1']);

      expect(rejectLens?.command?.command).toBe('changedown.rejectChange');
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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // Should have 2 per-change lenses (Accept + Reject)
      expect(result).toHaveLength(2);

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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // Find per-change lenses (not document-level)
      const perChangeLenses = result.filter(lens =>
        lens.command?.arguments?.[0] === 'change-3'
      );

      // Per-change lens should be at line 1 (where change starts), char 0
      expect(perChangeLenses[0].range.start.line).toBe(1);
      expect(perChangeLenses[0].range.start.character).toBe(0);
    });

    it('should create per-change lenses for multiple changes in always mode', () => {
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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // 2 changes x 2 per-change lenses = 4 total (no document-level lenses in always mode)
      expect(result).toHaveLength(4);

      // Check that we have per-change lenses
      const perChangeLenses = result.filter(lens =>
        lens.command?.command === 'changedown.acceptChange' ||
        lens.command?.command === 'changedown.rejectChange'
      );
      expect(perChangeLenses).toHaveLength(4);
    });

    it('should not create lenses when no changes exist', () => {
      const changes: ChangeNode[] = [];
      const text = 'No changes here';
      const result = createCodeLenses(changes, text, undefined, 'always');
      expect(result).toHaveLength(0);
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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // 3 changes x 2 lenses per change = 6 total
      expect(result).toHaveLength(6);

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

    it('should return empty array in default cursor mode without cursor state', () => {
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
      // Default mode is 'cursor', no cursorState provided → empty
      const result = createCodeLenses(changes, text);
      expect(result).toHaveLength(0);
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
      const result = createCodeLenses(changes, text, undefined, 'always');

      // Per-change lenses should be at line 0, char 0
      const perChangeLenses = result.filter(l =>
        l.command?.command === 'changedown.acceptChange' ||
        l.command?.command === 'changedown.rejectChange'
      );
      expect(perChangeLenses[0].range.start.line).toBe(0);
      expect(perChangeLenses[0].range.start.character).toBe(0);
    });
    it('excludes consumed ops from actionable change count', () => {
      const changes: ChangeNode[] = [
        {
          id: 'cn-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 15 },
          contentRange: { start: 3, end: 13 },
          level: 2,
          anchored: true,
        },
        {
          id: 'cn-2',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 16, end: 31 },
          contentRange: { start: 19, end: 29 },
          level: 2,
          anchored: true,
          consumedBy: 'cn-3',
        },
        {
          id: 'cn-3',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 32, end: 47 },
          contentRange: { start: 35, end: 45 },
          level: 2,
          anchored: true,
        },
      ];
      const text = '{++first change++} {++consumed op++} {++third change++}';
      const lenses = createCodeLenses(changes, text, 'review', 'always');

      // cn-2 is consumed — should not generate a per-change lens
      const perChangeLenses = lenses.filter(
        l => l.command?.command === 'changedown.acceptChange' ||
             l.command?.command === 'changedown.rejectChange'
      );
      const lensChangeIds = perChangeLenses
        .map(l => l.command?.arguments?.[0])
        .filter(Boolean);

      // Only cn-1 and cn-3 should have lenses (not cn-2)
      expect(lensChangeIds).not.toContain('cn-2');
      expect(lensChangeIds).toContain('cn-1');
      expect(lensChangeIds).toContain('cn-3');
      // 2 actionable changes × 2 lenses each = 4 per-change lenses
      expect(perChangeLenses).toHaveLength(4);
    });
  });
});
