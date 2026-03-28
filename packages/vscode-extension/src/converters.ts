import * as vscode from 'vscode';
import { OffsetRange, TextEdit } from '@changedown/core';

export function offsetToPosition(text: string, offset: number): vscode.Position {
    let line = 0, char = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') { line++; char = 0; } else { char++; }
    }
    return new vscode.Position(line, char);
}

export function positionToOffset(text: string, position: vscode.Position): number {
    let line = 0, char = 0;
    for (let i = 0; i < text.length; i++) {
        if (line === position.line && char === position.character) { return i; }
        if (text[i] === '\n') { line++; char = 0; } else { char++; }
    }
    return text.length;
}

export function coreRangeToVscode(text: string, range: OffsetRange): vscode.Range {
    return new vscode.Range(offsetToPosition(text, range.start), offsetToPosition(text, range.end));
}

export function coreEditToVscode(text: string, edit: TextEdit): { range: vscode.Range; newText: string } {
    const start = offsetToPosition(text, edit.offset);
    const end = offsetToPosition(text, edit.offset + edit.length);
    return { range: new vscode.Range(start, end), newText: edit.newText };
}
