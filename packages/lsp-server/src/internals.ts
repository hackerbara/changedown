/**
 * Internal barrel export for test consumption.
 *
 * Re-exports everything from the public API plus internal modules
 * that tests need but are not part of the public surface.
 */

// Public API (re-exported from index.ts)
export * from './server';
export * from './converters';
export * from './capabilities/hover';
export * from './notifications/decoration-data';
export * from './notifications/pending-edit';
export * from './pending-edit-manager';

// Internal modules needed by tests
export * from './notifications/document-state';
export * from './git';
export * from './capabilities/code-actions';
export * from './capabilities/code-lens';
export * from './capabilities/diagnostics';
export * from './capabilities/document-links';
export * from './capabilities/folding-ranges';
export * from './capabilities/semantic-tokens';

// Re-export LSP types and values that tests need
export {
  Position,
  Range,
  CodeActionKind,
  DiagnosticSeverity,
  TextDocumentSyncKind,
} from 'vscode-languageserver';
export type {
  Connection,
  InitializeParams,
  InitializeResult,
  WorkspaceEdit,
  TextEdit,
  CodeLens,
  Command,
  Diagnostic,
  SemanticTokensLegend,
  FoldingRange,
} from 'vscode-languageserver';
