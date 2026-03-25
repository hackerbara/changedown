/*---------------------------------------------------------------------------------------------
 *  Type definitions for the VS Code QuickDiffProvider proposed API.
 *  Source: https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickDiffProvider.d.ts
 *  License: MIT (Microsoft Corporation)
 *
 *  This API allows registering a QuickDiffProvider scoped to a DocumentSelector,
 *  enabling per-language gutter diff control. When finalized, remove this file.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

    export namespace window {
        /**
         * Register a QuickDiffProvider scoped to specific document types.
         * Unlike SourceControl.quickDiffProvider, this allows language-scoped gutter diffs.
         */
        export function registerQuickDiffProvider(
            selector: DocumentSelector,
            quickDiffProvider: QuickDiffProvider,
            id: string,
            label: string,
            rootUri?: Uri
        ): Disposable;
    }
}
