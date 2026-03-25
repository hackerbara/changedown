import * as vscode from 'vscode';
import { SIDECAR_BLOCK_MARKER } from '@changetracks/core';
import { getOutputChannel } from '../output-channel';

/**
 * Check if a document is supported for ChangeTracks operations.
 * Markdown files are always supported. Code files are supported if they have sidecar annotations.
 */
export function isSupported(doc: vscode.TextDocument): boolean {
    if (doc.languageId === 'markdown') return true;
    if (doc.getText().includes(SIDECAR_BLOCK_MARKER)) return true;
    return false;
}

/**
 * Find the best supported text editor, with fallback.
 * activeTextEditor may be a sidebar panel; check visibleTextEditors as a safety net.
 */
export function findSupportedEditor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && isSupported(active.document)) return active;
    return vscode.window.visibleTextEditors.find(e => isSupported(e.document));
}

/**
 * Set a VS Code context key for when-clause bindings.
 * Thin wrapper around `vscode.commands.executeCommand('setContext', ...)`.
 */
export function setContextKey(key: string, value: boolean | string): void {
    vscode.commands.executeCommand('setContext', key, value);
}

/**
 * Log an error to the output channel and optionally show a notification.
 * Matches the resilience of the original controller.ts logError: try/catch,
 * timestamp, JSON.stringify for non-Error values, console.error fallback.
 */
export function logError(message: string, error: unknown, showNotification = false): void {
    try {
        const ch = getOutputChannel();
        if (ch) {
            const timestamp = new Date().toISOString();
            ch.appendLine(`[${timestamp}] ERROR: ${message}`);
            if (error) {
                if (error instanceof Error) {
                    ch.appendLine(`  Message: ${error.message}`);
                    if (error.stack) {
                        ch.appendLine(`  Stack: ${error.stack}`);
                    }
                } else {
                    ch.appendLine(`  Details: ${JSON.stringify(error)}`);
                }
            }
        }
    } catch (e) {
        console.error('ChangeTracks Error:', message, error);
    }

    if (showNotification) {
        vscode.window.showErrorMessage(`ChangeTracks: ${message}`);
    }
}
