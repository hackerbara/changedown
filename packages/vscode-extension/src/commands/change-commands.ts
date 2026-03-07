import * as vscode from 'vscode';
import { type ViewMode, VIEW_MODES } from '../view-mode';
import { toResolvedUri } from '../resolved-content-provider';
import { annotateFromGit } from '../annotate-command';
import type { ExtensionController } from '../controller';
import { ProjectStatusModel } from '../project-status';

export function registerChangeCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    statusModel: ProjectStatusModel
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks.toggleTracking', () => {
            controller.toggleTracking();
        }),
        vscode.commands.registerCommand('changetracks.acceptChange', async (changeId?: string) => {
            await controller.acceptChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changetracks.rejectChange', async (changeId?: string) => {
            await controller.rejectChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changetracks.acceptAll', async () => {
            await controller.acceptAllChanges();
        }),
        vscode.commands.registerCommand('changetracks.rejectAll', async () => {
            await controller.rejectAllChanges();
        }),
        vscode.commands.registerCommand('changetracks.nextChange', async () => {
            await controller.nextChange();
        }),
        vscode.commands.registerCommand('changetracks.previousChange', async () => {
            await controller.previousChange();
        }),
        vscode.commands.registerCommand('changetracks.addComment', async () => {
            await controller.addComment();
        }),
        vscode.commands.registerCommand('changetracks.toggleView', () => {
            controller.cycleViewMode();
        }),
        vscode.commands.registerCommand('changetracks.setViewMode', (mode: string) => {
            if ((VIEW_MODES as readonly string[]).includes(mode)) {
                controller.setViewMode(mode as ViewMode);
            }
        }),
        vscode.commands.registerCommand('changetracks.annotateFromGit', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) await annotateFromGit(editor);
        }),
        vscode.commands.registerCommand('changetracks.revealPanel', () => {
            vscode.commands.executeCommand('changetracksReview.focus');
        }),
        vscode.commands.registerCommand('changetracks.showMenu', () => {
            vscode.commands.executeCommand('changetracks.revealPanel');
        }),
        vscode.commands.registerCommand('changetracks.clipboardCutAction', async () => {
            if (controller.trackingMode) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.languageId === 'markdown') {
                    controller.prepareCutAsMove();
                }
            }
            await vscode.commands.executeCommand('editor.action.clipboardCutAction');
        }),
        vscode.commands.registerCommand('changetracks.clipboardPasteAction', async () => {
            if (controller.trackingMode) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.languageId === 'markdown') {
                    controller.preparePasteAsMove();
                }
            }
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        }),
        vscode.commands.registerCommand('changetracks.goToLinkedChange', async () => {
            await controller.goToLinkedChange();
        }),
        vscode.commands.registerCommand('changetracks.revealChange', (changeId: string) => {
            controller.revealChangeById(changeId);
        }),
        vscode.commands.registerCommand('changetracks.goToPosition', async (targetUri: string, line: number, character?: number) => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetUri));
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(line, character ?? 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),
        vscode.commands.registerCommand('changetracks.compactChange', async (changeId?: string) => {
            await controller.compactChange(changeId);
        }),
        vscode.commands.registerCommand('changetracks.compactChangeFully', async (changeId?: string) => {
            await controller.compactChangeFully(changeId);
        }),
        vscode.commands.registerCommand('changetracks.showDiff', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const docUri = editor.document.uri;
            const resolvedUri = toResolvedUri(docUri);
            const title = `${editor.document.fileName.split('/').pop()}: Settled ↔ Current`;
            await vscode.commands.executeCommand('vscode.diff', resolvedUri, docUri, title);
        })
    );
}
