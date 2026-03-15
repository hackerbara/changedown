/**
 * Internal barrel export for test consumption.
 *
 * Re-exports extension internals that @fast tier tests need.
 * These modules require a vscode mock to be installed before import
 * (see vscode-mock.ts in the test package).
 */

// Decorator
export { EditorDecorator } from './decorator';

// Hidden range search (cursor snap)
export { findContainingHiddenRange } from './hidden-range-search';

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

// DOCX preview
export { buildAnnotationCards } from './docx/annotation-extractor';
export type { AnnotationCard } from './docx/annotation-extractor';
export { renderMarkdownToHtml } from './docx/docx-preview-renderer';
export { buildLoadingHtml, buildErrorHtml, buildChoiceHtml, buildPreviewHtml } from './docx/docx-preview-html';
export type { ImportStats, PreviewHtmlOptions } from './docx/docx-preview-html';

// Review panel
export { generateReviewHtml, colorClassForType, getChangePreview, buildCardData } from './review-panel';
export type { ChangeCardData, ReviewPanelState } from './review-panel';

// Thread data builders (pure functions, no VS Code API dependency at runtime)
export { buildCommentsForChange, buildThreadDataForChanges } from './thread-data';
export type { CommentData, ThreadData } from './thread-data';

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
