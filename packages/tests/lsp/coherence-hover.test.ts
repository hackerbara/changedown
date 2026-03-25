import { describe, it, expect } from 'vitest';
import { createHover, offsetToPosition } from '@changetracks/lsp-server/internals';
import { ChangeType, ChangeStatus } from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';

describe('hover with unanchored changes', () => {
  it('returns null for hover over unanchored change position', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Comment, status: ChangeStatus.Proposed,
      range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
      level: 2, anchored: false,
      metadata: { comment: 'This is a comment' },
    }];
    // level >= 2 && anchored === false → isGhostNode → filtered before range check
    const result = createHover({ line: 0, character: 0 }, changes, text);
    expect(result).toBeNull();
  });

  it('returns hover for anchored change', () => {
    const text = 'Hello world\n';
    const changes: ChangeNode[] = [{
      id: 'ct-1', type: ChangeType.Comment, status: ChangeStatus.Proposed,
      range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
      level: 2, anchored: true,
      metadata: { comment: 'A comment' },
    }];
    // anchored === true → not a ghost node → included in range check → hover returned
    const result = createHover({ line: 0, character: 2 }, changes, text);
    expect(result).not.toBeNull();
    expect(result!.contents).toBeDefined();
  });
});

describe('hover with consumed ops', () => {
  // Build a text long enough that offset 60 falls inside the footnote block range [50,80]
  const text = 'A'.repeat(50) + 'B'.repeat(30) + 'C'.repeat(20);

  it('shows consumption relationship for consumed op', () => {
    const changes: ChangeNode[] = [{
      id: 'ct-3', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 50, end: 80 }, contentRange: { start: 50, end: 80 },
      anchored: false, level: 2,
      consumedBy: 'ct-5',
    }];
    const position = offsetToPosition(text, 60); // inside footnote block range
    const hover = createHover(position, changes, text);
    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain('Consumed by ct-5');
  });

  it('shows partial consumption for partially consumed op', () => {
    const changes: ChangeNode[] = [{
      id: 'ct-3', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
      range: { start: 50, end: 80 }, contentRange: { start: 50, end: 80 },
      anchored: false, level: 2,
      consumedBy: 'ct-5',
      consumptionType: 'partial',
    }];
    const position = offsetToPosition(text, 60);
    const hover = createHover(position, changes, text);
    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain('Partially consumed by ct-5');
  });

  it('shows consuming relationship for op that consumed others', () => {
    const changes: ChangeNode[] = [
      {
        id: 'ct-3', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 10, end: 20 }, contentRange: { start: 10, end: 20 },
        anchored: false, level: 2,
        consumedBy: 'ct-5',
      },
      {
        id: 'ct-4', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 30, end: 40 }, contentRange: { start: 30, end: 40 },
        anchored: false, level: 2,
        consumedBy: 'ct-5',
      },
      {
        id: 'ct-5', type: ChangeType.Substitution, status: ChangeStatus.Proposed,
        range: { start: 50, end: 80 }, contentRange: { start: 50, end: 80 },
        anchored: true, level: 2,
        metadata: { comment: 'Rewrote the paragraph' },
      },
    ];
    const position = offsetToPosition(text, 60); // inside ct-5's range
    const hover = createHover(position, changes, text);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Reason:');
    expect(value).toContain('Rewrote the paragraph');
    expect(value).toContain('ct-3');
    expect(value).toContain('ct-4');
  });

  it('shows consuming relationship even without comment', () => {
    const changes: ChangeNode[] = [
      {
        id: 'ct-3', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 10, end: 20 }, contentRange: { start: 10, end: 20 },
        anchored: false, level: 2,
        consumedBy: 'ct-5',
      },
      {
        id: 'ct-5', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 50, end: 80 }, contentRange: { start: 50, end: 80 },
        anchored: true, level: 2,
      },
    ];
    const position = offsetToPosition(text, 60);
    const hover = createHover(position, changes, text);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('consumed ct-3');
  });
});
