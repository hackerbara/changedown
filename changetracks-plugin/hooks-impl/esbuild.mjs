import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');

// Each hook runs as a separate Node process (per hooks.json)
await esbuild.build({
  entryPoints: [
    'src/pre-tool-use.ts',
    'src/post-tool-use.ts',
    'src/stop.ts',
    'src/adapters/cursor/pre-tool-use.ts',
    'src/adapters/cursor/before-mcp-execution.ts',
    'src/adapters/cursor/before-read-file.ts',
    'src/adapters/cursor/after-file-edit.ts',
    'src/adapters/cursor/stop.ts',
  ],
  bundle: true,
  outdir: 'dist',
  outbase: 'src',
  format: 'esm',
  platform: 'node',
  target: 'ES2022',
  sourcemap: true,
  minify: production,
});

console.log('Bundled hooks-impl → dist/ (pre-tool-use, post-tool-use, stop, adapters/cursor including pre-tool-use)');
