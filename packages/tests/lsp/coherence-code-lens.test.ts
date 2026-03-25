import { describe, it, expect } from 'vitest';
import { createCodeLenses } from '@changetracks/lsp-server/internals';
import { ChangeType, ChangeStatus } from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';

describe('code lenses with unanchored changes', () => {
  it('skips unanchored changes for per-change lenses', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false, settled: false,
    }];
    const result = createCodeLenses(changes, text, 'review', 'always');
    // Should have no per-change lenses (unanchored filtered out)
    const perChangeLenses = result.filter(l =>
      l.command?.command === 'changetracks.acceptChange' ||
      l.command?.command === 'changetracks.rejectChange'
    );
    expect(perChangeLenses).toHaveLength(0);
  });

  it('emits document-level lens when coherenceRate < 100', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false, settled: false,
    }];
    const result = createCodeLenses(changes, text, 'review', 'always', undefined, 50);
    const docLens = result.find(l =>
      l.command?.command === 'changetracks.inspectUnresolved'
    );
    expect(docLens).toBeDefined();
    expect(docLens!.command!.title).toContain('unresolved');
  });

  it('shows document-level lens in settled view mode', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false, settled: false,
    }];
    const result = createCodeLenses(changes, text, 'settled', 'always', undefined, 50);
    const docLens = result.find(l =>
      l.command?.command === 'changetracks.inspectUnresolved'
    );
    expect(docLens).toBeDefined();
  });

  it('suppresses all lenses including coherence in off mode', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false, settled: false,
    }];
    const result = createCodeLenses(changes, text, 'review', 'off', undefined, 50);
    expect(result).toHaveLength(0);
  });
});
