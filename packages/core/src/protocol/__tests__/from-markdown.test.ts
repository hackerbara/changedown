import { describe, expect, it } from 'vitest';
import { buildProtocolDocumentFromMarkdown } from '../index.js';

describe('file-backed Markdown protocol adapter', () => {
  it('treats existing ChangeDown Markdown as the same protocol universe', () => {
    const protocol = buildProtocolDocumentFromMarkdown([
      'Before {++after++}[^cn-2]',
      '',
      '[^cn-2]: @ada | 2026-05-16 | ins | proposed',
    ].join('\n'));

    expect(protocol.source).toContain('{++after++}[^cn-2]');
    expect(protocol.entries.map((entry) => entry.id)).toEqual(['cn-2']);
    expect(protocol.backendKind).toBe('file-markdown');
  });

  it('fails closed when structured protocol anchors are stale', () => {
    expect(() => buildProtocolDocumentFromMarkdown([
      'Before {++after++}[^cn-2]',
      '',
      '[^cn-2]: @ada | 2026-05-16 | ins | proposed',
      '    anchor: inline-range:[^cn-999]',
    ].join('\n'))).toThrow(/ProtocolInvariantViolation: missing-anchor:cn-2:\[\^cn-999\]/u);
  });

  it('round-trips structured anchor child roles without treating them as marker text', () => {
    const protocol = buildProtocolDocumentFromMarkdown([
      'Moved text[^cn-2]',
      '',
      '[^cn-2]: @ada | 2026-05-16 | move | proposed',
      '    representation: compound-child',
      '    anchor: compound-child:[^cn-2]:move-from',
    ].join('\n'));

    expect(protocol.entries[0].anchors).toEqual([
      { kind: 'compound-child', marker: '[^cn-2]', childRole: 'move-from' },
    ]);
  });


  it('keeps metadata-only protocol footnote rows even when CriticMarkup parser has no change node', () => {
    const protocol = buildProtocolDocumentFromMarkdown([
      'Aligned paragraph[^cn-7]',
      '',
      '[^cn-7]: @ada | 2026-05-16 | format | proposed',
      '    representation: metadata-anchor',
      '    actionability: blocked',
      '    reason: metadata-only-v1',
      '    anchor: paragraph:[^cn-7]',
      '    property: paragraph-alignment',
    ].join('\n'));

    expect(protocol.entries).toHaveLength(1);
    expect(protocol.entries[0]).toMatchObject({
      id: 'cn-7',
      kind: 'format',
      representation: 'metadata-anchor',
      actionability: { state: 'blocked', reason: 'metadata-only-v1' },
      protocolMetadata: { property: 'paragraph-alignment' },
    });
  });


  it('uses inline metadata status when file parser entries do not have protocol status', () => {
    const protocol = buildProtocolDocumentFromMarkdown('Before {++after++}{>>@ada|2026-05-16|ins|accepted<<}');

    expect(protocol.entries[0]).toMatchObject({
      id: 'cn-1',
      status: 'accepted',
      author: '@ada',
      date: '2026-05-16',
    });
  });

});
