import * as vscode from 'vscode';
import { SIDECAR_BLOCK_MARKER } from '@changetracks/core';

/**
 * Single source for current document/editor. Unifies findMarkdownDocument and findSupportedEditor.
 * Policy: active supported editor (markdown or sidecar-annotated), else first visible supported.
 */
export class CurrentDocumentService {
    private isSupported(doc: vscode.TextDocument): boolean {
        if (doc.languageId === 'markdown') return true;
        if (doc.getText().includes(SIDECAR_BLOCK_MARKER)) return true;
        return false;
    }

    /** Best supported text editor: active if supported, else first visible supported. */
    getCurrentEditor(): vscode.TextEditor | undefined {
        const active = vscode.window.activeTextEditor;
        if (active && this.isSupported(active.document)) return active;
        return vscode.window.visibleTextEditors.find(e => this.isSupported(e.document));
    }

    /** Current document from best supported editor, or first visible markdown editor. */
    getCurrentDocument(): vscode.TextDocument | undefined {
        const editor = this.getCurrentEditor();
        if (editor) return editor.document;
        return undefined;
    }
}
