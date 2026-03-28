import { build } from 'esbuild';

await build({
  entryPoints: ['src/bridge.ts'],
  bundle: true,
  outfile: 'dist/lexical-bridge.js',
  format: 'iife',
  globalName: 'ChangeDownLexical',
  target: 'chrome120',
  minify: false,
  sourcemap: true,
});

console.log('Built dist/lexical-bridge.js');
