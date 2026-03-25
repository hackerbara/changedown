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
      expect(perChangeActions).toHaveLength(4);

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept insertion');
      expect(acceptAction.kind).toBe(CodeActionKind.QuickFix);
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.command!.arguments).toContain('change-1');
      expect(acceptAction.edit).toBeUndefined();

      // Reject action
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject insertion');
      expect(rejectAction.kind).toBe(CodeActionKind.QuickFix);
      expect(rejectAction.command).toBeDefined();
      expect(rejectAction.command!.command).toBe('changetracks.rejectChange');
      expect(rejectAction.command!.arguments).toContain('change-1');
      expect(rejectAction.edit).toBeUndefined();
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
      expect(perChangeActions).toHaveLength(4);

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept deletion');
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.edit).toBeUndefined();

      // Reject action
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject deletion');
      expect(rejectAction.command).toBeDefined();
      expect(rejectAction.command!.command).toBe('changetracks.rejectChange');
      expect(rejectAction.edit).toBeUndefined();
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
      expect(perChangeActions).toHaveLength(4);

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Accept substitution');
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.edit).toBeUndefined();

      // Reject action
      const rejectAction = perChangeActions[1];
      expect(rejectAction.title).toBe('Reject substitution');
      expect(rejectAction.command).toBeDefined();
      expect(rejectAction.command!.command).toBe('changetracks.rejectChange');
      expect(rejectAction.edit).toBeUndefined();
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
      expect(perChangeActions).toHaveLength(4);

      expect(perChangeActions[0].command!.command).toBe('changetracks.acceptChange');
      expect(perChangeActions[0].command!.arguments).toContain('change-4');
      expect(perChangeActions[1].command!.command).toBe('changetracks.rejectChange');
      expect(perChangeActions[1].command!.arguments).toContain('change-4');
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

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Remove highlight');
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.edit).toBeUndefined();
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

      // Accept action
      const acceptAction = perChangeActions[0];
      expect(acceptAction.title).toBe('Remove comment');
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.edit).toBeUndefined();
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
      expect(bulkAccept!.command).toBeDefined();
      expect(bulkAccept!.command!.command).toBe('changetracks.acceptAll');
      expect(bulkAccept!.edit).toBeUndefined();
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
      expect(bulkReject!.command).toBeDefined();
      expect(bulkReject!.command!.command).toBe('changetracks.rejectAll');
      expect(bulkReject!.edit).toBeUndefined();
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
      expect(bulkAccept!.command).toBeDefined();
      expect(bulkAccept!.command!.command).toBe('changetracks.acceptAll');
      expect(bulkAccept!.edit).toBeUndefined();
    });
  });

  describe('request-changes code action', () => {
    it('creates request-changes action for proposed insertion', () => {
      const change: ChangeNode = {
        id: 'change-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 6, end: 17 },
        contentRange: { start: 9, end: 14 },
        modifiedText: 'world',
        level: 0, anchored: false
      };
      const text = 'Hello {++world++}!';
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: world',
        code: 'change-1',
        data: { changeId: 'change-1' }
      };
      const actions = createCodeActions(diagnostic, [change], text, 'file:///test.md');
      const rcAction = actions.find(a => a.title === 'Request changes');
      expect(rcAction).toBeDefined();
      expect(rcAction!.command!.command).toBe('changetracks.requestChanges');
      expect(rcAction!.command!.arguments).toContain('change-1');
    });
  });

  describe('withdraw code action', () => {
    it('creates withdraw action for proposed changes', () => {
      const change: ChangeNode = {
        id: 'change-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 6, end: 17 },
        contentRange: { start: 9, end: 14 },
        modifiedText: 'world',
        level: 0, anchored: false
      };
      const text = 'Hello {++world++}!';
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Insertion: world',
        code: 'change-1',
        data: { changeId: 'change-1' }
      };
      const actions = createCodeActions(diagnostic, [change], text, 'file:///test.md');
      const withdrawAction = actions.find(a => a.title === 'Withdraw request');
      expect(withdrawAction).toBeDefined();
      expect(withdrawAction!.command!.command).toBe('changetracks.withdrawRequest');
      expect(withdrawAction!.command!.arguments).toContain('change-1');
    });
  });

  describe('createCodeActions - Consumed ops', () => {
    const text = 'Some document text with changes';
    const uri = 'file:///test.md';

    it('offers navigate and compact actions for consumed op diagnostic', () => {
      const changes: ChangeNode[] = [{
        id: 'ct-3',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        anchored: false,
        level: 2,
        consumedBy: 'ct-5',
        range: { start: 100, end: 120 },
        contentRange: { start: 103, end: 117 },
        modifiedText: 'some text',
      }];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Consumed by ct-5',
        code: 'ct-3',
        data: { changeId: 'ct-3', changeType: ChangeType.Insertion, consumed: true, consumedBy: 'ct-5' },
      };
      const actions = createCodeActions(diagnostic, changes, text, uri);
      const titles = actions.map(a => a.title);

      // Should offer navigation to consuming change
      expect(titles.some(t => /Go to.*ct-5/.test(t))).toBe(true);
      // Should offer compact action
      expect(titles.some(t => /Compact/i.test(t))).toBe(true);
      // No per-change accept/reject for consumed ops (bulk actions excluded from check)
      const perChangeActions = actions.filter(a => a.kind === CodeActionKind.QuickFix || a.kind === 'refactor.rewrite');
      const perChangeTitles = perChangeActions.map(a => a.title);
      expect(perChangeTitles.some(t => /Accept/i.test(t))).toBe(false);
      expect(perChangeTitles.some(t => /Reject/i.test(t))).toBe(false);
    });

    it('omits compact action when change has active discussion thread', () => {
      const changes: ChangeNode[] = [{
        id: 'ct-3',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        anchored: false,
        level: 2,
        consumedBy: 'ct-5',
        replyCount: 2,
        range: { start: 100, end: 120 },
        contentRange: { start: 103, end: 117 },
        modifiedText: 'some text',
      }];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Consumed by ct-5',
        code: 'ct-3',
        data: { changeId: 'ct-3', changeType: ChangeType.Insertion, consumed: true, consumedBy: 'ct-5' },
      };
      const actions = createCodeActions(diagnostic, changes, text, uri);
      const titles = actions.map(a => a.title);

      // Should still offer navigation
      expect(titles.some(t => /Go to.*ct-5/.test(t))).toBe(true);
      // Should NOT offer compact when thread is active
      expect(titles.some(t => /Compact/i.test(t))).toBe(false);
    });

    it('routes consumed op through navigate command to consuming change', () => {
      const changes: ChangeNode[] = [{
        id: 'ct-3',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        anchored: false,
        level: 2,
        consumedBy: 'ct-5',
        range: { start: 100, end: 120 },
        contentRange: { start: 103, end: 117 },
        modifiedText: 'some text',
      }];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Consumed by ct-5',
        code: 'ct-3',
        data: { changeId: 'ct-3', changeType: ChangeType.Insertion, consumed: true, consumedBy: 'ct-5' },
      };
      const actions = createCodeActions(diagnostic, changes, text, uri);
      const navigateAction = actions.find(a => /Go to/.test(a.title));

      expect(navigateAction).toBeDefined();
      expect(navigateAction!.command!.command).toBe('changetracks.jumpToFootnote');
      expect(navigateAction!.command!.arguments).toContain('ct-5');
    });

    it('routes compact action to compactChange command', () => {
      const changes: ChangeNode[] = [{
        id: 'ct-3',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        anchored: false,
        level: 2,
        consumedBy: 'ct-5',
        range: { start: 100, end: 120 },
        contentRange: { start: 103, end: 117 },
        modifiedText: 'some text',
      }];
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: DiagnosticSeverity.Information,
        source: 'changetracks',
        message: 'Consumed by ct-5',
        code: 'ct-3',
        data: { changeId: 'ct-3', changeType: ChangeType.Insertion, consumed: true, consumedBy: 'ct-5' },
      };
      const actions = createCodeActions(diagnostic, changes, text, uri);
      const compactAction = actions.find(a => /Compact/i.test(a.title));

      expect(compactAction).toBeDefined();
      expect(compactAction!.command!.command).toBe('changetracks.compactChange');
      expect(compactAction!.command!.arguments).toContain('ct-3');
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
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.command!.arguments).toContain('change-12');
      expect(acceptAction.edit).toBeUndefined();
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
      expect(acceptAction.command).toBeDefined();
      expect(acceptAction.command!.command).toBe('changetracks.acceptChange');
      expect(acceptAction.edit).toBeUndefined();
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
      const bulkAccept = actions.find(a => a.title === 'Accept all changes');
      const bulkReject = actions.find(a => a.title === 'Reject all changes');
      expect(bulkAccept).toBeTruthy();
      expect(bulkReject).toBeTruthy();
      expect(bulkAccept!.command!.command).toBe('changetracks.acceptAll');
      expect(bulkReject!.command!.command).toBe('changetracks.rejectAll');
    });
  });
});
