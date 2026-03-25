import * as vscode from 'vscode';
import { Workspace, VirtualDocument, ChangeNode, scanMaxCtId } from '@changetracks/core';
import { getCachedDecorationData, migrateDecorationCache } from '../lsp-client';
import { ExtDocumentState, createExtDocumentState } from '../document-state';
import { isSupported } from './shared';

/** Debounce notifications so SCM/Explorer/Comments don't run on every decoration run. */
const NOTIFY_CHANGES_DEBOUNCE_MS = 120;

export class DocumentStateManager implements vscode.Disposable {
    private docStates = new Map<string, ExtDocumentState>();
    public readonly workspace: Workspace;

    /** Pending URIs to include in next notify (debounce coalescing). */
    private pendingNotifyUris = new Set<string>();
    private notifyChangesTimeout: ReturnType<typeof setTimeout> | null = null;

    private readonly _onDidChangeChanges = new vscode.EventEmitter<vscode.Uri[]>();
    /** Fires when the set of changes may have changed. Payload: URIs of affected documents. */
    public readonly onDidChangeChanges = this._onDidChangeChanges.event;

    private readonly _onDidChangeDocumentState = new vscode.EventEmitter<{ uri: string; state: { tracking: { enabled: boolean; source: string }; viewMode: string } }>();
    /** Fires when LSP pushes document state (tracking, viewMode). */
    public readonly onDidChangeDocumentState = this._onDidChangeDocumentState.event;

    /** Callback to retrieve pending change nodes from PendingEditManager. */
    private readonly getPendingNodes: (uri: string) => ChangeNode[];

    /** Optional callback for file rename cleanup (e.g. comment thread disposal). */
    private onRenameCleanup: ((oldUri: string) => void) | undefined;

    constructor(
        getPendingNodes: (uri: string) => ChangeNode[],
        onRenameCleanup?: (oldUri: string) => void
    ) {
        this.workspace = new Workspace();
        this.getPendingNodes = getPendingNodes;
        this.onRenameCleanup = onRenameCleanup;
    }

    // ── Static helpers ─────────────────────────────────────────────────────

    /**
     * Filter out optimistic ChangeNodes produced by PendingEditManager.
     * Optimistic nodes have id='' and level=0 — they lack metadata and
     * should not appear in review panels, hover tooltips, or CodeLens.
     */
    static filterOptimisticNodes(changes: ChangeNode[]): ChangeNode[] {
        return changes.filter(c => c.id !== '' && c.level > 0);
    }

    /** Merge sorted ChangeNode[] with pending nodes via binary insertion (O(n) vs O(n log n) sort). */
    static mergeWithPending(sorted: ChangeNode[], pending: ChangeNode[]): ChangeNode[] {
        const result = [...sorted];
        for (const node of pending) {
            // Binary search for insertion point
            let lo = 0, hi = result.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (result[mid].range.start < node.range.start) lo = mid + 1;
                else hi = mid;
            }
            result.splice(lo, 0, node);
        }
        return result;
    }

    // ── State accessors ────────────────────────────────────────────────────

    ensureDocState(uri: string, version: number, text: string): ExtDocumentState {
        let state = this.docStates.get(uri);
        if (!state) {
            state = createExtDocumentState(version, text);
            this.docStates.set(uri, state);
        }
        return state;
    }

    getState(uri: string): ExtDocumentState | undefined {
        return this.docStates.get(uri);
    }

    removeState(uri: string): void {
        this.docStates.delete(uri);
    }

    // ── scId allocation ────────────────────────────────────────────────────

    /**
     * Allocate the next ct-ID for a document. IDs are sequential per-document
     * and formatted as 'ct-N' where N starts from 1 (or max+1 if document already has ct-IDs).
     */
    allocateScId(docUri: string): string {
        let state = this.docStates.get(docUri);
        if (!state) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === docUri) {
                state = this.ensureDocState(docUri, editor.document.version, editor.document.getText());
                const maxId = scanMaxCtId(editor.document.getText());
                state.nextScId = maxId + 1;
            }
        } else if (state.nextScId === 1) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === docUri) {
                const maxId = scanMaxCtId(editor.document.getText());
                state.nextScId = maxId + 1;
            }
        }
        const current = state?.nextScId ?? 1;
        if (state) state.nextScId = current + 1;
        return `ct-${current}`;
    }

    // ── Virtual document construction ──────────────────────────────────────

    /**
     * Get VirtualDocument for a URI. Merges LSP-sourced ChangeNodes with
     * optimistic nodes from PendingEditManager for instant decoration feedback.
     *
     * Priority:
     * 1. LSP decoration cache (authoritative) + optimistic overlay
     * 2. Local parse fallback (for non-decoration callers: navigation, accept/reject)
     * 3. Optimistic overlay only (LSP not ready, no fallback requested)
     *
     * @param parseFallback When true, parse locally if cache is empty
     *   (for in-memory edit consumers: compactChangeFully, accept/reject, navigation).
     */
    getVirtualDocumentFor(uri: string, text: string, languageId?: string, parseFallback?: boolean): VirtualDocument {
        const cached = getCachedDecorationData(uri);
        const pendingNodes = this.getPendingNodes(uri);

        if (cached) {
            const currentVersion = this.docStates.get(uri)?.version ?? 0;
            if (cached.documentVersion === currentVersion) {
                // Cache is current — use LSP data
                if (pendingNodes.length > 0) {
                    return new VirtualDocument(DocumentStateManager.mergeWithPending(cached.changes, pendingNodes));
                }
                return new VirtualDocument(cached.changes);
            }
            // Cache is stale — fall through to local parse
        }

        // Fallback: local parse for non-decoration callers (navigation, accept/reject, etc.)
        if (parseFallback) {
            const localDoc = this.workspace.parse(text, languageId ?? 'markdown');
            if (pendingNodes.length > 0) {
                return new VirtualDocument(DocumentStateManager.mergeWithPending(localDoc.getChanges(), pendingNodes));
            }
            return localDoc;
        }

        // No LSP data, no fallback: return optimistic nodes only
        return new VirtualDocument(pendingNodes);
    }

    /**
     * Returns the current list of changes for a document (from LSP cache or local parse).
     * Used by Change Explorer and other consumers that need ChangeNode[].
     */
    getChangesForDocument(doc: vscode.TextDocument): ChangeNode[] {
        if (!isSupported(doc)) {
            return [];
        }
        const uri = doc.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, doc.getText(), doc.languageId, true);
        return DocumentStateManager.filterOptimisticNodes(virtualDoc.getChanges());
    }

    // ── Document state from LSP ────────────────────────────────────────────

    /**
     * Called when LSP sends changetracks/documentState.
     * Stores tracking + viewMode on the doc state and fires onDidChangeDocumentState
     * for the controller to update context keys.
     */
    setDocumentState(uri: string, state: { tracking: { enabled: boolean; source: string }; viewMode: string }): void {
        const ds = this.ensureDocState(uri, 0, '');
        ds.tracking = state.tracking;
        ds.lspViewMode = state.viewMode;
        this._onDidChangeDocumentState.fire({ uri, state });
        this.scheduleNotifyChanges();
    }

    // ── File rename ────────────────────────────────────────────────────────

    handleFileRename(oldUri: string, newUri: string): void {
        // Migrate per-document state bag
        const oldState = this.docStates.get(oldUri);
        if (oldState) {
            const existingState = this.docStates.get(newUri);
            if (existingState) {
                oldState.nextScId = Math.max(oldState.nextScId, existingState.nextScId);
            }
            this.docStates.set(newUri, oldState);
            this.docStates.delete(oldUri);
        }

        // Migrate decoration cache
        migrateDecorationCache(oldUri, newUri);

        // Comment threads: dispose and let them recreate on next decoration update
        this.onRenameCleanup?.(oldUri);
    }

    // ── Notify changes (debounced) ─────────────────────────────────────────

    /**
     * Debounce notifications to listeners (SCM, Change Explorer, comments, timeline).
     * @param uris URIs of affected documents; if omitted, uses visible supported editors.
     */
    scheduleNotifyChanges(uris?: vscode.Uri[]): void {
        if (uris?.length) {
            uris.forEach(u => this.pendingNotifyUris.add(u.toString()));
        } else {
            vscode.window.visibleTextEditors
                .filter(e => isSupported(e.document))
                .forEach(e => this.pendingNotifyUris.add(e.document.uri.toString()));
        }
        if (this.notifyChangesTimeout) {
            clearTimeout(this.notifyChangesTimeout);
            this.notifyChangesTimeout = null;
        }
        this.notifyChangesTimeout = setTimeout(() => {
            this.notifyChangesTimeout = null;
            const arr = Array.from(this.pendingNotifyUris).map(s => vscode.Uri.parse(s));
            this.pendingNotifyUris.clear();
            this._onDidChangeChanges.fire(arr);
        }, NOTIFY_CHANGES_DEBOUNCE_MS);
    }

    // ── Test / lifecycle ───────────────────────────────────────────────────

    resetForTest(): void {
        this.docStates.clear();
        this.pendingNotifyUris.clear();
        if (this.notifyChangesTimeout) {
            clearTimeout(this.notifyChangesTimeout);
            this.notifyChangesTimeout = null;
        }
    }

    dispose(): void {
        this.docStates.clear();
        this.pendingNotifyUris.clear();
        if (this.notifyChangesTimeout) {
            clearTimeout(this.notifyChangesTimeout);
            this.notifyChangesTimeout = null;
        }
        this._onDidChangeChanges.dispose();
        this._onDidChangeDocumentState.dispose();
    }
}
