import * as assert from 'node:assert';
import {
  buildDeliberationHeader,
  buildLineRefMap,
  FootnoteInfo,
  parseTimestamp,
} from '@changetracks/core/internals';

describe('view-builder-utils', () => {
  describe('buildDeliberationHeader', () => {
    it('produces correct counts from footnotes', () => {
      const footnotes = new Map<string, FootnoteInfo>([
        ['ct-1', { id: 'ct-1', author: '@alice', date: '2026-01-01', timestamp: parseTimestamp('2026-01-01'), type: 'ins', status: 'proposed', reason: '', replyCount: 0, startLine: 10, endLine: 10 }],
        ['ct-2', { id: 'ct-2', author: '@bob', date: '2026-01-01', timestamp: parseTimestamp('2026-01-01'), type: 'del', status: 'accepted', reason: '', replyCount: 2, startLine: 11, endLine: 13 }],
      ]);
      const header = buildDeliberationHeader({
        filePath: 'test.md',
        trackingStatus: 'tracked',
        protocolMode: 'classic',
        defaultView: 'review',
        viewPolicy: 'suggest',
        footnotes,
      });
      assert.strictEqual(header.counts.proposed, 1);
      assert.strictEqual(header.counts.accepted, 1);
      assert.strictEqual(header.counts.rejected, 0);
      assert.deepStrictEqual(header.authors, ['@alice', '@bob']);
      assert.strictEqual(header.threadCount, 1);
    });

    it('returns zero counts for empty footnotes', () => {
      const header = buildDeliberationHeader({
        filePath: 'empty.md',
        trackingStatus: 'untracked',
        protocolMode: 'compact',
        defaultView: 'review',
        viewPolicy: 'suggest',
        footnotes: new Map(),
      });
      assert.strictEqual(header.counts.proposed, 0);
      assert.deepStrictEqual(header.authors, []);
    });
  });

  describe('buildLineRefMap', () => {
    it('maps line indices to footnote IDs from refs', () => {
      const content = 'Hello[^ct-1] world.\nSecond line[^ct-2].\n\n[^ct-1]: a\n[^ct-2]: b';
      const lines = content.split('\n');
      const map = buildLineRefMap(lines);
      assert.deepStrictEqual([...map.get(0)!], ['ct-1']);
      assert.deepStrictEqual([...map.get(1)!], ['ct-2']);
      assert.ok(!map.has(2));
    });
  });
});
