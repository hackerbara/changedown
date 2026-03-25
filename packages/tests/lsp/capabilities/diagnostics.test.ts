import { describe, it, expect } from 'vitest';
import { createDiagnostics, DiagnosticSeverity } from '@changetracks/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';

describe('Diagnostics', () => {
  describe('createDiagnostics', () => {
    it('should create diagnostic for insertion', () => {
      const text = 'Hello {++world++}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 }, // {++world++}
          contentRange: { start: 9, end: 14 }, // world,
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.severity).toBe(DiagnosticSeverity.Hint);
      expect(diag.source).toBe('changetracks');
      expect(diag.code).toBe('change-1');
      expect(diag.message).toBe('Insertion: world');
      expect(diag.data).toStrictEqual({ changeId: 'change-1', changeType: ChangeType.Insertion });

      // Verify range conversion
      expect(diag.range.start.line).toBe(0);
      expect(diag.range.start.character).toBe(6);
      expect(diag.range.end.line).toBe(0);
      expect(diag.range.end.character).toBe(17);
    });

    it('should create diagnostic for deletion', () => {
      const text = 'Hello {--world--}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.message).toBe('Deletion: world');
      expect(diag.data).toStrictEqual({ changeId: 'change-2', changeType: ChangeType.Deletion });
    });

    it('should create diagnostic for substitution', () => {
      const text = 'Hello {~~world~>universe~~}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-3',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 27 },
          contentRange: { start: 9, end: 24 },
          originalRange: { start: 9, end: 14 }, // world
          modifiedRange: { start: 16, end: 24 }, // universe
          originalText: 'world',
          modifiedText: 'universe',
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.message).toBe('Substitution: world → universe');
      expect(diag.data).toStrictEqual({ changeId: 'change-3', changeType: ChangeType.Substitution });
    });

    it('should create diagnostic for highlight', () => {
      const text = 'Hello {==world==}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-4',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.message).toBe('Highlight: world');
      expect(diag.data).toStrictEqual({ changeId: 'change-4', changeType: ChangeType.Highlight });
    });

    it('should create diagnostic for comment', () => {
      const text = 'Hello {>>this is a note<<}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-5',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 26 },
          contentRange: { start: 9, end: 23 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.message).toBe('Comment: this is a note');
      expect(diag.data).toStrictEqual({ changeId: 'change-5', changeType: ChangeType.Comment });
    });

    it('should handle highlight with attached comment', () => {
      const text = 'Hello {==world==}{>>note<<}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-6',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          metadata: {
            comment: 'note'
          },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      expect(diag.message).toBe('Highlight: world (note)');
    });

    it('should handle multi-line changes', () => {
      const text = 'Line 1\n{++Line 2\nLine 3++}\nLine 4';
      const changes: ChangeNode[] = [
        {
          id: 'change-7',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 7, end: 26 },
          contentRange: { start: 10, end: 23 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      // Verify multi-line range
      expect(diag.range.start.line).toBe(1);
      expect(diag.range.start.character).toBe(0);
      expect(diag.range.end.line).toBe(2);
      expect(diag.range.end.character).toBe(9);

      expect(diag.message).toBe('Insertion: Line 2\nLine 3');
    });

    it('should create diagnostics for multiple changes', () => {
      const text = '{++insert++} some text {--delete--}';
      const changes: ChangeNode[] = [
        {
          id: 'change-8',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 12 },
          contentRange: { start: 3, end: 9 },
          level: 0, anchored: true
        },
        {
          id: 'change-9',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 23, end: 35 },
          contentRange: { start: 26, end: 32 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].message).toBe('Insertion: insert');
      expect(diagnostics[1].message).toBe('Deletion: delete');
    });

    it('should handle empty changes array', () => {
      const text = 'Plain text with no changes';
      const changes: ChangeNode[] = [];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(0);
    });

    it('should truncate long content in message', () => {
      const longText = 'a'.repeat(100);
      const text = `{++${longText}++}`;
      const changes: ChangeNode[] = [
        {
          id: 'change-10',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: text.length },
          contentRange: { start: 3, end: text.length - 3 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      // Message should be truncated to reasonable length
      expect(diag.message.length < 150).toBeTruthy();
      expect(diag.message.endsWith('...')).toBeTruthy();
    });

    it('should handle CRLF line endings', () => {
      const text = 'Line 1\r\n{++Line 2++}\r\nLine 3';
      const changes: ChangeNode[] = [
        {
          id: 'change-11',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 8, end: 20 },
          contentRange: { start: 11, end: 17 },
          level: 0, anchored: true
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];

      // Verify CRLF handling
      expect(diag.range.start.line).toBe(1);
      expect(diag.range.start.character).toBe(0);
    });

    it('emits Information diagnostic for consumed change', () => {
      const text = 'Some document text.\n\n[^ct-3]: {++inserted text++}';
      const changes: ChangeNode[] = [
        {
          id: 'ct-3',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          anchored: false,
          level: 2,
          consumedBy: 'ct-5',
          range: { start: 21, end: 49 }, // footnote block range
          contentRange: { start: 31, end: 44 }, // inserted text
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Information);
      expect(diagnostics[0].message).toContain('Consumed by ct-5');
      expect(diagnostics[0].data).toMatchObject({ consumed: true, consumedBy: 'ct-5' });
    });

    it('emits Information diagnostic with partial consumption label', () => {
      const text = 'Some document text.\n\n[^ct-7]: {++partial text++}';
      const changes: ChangeNode[] = [
        {
          id: 'ct-7',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          anchored: false,
          level: 2,
          consumedBy: 'ct-9',
          consumptionType: 'partial',
          range: { start: 21, end: 48 },
          contentRange: { start: 31, end: 43 },
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Information);
      expect(diagnostics[0].message).toContain('Partially consumed by ct-9');
    });
  });
});
