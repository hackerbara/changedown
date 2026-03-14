import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/**/*.test.ts',
      'engine/**/*.test.ts',
      'mcp/**/*.test.ts',
      'hooks/**/*.test.ts',
      'opencode/**/*.test.ts',
      'lsp/**/*.test.ts',
    ],
    deps: {
      inline: ['@changetracks/core'],
    },
  },
});
