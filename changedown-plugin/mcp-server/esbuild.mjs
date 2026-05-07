import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');

// Shared config — sources already have shebangs, esbuild preserves them
const shared = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'ES2022',
  sourcemap: true,
  minify: production,
};

// MCP server entry point (what Claude Code runs via stdio)
await esbuild.build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  external: ['ws'],
});

// CLI entry point
// cli.ts pulls in commander (a CJS package) transitively through changedown/cli-runner.
// Commander's command.js calls require("node:events") / require("node:path") etc.
// In an ESM bundle esbuild cannot satisfy those via its __require shim (no `require`
// in scope).  Injecting createRequire restores a working `require` for the shim.
await esbuild.build({
  ...shared,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  banner: {
    js: 'import { createRequire } from "node:module"; var require = createRequire(import.meta.url);',
  },
});

// Internals entry point (used by tests)
await esbuild.build({
  ...shared,
  entryPoints: ['src/internals.ts'],
  outfile: 'dist/internals.js',
});

// Worker-safe remote relay facade subpath. Keep this browser-bundleable.
await esbuild.build({
  ...shared,
  platform: 'browser',
  entryPoints: ['src/remote-worker.ts'],
  outfile: 'dist/remote-worker.js',
});

// Transport entry points (leader election + HTTP transport modules)
await esbuild.build({
  ...shared,
  entryPoints: ['src/transport/fixed-port-leader.ts'],
  outfile: 'dist/transport/fixed-port-leader.js',
});

await esbuild.build({
  ...shared,
  entryPoints: ['src/transport/streamable-http.ts'],
  outfile: 'dist/transport/streamable-http.js',
});

await esbuild.build({
  ...shared,
  entryPoints: ['src/transport/client-proxy.ts'],
  outfile: 'dist/transport/client-proxy.js',
});

await esbuild.build({
  ...shared,
  entryPoints: ['src/transport/pane-endpoint.ts'],
  outfile: 'dist/transport/pane-endpoint.js',
});

// RemoteBackend — DocumentBackend implementation over pane RPC (Tranche 3.5)
await esbuild.build({
  ...shared,
  entryPoints: ['src/remote-backend.ts'],
  outfile: 'dist/remote-backend.js',
});

// Pane-registration callback factory — wires pane registrations into BackendRegistry
// remote-backend.js stays external so consumers and this bundle share one
// RemoteBackend module identity (instanceof checks work across modules).
await esbuild.build({
  ...shared,
  entryPoints: ['src/pane-registration.ts'],
  outfile: 'dist/pane-registration.js',
  external: ['./remote-backend.js'],
});

console.log('Bundled mcp-server → dist/index.js, dist/cli.js, dist/internals.js, dist/remote-worker.js, dist/transport/fixed-port-leader.js, dist/transport/streamable-http.js, dist/transport/client-proxy.js, dist/transport/pane-endpoint.js, dist/remote-backend.js, dist/pane-registration.js');
