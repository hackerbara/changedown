/**
 * Bridge to changetracks/init for the VS Code extension.
 *
 * The CLI package is ESM-only (`"type": "module"`), but the VS Code extension
 * compiles as CommonJS. Static `import` from an ESM package fails under
 * `require()`. This module uses dynamic `import()` which works from CJS→ESM,
 * and provides type-safe wrappers for the init functions.
 *
 * At production time, esbuild bundles everything together and handles the
 * ESM→CJS conversion transparently.
 */

/** Subset of changetracks/init types used by the extension */
export interface InitConfigOptions {
    author: string;
    trackingInclude?: string[];
    trackingExclude?: string[];
    authorEnforcement?: 'optional' | 'required';
    policyMode?: 'safety-net' | 'strict' | 'permissive';
    policyDefaultView?: 'review' | 'changes' | 'settled';
    protocolMode?: 'classic' | 'compact';
    protocolReasoning?: 'optional' | 'required';
    autoSettleOnApprove?: boolean;
    autoSettleOnReject?: boolean;
}

export interface AgentStatus {
    name: string;
    detected: boolean;
    configured: boolean;
}

export interface GitignoreResult {
    action: 'appended' | 'created' | 'skipped';
    path: string;
}

export interface CliInit {
    resolveIdentity: (cwd?: string) => string;
    generateDefaultConfig: (options: InitConfigOptions) => string;
    copyExamples: (targetDir: string) => Promise<void>;
    detectAgents: () => AgentStatus[];
    configureAgents: (projectDir: string, agents: AgentStatus[]) => Promise<string[]>;
    ensureGitignoreEntries: (projectDir: string) => GitignoreResult;
    createGitignore: (projectDir: string) => GitignoreResult;
    hasGitignore: (projectDir: string) => boolean;
}

let cached: CliInit | undefined;

/**
 * Dynamically import the CLI init module (ESM→CJS bridge).
 * Result is cached after first load.
 */
export async function loadCliInit(): Promise<CliInit> {
    if (cached) return cached;
    const mod = await import('changetracks/init');
    cached = {
        resolveIdentity: mod.resolveIdentity,
        generateDefaultConfig: mod.generateDefaultConfig,
        copyExamples: mod.copyExamples,
        detectAgents: mod.detectAgents,
        configureAgents: mod.configureAgents,
        ensureGitignoreEntries: mod.ensureGitignoreEntries,
        createGitignore: mod.createGitignore,
        hasGitignore: mod.hasGitignore,
    };
    return cached;
}
