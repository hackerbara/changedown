// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { findWorkbenchJsPath, isCursorApp } from '../detect-cursor.js';

describe('detect-cursor', () => {
  it('detects Cursor app from app path', () => {
    expect(isCursorApp('/Applications/Cursor.app/Contents/Resources/app')).toBe(true);
    expect(isCursorApp('/Applications/Visual Studio Code.app/Contents/Resources/app')).toBe(false);
  });

  it('constructs workbench JS path from app root', () => {
    const path = findWorkbenchJsPath('/Applications/Cursor.app/Contents/Resources/app');
    expect(path).toBe('/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js');
  });
});
