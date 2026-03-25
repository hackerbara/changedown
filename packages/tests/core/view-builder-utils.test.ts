import { describe, it, expect } from 'vitest';
import {
  buildDeliberationHeader,
  buildLineRefMap,
  computeContinuationLines,
  parseForFormat,
  ChangeType,
  ChangeStatus,
} from '@changetracks/core/internals';

describe('view-builder-utils', () => {
  describe('buildDeliberationHeader', () => {
    it('produces correct counts from footnotes', () => {
      const ct1Node = {
        id: 'ct-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 },
        contentRange: { start: 0, end: 10 },
        level: 2 as const,
        anchored: true,
        metadata: { author: '@alice', date: '2026-01-01', status: 'proposed' },
        replyCount: 0,
        footnoteLineRange: { startLine: 10, endLine: 10 },
      };
      const ct2Node = {
        id: 'ct-2',
        type: ChangeType.Deletion,
        status: ChangeStatus.Accepted,
        range: { start: 0, end: 10 },
        contentRange: { start: 0, end: 10 },
        level: 2 as const,
        anchored: true,
        metadata: { author: '@bob', date: '2026-01-01', status: 'accepted' },
        replyCount: 2,
        footnoteLineRange: { startLine: 11, endLine: 13 },
      };
      const header = buildDeliberationHeader({
        filePath: 'test.md',
        trackingStatus: 'tracked',
        protocolMode: 'classic',
        defaultView: 'review',
        viewPolicy: 'suggest',
        changes: [ct1Node, ct2Node],
      });
      expect(header.counts.proposed).toBe(1);
      expect(header.counts.accepted).toBe(1);
      expect(header.counts.rejected).toBe(0);
      expect(header.authors).toStrictEqual(['@alice', '@bob']);
      expect(header.threadCount).toBe(1);
    });

    it('returns zero counts for empty footnotes', () => {
      const header = buildDeliberationHeader({
        filePath: 'empty.md',
        trackingStatus: 'untracked',
        protocolMode: 'compact',
        defaultView: 'review',
        viewPolicy: 'suggest',
        changes: [],
      });
      expect(header.counts.proposed).toBe(0);
      expect(header.authors).toStrictEqual([]);
    });
  });

  describe('computeContinuationLines', () => {
    it('produces identical output with preParsed changes', () => {
      const content = 'Hello {++world\nfoo++}[^ct-1]\n\n[^ct-1]: @alice | 2026-03-23 | ins | proposed';
      const withoutPreParsed = computeContinuationLines(content);
      const changes = parseForFormat(content).getChanges();
      const withPreParsed = computeContinuationLines(content, changes);
      expect(withPreParsed).toEqual(withoutPreParsed);
    });
  });

  describe('buildLineRefMap', () => {
    it('maps line indices to footnote IDs from refs', () => {
      const content = 'Hello[^ct-1] world.\nSecond line[^ct-2].\n\n[^ct-1]: a\n[^ct-2]: b';
      const lines = content.split('\n');
      const map = buildLineRefMap(lines);
      expect([...map.get(0)!]).toStrictEqual(['ct-1']);
      expect([...map.get(1)!]).toStrictEqual(['ct-2']);
      expect(map.has(2)).toBe(false);
    });
  });
});
