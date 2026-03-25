import { describe, it, expect } from 'vitest';
import { isGhostNode, ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';

function makeNode(overrides: Partial<ChangeNode>): ChangeNode {
  return {
    id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
    range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
    anchored: false, level: 2, originalText: '', modifiedText: '',
    ...overrides,
  } as ChangeNode;
}

describe('isGhostNode', () => {
  it('returns true for unresolved L2+ node (anchored:false, no consumedBy)', () => {
    expect(isGhostNode(makeNode({ anchored: false, level: 2 }))).toBe(true);
  });

  it('returns false for consumed L2+ node (anchored:false, has consumedBy)', () => {
    expect(isGhostNode(makeNode({ anchored: false, level: 2, consumedBy: 'ct-5' }))).toBe(false);
  });

  it('returns false for anchored L2+ node', () => {
    expect(isGhostNode(makeNode({ anchored: true, level: 2 }))).toBe(false);
  });

  it('returns false for L0/L1 nodes regardless of anchored state', () => {
    expect(isGhostNode(makeNode({ anchored: false, level: 0 }))).toBe(false);
    expect(isGhostNode(makeNode({ anchored: false, level: 1 }))).toBe(false);
  });
});
