// packages/tests/mcp-transport/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    // Each test file gets its own OS process so port leaks from a crashed
    // test cannot pollute siblings. Required because these tests spawn real
    // mcp-server subprocesses against real loopback ports.
    pool: 'forks',
    isolate: false,
    // Default vitest timeout is 5s; subprocess startup + SSE drain can need more.
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ['**/*.test.ts'],
  },
});
