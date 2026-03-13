/**
 * Runtime browser shim for the 'vscode' module.
 *
 * The preview plugin's import chain reaches visual-semantics.ts which does
 * `import * as vscode from 'vscode'`. In the browser there is no vscode
 * module, so this shim provides the subset of exports that are actually
 * used at runtime.
 *
 * Vite config aliases 'vscode' → this file.
 */

/** Stub for vscode.ThemeIcon — used by visual-semantics.ts iconForType(). */
export class ThemeIcon {
  constructor(public id: string) {}
}

/** Stub for vscode.ColorThemeKind enum values. */
export const ColorThemeKind = { Dark: 2, Light: 1, HighContrast: 3 } as const;

/**
 * Stub for vscode.workspace — the preview plugin's getVSCodeConfig() calls
 * require('vscode').workspace.getConfiguration() inside a try/catch, so this
 * is only reached if the bundler resolves the require statically.
 */
export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
};

/**
 * Stub for vscode.window — getVSCodeConfig() reads
 * vscode.window.activeColorTheme?.kind.
 */
export const window = {
  activeColorTheme: { kind: 2 }, // Dark theme
};
