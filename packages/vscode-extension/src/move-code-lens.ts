import * as vscode from 'vscode';
import type { ChangeNode } from '@changedown/core';
import { offsetToPosition } from './converters';

export type GetChangesForDocument = (doc: vscode.TextDocument) => ChangeNode[];

export class MoveCodeLensProvider implements vscode.CodeLensProvider {
    constructor(private readonly getChangesForDocument: GetChangesForDocument) {}

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'markdown') { return []; }

        const text = document.getText();
        const changes = this.getChangesForDocument(document);
        const lenses: vscode.CodeLens[] = [];

        for (const change of changes) {
            if (!change.moveRole || !change.groupId) { continue; }

            const startPos = offsetToPosition(text, change.range.start);
            const endPos = offsetToPosition(text, change.range.end);
            const range = new vscode.Range(startPos, endPos);

            if (change.moveRole === 'from') {
                lenses.push(new vscode.CodeLens(range, {
                    title: '\u2192 Go to destination',
                    command: 'changedown.goToLinkedChange',
                }));
            } else if (change.moveRole === 'to') {
                lenses.push(new vscode.CodeLens(range, {
                    title: '\u2190 Go to source',
                    command: 'changedown.goToLinkedChange',
                }));
            }
        }

        return lenses;
    }
}
