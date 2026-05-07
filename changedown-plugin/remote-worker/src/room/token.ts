import type { AuthorizedTokenHashes, RelayRole } from './types.js';

export interface ParsedRelayToken {
  version: 'cdr1';
  roomId: string;
  secret: string;
}

export interface ParsedLeaseToken {
  version: 'cdr2';
  roomId: string;
  leaseId: string;
  role: RelayRole;
  expiresAt: number;
}

export function parseRelayToken(raw: string | null): ParsedRelayToken | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [version, roomId, secret] = parts;
  if (version !== 'cdr1') return null;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(roomId)) return null;
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(secret)) return null;
  return { version, roomId, secret };
}

export function roomIdFromRelayLikeToken(raw: string | null): string | null {
  const parsed = parseRelayToken(raw);
  if (parsed) return parsed.roomId;
  if (!raw) return null;
  const [version, roomId] = raw.split('.');
  if (version !== 'cdr2') return null;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(roomId ?? '')) return null;
  return roomId;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const raw = String.fromCharCode(...new Uint8Array(digest));
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacBase64Url(signingKey: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const raw = String.fromCharCode(...new Uint8Array(signature));
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function mintLeaseToken(input: {
  roomId: string;
  leaseId: string;
  role: RelayRole;
  expiresAt: number;
  signingKey: string;
}): Promise<string> {
  const payload = `${input.roomId}:${input.leaseId}:${input.role}:${input.expiresAt}`;
  const signature = await hmacBase64Url(input.signingKey, payload);
  return `cdr2.${input.roomId}.${input.leaseId}_${input.role}_${input.expiresAt}_${signature}`;
}

export async function verifyLeaseToken(raw: string | null, signingKey: string): Promise<ParsedLeaseToken | null> {
  if (!raw) return null;
  const [version, roomId, secret] = raw.split('.');
  if (version !== 'cdr2' || !/^[a-zA-Z0-9_-]{1,128}$/.test(roomId ?? '') || !secret) return null;
  const [leaseId, role, expiresRaw, ...signatureParts] = secret.split('_');
  const signature = signatureParts.join('_');
  if (!leaseId || !/^[a-zA-Z0-9-]{1,128}$/.test(leaseId)) return null;
  if (role !== 'owner' && role !== 'read' && role !== 'write') return null;
  if (!expiresRaw || !signature) return null;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return null;
  const payload = `${roomId}:${leaseId}:${role}:${expiresAt}`;
  if (await hmacBase64Url(signingKey, payload) !== signature) return null;
  return { version, roomId, leaseId, role, expiresAt };
}

export function roleForTokenHash(tokenHash: string, authorizedTokenHashes: AuthorizedTokenHashes): RelayRole | null {
  if (authorizedTokenHashes.owner === tokenHash) return 'owner';
  if (authorizedTokenHashes.write === tokenHash) return 'write';
  if (authorizedTokenHashes.read === tokenHash) return 'read';
  return null;
}


export async function deriveRoleSecret(owner: ParsedRelayToken, role: Exclude<RelayRole, 'owner'>): Promise<string> {
  const prefix = role === 'read' ? 'read_' : 'write_';
  return `${prefix}${await sha256Base64Url(`changedown-relay-role:v1:${owner.roomId}:${role}:${owner.secret}`)}`;
}

export async function deriveRoleToken(owner: ParsedRelayToken, role: Exclude<RelayRole, 'owner'>): Promise<string> {
  return `${owner.version}.${owner.roomId}.${await deriveRoleSecret(owner, role)}`;
}


export function roleFromRelayToken(parsed: ParsedRelayToken): RelayRole {
  if (parsed.secret.startsWith('read_')) return 'read';
  if (parsed.secret.startsWith('write_')) return 'write';
  return 'owner';
}
