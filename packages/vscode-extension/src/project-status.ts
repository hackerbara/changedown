import * as vscode from 'vscode';
import { parse } from 'smol-toml';

export type ProjectStatusField = 'tracking' | 'required' | 'amend';

export interface ProjectStatus {
    tracking: { enabled: boolean; source: 'default' | 'project' | 'file' | 'session' };
    required: string[];  // e.g. ['author']
    amend: string;       // e.g. 'same-author', 'collaborative', 'permissive'
}

export class ProjectStatusModel implements vscode.Disposable {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    private configLoaded = false;
    private trackingDefault: 'tracked' | 'untracked' = 'tracked';
    private authorEnforcement: 'optional' | 'required' = 'optional';
    private policyMode = 'safety-net';
    private hooksEnforcement: 'warn' | 'block' = 'warn';
    private hashlineEnabled = false;
    private matchingMode: 'strict' | 'normalized' = 'normalized';
    private settlementAutoApprove = true;

    private fileTrackingOverride: 'tracked' | 'untracked' | null = null;
    private sessionTrackingOverride: boolean | null = null;
    private visibleFields: ProjectStatusField[] = ['tracking', 'required', 'amend'];

    /** Full parsed config for settings panel serialization */
    private rawConfig: Record<string, unknown> = {};

    updateFromToml(tomlContent: string): void {
        try {
            const parsed = parse(tomlContent) as Record<string, Record<string, unknown>>;
            this.rawConfig = parsed;

            const tracking = parsed['tracking'];
            if (tracking?.['default'] === 'tracked' || tracking?.['default'] === 'untracked') {
                this.trackingDefault = tracking['default'] as 'tracked' | 'untracked';
            }

            const author = parsed['author'];
            if (author?.['enforcement'] === 'optional' || author?.['enforcement'] === 'required') {
                this.authorEnforcement = author['enforcement'] as 'optional' | 'required';
            }

            const protocol = parsed['protocol'];
            const policy = parsed['policy'];
            if (policy?.['mode']) { this.policyMode = String(policy['mode']); }

            const hooks = parsed['hooks'];
            if (hooks?.['enforcement'] === 'warn' || hooks?.['enforcement'] === 'block') {
                this.hooksEnforcement = hooks['enforcement'] as 'warn' | 'block';
            }

            const hashline = parsed['hashline'];
            if (typeof hashline?.['enabled'] === 'boolean') { this.hashlineEnabled = hashline['enabled']; }

            const matching = parsed['matching'];
            if (matching?.['mode'] === 'strict' || matching?.['mode'] === 'normalized') {
                this.matchingMode = matching['mode'] as 'strict' | 'normalized';
            }

            const settlement = parsed['settlement'];
            if (typeof settlement?.['auto_on_approve'] === 'boolean') {
                this.settlementAutoApprove = settlement['auto_on_approve'];
            }

            this.configLoaded = true;
        } catch {
            // Invalid TOML — keep previous state, still fire event
        }
        this._onDidChange.fire();
    }

    setFileTrackingOverride(value: 'tracked' | 'untracked' | null): void {
        this.fileTrackingOverride = value;
        this._onDidChange.fire();
    }

    setSessionTrackingOverride(value: boolean | null): void {
        this.sessionTrackingOverride = value;
        this._onDidChange.fire();
    }

    setVisibleFields(fields: ProjectStatusField[]): void {
        this.visibleFields = fields;
        this._onDidChange.fire();
    }

    getVisibleFields(): ProjectStatusField[] {
        return [...this.visibleFields];
    }

    getStatus(): ProjectStatus {
        let trackingEnabled: boolean;
        let trackingSource: 'default' | 'project' | 'file' | 'session';

        if (this.sessionTrackingOverride !== null) {
            trackingEnabled = this.sessionTrackingOverride;
            trackingSource = 'session';
        } else if (this.fileTrackingOverride !== null) {
            trackingEnabled = this.fileTrackingOverride === 'tracked';
            trackingSource = 'file';
        } else if (this.configLoaded) {
            trackingEnabled = this.trackingDefault === 'tracked';
            trackingSource = 'project';
        } else {
            trackingEnabled = true; // Default: tracking on
            trackingSource = 'default';
        }

        const required: string[] = [];
        if (this.authorEnforcement === 'required') { required.push('author'); }

        return {
            tracking: { enabled: trackingEnabled, source: trackingSource },
            required,
            amend: 'same-author', // Default policy; trust cascade config not yet implemented
        };
    }

    /** Full config for settings panel serialization */
    getRawConfig(): Record<string, unknown> {
        return JSON.parse(JSON.stringify(this.rawConfig));
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
