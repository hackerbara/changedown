/**
 * CodeLens provider that shows "Accept" and "Reject" above each tracked change,
 * so users can click inline without using the tree or keyboard.
 */

import * as vscode from 'vscode';
import type { ChangeNode } from '@changetracks/core';
import { offsetToPosition } from './converters';

export type GetChangesForDocument = (doc: vscode.TextDocument) => ChangeNode[];

export class AcceptRejectCodeLensProvider implements vscode.CodeLensProvider {
    constructor(private readonly getChangesForDocument: GetChangesForDocument) {}

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const text = document.getText();
        const changes = this.getChangesForDocument(document);
        if (changes.length === 0) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        for (const change of changes) {
            const startPos = offsetToPosition(text, change.range.start);
            const endPos = offsetToPosition(text, change.range.end);
            const range = new vscode.Range(startPos, endPos);

            lenses.push(new vscode.CodeLens(range, {
                title: '$(check) Accept',
                command: 'changetracks.acceptChange',
                arguments: [change.id],
            }));
            lenses.push(new vscode.CodeLens(range, {
                title: '$(close) Reject',
                command: 'changetracks.rejectChange',
                arguments: [change.id],
            }));
        }
        return lenses;
    }
}
