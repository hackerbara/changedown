/**
 * Browser-safe entry point for @changedown/docx.
 * Excludes Node-only imports (fs, path, image-size, pandoc CLI).
 */
export { importDocxFromAst } from './import/import-from-ast.js';
export { exportDocx } from './export/exporter.js';
export type { ImportStats, ExportOptions, ExportStats, ExportMode, CommentMode, ImageFormat, ImageDimensions, ImageInfo } from './types.js';
