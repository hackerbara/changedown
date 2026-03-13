import * as assert from 'assert';
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.severity, DiagnosticSeverity.Hint);
      assert.strictEqual(diag.source, 'changetracks');
      assert.strictEqual(diag.code, 'change-1');
      assert.strictEqual(diag.message, 'Insertion: world');
      assert.deepStrictEqual(diag.data, { changeId: 'change-1', changeType: ChangeType.Insertion });

      // Verify range conversion
      assert.strictEqual(diag.range.start.line, 0);
      assert.strictEqual(diag.range.start.character, 6);
      assert.strictEqual(diag.range.end.line, 0);
      assert.strictEqual(diag.range.end.character, 17);
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.message, 'Deletion: world');
      assert.deepStrictEqual(diag.data, { changeId: 'change-2', changeType: ChangeType.Deletion });
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.message, 'Substitution: world → universe');
      assert.deepStrictEqual(diag.data, { changeId: 'change-3', changeType: ChangeType.Substitution });
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.message, 'Highlight: world');
      assert.deepStrictEqual(diag.data, { changeId: 'change-4', changeType: ChangeType.Highlight });
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.message, 'Comment: this is a note');
      assert.deepStrictEqual(diag.data, { changeId: 'change-5', changeType: ChangeType.Comment });
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      assert.strictEqual(diag.message, 'Highlight: world (note)');
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      // Verify multi-line range
      assert.strictEqual(diag.range.start.line, 1);
      assert.strictEqual(diag.range.start.character, 0);
      assert.strictEqual(diag.range.end.line, 2);
      assert.strictEqual(diag.range.end.character, 9);

      assert.strictEqual(diag.message, 'Insertion: Line 2\nLine 3');
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
          level: 0, anchored: false
        },
        {
          id: 'change-9',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 23, end: 35 },
          contentRange: { start: 26, end: 32 },
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 2);
      assert.strictEqual(diagnostics[0].message, 'Insertion: insert');
      assert.strictEqual(diagnostics[1].message, 'Deletion: delete');
    });

    it('should handle empty changes array', () => {
      const text = 'Plain text with no changes';
      const changes: ChangeNode[] = [];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 0);
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      // Message should be truncated to reasonable length
      assert.ok(diag.message.length < 150);
      assert.ok(diag.message.endsWith('...'));
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
          level: 0, anchored: false
        }
      ];

      const diagnostics = createDiagnostics(changes, text);

      assert.strictEqual(diagnostics.length, 1);
      const diag = diagnostics[0];

      // Verify CRLF handling
      assert.strictEqual(diag.range.start.line, 1);
      assert.strictEqual(diag.range.start.character, 0);
    });
  });
});
