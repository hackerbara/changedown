import type { VirtualDocument, ViewName } from '@changedown/core';
import type { CursorState } from './capabilities/code-lens';

/**
 * Pending overlay from VS Code extension (Phase 1).
 * In-flight insertion before flush; LSP merges with parse for decorationData.
 */
export interface PendingOverlay {
  range: { start: number; end: number };
  text: string;
  type: 'insertion';
  scId?: string;
}

export interface LspDocumentState {
  version: number;
  parseResult: VirtualDocument;
  text: string;
  languageId: string;
  overlay: PendingOverlay | null;
  viewMode: ViewName;
  cursorState: CursorState | null;
  decorationTimeout: ReturnType<typeof setTimeout> | null;
  isPromoting: boolean;
  isBatchEditing: boolean;
  suppressRepromotion: boolean;
  /** True after autoFoldLines has been sent for this document. Reset on view mode leave from review/changes. */
  autoFoldSent: boolean;
}

export function createLspDocumentState(
  version: number,
  text: string,
  languageId: string,
  parseResult: VirtualDocument,
): LspDocumentState {
  return {
    version, text, languageId, parseResult,
    overlay: null,
    viewMode: 'review',
    cursorState: null,
    decorationTimeout: null,
    isPromoting: false,
    isBatchEditing: false,
    suppressRepromotion: false,
    autoFoldSent: false,
  };
}
