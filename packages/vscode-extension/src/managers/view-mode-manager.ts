import * as vscode from 'vscode';
import type { ChangeNode } from '@changedown/core';
import { ViewMode, VIEW_MODE_LABELS, nextViewMode } from '../view-mode';
import { invalidateDecorationCache } from '../lsp-client';
import { ProjectedView } from '../projected-view';
import { DocumentStateManager } from './document-state-manager';
import { LspBridge } from './lsp-bridge';
import { isSupported } from './shared';

/**
 * Callbacks from controller for cross-cutting concerns that ViewModeManager
 * cannot own directly (they depend on other manager internals).
 */
export interface ViewModeCallbacks {
    updateDecorations(editor: vscode.TextEditor): void;
    scheduleNotifyChanges(uris?: vscode.Uri[]): void;
    getChangesForDocument(doc: vscode.TextDocument): ChangeNode[];
    updateStatusBar(): void;
    setContextKey(key: string, value: any): void;
}

/**
 * ViewModeManager owns the view mode state machine, projected view transitions,
 * delimiter visibility, and folding provider lifecycle.
 *
 * Extracted from controller.ts to isolate view mode concerns.
 */
export class ViewModeManager implements vscode.Disposable {
    private _viewMode: ViewMode;
    private _showDelimiters: boolean;
    private readonly projectedView = new ProjectedView();
    private readonly docStateManager: DocumentStateManager;
    private readonly lspBridge: LspBridge;
    private readonly callbacks: ViewModeCallbacks;

    private readonly _onDidChangeViewMode = new vscode.EventEmitter<ViewMode>();
    /** Fires when the view mode changes. Payload: new view mode. */
    public readonly onDidChangeViewMode = this._onDidChangeViewMode.event;

    constructor(
        docStateManager: DocumentStateManager,
        lspBridge: LspBridge,
        callbacks: ViewModeCallbacks,
        initialViewMode: ViewMode,
        initialShowDelimiters: boolean,
    ) {
        this.docStateManager = docStateManager;
        this.lspBridge = lspBridge;
        this.callbacks = callbacks;
        this._viewMode = initialViewMode;
        this._showDelimiters = initialShowDelimiters;
    }

    // ── Public accessors ────────────────────────────────────────────────

    public get viewMode(): ViewMode {
        return this._viewMode;
    }

    public get showDelimiters(): boolean {
        return this._showDelimiters;
    }

    /** Whether the projected view is currently active (buffer replaced with settled/raw text). */
    public get isProjectedViewActive(): boolean {
        return this.projectedView.active;
    }

    /** The URI of the document whose buffer is currently projected, or null. */
    public get projectedViewOriginalUri(): vscode.Uri | null {
        return this.projectedView.originalUri;
    }

    // ── Config updates ──────────────────────────────────────────────────

    /**
     * Update the showDelimiters flag (called from config change handler).
     */
    public updateShowDelimiters(value: boolean): void {
        this._showDelimiters = value;
    }

    // ── View mode transitions ───────────────────────────────────────────

    /**
     * Set the view mode, handling projected view transitions and notifying
     * LSP, decorations, folding provider, and status bar.
     */
    public async setViewMode(mode: ViewMode): Promise<void> {
        const previousMode = this._viewMode;
        this._viewMode = mode;
        this.callbacks.setContextKey('changedown:viewMode', mode);

        const editor = vscode.window.activeTextEditor;

        // Handle projected view transitions
        // Wrap in isConverting to suppress tracking during buffer replacement.
        // ProjectedView.enter() sets isActive AFTER applyEdit, so the
        // projectedView.active guard in onDidChangeTextDocument doesn't catch
        // the edit. isConverting provides the safety net.
        if (editor && isSupported(editor.document)) {
            const wasProjected = previousMode === 'settled' || previousMode === 'raw';
            const isProjected = mode === 'settled' || mode === 'raw';
            const uri = editor.document.uri.toString();
            const viewState = this.docStateManager.ensureDocState(uri, editor.document.version, editor.document.getText());

            if (isProjected && !wasProjected) {
                this.lspBridge.batchEdit('start', uri);
                viewState.isConverting = true;
                try {
                    await this.projectedView.enter(editor, mode as 'settled' | 'raw');
                } finally {
                    viewState.isConverting = false;
                    this.lspBridge.batchEdit('end', uri);
                }
            } else if (!isProjected && wasProjected) {
                this.lspBridge.batchEdit('start', uri);
                viewState.isConverting = true;
                try {
                    await this.projectedView.exit(editor);
                } finally {
                    viewState.isConverting = false;
                    this.lspBridge.batchEdit('end', uri);
                    viewState.shadow = editor.document.getText();
                    invalidateDecorationCache(uri);
                }
            } else if (isProjected && wasProjected && mode !== previousMode) {
                this.lspBridge.batchEdit('start', uri);
                viewState.isConverting = true;
                try {
                    await this.projectedView.exit(editor);
                    invalidateDecorationCache(uri);
                    await this.projectedView.enter(editor, mode as 'settled' | 'raw');
                } finally {
                    viewState.isConverting = false;
                    this.lspBridge.batchEdit('end', uri);
                }
            }
        }

        // Notify LSP server of view mode change (for semantic token filtering).
        // Send for all visible supported documents so the server updates its per-URI state.
        if (this.lspBridge.hasViewModeSender) {
            for (const e of vscode.window.visibleTextEditors) {
                if (isSupported(e.document)) {
                    this.lspBridge.sendViewMode(e.document.uri.toString(), mode);
                }
            }
        }

        // Update decorations for all visible editors (skip for projected view — no markup to decorate)
        // Filter out comment input editors to avoid O(N) decoration storm.
        if (mode !== 'settled' && mode !== 'raw') {
            vscode.window.visibleTextEditors.forEach(e => {
                if (isSupported(e.document) && !e.document.uri.toString().includes('commentinput-')) {
                    this.callbacks.updateDecorations(e);
                }
            });
        }

        // Fire change event so panel refreshes when view mode changes
        this.callbacks.scheduleNotifyChanges();

        vscode.window.showInformationMessage(`ChangeDown View: ${VIEW_MODE_LABELS[mode]}`);
        this.callbacks.updateStatusBar();

        this._onDidChangeViewMode.fire(mode);
    }

    /**
     * Cycle to the next view mode in order: review → changes → settled → raw → review.
     */
    public async cycleViewMode(): Promise<void> {
        await this.setViewMode(nextViewMode(this._viewMode));
    }

    /**
     * Exit projected view for a URI (used when user switches to a different file
     * while in projected view). Resets to review mode.
     * Returns a promise that resolves when the exit is complete.
     */
    public async exitProjectedView(editor: vscode.TextEditor): Promise<void> {
        if (!this.projectedView.active || !this.projectedView.originalUri) return;

        const exitUri = this.projectedView.originalUri.toString();
        this.lspBridge.batchEdit('start', exitUri);
        const exitState = this.docStateManager.ensureDocState(exitUri, 0, '');
        exitState.isConverting = true;
        try {
            await this.projectedView.exit(editor);
        } finally {
            exitState.isConverting = false;
            this.lspBridge.batchEdit('end', exitUri);
            exitState.shadow = editor.document.getText();
            invalidateDecorationCache(exitUri);
            this._viewMode = 'review';
            this.callbacks.setContextKey('changedown:viewMode', 'review');
            this.callbacks.updateStatusBar();
            this.callbacks.scheduleNotifyChanges();
        }
    }

    /**
     * Recover any orphaned swap files from a previous crash.
     */
    public static recoverCrashBackups(): Promise<void> {
        return ProjectedView.recoverCrashBackups();
    }

    // ── Test / lifecycle ─────────────────────────────────────────────────

    /**
     * Reset transient view-mode state for test isolation.
     * Currently a no-op — view mode is reset per-scenario via settings, and
     * the projected view is not active during test resets.
     */
    public resetForTest(): void {
        // Nothing to reset: view mode is configuration-driven and projected view
        // is not active at the point _testResetDocument is called.
    }

    // ── Dispose ─────────────────────────────────────────────────────────

    public dispose(): void {
        this.projectedView.dispose();
        this._onDidChangeViewMode.dispose();
    }
}
