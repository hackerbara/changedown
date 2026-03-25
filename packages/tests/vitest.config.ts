import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest-setup.ts'],
    include: [
      'core/**/*.test.ts',
      'engine/**/*.test.ts',
      'mcp/**/*.test.ts',
      'hooks/**/*.test.ts',
      'opencode/**/*.test.ts',
      'lsp/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: [
          '@changetracks/core',
          '@changetracks/docx',
          '@changetracks/lsp-server',
          '@changetracks/mcp',
          '@changetracks/opencode-plugin',
          'changetracks',
          'changetracks-hooks',
          'diff',
          'xxhash-wasm',
        ],
      },
    },
  },
});
