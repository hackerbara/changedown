import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core/internals';
import { scrubBackward, scrubForward, type ActiveOperation } from '@changetracks/core/internals';
import { FootnoteNativeParser } from '@changetracks/core/internals';

beforeAll(async () => {
  await initHashline();
});

describe('scrubBackward', () => {
  it('un-applies a single insertion to reach body_0', () => {
    const body = 'The very lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'insertion',
      modifiedText: 'very ', originalText: '',
      editOpLine: '    1:a1 The {++very ++}lazy dog',
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.body0).toBe('The lazy dog');
    expect(result.positions.get('ct-1')).toBeDefined();
    expect(result.positions.get('ct-1')!.offset).toBe(4);
  });

  it('un-applies a single deletion to reach body_0', () => {
    const body = 'The lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'deletion',
      modifiedText: '', originalText: 'very ',
      editOpLine: '    1:a1 The {--very --}lazy dog',
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.body0).toBe('The very lazy dog');
  });

  it('resolves edit-over-edit by un-applying in reverse log order', () => {
    const body = 'The extremely lazy dog';
    const ops: ActiveOperation[] = [
      {
        id: 'ct-1', type: 'insertion',
        modifiedText: 'very ', originalText: '',
        editOpLine: '    1:a1 The {++very ++}lazy dog',
        lineNumber: 1, hash: 'a1', status: 'proposed',
      },
      {
        id: 'ct-2', type: 'substitution',
        modifiedText: 'extremely lazy', originalText: 'very lazy',
        editOpLine: '    1:b1 The {~~very lazy~>extremely lazy~~} dog',
        lineNumber: 1, hash: 'b1', status: 'proposed',
      },
    ];
    const result = scrubBackward(body, ops);
    expect(result.body0).toBe('The lazy dog');
    expect(result.body0).not.toBe(body);
    expect(result.positions.get('ct-1')).toBeDefined();
    expect(result.positions.get('ct-1')!.resolved).toBe(true);
  });

  it('un-applies a substitution to reach body_0', () => {
    const body = 'The slow brown fox';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'substitution',
      modifiedText: 'slow', originalText: 'quick',
      editOpLine: '    1:a1 The {~~quick~>slow~~} brown fox',
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.body0).toBe('The quick brown fox');
  });

  it('skips rejected operations', () => {
    const body = 'The lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'insertion',
      modifiedText: 'very ', originalText: '',
      editOpLine: '    1:a1 The {++very ++}lazy dog',
      lineNumber: 1, hash: 'a1', status: 'rejected',
    }];
    const result = scrubBackward(body, ops);
    expect(result.body0).toBe('The lazy dog');
    expect(result.positions.has('ct-1')).toBe(false);
  });

  it('marks an operation as unresolved when its text cannot be found', () => {
    const body = 'Completely different text';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'insertion',
      modifiedText: 'very ', originalText: '',
      editOpLine: '    1:a1 The {++very ++}lazy dog',
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.positions.get('ct-1')!.resolved).toBe(false);
    expect(result.body0).toBe('Completely different text');
  });

  it('resolves via direct text match fallback when editOpLine lacks CriticMarkup', () => {
    const body = 'The very lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'insertion',
      modifiedText: 'very ', originalText: '',
      editOpLine: '    1:a1 The very lazy dog',  // No CriticMarkup!
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.positions.get('ct-1')!.resolved).toBe(true);
    expect(result.body0).toBe('The lazy dog');
  });

  it('cannot resolve deletion via fallback when editOpLine lacks CriticMarkup', () => {
    const body = 'The lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'deletion',
      modifiedText: '', originalText: 'very ',
      editOpLine: '    1:a1 The lazy dog',  // No CriticMarkup
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const result = scrubBackward(body, ops);
    expect(result.positions.get('ct-1')!.resolved).toBe(false);
  });
});

describe('scrubForward', () => {
  it('computes fresh anchors for a single insertion', () => {
    const body = 'The very lazy dog';
    const ops: ActiveOperation[] = [{
      id: 'ct-1', type: 'insertion',
      modifiedText: 'very ', originalText: '',
      editOpLine: '    1:a1 The {++very ++}lazy dog',
      lineNumber: 1, hash: 'a1', status: 'proposed',
    }];
    const backward = scrubBackward(body, ops);
    const forward = scrubForward(backward.body0, ops, backward.positions);

    expect(forward.anchors.get('ct-1')).toBeDefined();
    expect(forward.anchors.get('ct-1')).toContain('{++very ++}');
    expect(forward.finalBody).toBe(body);
  });

  it('detects full consumption when a later deletion removes an earlier insertion', () => {
    const body = 'The lazy dog';
    const ops: ActiveOperation[] = [
      {
        id: 'ct-1', type: 'insertion',
        modifiedText: 'very ', originalText: '',
        editOpLine: '    1:a1 The {++very ++}lazy dog',
        lineNumber: 1, hash: 'a1', status: 'proposed',
      },
      {
        id: 'ct-2', type: 'deletion',
        modifiedText: '', originalText: 'very ',
        editOpLine: '    1:b1 The {--very --}lazy dog',
        lineNumber: 1, hash: 'b1', status: 'proposed',
      },
    ];
    const backward = scrubBackward(body, ops);
    const forward = scrubForward(backward.body0, ops, backward.positions);

    expect(forward.consumption.get('ct-1')).toEqual({
      consumedBy: 'ct-2',
      type: 'full',
    });
  });

  it('detects partial consumption when a substitution overlaps an insertion', () => {
    const body = 'The extremely lazy dog';
    const ops: ActiveOperation[] = [
      {
        id: 'ct-1', type: 'insertion',
        modifiedText: 'very ', originalText: '',
        editOpLine: '    1:a1 The {++very ++}lazy dog',
        lineNumber: 1, hash: 'a1', status: 'proposed',
      },
      {
        id: 'ct-2', type: 'substitution',
        modifiedText: 'extremely lazy', originalText: 'very lazy',
        editOpLine: '    1:b1 The {~~very lazy~>extremely lazy~~} dog',
        lineNumber: 1, hash: 'b1', status: 'proposed',
      },
    ];
    const backward = scrubBackward(body, ops);
    const forward = scrubForward(backward.body0, ops, backward.positions);

    expect(forward.consumption.get('ct-1')).toBeDefined();
    expect(forward.consumption.get('ct-1')!.consumedBy).toBe('ct-2');
  });

  it('reports no consumption when operations target different regions', () => {
    const body = 'The very lazy brown dog';
    const ops: ActiveOperation[] = [
      {
        id: 'ct-1', type: 'insertion',
        modifiedText: 'very ', originalText: '',
        editOpLine: '    1:a1 The {++very ++}lazy brown dog',
        lineNumber: 1, hash: 'a1', status: 'proposed',
      },
      {
        id: 'ct-2', type: 'insertion',
        modifiedText: 'brown ', originalText: '',
        editOpLine: '    1:b1 very lazy {++brown ++}dog',
        lineNumber: 1, hash: 'b1', status: 'proposed',
      },
    ];
    const backward = scrubBackward(body, ops);
    const forward = scrubForward(backward.body0, ops, backward.positions);

    expect(forward.consumption.has('ct-1')).toBe(false);
    expect(forward.consumption.has('ct-2')).toBe(false);
  });

  it('consumed op gets footnoteLineRange as its range and consumptionType propagated', async () => {
    // L3 document where ct-2 (deletion) fully consumes ct-1 (insertion) at same location.
    // Uses dummy hashes that won't match computeLineHash, forcing the replay fallback path
    // which detects consumption relationships.
    const l3Text = [
      'The lazy dog',
      '',
      '[^ct-1]: agent | 2026-03-23 | ins | proposed',
      '    1:ab The {++very ++}lazy dog',
      '[^ct-2]: agent | 2026-03-23 | del | proposed',
      '    1:cd The {--very --}lazy dog',
    ].join('\n');

    const parser = new FootnoteNativeParser();
    const vdoc = parser.parse(l3Text);
    const changes = vdoc.getChanges();
    const ct1 = changes.find(c => c.id === 'ct-1');

    expect(ct1).toBeDefined();
    expect(ct1!.consumedBy).toBe('ct-2');
    expect(ct1!.consumptionType).toBe('full');
    // Range should point to footnote block, not {0,0}
    expect(ct1!.range.start).toBeGreaterThan(0);
  });
});
