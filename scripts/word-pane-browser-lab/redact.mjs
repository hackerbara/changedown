import crypto from 'node:crypto';

const SENSITIVE_KEY = /token|secret|password|authorization|cookie|api[-_]?key/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const CDR_TOKEN = /\bcdr2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const TOKEN_QUERY = /([?&](?:token|secret|password|authorization|cookie|api[-_]?key)=)[^&#\s"'<>]+/gi;
const USER_PATH = /\/Users\/[^/\s"'<>]+/g;

function isSensitiveKey(key) {
  if (/^(hasToken|tokenHash)$/i.test(key)) return false;
  return SENSITIVE_KEY.test(key);
}

export function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export function redactString(value) {
  return String(value)
    .replace(BEARER, 'Bearer [redacted]')
    .replace(CDR_TOKEN, '[redacted-cdr-token]')
    .replace(TOKEN_QUERY, '$1[redacted]')
    .replace(USER_PATH, '/Users/[redacted]');
}

export function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.toString();
  } catch {
    return redactString(value);
  }
}

export function sanitizeJson(value) {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) return sanitizeUrl(value);
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (typeof value === 'object' && value) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? '[redacted]' : sanitizeJson(child);
    }
    return out;
  }
  return undefined;
}

export function inviteShape(value) {
  const raw = String(value ?? '');
  const roomMatch = raw.match(/\bpublic-[1-5]\b/);
  const tokenMatch = raw.match(/cdr2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return {
    rawLength: raw.length,
    roomId: roomMatch?.[0],
    hasToken: Boolean(tokenMatch),
    tokenHash: tokenMatch ? hashValue(tokenMatch[0]) : undefined,
  };
}
