import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@preview': resolve(__dirname, '../packages/vscode-extension/src/preview'),
      // Stub: visual-semantics imports vscode which doesn't exist in browser
      'vscode': resolve(__dirname, 'src/vscode-shim.ts'),
    },
    conditions: ['import', 'module', 'browser', 'default'],
  },
  optimizeDeps: {
    include: ['@changetracks/core', 'markdown-it'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
