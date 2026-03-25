// packages/vscode-extension/src/document-state.ts

export interface ExtDocumentState {
  /** VS Code's TextDocument.version at last mutation */
  version: number;

  /** Previous document text for deletion extraction during tracking */
  shadow: string;

  /** Per-document ct-ID allocator */
  nextScId: number;

  /** LSP-sourced tracking state */
  tracking: { enabled: boolean; source: string };

  /** LSP-sourced view mode (mirrored, not authoritative — controller._viewMode owns truth) */
  lspViewMode: string;

  /** User toggle override (trumps LSP). Undefined = no override. */
  userTrackingOverride: boolean | undefined;

  /** Last cursor offset for hidden-range snap direction */
  lastCursorOffset: number;

  /**
   * Suppresses tracking during L3↔L2 conversion and projected view transitions.
   * Set by promotionStarting notification, cleared by promotionComplete.
   * Cross-process invariant: if LSP crashes between start/complete, stays true.
   */
  isConverting: boolean;
}

export function createExtDocumentState(version: number, text: string): ExtDocumentState {
  return {
    version,
    shadow: text,
    nextScId: 1,
    tracking: { enabled: false, source: 'default' },
    lspViewMode: 'review',
    userTrackingOverride: undefined,
    lastCursorOffset: 0,
    isConverting: false,
  };
}
