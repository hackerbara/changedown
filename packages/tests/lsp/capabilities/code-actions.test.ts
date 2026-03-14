import { describe, it, expect } from 'vitest';
import { createCodeActions, CodeActionKind, DiagnosticSeverity } from '@changetracks/lsp-server/internals';
import type { Diagnostic } from '@changetracks/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';

describe('Code Actions', () => {
  describe('createCodeActions - Insertions', () => {
    it('should create accept and reject actions for insertion', () => {
      const text = 'Hello {++world++}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          modifiedText: 'world',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: world',
        code: 'change-1',
        data: { changeId: 'change-1', changeType: ChangeType.Insertion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Should have 2 per-change actions + 2 bulk actions
      expect(actions.length >= 2).toBeTruthy();

      // Filter for per-change actions (QuickFix kind)
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(2);

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept insertion');
      expect(acceptAction.kind).toBe(CodeActionKind.QuickFix);
      expect(acceptAction.edit).toBeTruthy();
      expect(acceptAction.edit.changes).toBeTruthy();

      // Should remove delimiters, keep content
      const acceptEdits = acceptAction.edit.changes!['file:///test.md'];
      expect(acceptEdits).toHaveLength(1);
      expect(acceptEdits[0].newText).toBe('world');
      expect(acceptEdits[0].range).toStrictEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 17 }
      });

      // Reject action
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject insertion');
      expect(rejectAction.kind).toBe(CodeActionKind.QuickFix);
      expect(rejectAction.edit).toBeTruthy();

      // Should remove entire markup
      const rejectEdits = rejectAction.edit.changes!['file:///test.md'];
      expect(rejectEdits).toHaveLength(1);
      expect(rejectEdits[0].newText).toBe('');
      expect(rejectEdits[0].range).toStrictEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 17 }
      });
    });
  });

  describe('createCodeActions - Deletions', () => {
    it('should create accept and reject actions for deletion', () => {
      const text = 'Hello {--world--}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          originalText: 'world',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Deletion: world',
        code: 'change-2',
        data: { changeId: 'change-2', changeType: ChangeType.Deletion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(2);

      // Accept action - should remove entire markup including content
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept deletion');
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('');

      // Reject action - should remove delimiters, keep content
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject deletion');
      const rejectEdits = rejectAction.edit!.changes!['file:///test.md'];
      expect(rejectEdits[0].newText).toBe('world');
    });
  });

  describe('createCodeActions - Substitutions', () => {
    it('should create accept and reject actions for substitution', () => {
      const text = 'Hello {~~world~>universe~~}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-3',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 27 },
          contentRange: { start: 9, end: 24 },
          originalRange: { start: 9, end: 14 },
          modifiedRange: { start: 16, end: 24 },
          originalText: 'world',
          modifiedText: 'universe',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 27 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Substitution: world → universe',
        code: 'change-3',
        data: { changeId: 'change-3', changeType: ChangeType.Substitution }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(2);

      // Accept action - should replace with modified text
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept substitution');
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('universe');

      // Reject action - should replace with original text
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject substitution');
      const rejectEdits = rejectAction.edit!.changes!['file:///test.md'];
      expect(rejectEdits[0].newText).toBe('world');
    });

    it('should handle substitution with short text', () => {
      const text = 'Hello {~~old~>new~~}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-4',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 20 },
          contentRange: { start: 9, end: 17 },
          originalRange: { start: 9, end: 12 },
          modifiedRange: { start: 14, end: 17 },
          originalText: 'old',
          modifiedText: 'new',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 20 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Substitution: old → new',
        code: 'change-4',
        data: { changeId: 'change-4', changeType: ChangeType.Substitution }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(2);

      // Should use originalText/modifiedText from the change node
      const acceptEdits = perChangeActions[0].edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('new');

      const rejectEdits = perChangeActions[1].edit!.changes!['file:///test.md'];
      expect(rejectEdits[0].newText).toBe('old');
    });
  });

  describe('createCodeActions - Highlights and Comments', () => {
    it('should create accept action for highlight', () => {
      const text = 'Hello {==world==}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-5',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 17 },
          contentRange: { start: 9, end: 14 },
          originalText: 'world',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Highlight: world',
        code: 'change-5',
        data: { changeId: 'change-5', changeType: ChangeType.Highlight }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions (highlights only have 1 action)
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(1);

      // Accept action - remove markup, keep content
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Remove highlight');
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('world');
    });

    it('should create accept action for comment', () => {
      const text = 'Hello {>>note<<}!';
      const changes: ChangeNode[] = [
        {
          id: 'change-6',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 6, end: 16 },
          contentRange: { start: 9, end: 13 },
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 16 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Comment: note',
        code: 'change-6',
        data: { changeId: 'change-6', changeType: ChangeType.Comment }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions (comments only have 1 action)
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions).toHaveLength(1);

      // Accept action - remove entire comment
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Remove comment');
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('');
    });
  });

  describe('createCodeActions - Bulk Operations', () => {
    it('should create bulk accept all action', () => {
      const text = '{++insert++} some {--delete--} text';
      const changes: ChangeNode[] = [
        {
          id: 'change-7',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 12 },
          contentRange: { start: 3, end: 9 },
          modifiedText: 'insert',
          level: 0, anchored: false
        },
        {
          id: 'change-8',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 18, end: 30 },
          contentRange: { start: 21, end: 27 },
          originalText: 'delete',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: insert',
        code: 'change-7',
        data: { changeId: 'change-7', changeType: ChangeType.Insertion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Should have per-change actions + bulk actions
      expect(actions.length >= 4).toBeTruthy(); // 2 per-change + 2 bulk

      // Find bulk accept action
      const bulkAccept = actions.find(a => a.title === 'Accept all changes');
      expect(bulkAccept).toBeTruthy();
      expect(bulkAccept!.kind).toBe(CodeActionKind.Source);

      // Should process in reverse order to preserve ranges
      const edits = bulkAccept!.edit!.changes!['file:///test.md'];
      expect(edits).toHaveLength(2);

      // First edit should be for the deletion (later in document)
      expect(edits[0].range.start.character).toBe(18);
      expect(edits[0].newText).toBe('');

      // Second edit should be for the insertion
      expect(edits[1].range.start.character).toBe(0);
      expect(edits[1].newText).toBe('insert');
    });

    it('should create bulk reject all action', () => {
      const text = '{++insert++} some {--delete--} text';
      const changes: ChangeNode[] = [
        {
          id: 'change-9',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 12 },
          contentRange: { start: 3, end: 9 },
          modifiedText: 'insert',
          level: 0, anchored: false
        },
        {
          id: 'change-10',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 18, end: 30 },
          contentRange: { start: 21, end: 27 },
          originalText: 'delete',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: insert',
        code: 'change-9',
        data: { changeId: 'change-9', changeType: ChangeType.Insertion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Find bulk reject action
      const bulkReject = actions.find(a => a.title === 'Reject all changes');
      expect(bulkReject).toBeTruthy();
      expect(bulkReject!.kind).toBe(CodeActionKind.Source);

      // Should process in reverse order
      const edits = bulkReject!.edit!.changes!['file:///test.md'];
      expect(edits).toHaveLength(2);

      // First edit should be for the deletion (reject = keep content)
      expect(edits[0].range.start.character).toBe(18);
      expect(edits[0].newText).toBe('delete');

      // Second edit should be for the insertion (reject = remove all)
      expect(edits[1].range.start.character).toBe(0);
      expect(edits[1].newText).toBe('');
    });

    it('should handle bulk operations with substitutions', () => {
      const text = '{~~old~>new~~} text';
      const changes: ChangeNode[] = [
        {
          id: 'change-11',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          originalRange: { start: 3, end: 6 },
          modifiedRange: { start: 8, end: 11 },
          originalText: 'old',
          modifiedText: 'new',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 14 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Substitution: old → new',
        code: 'change-11',
        data: { changeId: 'change-11', changeType: ChangeType.Substitution }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      const bulkAccept = actions.find(a => a.title === 'Accept all changes');
      expect(bulkAccept).toBeTruthy();

      const edits = bulkAccept!.edit!.changes!['file:///test.md'];
      expect(edits).toHaveLength(1);
      expect(edits[0].newText).toBe('new');
    });
  });

  describe('createCodeActions - Edge Cases', () => {
    it('should handle multi-line changes', () => {
      const text = 'Line 1\n{++Line 2\nLine 3++}\nLine 4';
      const changes: ChangeNode[] = [
        {
          id: 'change-12',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 7, end: 26 },
          contentRange: { start: 10, end: 23 },
          modifiedText: 'Line 2\nLine 3',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 1, character: 0 }, end: { line: 2, character: 9 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: Line 2\nLine 3',
        code: 'change-12',
        data: { changeId: 'change-12', changeType: ChangeType.Insertion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions.length >= 2).toBeTruthy();

      const acceptAction = perChangeActions[0];
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('Line 2\nLine 3');
    });

    it('should handle CRLF line endings', () => {
      const text = 'Line 1\r\n{++Line 2++}\r\nLine 3';
      const changes: ChangeNode[] = [
        {
          id: 'change-13',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 8, end: 20 },
          contentRange: { start: 11, end: 17 },
          modifiedText: 'Line 2',
          level: 0, anchored: false
        }
      ];
      const diagnostic: Diagnostic = {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 12 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: Line 2',
        code: 'change-13',
        data: { changeId: 'change-13', changeType: ChangeType.Insertion }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Filter for per-change actions
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix);
      expect(perChangeActions.length >= 2).toBeTruthy();

      const acceptAction = perChangeActions[0];
      const acceptEdits = acceptAction.edit!.changes!['file:///test.md'];
      expect(acceptEdits[0].newText).toBe('Line 2');
    });

    it('should return empty array for unknown change type', () => {
      const text = 'Hello world!';
      const changes: ChangeNode[] = [];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Unknown change',
        code: 'change-14',
        data: { changeId: 'change-14', changeType: 'Unknown' as any }
      };

      const actions = createCodeActions(diagnostic, changes, text, 'file:///test.md');

      // Should still have bulk actions
      expect(actions.length >= 2).toBeTruthy();
      expect(actions.find(a => a.title === 'Accept all changes')).toBeTruthy();
      expect(actions.find(a => a.title === 'Reject all changes')).toBeTruthy();
    });
  });
});
