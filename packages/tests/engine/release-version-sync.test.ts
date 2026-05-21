import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('release: mcp-server version.ts sync', () => {
  it('matches mcp-server/package.json', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/mcp/package.json'), 'utf8'));
    const versionTs = fs.readFileSync(path.join(root, 'packages/mcp/src/version.ts'), 'utf8');
    const m = versionTs.match(/version\s*=\s*['"]([^'"]+)['"]/);
    expect(m, 'version.ts should export `version` as a string literal').toBeTruthy();
    expect(m![1]).toBe(pkg.version);
  });
});
