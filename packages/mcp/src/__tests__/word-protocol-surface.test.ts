import { describe, expect, it } from 'vitest';
import type { DocumentSnapshot } from '@changedown/core/backend';
import {
  assertProtocolReviewCapability,
  assertProtocolReviewPostcondition,
  protocolListRows,
  protocolSourceForRead,
} from '../word-protocol-surface.js';
import { assertWordThreadCapability } from '../word-review.js';

function snapshot(): DocumentSnapshot {
  return {
    text: '{++hello++}[^cn-2]\n\n[^cn-2]: @word | 2026-05-16 | ins | proposed\n',
    format: 'L2',
    version: '1',
    publicationState: 'ready',
    protocolSurface: {
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-a',
      source: '{++hello++}[^cn-2]\n\n[^cn-2]: @word | 2026-05-16 | ins | proposed\n',
      entries: [
        {
          id: 'cn-2',
          kind: 'ins',
          status: 'proposed',
          representation: 'inline-markup',
          preview: 'hello',
          line: 1,
          actionability: { state: 'native-ready' },
          certification: { state: 'action-plan-ready' },
        },
      ],
      order: ['cn-2'],
      actionabilityByChangeId: { 'cn-2': { state: 'native-ready' } },
      certificationByChangeId: { 'cn-2': { state: 'action-plan-ready' } },
    },
    actionPlanRefsByChangeId: {
      'cn-2': {
        publicChangeId: 'cn-2',
        actionKind: 'accept',
        targetKind: 'native',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: 'digest-a',
        createdFromPackageDigest: 'pkg-a',
        createdFromSourceGraphDigest: 'graph-a',
        currentProtocolDigest: 'digest-a',
        currentPackageDigest: 'pkg-a',
        currentSourceGraphDigest: 'graph-a',
      },
    },
  };
}

describe('Word protocol surface MCP helpers', () => {
  it('uses protocol source for read output', () => {
    expect(protocolSourceForRead(snapshot()).source).toContain('[^cn-2]');
  });

  it('uses protocol entries for list rows', () => {
    expect(protocolListRows(snapshot(), {}).map((row) => row.change_id)).toEqual(['cn-2']);
  });

  it('includes protocol-only actionability reasons without exposing provider evidence', () => {
    const blocked = snapshot();
    blocked.protocolSurface!.entries = [
      {
        ...blocked.protocolSurface!.entries[0]!,
        actionability: {
          state: 'blocked',
          reason: 'unsupported-action:targeted-native-proof-needed: package source row is detected but no unique native Word revision target was proven',
        },
      },
    ];

    const [row] = protocolListRows(blocked, {});

    expect(row).toMatchObject({
      change_id: 'cn-2',
      protocol_actionability: 'blocked',
      protocol_actionability_reason: 'unsupported-action:targeted-native-proof-needed: package source row is detected but no unique native Word revision target was proven',
    });
    expect(JSON.stringify(row)).not.toContain('native-1');
    expect(JSON.stringify(row)).not.toContain('sourceGroupId');
  });

  it('unions change_id and change_ids filters and treats an empty change_ids list as no filter', () => {
    const withTwo = snapshot();
    withTwo.protocolSurface!.entries = [
      ...withTwo.protocolSurface!.entries,
      {
        id: 'cn-3',
        kind: 'del',
        status: 'proposed',
        representation: 'inline-markup',
        preview: 'bye',
        line: 2,
        actionability: { state: 'blocked', reason: 'no-native-target' },
        certification: { state: 'protocol-ready' },
      },
    ];

    expect(protocolListRows(withTwo, { change_ids: [] }).map((row) => row.change_id)).toEqual(['cn-2', 'cn-3']);
    expect(protocolListRows(withTwo, { change_id: 'cn-2', change_ids: ['cn-3'] }).map((row) => row.change_id)).toEqual(['cn-2', 'cn-3']);
  });

  it('fails closed when review actionability is not native-ready', () => {
    const blocked = snapshot();
    blocked.protocolSurface!.actionabilityByChangeId = {
      'cn-2': { state: 'blocked', reason: 'stale-protocol-digest' },
    };
    expect(() => assertProtocolReviewCapability(blocked, 'cn-2')).toThrow(
      /WordReviewCapabilityUnavailable: cn-2 is blocked/,
    );
  });

  it('accepts thread-ready actionability for comment thread operations but not review operations', () => {
    const threaded = snapshot();
    threaded.protocolSurface!.entries = [{
      id: 'cn-4',
      kind: 'comment',
      status: 'proposed',
      representation: 'comment-thread',
      preview: 'Discuss with Will',
      line: 1,
      actionability: { state: 'thread-ready' },
      certification: { state: 'action-plan-ready' },
    }];
    threaded.protocolSurface!.order = ['cn-4'];
    threaded.protocolSurface!.actionabilityByChangeId = {
      'cn-4': { state: 'thread-ready' },
    };
    threaded.protocolSurface!.certificationByChangeId = {
      'cn-4': { state: 'action-plan-ready' },
    };
    threaded.actionPlanRefsByChangeId = {
      'cn-4': {
        publicChangeId: 'cn-4',
        actionKind: 'reply',
        targetKind: 'thread',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: 'digest-a',
        createdFromPackageDigest: 'pkg-a',
        createdFromSourceGraphDigest: 'graph-a',
        currentProtocolDigest: 'digest-a',
        currentPackageDigest: 'pkg-a',
        currentSourceGraphDigest: 'graph-a',
      },
    };

    expect(() => assertWordThreadCapability(threaded, 'cn-4', 'resolve')).not.toThrow();
    expect(() => assertProtocolReviewCapability(threaded, 'cn-4')).toThrow(
      /WordReviewCapabilityUnavailable: cn-4 is thread-ready/,
    );
  });

  it('fails closed when native-ready action plan refs lack current digest evidence', () => {
    const stale = snapshot();
    stale.actionPlanRefsByChangeId = {
      'cn-2': {
        publicChangeId: 'cn-2',
        actionKind: 'accept',
        targetKind: 'native',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: 'digest-a',
        createdFromPackageDigest: 'pkg-a',
        createdFromSourceGraphDigest: 'graph-a',
      },
    };

    expect(() => assertProtocolReviewCapability(stale, 'cn-2')).toThrow(
      /no current dereferenceable CodecActionPlan/,
    );
  });

  it('fails closed when current action plan digest evidence is malformed', () => {
    const malformed = snapshot();
    malformed.actionPlanRefsByChangeId = {
      'cn-2': {
        publicChangeId: 'cn-2',
        actionKind: 'accept',
        targetKind: 'native',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: '',
        createdFromPackageDigest: '',
        createdFromSourceGraphDigest: '',
        currentProtocolDigest: '',
        currentPackageDigest: '',
        currentSourceGraphDigest: '',
      },
    };

    expect(() => assertProtocolReviewCapability(malformed, 'cn-2')).toThrow(
      /no current dereferenceable CodecActionPlan/,
    );
  });

  it('fails closed when thread-ready action plan refs lack current digest evidence', () => {
    const threaded = snapshot();
    threaded.protocolSurface!.entries = [{
      id: 'cn-4',
      kind: 'comment',
      status: 'proposed',
      representation: 'comment-thread',
      preview: 'Discuss with Will',
      line: 1,
      actionability: { state: 'thread-ready' },
      certification: { state: 'action-plan-ready' },
    }];
    threaded.protocolSurface!.order = ['cn-4'];
    threaded.protocolSurface!.actionabilityByChangeId = { 'cn-4': { state: 'thread-ready' } };
    threaded.protocolSurface!.certificationByChangeId = { 'cn-4': { state: 'action-plan-ready' } };
    threaded.actionPlanRefsByChangeId = {
      'cn-4': {
        publicChangeId: 'cn-4',
        actionKind: 'reply',
        targetKind: 'thread',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: 'digest-a',
        createdFromPackageDigest: 'pkg-a',
        createdFromSourceGraphDigest: 'graph-a',
      },
    };

    expect(() => assertWordThreadCapability(threaded, 'cn-4', 'resolve')).toThrow(
      /no current dereferenceable thread action plan/,
    );
  });

  it('fails closed when review actionability exists for a non-entry provider id', () => {
    const hidden = snapshot();
    hidden.protocolSurface!.actionabilityByChangeId = {
      'cn-2': { state: 'native-ready' },
      'cn-native-provider': { state: 'native-ready' },
    };

    expect(() => assertProtocolReviewCapability(hidden, 'cn-native-provider')).toThrow(
      /not present in the Word protocol surface/,
    );
  });

  it('accepts product-certified postcondition after backend action', () => {
    const post = snapshot();
    post.protocolSurface!.certificationByChangeId = {
      'cn-2': { state: 'product-certified' },
    };
    expect(() => assertProtocolReviewPostcondition(post, 'cn-2', 'approve')).not.toThrow();
  });

  it('does not accept terminal status plus observed certification as a review postcondition', () => {
    const post = snapshot();
    post.protocolSurface!.entries = [
      {
        ...post.protocolSurface!.entries[0]!,
        status: 'accepted',
        certification: { state: 'observed' },
      },
    ];
    post.protocolSurface!.certificationByChangeId = {
      'cn-2': { state: 'observed' },
    };

    expect(() => assertProtocolReviewPostcondition(post, 'cn-2', 'approve')).toThrow(
      /ReviewPostconditionFailed/,
    );
  });
});
