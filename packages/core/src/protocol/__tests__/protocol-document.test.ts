import { describe, expect, it } from 'vitest';
import {
  buildChangeDownProtocolDocument,
  buildPublicChangeIndex,
  assertProtocolDocumentInvariants,
  type PublicChangeEntry,
} from '../index.js';

const entry: PublicChangeEntry = {
  id: 'cn-2',
  kind: 'format',
  status: 'proposed',
  representation: 'rendered-substitution',
  anchors: [{ kind: 'inline-range', marker: '[^cn-2]' }],
  actionability: { state: 'action-plan-ready' },
  date: '2026-05-16T00:00:00Z',
  protocolMetadata: { property: 'bold' },
};

describe('ChangeDown protocol document', () => {
  it('builds one source string and index from public entries with body anchors', () => {
    const protocol = buildChangeDownProtocolDocument({
      body: '{~~important~>**important**~~}[^cn-2]',
      entries: [entry],
    });
    expect(protocol.source).toContain('{~~important~>**important**~~}[^cn-2]');
    expect(protocol.source).toContain('[^cn-2]: @word | 2026-05-16 | format | proposed');
    expect(assertProtocolDocumentInvariants(protocol).ok).toBe(true);
    expect(buildPublicChangeIndex(protocol).byId.get('cn-2')).toMatchObject({ kind: 'format' });
  });

  it('fails closed for list rows without a body or structured protocol anchor', () => {
    const protocol = buildChangeDownProtocolDocument({
      body: 'No anchor here',
      entries: [entry],
      validate: false,
    });
    const invariant = assertProtocolDocumentInvariants(protocol);
    expect(invariant.ok).toBe(false);
    expect(invariant.errors).toContain('missing-anchor:cn-2:[^cn-2]');
  });

  it('allows metadata-dominant rows only when the public body has an anchor', () => {
    const metadataEntry: PublicChangeEntry = {
      ...entry,
      id: 'cn-3',
      kind: 'format',
      representation: 'metadata-anchor',
      anchors: [{ kind: 'paragraph', marker: '[^cn-3]' }],
      actionability: { state: 'blocked', reason: 'metadata-only-v1' },
      protocolMetadata: { property: 'paragraph-alignment', before: 'left', after: 'center' },
    };
    const protocol = buildChangeDownProtocolDocument({
      body: 'Aligned paragraph[^cn-3]',
      entries: [metadataEntry],
    });
    expect(assertProtocolDocumentInvariants(protocol).ok).toBe(true);
  });
});
