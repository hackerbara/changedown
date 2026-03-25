import * as vscode from 'vscode';
import { isSupported } from './shared';

/**
 * DecorationScheduler owns the debounce timer for decoration updates.
 *
 * Coalesces rapid document/selection events into a single parse + decorate
 * run to avoid renderer CPU spikes (keystrokes, cursor moves).
 *
 * The actual decoration work (`updateDecorations`) stays in controller.ts
 * for now — it accesses too many manager internals — and is provided as
 * a `performUpdate` callback.
 *
 * afterUpdate is called after performUpdate in the scheduled (debounced)
 * path only (not in updateNow). It is used for cursor-context and status
 * bar refreshes that are only needed when the update fires from the timer.
 */
export class DecorationScheduler implements vscode.Disposable {
    private static readonly DEBOUNCE_MS = 50;
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private pendingUri: string | null = null;
    private readonly performUpdate: (editor: vscode.TextEditor) => void;
    private readonly afterUpdate: ((editor: vscode.TextEditor) => void) | undefined;

    constructor(opts: {
        performUpdate: (editor: vscode.TextEditor) => void;
        afterUpdate?: (editor: vscode.TextEditor) => void;
    }) {
        this.performUpdate = opts.performUpdate;
        this.afterUpdate = opts.afterUpdate;
    }

    /**
     * Schedule a decoration update after the debounce delay. Multiple rapid
     * calls for the same or different URIs coalesce into a single run.
     * When the timer fires, checks that the URI is still the active editor
     * before running.
     */
    scheduleUpdate(editor: vscode.TextEditor): void {
        const uri = editor.document.uri.toString();
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.pendingUri = uri;
        this.timeout = setTimeout(() => {
            this.timeout = null;
            this.pendingUri = null;
            const active = vscode.window.activeTextEditor;
            if (active && active.document.uri.toString() === uri && isSupported(active.document)) {
                this.performUpdate(active);
                this.afterUpdate?.(active);
            }
        }, DecorationScheduler.DEBOUNCE_MS);
    }

    /**
     * Cancel any pending debounced update and run performUpdate immediately.
     * Does NOT call afterUpdate — caller is responsible for any follow-up
     * (cursor context, status bar) as needed.
     */
    updateNow(editor: vscode.TextEditor): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
            this.pendingUri = null;
        }
        this.performUpdate(editor);
    }

    dispose(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.pendingUri = null;
    }
}
