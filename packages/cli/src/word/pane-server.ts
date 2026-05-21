import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_PANE_PORT = 3000;
const LOCAL_PANE_HOST = '127.0.0.1';
const CERT_DIR = path.join(os.homedir(), '.office-addin-dev-certs');

export const LOCAL_PANE_ORIGIN = `https://${LOCAL_PANE_HOST}:${LOCAL_PANE_PORT}`;
export const PACKAGED_WORD_PANE_DIR = fileURLToPath(new URL('../../word-pane/', import.meta.url));
export const PACKAGED_LOCAL_MANIFEST_PATH = path.join(PACKAGED_WORD_PANE_DIR, 'manifest.xml');

export interface LocalPaneServerHandle {
  url: string;
  close(): Promise<void>;
}

function contentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case '.css': return 'text/css; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.ico': return 'image/x-icon';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    case '.xml': return 'application/xml; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function safeResolveAsset(urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  } catch {
    return undefined;
  }
  const relative = decoded === '/' ? 'taskpane.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(PACKAGED_WORD_PANE_DIR, relative);
  const root = path.resolve(PACKAGED_WORD_PANE_DIR);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return undefined;
  return resolved;
}

async function readDevCerts(): Promise<{ key: Buffer; cert: Buffer }> {
  try {
    const [key, leaf, ca] = await Promise.all([
      fs.readFile(path.join(CERT_DIR, 'localhost.key')),
      fs.readFile(path.join(CERT_DIR, 'localhost.crt')),
      fs.readFile(path.join(CERT_DIR, 'ca.crt')).catch(() => undefined),
    ]);
    // Serve the full chain (leaf + CA) as a PEM bundle. Word's WKWebView on
    // macOS rejects leaf-only chains with a silent TLS handshake failure
    // (openssl: "unable to verify the first certificate"). The Node `ca`
    // option controls client-cert trust, not server chain — it must NOT be
    // used here. See packages/mcp/src/transport/fixed-port-leader.ts.
    const cert = ca ? Buffer.concat([leaf, Buffer.from('\n'), ca]) : leaf;
    return { key, cert };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Office dev certificates were not found under ${CERT_DIR}. ` +
      `Run \`npx office-addin-dev-certs install\` and trust the prompt, ` +
      `or fall back to the hosted pane: \`changedown word start --pane hosted\`. ` +
      message,
    );
  }
}

export async function startLocalPaneServer(dryRun = false): Promise<LocalPaneServerHandle | undefined> {
  if (dryRun) {
    console.log(`[dry-run] serve packaged Word pane from ${PACKAGED_WORD_PANE_DIR} at ${LOCAL_PANE_ORIGIN}`);
    return undefined;
  }

  const certs = await readDevCerts();
  const server = https.createServer(certs, async (req, res) => {
    try {
      const assetPath = safeResolveAsset(req.url ?? '/');
      if (!assetPath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const body = await fs.readFile(assetPath);
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': contentType(assetPath),
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_PANE_PORT, LOCAL_PANE_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(
        `${LOCAL_PANE_ORIGIN} is already in use. Stop the existing process, run \`changedown word stop\`, ` +
        'or use `changedown word start --pane hosted`.',
      );
    }
    throw err;
  });

  console.log(`Serving local ChangeDown Word pane at ${LOCAL_PANE_ORIGIN}`);
  return {
    url: LOCAL_PANE_ORIGIN,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}
