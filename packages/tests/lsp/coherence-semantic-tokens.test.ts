import { describe, it, expect } from 'vitest';
import { buildSemanticTokens } from '@changedown/lsp-server/internals';
import { ChangeType, ChangeStatus } from '@changedown/core';
import type { ChangeNode } from '@changedown/core';

describe('semantic tokens with unanchored changes', () => {
  it('skips unanchored changes (no tokens at sentinel 0,0)', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false,
    }];
    const result = buildSemanticTokens(changes, text);
    expect(result.data).toHaveLength(0);
  });

  it('emits tokens for anchored changes', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
      level: 2, anchored: true,
    }];
    const result = buildSemanticTokens(changes, text);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
