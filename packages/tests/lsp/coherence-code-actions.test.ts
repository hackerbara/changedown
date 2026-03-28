import { describe, it, expect } from 'vitest';
import { createCodeActions } from '@changedown/lsp-server/internals';
import { ChangeType, ChangeStatus } from '@changedown/core';
import type { ChangeNode } from '@changedown/core';

describe('code actions for unresolved changes', () => {
  it('offers search and jump actions for unresolved diagnostics', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changedown',
      message: 'Unresolved anchor',
      code: 'cn-5',
      data: { changeId: 'cn-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const searchAction = result.find(a => a.command?.command === 'changedown.searchAnchorText');
    const jumpAction = result.find(a => a.command?.command === 'changedown.jumpToFootnote');
    expect(searchAction).toBeDefined();
    expect(jumpAction).toBeDefined();
  });

  it('passes the changeId as argument to both unresolved actions', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changedown',
      message: 'Unresolved anchor',
      code: 'cn-5',
      data: { changeId: 'cn-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const searchAction = result.find(a => a.command?.command === 'changedown.searchAnchorText');
    const jumpAction = result.find(a => a.command?.command === 'changedown.jumpToFootnote');
    expect(searchAction?.command?.arguments).toContain('cn-5');
    expect(jumpAction?.command?.arguments).toContain('cn-5');
  });

  it('uses QuickFix kind for both unresolved actions', () => {
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: 2, // Warning
      source: 'changedown',
      message: 'Unresolved anchor',
      code: 'cn-5',
      data: { changeId: 'cn-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const unresolvedActions = result.filter(
      a => a.command?.command === 'changedown.searchAnchorText' ||
           a.command?.command === 'changedown.jumpToFootnote'
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
      source: 'changedown',
      message: 'Unresolved anchor',
      code: 'cn-5',
      data: { changeId: 'cn-5', changeType: ChangeType.Insertion, unresolved: true },
    };
    const changes: ChangeNode[] = [];
    const result = createCodeActions(diagnostic as any, changes, '', 'file:///test.md');
    const acceptAction = result.find(a => a.command?.command === 'changedown.acceptChange');
    const rejectAction = result.find(a => a.command?.command === 'changedown.rejectChange');
    expect(acceptAction).toBeUndefined();
    expect(rejectAction).toBeUndefined();
  });

  it('offers accept/reject for resolved diagnostics (existing behavior)', () => {
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
      level: 2, anchored: true,
    }];
    const diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 4, // Hint
      source: 'changedown',
      message: 'Insertion: hello',
      code: 'cn-1',
      data: { changeId: 'cn-1', changeType: ChangeType.Insertion },
    };
    const result = createCodeActions(diagnostic as any, changes, 'hello\n', 'file:///test.md');
    const acceptAction = result.find(a => a.title.includes('Accept'));
    expect(acceptAction).toBeDefined();
  });
});
