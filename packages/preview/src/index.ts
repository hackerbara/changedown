export { ThemeColor, CHANGE_COLORS, AUTHOR_PALETTE, ChangeStyleInfo, getChangeStyle } from './palette.js';
export { PreviewAuthorColorMap } from './author-colors.js';
export { escapeHtml, sanitizeContentHtml } from './escape-html.js';
export { buildReplacements, findFenceZones, LineOffsetMap } from './replacements.js';
export type { PreviewOptions, FenceZone } from './replacements.js';
export { containsCriticMarkup, renderFenceWithCriticMarkup, changedownPlugin } from './plugin.js';
export type { PluginConfig } from './plugin.js';
export { buildDecorationPlan, AuthorColorMap } from './decoration-logic.js';
export type { DecorationPlan, OffsetDecoration, OffsetRange, ViewMode, AuthorDecorationRole } from './decoration-logic.js';
