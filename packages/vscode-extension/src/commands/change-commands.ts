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
        vscode.commands.registerCommand('changedown.toggleTracking', () => {
            controller.toggleTracking();
        }),
        vscode.commands.registerCommand('changedown.acceptChange', async (changeId?: string, decision?: 'approve' | 'request_changes', reason?: string) => {
            await controller.acceptChangeAtCursor(changeId, decision, reason);
        }),
        vscode.commands.registerCommand('changedown.rejectChange', async (changeId?: string, decision?: 'reject', reason?: string) => {
            await controller.rejectChangeAtCursor(changeId, decision, reason);
        }),
        vscode.commands.registerCommand('changedown.acceptAll', async () => {
            await controller.acceptAllChanges();
        }),
        vscode.commands.registerCommand('changedown.rejectAll', async () => {
            await controller.rejectAllChanges();
        }),
        vscode.commands.registerCommand('changedown.acceptAllOnLine', async () => {
            await controller.acceptAllOnLine();
        }),
        vscode.commands.registerCommand('changedown.rejectAllOnLine', async () => {
            await controller.rejectAllOnLine();
        }),
        vscode.commands.registerCommand('changedown.nextChange', async () => {
            await controller.nextChange();
        }),
        vscode.commands.registerCommand('changedown.previousChange', async () => {
            await controller.previousChange();
        }),
        vscode.commands.registerCommand('changedown.addComment', async () => {
            await controller.addComment();
        }),
        vscode.commands.registerCommand('changedown.toggleView', async () => {
            await controller.cycleViewMode();
        }),
        vscode.commands.registerCommand('changedown.setViewMode', async (mode: string) => {
            if ((VIEW_MODES as readonly string[]).includes(mode)) {
                await controller.setViewMode(mode as ViewMode);
            }
        }),
        vscode.commands.registerCommand('changedown.annotateFromGit', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) await annotateFromGit(editor);
        }),
        vscode.commands.registerCommand('changedown.revealPanel', () => {
            vscode.commands.executeCommand('changedownReview.focus');
        }),
        vscode.commands.registerCommand('changedown.showMenu', () => {
            vscode.commands.executeCommand('changedown.revealPanel');
        }),
        vscode.commands.registerCommand('changedown.clipboardCutAction', async () => {
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
        vscode.commands.registerCommand('changedown.clipboardPasteAction', async () => {
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
        vscode.commands.registerCommand('changedown.goToLinkedChange', async () => {
            await controller.goToLinkedChange();
        }),
        vscode.commands.registerCommand('changedown.revealChange', (changeId: string) => {
            controller.revealChangeById(changeId);
            changeComments.expandThreadForChangeId(changeId);
        }),
        vscode.commands.registerCommand('changedown.goToPosition', async (targetUri: string, line: number, character?: number) => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetUri));
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(line, character ?? 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),
        vscode.commands.registerCommand('changedown.requestChanges', async (changeId?: string) => {
            await controller.requestChangesAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.withdrawRequest', async (changeId?: string) => {
            await controller.withdrawRequestAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.amendChange', async (changeId?: string) => {
            await controller.amendChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.supersedeChange', async (changeId?: string) => {
            await controller.supersedeChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.compactChange', async (changeId?: string) => {
            await controller.compactChange(changeId);
        }),
        vscode.commands.registerCommand('changedown.compactChangeFully', async (changeId?: string) => {
            await controller.compactChangeFully(changeId);
        }),
        vscode.commands.registerCommand('changedown.showDiff', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const docUri = editor.document.uri;
            const resolvedUri = toResolvedUri(docUri);
            const title = `${editor.document.fileName.split('/').pop()}: Settled ↔ Current`;
            await vscode.commands.executeCommand('vscode.diff', resolvedUri, docUri, title);
        }),
        // Lifecycle commands that take a changeId string (called from review panel webview)
        vscode.commands.registerCommand('changedown.resolveByChangeId', async (changeId?: string) => {
            if (!changeId) return;
            await controller.sendLifecycleRequest('changedown/resolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changedown.unresolveByChangeId', async (changeId?: string) => {
            if (!changeId) return;
            await controller.sendLifecycleRequest('changedown/unresolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changedown.viewDeliberation', () => {
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
