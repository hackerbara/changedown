import { describe, it, expect } from 'vitest';
import { createCodeActions } from '@changetracks/lsp-server/internals';
import { ChangeType, ChangeStatus } from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';

describe('code actions for unresolved changes', () => {
  it('offers search and jump actions for unresolved diagnostics', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changetracks',
      message: 'Unresolved anchor',
      code: 'ct-5',
      data: { changeId: 'ct-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const searchAction = result.find(a => a.command?.command === 'changetracks.searchAnchorText');
    const jumpAction = result.find(a => a.command?.command === 'changetracks.jumpToFootnote');
    expect(searchAction).toBeDefined();
    expect(jumpAction).toBeDefined();
  });

  it('passes the changeId as argument to both unresolved actions', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changetracks',
      message: 'Unresolved anchor',
      code: 'ct-5',
      data: { changeId: 'ct-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const searchAction = result.find(a => a.command?.command === 'changetracks.searchAnchorText');
    const jumpAction = result.find(a => a.command?.command === 'changetracks.jumpToFootnote');
    expect(searchAction?.command?.arguments).toContain('ct-5');
    expect(jumpAction?.command?.arguments).toContain('ct-5');
  });

  it('uses QuickFix kind for both unresolved actions', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changetracks',
      message: 'Unresolved anchor',
      code: 'ct-5',
      data: { changeId: 'ct-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const unresolvedActions = result.filter(
      a => a.command?.command === 'changetracks.searchAnchorText' ||
           a.command?.command === 'changetracks.jumpToFootnote'
    );
    expect(unresolvedActions).toHaveLength(2);
    for (const action of unresolvedActions) {
      expect(action.kind).toBe('quickfix');
    }
  });

  it('does not offer accept/reject for unresolved diagnostics', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changetracks',
      message: 'Unresolved anchor',
      code: 'ct-5',
      data: { changeId: 'ct-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const acceptAction = result.find(a => a.command?.command === 'changetracks.acceptChange');
    const rejectAction = result.find(a => a.command?.command === 'changetracks.rejectChange');
    expect(acceptAction).toBeUndefined();
    expect(rejectAction).toBeUndefined();
  });

  it('offers accept/reject for resolved diagnostics (existing behavior)', () => {
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
      level: 2, anchored: true,
    }];
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 4, // Hint
      source: 'changetracks',
      message: 'Insertion: hello',
      code: 'ct-1',
      data: { changeId: 'ct-1', changeType: ChangeType.Insertion },
    };
    const result = createCodeActions(diagnostic as any, changes, 'hello\n', 'file:///test.md');
    const acceptAction = result.find(a => a.title.includes('Accept'));
    expect(acceptAction).toBeDefined();
  });
});
