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
      'preview/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: [
          '@changedown/core',
          '@changedown/docx',
          '@changedown/lsp-server',
          '@changedown/preview',
          '@changedown/mcp',
          '@changedown/opencode-plugin',
          'changedown',
          'changedown-hooks',
          'diff',
          'xxhash-wasm',
        ],
      },
    },
  },
});
