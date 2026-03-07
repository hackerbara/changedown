import * as vscode from 'vscode';
import { openDiffForResource } from '../changetracks-scm';
import type { ExtensionController } from '../controller';
import type { ChangetracksSCM } from '../changetracks-scm';

export function registerScmCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    getScm: () => ChangetracksSCM | null
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks.openDiffForResource', (arg: vscode.Uri | vscode.SourceControlResourceState | vscode.SourceControlResourceState[]) => {
            try {
                const uri = Array.isArray(arg) ? arg[0]?.resourceUri : ('resourceUri' in (arg || {}) ? (arg as vscode.SourceControlResourceState).resourceUri : arg as vscode.Uri);
                if (uri) openDiffForResource(uri);
            } catch (e) {
                console.error('[changetracks] openDiffForResource failed:', e);
            }
        }),
        vscode.commands.registerCommand('changetracks.acceptAllInFile', async (resourceUriOrStates: vscode.Uri | vscode.SourceControlResourceState[]) => {
            const uris = Array.isArray(resourceUriOrStates)
                ? resourceUriOrStates.map(s => s.resourceUri).filter((u): u is vscode.Uri => !!u)
                : [resourceUriOrStates];
            for (const uri of uris) await controller.acceptAllInDocument(uri);
        }),
        vscode.commands.registerCommand('changetracks.rejectAllInFile', async (resourceUriOrStates: vscode.Uri | vscode.SourceControlResourceState[]) => {
            const uris = Array.isArray(resourceUriOrStates)
                ? resourceUriOrStates.map(s => s.resourceUri).filter((u): u is vscode.Uri => !!u)
                : [resourceUriOrStates];
            for (const uri of uris) await controller.rejectAllInDocument(uri);
        }),
        vscode.commands.registerCommand('changetracks.showScmIndexStatus', () => {
            const scm = getScm();
            const status = scm?.getIndexStatus();
            if (status) {
                vscode.window.showInformationMessage(
                    `ChangeTracks SCM: ${status.fileCount} file(s) with changes, last scan ${new Date(status.lastScanTs).toLocaleTimeString()}`
                );
            } else {
                vscode.window.showInformationMessage('ChangeTracks SCM: not available (legacy mode or init failed)');
            }
        })
    );
}
