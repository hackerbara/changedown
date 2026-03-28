import * as vscode from 'vscode';
import { annotateMarkdown, annotateSidecar, SIDECAR_BLOCK_MARKER } from '@changedown/core';
import { getPreviousVersion } from './git-integration';

/**
 * Annotate Recent Changes Command
 *
 * Main command that generates ChangeDown annotations from git changes.
 * Routes to appropriate annotator based on file type:
 * - Markdown files → CriticMarkup annotations
 * - Code files → Sidecar annotations
 *
 * Workflow:
 * 1. Verify file is saved (scheme === 'file')
 * 2. Check if already annotated (skip if so)
 * 3. Get previous version from git
 * 4. Check for actual changes
 * 5. Route to appropriate annotator
 * 6. Replace buffer with annotated text
 * 7. Save to disk if configured
 *
 * Returns true on success, false otherwise.
 */
export async function annotateFromGit(editor: vscode.TextEditor): Promise<boolean> {
    const doc = editor.document;

    // Step 1: Check if file is saved
    if (doc.uri.scheme !== 'file') {
        vscode.window.showWarningMessage('ChangeDown: Can only annotate saved files');
        return false;
    }

    const currentText = doc.getText();

    // Step 2: Check if already annotated
    if (currentText.includes(SIDECAR_BLOCK_MARKER) || currentText.includes('{++') || currentText.includes('{--')) {
        vscode.window.showWarningMessage('ChangeDown: File already contains annotations');
        return false;
    }

    // Step 3: Get previous version from git
    const prev = await getPreviousVersion(doc.uri);

    if (!prev) {
        vscode.window.showInformationMessage('ChangeDown: No git history found for this file');
        return false;
    }

    // Step 4: Check if there are actual changes
    if (prev.oldText === currentText) {
        vscode.window.showInformationMessage('ChangeDown: No changes detected');
        return false;
    }

    // Step 5: Route to appropriate annotator
    const languageId = doc.languageId;
    let annotatedText: string | undefined;

    if (languageId === 'markdown') {
        annotatedText = annotateMarkdown(prev.oldText, currentText);
    } else {
        // Code file → sidecar annotation
        annotatedText = annotateSidecar(prev.oldText, currentText, languageId, {
            author: prev.author,
            date: prev.date,
        });

        if (!annotatedText) {
            vscode.window.showWarningMessage(`ChangeDown: Language "${languageId}" is not supported for code annotations`);
            return false;
        }
    }

    // Step 6: Replace entire buffer with annotated text
    const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(currentText.length)
    );

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, annotatedText!);
    });

    if (!success) {
        vscode.window.showErrorMessage('ChangeDown: Failed to apply annotations');
        return false;
    }

    // Step 7: Save to disk if configured
    const config = vscode.workspace.getConfiguration('changedown');
    const shouldPersist = config.get<boolean>('persistAnnotations', true);

    if (shouldPersist) {
        await doc.save();
    }

    // Success message
    const changeCount = 'changes';
    vscode.window.showInformationMessage(`ChangeDown: Annotated with recent ${changeCount}`);

    return true;
}
