import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');

// Build the extension
await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'ES2020',
    sourcemap: !production,
    minify: production,
});

// Bundle LSP server into a single file so the packaged extension doesn't need
// node_modules at runtime (avoids "Cannot find module 'vscode-languageserver/node'").
const serverEntry = path.join(__dirname, '..', 'lsp-server', 'dist', 'bin', 'server.js');
const serverOutDir = path.join(__dirname, 'out', 'server');
const serverOutFile = path.join(serverOutDir, 'server.js');

fs.mkdirSync(serverOutDir, { recursive: true });

await esbuild.build({
    entryPoints: [serverEntry],
    bundle: true,
    outfile: serverOutFile,
    format: 'cjs',
    platform: 'node',
    target: 'ES2020',
    sourcemap: !production,
    minify: production,
    // Resolve from lsp-server so vscode-languageserver and @changetracks/core are found
    absWorkingDir: path.join(__dirname, '..', 'lsp-server'),
});

console.log(`Bundled LSP server to ${serverOutFile}`);
