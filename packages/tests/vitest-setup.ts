import { beforeAll } from 'vitest';
import { initHashline } from '@changedown/core';

beforeAll(async () => {
  await initHashline();
});
