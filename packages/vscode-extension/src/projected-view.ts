import * as vscode from 'vscode';
import { computeSettledText, computeOriginalText } from '@changedown/core';
import * as fs from 'fs';
import type { ViewMode } from './view-mode';

const SWAP_EXTENSION = '.changedown-swap';

export class ProjectedView {
    private originalMarkup: string | null = null;
    private _originalUri: vscode.Uri | null = null;
    private isActive = false;

    get active(): boolean {
        return this.isActive;
    }

    get originalUri(): vscode.Uri | null {
        return this._originalUri;
    }

    /**
     * Swap the editor buffer with projected text for the given view mode.
     */
    async enter(editor: vscode.TextEditor, mode: 'settled' | 'raw'): Promise<void> {
        if (this.isActive) {
            await this.exit(editor);
        }

        const document = editor.document;
        this.originalMarkup = document.getText();
        this._originalUri = document.uri;

        // Write crash recovery backup (async, fire-and-forget)
        const swapPath = document.uri.fsPath + SWAP_EXTENSION;
        fs.promises.writeFile(swapPath, this.originalMarkup, 'utf-8').catch(() => {});

        // Compute projected text
        const projected = mode === 'settled'
            ? computeSettledText(this.originalMarkup)
            : computeOriginalText(this.originalMarkup);

        // Replace buffer content
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(this.originalMarkup.length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, projected);
        await vscode.workspace.applyEdit(edit);

        // Set file read-only via workspace config (idempotent, blocks edits AND saves)
        await this.setReadOnly(document.uri, true);

        this.isActive = true;
    }

    /**
     * Restore the original markup and exit projected view.
     */
    async exit(editor: vscode.TextEditor): Promise<void> {
        if (!this.isActive || !this.originalMarkup || !this._originalUri) return;

        // Remove read-only first so we can edit
        await this.setReadOnly(this._originalUri, false);

        // Restore original markup
        const document = editor.document;
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, this.originalMarkup);
        await vscode.workspace.applyEdit(edit);

        // Revert to clean disk state only if restored content matches disk.
        // When the buffer was promoted (L3) but disk is L2, reverting would
        // undo the promotion by replacing L3 buffer with L2 disk content.
        try {
            const diskContent = await fs.promises.readFile(document.uri.fsPath, 'utf-8');
            if (diskContent === this.originalMarkup) {
                await vscode.commands.executeCommand('workbench.action.files.revert');
            }
        } catch {
            // File not on disk (untitled) — skip revert
        }

        // Remove crash recovery file
        const swapPath = this._originalUri.fsPath + SWAP_EXTENSION;
        fs.promises.unlink(swapPath).catch(() => {});

        this.originalMarkup = null;
        this._originalUri = null;
        this.isActive = false;
    }

    /**
     * Set or clear read-only for a file via files.readonlyInclude workspace config.
     * This is idempotent — safe to call multiple times.
     */
    private async setReadOnly(uri: vscode.Uri, readOnly: boolean): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('files');
            const existing: Record<string, boolean> = { ...(config.get('readonlyInclude') ?? {}) };
            const relPath = vscode.workspace.asRelativePath(uri);

            if (readOnly) {
                existing[relPath] = true;
            } else {
                delete existing[relPath];
            }

            await config.update('readonlyInclude', existing, vscode.ConfigurationTarget.Workspace);
        } catch {
            // Workspace settings unavailable (single-file mode) — read-only not enforced
        }
    }

    /**
     * On extension activation, check for orphaned swap files and restore.
     */
    static async recoverCrashBackups(): Promise<void> {
        for (const editor of vscode.window.visibleTextEditors) {
            const swapPath = editor.document.uri.fsPath + SWAP_EXTENSION;
            try {
                const originalMarkup = await fs.promises.readFile(swapPath, 'utf-8');
                const document = editor.document;
                const currentText = document.getText();

                // Clear readonlyInclude entry left by the crashed projected view
                const config = vscode.workspace.getConfiguration('files');
                const existing: Record<string, boolean> = { ...(config.get('readonlyInclude') ?? {}) };
                const relPath = vscode.workspace.asRelativePath(document.uri);
                if (existing[relPath]) {
                    delete existing[relPath];
                    await config.update('readonlyInclude', existing, vscode.ConfigurationTarget.Workspace);
                }

                if (currentText !== originalMarkup) {
                    // Revert to disk — original markup IS what's on disk
                    await vscode.commands.executeCommand('workbench.action.files.revert');
                }

                await fs.promises.unlink(swapPath).catch(() => {});
            } catch {
                // No swap file — nothing to recover
            }
        }
    }

    dispose(): void {
        // Clean up read-only setting if still active
        if (this.isActive && this._originalUri) {
            this.setReadOnly(this._originalUri, false);
        }
    }
}
