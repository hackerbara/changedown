export function validateOrigin(request: Request, allowed: string[]): Response | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (allowed.includes(origin)) return null;
  return new Response('Forbidden origin', { status: 403 });
}

export function corsHeaders(request: Request, allowed: string[]): Headers | null {
  const origin = request.headers.get('Origin');
  if (!origin || !allowed.includes(origin)) return null;
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key,X-Agent-Id,X-Share-Token');
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Vary', 'Origin');
  return headers;
}

export function corsPreflightResponse(request: Request, allowed: string[]): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const headers = corsHeaders(request, allowed);
  if (!headers) return new Response('Forbidden origin', { status: 403 });
  return new Response(null, { status: 204, headers });
}

export function withCorsHeaders(request: Request, allowed: string[], response: Response): Response {
  const cors = corsHeaders(request, allowed);
  if (!cors) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of cors) {
    if (key.toLowerCase() === 'vary') {
      const existing = headers.get('Vary');
      headers.set('Vary', existing ? `${existing}, ${value}` : value);
    } else {
      headers.set(key, value);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
