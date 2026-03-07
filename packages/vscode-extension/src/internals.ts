/**
 * Internal barrel export for test consumption.
 *
 * Re-exports extension internals that @fast tier tests need.
 * These modules require a vscode mock to be installed before import
 * (see vscode-mock.ts in the test package).
 */

// Decorator
export { EditorDecorator } from './decorator';

// View port interface (for SpyEditor)
export { EditorPort } from './view/EditorPort';

// Visual semantics
export {
    CHANGE_COLORS,
    AUTHOR_PALETTE,
    getChangeStyle,
    typeLabel,
    typeLabelCapitalized,
    iconForType,
} from './visual-semantics';
export type { ThemeColor, ChangeStyleInfo } from './visual-semantics';

// Settings panel
export {
    DEFAULT_SETTINGS_CONFIG,
    DEFAULT_EDITOR_PREFS,
    generateSettingsHtml,
    parseFormData,
    parseEditorPreferences,
    serializeToToml,
    SettingsPanelProvider,
} from './settings-panel';
export type { SettingsConfig, EditorPreferencesConfig } from './settings-panel';

// Project status
export { ProjectStatusModel } from './project-status';
export type { ProjectStatusField, ProjectStatus } from './project-status';

// Preview
export { buildReplacements, findFenceZones } from './preview/replacements';
export type { PreviewOptions, FenceZone } from './preview/replacements';
export { containsCriticMarkup, renderFenceWithCriticMarkup, changetracksPlugin } from './preview/plugin';
export type { PluginConfig } from './preview/plugin';

// Git integration (used by @integration tier tests that run inside Extension Host)
export { getPreviousVersion } from './git-integration';
export { annotateFromGit } from './annotate-command';
export { ExtensionController } from './controller';

// Decoration cache helpers and optimistic range transform (used by @fast ORT1 tests).
// All live in range-transform.ts — no vscode or vscode-languageclient dependency —
// so @fast tier tests can import them without a full VS Code environment.
// lsp-client.ts re-exports these same symbols for callers in the extension runtime.
export {
    getCachedDecorationData,
    invalidateDecorationCache,
    setCachedDecorationData,
    transformRange,
    transformCachedDecorations,
} from './range-transform';
