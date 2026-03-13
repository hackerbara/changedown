import * as assert from 'assert';
import {
  parseTimestamp,
  nowTimestamp,
  compareTimestamps,
  formatTimestamp,
  type Timestamp,
} from '@changetracks/core/internals';

describe('parseTimestamp', () => {
  it('parses date-only', () => {
    const ts = parseTimestamp('2026-02-17');
    assert.strictEqual(ts.raw, '2026-02-17');
    assert.strictEqual(ts.date, '2026-02-17');
    assert.strictEqual(ts.time, undefined);
    assert.strictEqual(ts.utc, undefined);
    assert.strictEqual(ts.sortable, '2026-02-17T00:00:00Z');
  });

  it('parses ISO with T separator and Z', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    assert.strictEqual(ts.raw, '2026-02-17T14:32:05Z');
    assert.strictEqual(ts.date, '2026-02-17');
    assert.strictEqual(ts.time, '14:32:05');
    assert.strictEqual(ts.utc, true);
    assert.strictEqual(ts.sortable, '2026-02-17T14:32:05Z');
  });

  it('parses ISO minute precision with Z', () => {
    const ts = parseTimestamp('2026-02-17T14:32Z');
    assert.strictEqual(ts.date, '2026-02-17');
    assert.strictEqual(ts.time, '14:32:00');
    assert.strictEqual(ts.utc, true);
    assert.strictEqual(ts.sortable, '2026-02-17T14:32:00Z');
  });

  it('parses space-separated 24h time', () => {
    const ts = parseTimestamp('2026-02-17 14:30');
    assert.strictEqual(ts.date, '2026-02-17');
    assert.strictEqual(ts.time, '14:30:00');
    assert.strictEqual(ts.utc, false);
    assert.strictEqual(ts.sortable, '2026-02-17T14:30:00');
  });

  it('parses space-separated short hour', () => {
    const ts = parseTimestamp('2026-02-17 2:30');
    assert.strictEqual(ts.date, '2026-02-17');
    assert.strictEqual(ts.time, '02:30:00');
    assert.strictEqual(ts.utc, false);
    assert.strictEqual(ts.sortable, '2026-02-17T02:30:00');
  });

  it('parses pm suffix (lowercase, no space)', () => {
    const ts = parseTimestamp('2026-02-17 2:30pm');
    assert.strictEqual(ts.time, '14:30:00');
    assert.strictEqual(ts.sortable, '2026-02-17T14:30:00');
  });

  it('parses PM suffix (uppercase, with space)', () => {
    const ts = parseTimestamp('2026-02-17 2:30 PM');
    assert.strictEqual(ts.time, '14:30:00');
    assert.strictEqual(ts.sortable, '2026-02-17T14:30:00');
  });

  it('parses am suffix', () => {
    const ts = parseTimestamp('2026-02-17 2:30am');
    assert.strictEqual(ts.time, '02:30:00');
    assert.strictEqual(ts.sortable, '2026-02-17T02:30:00');
  });

  it('handles 12:00pm as noon', () => {
    const ts = parseTimestamp('2026-02-17 12:00pm');
    assert.strictEqual(ts.time, '12:00:00');
    assert.strictEqual(ts.sortable, '2026-02-17T12:00:00');
  });

  it('handles 12:00am as midnight', () => {
    const ts = parseTimestamp('2026-02-17 12:00am');
    assert.strictEqual(ts.time, '00:00:00');
    assert.strictEqual(ts.sortable, '2026-02-17T00:00:00');
  });

  it('strips milliseconds from ISO', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05.123Z');
    assert.strictEqual(ts.time, '14:32:05');
    assert.strictEqual(ts.utc, true);
    assert.strictEqual(ts.sortable, '2026-02-17T14:32:05Z');
  });

  it('preserves raw exactly', () => {
    const raw = '2026-02-17 2:30 PM';
    const ts = parseTimestamp(raw);
    assert.strictEqual(ts.raw, raw);
  });
});

describe('nowTimestamp', () => {
  it('returns a full ISO UTC timestamp', () => {
    const ts = nowTimestamp();
    assert.ok(ts.utc);
    assert.ok(ts.time);
    assert.match(ts.raw, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.strictEqual(ts.raw, ts.sortable);
    assert.match(ts.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('compareTimestamps', () => {
  it('orders date-only before same-day with time', () => {
    const a = parseTimestamp('2026-02-17');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it('orders earlier time before later time', () => {
    const a = parseTimestamp('2026-02-17T10:00:00Z');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it('orders different dates correctly', () => {
    const a = parseTimestamp('2026-02-16');
    const b = parseTimestamp('2026-02-17');
    assert.ok(compareTimestamps(a, b) < 0);
  });

  it('returns 0 for identical timestamps', () => {
    const a = parseTimestamp('2026-02-17T14:00:00Z');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    assert.strictEqual(compareTimestamps(a, b), 0);
  });

  it('handles mixed precision (date-only vs full ISO)', () => {
    const a = parseTimestamp('2026-02-17');
    const b = parseTimestamp('2026-02-18T00:00:00Z');
    assert.ok(compareTimestamps(a, b) < 0);
  });
});

describe('formatTimestamp', () => {
  it('format date returns YYYY-MM-DD', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    assert.strictEqual(formatTimestamp(ts, 'date'), '2026-02-17');
  });

  it('format full returns sortable', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    assert.strictEqual(formatTimestamp(ts, 'full'), '2026-02-17T14:32:05Z');
  });

  it('format raw returns original string', () => {
    const ts = parseTimestamp('2026-02-17 2:30pm');
    assert.strictEqual(formatTimestamp(ts, 'raw'), '2026-02-17 2:30pm');
  });
});
