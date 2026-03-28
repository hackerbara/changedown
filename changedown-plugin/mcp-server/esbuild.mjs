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
});

// CLI entry point
await esbuild.build({
  ...shared,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
});

// Internals entry point (used by tests)
await esbuild.build({
  ...shared,
  entryPoints: ['src/internals.ts'],
  outfile: 'dist/internals.js',
});

console.log('Bundled mcp-server → dist/index.js, dist/cli.js, dist/internals.js');
