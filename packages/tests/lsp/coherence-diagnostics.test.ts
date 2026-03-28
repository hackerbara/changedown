import { describe, it, expect } from 'vitest';
import { createDiagnostics } from '@changedown/lsp-server/internals';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ChangeType, ChangeStatus } from '@changedown/core';
import type { ChangeNode, UnresolvedDiagnostic } from '@changedown/core';

describe('diagnostics with unanchored changes', () => {
  const text = 'Line 0\nLine 1\nLine 2\n';

  it('emits Hint diagnostic for resolved changes', () => {
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 7, end: 13 }, contentRange: { start: 7, end: 13 },
      level: 2, anchored: true,
    }];
    const result = createDiagnostics(changes, text);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(DiagnosticSeverity.Hint);
  });

  it('emits Warning diagnostic for unresolved L2+ changes', () => {
    const changes: ChangeNode[] = [{
      id: 'cn-5', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false,
    }];
    const unresolvedDiagnostics: UnresolvedDiagnostic[] = [{
      changeId: 'cn-5',
      expectedText: 'Protocol overview',
      actualLineContent: 'Security architecture',
      attemptedPaths: ['hash', 'relocation', 'context', 'replay'],
    }];
    const result = createDiagnostics(changes, text, unresolvedDiagnostics);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(result[0].message).toContain('Unresolved');
    expect(result[0].code).toBe('cn-5');
  });

  it('does not emit diagnostics for L0/L1 unanchored changes', () => {
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 1, anchored: false,
    }];
    const result = createDiagnostics(changes, text);
    expect(result).toHaveLength(0);
  });

  it('handles unresolvedDiagnostics entries with no matching change gracefully', () => {
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false,
    }];
    const unresolvedDiagnostics: UnresolvedDiagnostic[] = [{
      changeId: 'cn-999', // no matching change
      expectedText: 'ghost',
      actualLineContent: '',
      attemptedPaths: ['hash'],
    }];
    const result = createDiagnostics(changes, text, unresolvedDiagnostics);
    // cn-1 should still get a Warning (fallback message, no detail from map)
    const warning = result.find(d => d.code === 'cn-1');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('Unresolved');
  });
});
