import * as vscode from 'vscode';

/**
 * Shared output channel reference.
 * Breaks the circular dependency: extension.ts → controller.ts → extension.ts
 * by providing a mutable reference that extension.ts sets after creation,
 * and controller.ts / PendingEditManager.ts read via getOutputChannel().
 */
let channel: vscode.OutputChannel | undefined;

export function setOutputChannel(ch: vscode.OutputChannel): void {
    channel = ch;
}

export function getOutputChannel(): vscode.OutputChannel | undefined {
    return channel;
}
