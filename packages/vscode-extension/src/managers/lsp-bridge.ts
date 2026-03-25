import * as vscode from 'vscode';
import type { PendingOverlay, ChangeNode } from '@changetracks/core';
import { scanMaxCtId } from '@changetracks/core';
import type { BatchEditSender } from '../lsp-client';
import { invalidateDecorationCache } from '../lsp-client';
import { DocumentStateManager } from './document-state-manager';
import { findSupportedEditor } from './shared';
import type { ViewMode } from '../view-mode';

/**
 * LspBridge owns all LSP communication — senders, lifecycle requests,
 * decoration/promotion handlers.
 *
 * Events:
 * - onDidReceiveDecorationData(uri) — fired when LSP pushes decoration data
 * - onDidCompletePromotion(uri) — fired when LSP signals promotion complete
 */
export class LspBridge implements vscode.Disposable {
    // ── Senders (late-bound by extension.ts after LSP ready) ──────────────

    private overlaySender: ((uri: string, overlay: PendingOverlay | null) => void) | null = null;
    private viewModeSender: ((uri: string, viewMode: ViewMode) => void) | null = null;
    private cursorPositionSender?: (uri: string, line: number, changeId?: string) => void;
    private batchEditSender: BatchEditSender | null = null;

    /** LSP client for lifecycle requests (accept/reject/amend/supersede) and project config. */
    private lspClient: { sendRequest: (method: string, params: any) => Promise<any> } | null = null;

    // ── Overlay debounce state ────────────────────────────────────────────

    private overlaySendTimeout: ReturnType<typeof setTimeout> | null = null;
    private static readonly OVERLAY_SEND_DEBOUNCE_MS = 50;
    private lastOverlayUri: string | null = null;

    // ── Events ────────────────────────────────────────────────────────────

    private readonly _onDidReceiveDecorationData = new vscode.EventEmitter<string>();
    /** Fires when LSP pushes decoration data for a URI. */
    public readonly onDidReceiveDecorationData = this._onDidReceiveDecorationData.event;

    private readonly _onDidCompletePromotion = new vscode.EventEmitter<string>();
    /** Fires when LSP signals promotion is complete for a URI. */
    public readonly onDidCompletePromotion = this._onDidCompletePromotion.event;

    // ── Dependencies ──────────────────────────────────────────────────────

    private readonly docStateManager: DocumentStateManager;
    private readonly getPendingOverlay: (uri: string) => PendingOverlay | null;

    constructor(
        docStateManager: DocumentStateManager,
        getPendingOverlay: (uri: string) => PendingOverlay | null
    ) {
        this.docStateManager = docStateManager;
        this.getPendingOverlay = getPendingOverlay;
    }

    // ── Setter methods (keep as public — late-bound by extension.ts) ─────

    public setOverlaySender(send: (uri: string, overlay: PendingOverlay | null) => void): void {
        this.overlaySender = send;
    }

    public setViewModeSender(send: (uri: string, viewMode: ViewMode) => void): void {
        this.viewModeSender = send;
    }

    public setCursorPositionSender(send: (uri: string, line: number, changeId?: string) => void): void {
        this.cursorPositionSender = send;
    }

    public setLspClient(client: { sendRequest: (method: string, params: any) => Promise<any> } | null): void {
        this.lspClient = client;
    }

    public setBatchEditSender(sender: BatchEditSender | null): void {
        this.batchEditSender = sender;
    }

    // ── Batch edit bracket (convenience for controller call sites) ────────

    /**
     * Send batch edit start/end to LSP. Used by controller for projected view,
     * save hooks, compact-all-resolved, and view mode transitions.
     */
    public batchEdit(action: 'start' | 'end', uri: string): void {
        this.batchEditSender?.(action, uri);
    }

    // ── View mode and cursor position sending ─────────────────────────────

    /**
     * Send view mode notification to LSP for a URI.
     */
    public sendViewMode(uri: string, viewMode: ViewMode): void {
        this.viewModeSender?.(uri, viewMode);
    }

    /**
     * Returns true if a view mode sender has been wired.
     */
    public get hasViewModeSender(): boolean {
        return this.viewModeSender !== null;
    }

    /**
     * Send cursor position to LSP.
     */
    public sendCursorPosition(uri: string, line: number, changeId?: string): void {
        this.cursorPositionSender?.(uri, line, changeId);
    }

    // ── Overlay sending ──────────────────────────────────────────────────

    /**
     * Debounced overlay send. Sends overlay for active document to LSP.
     * Clears previous URI when switching docs.
     */
    public scheduleOverlaySend(): void {
        if (!this.overlaySender) return;
        if (this.overlaySendTimeout) clearTimeout(this.overlaySendTimeout);
        this.overlaySendTimeout = setTimeout(() => {
            this.overlaySendTimeout = null;
            const editor = vscode.window.activeTextEditor;
            const uri = editor?.document.uri.toString();
            const overlay = uri ? this.getPendingOverlay(uri) : null;
            if (this.lastOverlayUri && this.lastOverlayUri !== uri) {
                this.overlaySender!(this.lastOverlayUri, null);
                this.lastOverlayUri = null;
            }
            if (uri) {
                this.overlaySender!(uri, overlay);
                this.lastOverlayUri = overlay ? uri : null;
            }
        }, LspBridge.OVERLAY_SEND_DEBOUNCE_MS);
    }

    /**
     * Send overlay=null for a URI immediately (doc close, editor switch).
     */
    public sendOverlayNull(uri: string): void {
        if (!this.overlaySender) return;
        this.overlaySender(uri, null);
        if (this.lastOverlayUri === uri) this.lastOverlayUri = null;
    }

    // ── Decoration data handler ───────────────────────────────────────────

    /**
     * Called when LSP sends decoration data. Fires onDidReceiveDecorationData
     * so the controller can refresh decorations and notify consumers.
     */
    public handleDecorationDataUpdate(uri: string, _changes: ChangeNode[]): void {
        this._onDidReceiveDecorationData.fire(uri);
    }

    // ── Promotion lifecycle ───────────────────────────────────────────────

    /**
     * Called when LSP sends changetracks/promotionStarting.
     * Sets the isConverting guard to suppress tracking during the workspace/applyEdit.
     */
    public handlePromotionStarting(uri: string): void {
        const state = this.docStateManager.ensureDocState(uri, 0, '');
        state.isConverting = true;
    }

    /**
     * Called when LSP sends changetracks/promotionComplete.
     * Clears isConverting, updates shadow/scId via DocumentStateManager,
     * then fires onDidCompletePromotion for controller to refresh surfaces.
     */
    public handlePromotionComplete(uri: string): void {
        const promoState = this.docStateManager.getState(uri);
        if (promoState) promoState.isConverting = false;

        // Update shadow and scId for all visible editors showing this URI
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri) {
                const promotedText = editor.document.getText();
                const pState = this.docStateManager.ensureDocState(uri, editor.document.version, promotedText);
                pState.shadow = promotedText;
                const maxId = scanMaxCtId(promotedText);
                pState.nextScId = maxId + 1;
            }
        }

        this._onDidCompletePromotion.fire(uri);
    }

    // ── Lifecycle requests ────────────────────────────────────────────────

    /**
     * Send a lifecycle LSP request and apply the returned edits to the active editor.
     * Used by accept/reject/amend/supersede/resolve/unresolve commands.
     * Returns { success: true, result } if edits were applied, { success: false } on failure or cancellation.
     */
    public async sendLifecycleRequest<T extends { edit?: unknown; edits?: unknown[]; error?: string; warning?: string }>(
        requestName: string,
        params: Record<string, unknown>
    ): Promise<{ success: boolean; result?: T }> {
        const editor = findSupportedEditor();
        if (!editor || !this.lspClient) return { success: false };

        const uri = editor.document.uri.toString();
        this.batchEditSender?.('start', uri);
        try {
            let result: T;
            try {
                result = await this.lspClient.sendRequest(requestName, { uri, ...params }) as T;
            } catch (err) {
                vscode.window.showErrorMessage(`LSP request failed: ${err instanceof Error ? err.message : String(err)}`);
                return { success: false };
            }

            if (result.error) {
                if (result.error === 'unresolved_discussion' && result.warning) {
                    const proceed = await vscode.window.showWarningMessage(
                        result.warning,
                        { modal: true },
                        'Proceed Anyway'
                    );
                    if (proceed !== 'Proceed Anyway') return { success: false };
                    return this.sendLifecycleRequest(requestName, { ...params, force: true });
                }
                vscode.window.showErrorMessage(result.error);
                return { success: false };
            }

            // Handle both singular 'edit' and plural 'edits'
            const rawEdits = (result.edits ?? (result.edit ? [result.edit] : [])) as Record<string, unknown>[];
            if (rawEdits.length > 0) {
                const wsEdit = new vscode.WorkspaceEdit();
                for (const edit of rawEdits) {
                    let range: vscode.Range;
                    if ('range' in edit && edit.range) {
                        // LSP TextEdit format (range-based) — from fullDocumentEdit
                        const r = edit.range as { start: { line: number; character: number }; end: { line: number; character: number } };
                        range = new vscode.Range(
                            new vscode.Position(r.start.line, r.start.character),
                            new vscode.Position(r.end.line, r.end.character)
                        );
                    } else {
                        // Offset-based format
                        const offset = edit.offset as number;
                        const length = edit.length as number;
                        range = new vscode.Range(
                            editor.document.positionAt(offset),
                            editor.document.positionAt(offset + length)
                        );
                    }
                    wsEdit.replace(editor.document.uri, range, edit.newText as string);
                }
                await vscode.workspace.applyEdit(wsEdit);

                // Invalidate stale cache immediately
                invalidateDecorationCache(uri);

                // Update shadow and version immediately (not after debounce)
                const state = this.docStateManager.getState(uri);
                if (state) {
                    state.shadow = editor.document.getText();
                    state.version = editor.document.version;
                }
            }

            return { success: true, result };
        } finally {
            this.batchEditSender?.('end', uri);
        }
    }

    // ── Project config ────────────────────────────────────────────────────

    /**
     * Fetch project config from LSP to determine if reasons are required.
     */
    public async getProjectConfig(): Promise<{ reasonRequired: { human: boolean } }> {
        if (!this.lspClient) {
            return { reasonRequired: { human: false } };
        }
        try {
            const result = await this.lspClient.sendRequest('changetracks/getProjectConfig', {});
            return result as { reasonRequired: { human: boolean } };
        } catch {
            return { reasonRequired: { human: false } };
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────

    public dispose(): void {
        if (this.overlaySendTimeout) {
            clearTimeout(this.overlaySendTimeout);
            this.overlaySendTimeout = null;
        }
        this._onDidReceiveDecorationData.dispose();
        this._onDidCompletePromotion.dispose();
    }
}
