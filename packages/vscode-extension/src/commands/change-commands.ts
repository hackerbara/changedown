import * as vscode from 'vscode';
import { type ViewMode, VIEW_MODES } from '../view-mode';
import { toResolvedUri } from '../resolved-content-provider';
import { annotateFromGit } from '../annotate-command';
import type { ExtensionController } from '../controller';
import { ProjectStatusModel } from '../project-status';
import { positionToOffset } from '../converters';
import { getOutputChannel } from '../output-channel';

export interface ChangeCommandsContext {
    expandThreadForChangeId(changeId: string): void;
}

export function registerChangeCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    statusModel: ProjectStatusModel,
    changeComments: ChangeCommandsContext
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks.toggleTracking', () => {
            controller.toggleTracking();
        }),
        vscode.commands.registerCommand('changetracks.acceptChange', async (changeId?: string, decision?: 'approve' | 'request_changes', reason?: string) => {
            await controller.acceptChangeAtCursor(changeId, decision, reason);
        }),
        vscode.commands.registerCommand('changetracks.rejectChange', async (changeId?: string, decision?: 'reject', reason?: string) => {
            await controller.rejectChangeAtCursor(changeId, decision, reason);
        }),
        vscode.commands.registerCommand('changetracks.acceptAll', async () => {
            await controller.acceptAllChanges();
        }),
        vscode.commands.registerCommand('changetracks.rejectAll', async () => {
            await controller.rejectAllChanges();
        }),
        vscode.commands.registerCommand('changetracks.acceptAllOnLine', async () => {
            await controller.acceptAllOnLine();
        }),
        vscode.commands.registerCommand('changetracks.rejectAllOnLine', async () => {
            await controller.rejectAllOnLine();
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
        vscode.commands.registerCommand('changetracks.toggleView', async () => {
            await controller.cycleViewMode();
        }),
        vscode.commands.registerCommand('changetracks.setViewMode', async (mode: string) => {
            if ((VIEW_MODES as readonly string[]).includes(mode)) {
                await controller.setViewMode(mode as ViewMode);
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
            try {
                if (controller.trackingMode) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.languageId === 'markdown') {
                        controller.prepareCutAsMove();
                    }
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[clipboard] cut metadata failed: ${err.message}`);
            }
            // Native action always executes
            await vscode.commands.executeCommand('editor.action.clipboardCutAction');
        }),
        vscode.commands.registerCommand('changetracks.clipboardPasteAction', async () => {
            try {
                if (controller.trackingMode) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.languageId === 'markdown') {
                        controller.preparePasteAsMove();
                    }
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[clipboard] paste metadata failed: ${err.message}`);
            }
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        }),
        vscode.commands.registerCommand('changetracks.goToLinkedChange', async () => {
            await controller.goToLinkedChange();
        }),
        vscode.commands.registerCommand('changetracks.revealChange', (changeId: string) => {
            controller.revealChangeById(changeId);
            changeComments.expandThreadForChangeId(changeId);
        }),
        vscode.commands.registerCommand('changetracks.goToPosition', async (targetUri: string, line: number, character?: number) => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetUri));
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(line, character ?? 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),
        vscode.commands.registerCommand('changetracks.requestChanges', async (changeId?: string) => {
            await controller.requestChangesAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changetracks.withdrawRequest', async (changeId?: string) => {
            await controller.withdrawRequestAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changetracks.amendChange', async (changeId?: string) => {
            await controller.amendChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changetracks.supersedeChange', async (changeId?: string) => {
            await controller.supersedeChangeAtCursor(changeId);
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
        }),
        // Lifecycle commands that take a changeId string (called from review panel webview)
        vscode.commands.registerCommand('changetracks.resolveByChangeId', async (changeId?: string) => {
            if (!changeId) return;
            await controller.sendLifecycleRequest('changetracks/resolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changetracks.unresolveByChangeId', async (changeId?: string) => {
            if (!changeId) return;
            await controller.sendLifecycleRequest('changetracks/unresolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changetracks.viewDeliberation', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const text = editor.document.getText();
            const cursorOffset = positionToOffset(text, editor.selection.active);
            const changes = controller.getChangesForDocument(editor.document);
            const change = changes.find(c => c.range.start <= cursorOffset && cursorOffset <= c.range.end);
            if (!change?.id) {
                vscode.window.showInformationMessage('No tracked change at cursor');
                return;
            }
            controller.revealChangeById(change.id);
            changeComments.expandThreadForChangeId(change.id);
        }),
    );
}
