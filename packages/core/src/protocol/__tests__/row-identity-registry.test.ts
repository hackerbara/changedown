import { describe, expect, it } from 'vitest';
import {
  createRowIdentityRegistry,
  signatureForSourceGroup,
  signatureForNativeRevisionGap,
} from '../row-identity-registry.js';

describe('shared row identity registry', () => {
  it('starts public source-backed ids at cn-2 and reserves tombstoned ids', () => {
    const registry = createRowIdentityRegistry();
    const first = registry.getOrAssign(signatureForSourceGroup({
      id: 'group-1',
      partName: 'word/document.xml',
      path: '/w:document[1]/w:body[1]/w:p[1]',
      kind: 'insertion',
      author: 'Ada',
      date: '2026-05-16T00:00:00Z',
      atomIds: ['atom-1'],
    }));
    expect(first).toBe('cn-2');

    registry.tombstone('cn-3', {
      reason: 'accepted',
      lastSignature: 'source|old',
    });

    const second = registry.getOrAssign(signatureForSourceGroup({
      id: 'group-2',
      partName: 'word/document.xml',
      path: '/w:document[1]/w:body[1]/w:p[2]',
      kind: 'deletion',
      atomIds: ['atom-2'],
    }));
    expect(second).toBe('cn-4');
  });

  it('keeps native-gap signatures separate from public source signatures', () => {
    const source = signatureForSourceGroup({ id: 'group-1', kind: 'insertion' });
    const native = signatureForNativeRevisionGap({
      kind: 'insertion',
      wordType: 'Insertion',
      dateSec: 1778889600,
      rangeTextHash: 'abc',
    });
    expect(source.startsWith('source|')).toBe(true);
    expect(native.startsWith('native-gap|')).toBe(true);
    expect(source).not.toBe(native);
  });
});
