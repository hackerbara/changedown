import * as vscode from 'vscode';

interface CoherenceState {
    rate: number;
    unresolvedCount: number;
    threshold: number;
}

export class CoherenceManager implements vscode.Disposable {
    private coherenceState = new Map<string, CoherenceState>();
    private lastNotifiedUri: string | undefined;

    private readonly _onDidChangeCoherence = new vscode.EventEmitter<string>();
    public readonly onDidChangeCoherence = this._onDidChangeCoherence.event;

    public updateCoherence(uri: string, rate: number, unresolvedCount: number, threshold: number): void {
        this.coherenceState.set(uri, { rate, unresolvedCount, threshold });
        this._onDidChangeCoherence.fire(uri);
    }

    public getCoherenceForStatusBar(uri: string): CoherenceState | undefined {
        return this.coherenceState.get(uri);
    }

    public checkCoherenceDegradation(uri: string): void {
        const cs = this.coherenceState.get(uri);
        if (!cs || cs.unresolvedCount === 0) return;
        if (cs.rate < cs.threshold && this.lastNotifiedUri !== uri) {
            this.lastNotifiedUri = uri;
            vscode.window.showInformationMessage(
                `ChangeTracks: ${cs.unresolvedCount} anchor${cs.unresolvedCount === 1 ? '' : 's'} could not be resolved. External or manual edits are the most common cause.`,
                'Inspect',
                'Dismiss'
            ).then(choice => {
                if (choice === 'Inspect') {
                    vscode.commands.executeCommand('changetracks.inspectUnresolved');
                }
            });
        }
    }

    public removeState(uri: string): void {
        this.coherenceState.delete(uri);
    }

    public resetForTest(): void {
        this.coherenceState.clear();
        this.lastNotifiedUri = undefined;
    }

    public dispose(): void {
        this.coherenceState.clear();
        this._onDidChangeCoherence.dispose();
    }
}
