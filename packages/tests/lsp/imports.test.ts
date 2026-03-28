/**
 * Test that imports from core package work correctly
 */

import { describe, it, expect } from 'vitest';
import { Workspace } from '@changedown/core';

describe('Package Integration', () => {
  it('can import Workspace from core package', () => {
    const workspace = new Workspace();
    expect(workspace).toBeTruthy();
  });
});
