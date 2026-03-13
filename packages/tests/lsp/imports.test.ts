/**
 * Test that imports from core package work correctly
 */

import * as assert from 'assert';
import { Workspace } from '@changetracks/core';

describe('Package Integration', () => {
  it('can import Workspace from core package', () => {
    const workspace = new Workspace();
    assert.ok(workspace, 'Workspace should be instantiable');
  });
});
