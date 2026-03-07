/**
 * A parsed timestamp preserving the original string.
 * Handles the full spectrum: date-only, informal time, full ISO.
 */
export interface Timestamp {
  /** Exactly what was written — never normalized, never lost */
  raw: string;
  /** Always extractable: YYYY-MM-DD */
  date: string;
  /** When time is present. Normalized to HH:MM:SS. */
  time?: string;
  /** True when Z suffix present, false when time present but no Z, undefined when date-only */
  utc?: boolean;
  /** Full ISO 8601 for ordering. */
  sortable: string;
}

// Match: YYYY-MM-DD optionally followed by T or space, then time, optional seconds, optional AM/PM, optional Z
// Also handles milliseconds (.NNN) which we strip
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s?([AaPp][Mm])?(Z)?)?$/;

function normalizeHour(hour: number, ampm?: string): number {
  if (!ampm) return hour;
  const upper = ampm.toUpperCase();
  if (upper === 'AM') return hour === 12 ? 0 : hour;
  if (upper === 'PM') return hour === 12 ? 12 : hour + 12;
  return hour;
}

export function parseTimestamp(raw: string): Timestamp {
  const m = TIMESTAMP_RE.exec(raw.trim());
  if (!m) {
    // Fallback: treat entire string as raw, try to extract date
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
    const date = dateMatch ? dateMatch[1] : raw.trim();
    return { raw, date, sortable: date ? `${date}T00:00:00Z` : raw };
  }

  const date = m[1];
  const hourRaw = m[2];
  const minuteRaw = m[3];
  const secondRaw = m[4];
  const ampm = m[5];
  const zulu = m[6];

  if (hourRaw === undefined) {
    // Date-only
    return { raw, date, sortable: `${date}T00:00:00Z` };
  }

  const hour = normalizeHour(parseInt(hourRaw, 10), ampm);
  const minute = parseInt(minuteRaw, 10);
  const second = secondRaw ? parseInt(secondRaw, 10) : 0;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const utc = zulu === 'Z';
  const sortable = `${date}T${time}${utc ? 'Z' : ''}`;

  return { raw, date, time, utc, sortable };
}

export function nowTimestamp(): Timestamp {
  const iso = new Date().toISOString(); // e.g. 2026-02-17T14:32:05.123Z
  // Strip milliseconds for cleaner output
  const raw = iso.replace(/\.\d{3}Z$/, 'Z');
  return parseTimestamp(raw);
}

export function compareTimestamps(a: Timestamp, b: Timestamp): number {
  if (a.sortable < b.sortable) return -1;
  if (a.sortable > b.sortable) return 1;
  return 0;
}

export function formatTimestamp(ts: Timestamp, style: 'date' | 'full' | 'raw'): string {
  switch (style) {
    case 'date': return ts.date;
    case 'full': return ts.sortable;
    case 'raw': return ts.raw;
  }
}
