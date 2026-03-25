import { beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core';

beforeAll(async () => {
  await initHashline();
});
