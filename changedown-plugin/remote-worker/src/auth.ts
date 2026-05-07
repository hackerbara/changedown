export { deriveRoleToken, parseRelayToken, roleFromRelayToken, roomIdFromRelayLikeToken } from './room/token.js';
export type { ParsedRelayToken, ParsedLeaseToken } from './room/token.js';

export function tokenFromRequest(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return request.headers.get('x-share-token') ?? new URL(request.url).searchParams.get('token');
}

export function queryTokenHeaders(request: Request): HeadersInit {
  return new URL(request.url).searchParams.has('token') ? { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } : {};
}
