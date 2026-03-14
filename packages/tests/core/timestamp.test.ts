import { describe, it, expect } from 'vitest';
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
    expect(ts.raw).toBe('2026-02-17');
    expect(ts.date).toBe('2026-02-17');
    expect(ts.time).toBeUndefined();
    expect(ts.utc).toBeUndefined();
    expect(ts.sortable).toBe('2026-02-17T00:00:00Z');
  });

  it('parses ISO with T separator and Z', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    expect(ts.raw).toBe('2026-02-17T14:32:05Z');
    expect(ts.date).toBe('2026-02-17');
    expect(ts.time).toBe('14:32:05');
    expect(ts.utc).toBe(true);
    expect(ts.sortable).toBe('2026-02-17T14:32:05Z');
  });

  it('parses ISO minute precision with Z', () => {
    const ts = parseTimestamp('2026-02-17T14:32Z');
    expect(ts.date).toBe('2026-02-17');
    expect(ts.time).toBe('14:32:00');
    expect(ts.utc).toBe(true);
    expect(ts.sortable).toBe('2026-02-17T14:32:00Z');
  });

  it('parses space-separated 24h time', () => {
    const ts = parseTimestamp('2026-02-17 14:30');
    expect(ts.date).toBe('2026-02-17');
    expect(ts.time).toBe('14:30:00');
    expect(ts.utc).toBe(false);
    expect(ts.sortable).toBe('2026-02-17T14:30:00');
  });

  it('parses space-separated short hour', () => {
    const ts = parseTimestamp('2026-02-17 2:30');
    expect(ts.date).toBe('2026-02-17');
    expect(ts.time).toBe('02:30:00');
    expect(ts.utc).toBe(false);
    expect(ts.sortable).toBe('2026-02-17T02:30:00');
  });

  it('parses pm suffix (lowercase, no space)', () => {
    const ts = parseTimestamp('2026-02-17 2:30pm');
    expect(ts.time).toBe('14:30:00');
    expect(ts.sortable).toBe('2026-02-17T14:30:00');
  });

  it('parses PM suffix (uppercase, with space)', () => {
    const ts = parseTimestamp('2026-02-17 2:30 PM');
    expect(ts.time).toBe('14:30:00');
    expect(ts.sortable).toBe('2026-02-17T14:30:00');
  });

  it('parses am suffix', () => {
    const ts = parseTimestamp('2026-02-17 2:30am');
    expect(ts.time).toBe('02:30:00');
    expect(ts.sortable).toBe('2026-02-17T02:30:00');
  });

  it('handles 12:00pm as noon', () => {
    const ts = parseTimestamp('2026-02-17 12:00pm');
    expect(ts.time).toBe('12:00:00');
    expect(ts.sortable).toBe('2026-02-17T12:00:00');
  });

  it('handles 12:00am as midnight', () => {
    const ts = parseTimestamp('2026-02-17 12:00am');
    expect(ts.time).toBe('00:00:00');
    expect(ts.sortable).toBe('2026-02-17T00:00:00');
  });

  it('strips milliseconds from ISO', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05.123Z');
    expect(ts.time).toBe('14:32:05');
    expect(ts.utc).toBe(true);
    expect(ts.sortable).toBe('2026-02-17T14:32:05Z');
  });

  it('preserves raw exactly', () => {
    const raw = '2026-02-17 2:30 PM';
    const ts = parseTimestamp(raw);
    expect(ts.raw).toBe(raw);
  });
});

describe('nowTimestamp', () => {
  it('returns a full ISO UTC timestamp', () => {
    const ts = nowTimestamp();
    expect(ts.utc).toBeTruthy();
    expect(ts.time).toBeTruthy();
    expect(ts.raw).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(ts.raw).toBe(ts.sortable);
    expect(ts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('compareTimestamps', () => {
  it('orders date-only before same-day with time', () => {
    const a = parseTimestamp('2026-02-17');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    expect(compareTimestamps(a, b) < 0).toBeTruthy();
  });

  it('orders earlier time before later time', () => {
    const a = parseTimestamp('2026-02-17T10:00:00Z');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    expect(compareTimestamps(a, b) < 0).toBeTruthy();
  });

  it('orders different dates correctly', () => {
    const a = parseTimestamp('2026-02-16');
    const b = parseTimestamp('2026-02-17');
    expect(compareTimestamps(a, b) < 0).toBeTruthy();
  });

  it('returns 0 for identical timestamps', () => {
    const a = parseTimestamp('2026-02-17T14:00:00Z');
    const b = parseTimestamp('2026-02-17T14:00:00Z');
    expect(compareTimestamps(a, b)).toBe(0);
  });

  it('handles mixed precision (date-only vs full ISO)', () => {
    const a = parseTimestamp('2026-02-17');
    const b = parseTimestamp('2026-02-18T00:00:00Z');
    expect(compareTimestamps(a, b) < 0).toBeTruthy();
  });
});

describe('formatTimestamp', () => {
  it('format date returns YYYY-MM-DD', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    expect(formatTimestamp(ts, 'date')).toBe('2026-02-17');
  });

  it('format full returns sortable', () => {
    const ts = parseTimestamp('2026-02-17T14:32:05Z');
    expect(formatTimestamp(ts, 'full')).toBe('2026-02-17T14:32:05Z');
  });

  it('format raw returns original string', () => {
    const ts = parseTimestamp('2026-02-17 2:30pm');
    expect(formatTimestamp(ts, 'raw')).toBe('2026-02-17 2:30pm');
  });
});
