import * as vscode from 'vscode';

/**
 * Git Integration Module
 *
 * Wraps the built-in vscode.git extension API to fetch previous file versions.
 * Used by git-backed annotation providers to generate change annotations from diffs.
 */

// Minimal types from vscode.git extension
interface GitExtension {
    getAPI(version: 1): GitAPI;
}

interface GitAPI {
    getRepository(uri: vscode.Uri): Repository | null;
}

export interface Repository {
    rootUri: vscode.Uri;
    show(ref: string, path: string): Promise<string>;
    log(options?: { maxEntries?: number; path?: string }): Promise<Commit[]>;
    diffWithHEAD(path?: string): Promise<Change[]>;
    state: RepositoryState;
    onDidCheckout?: vscode.Event<void>;
}

interface RepositoryState {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    HEAD: { name?: string; commit?: string } | undefined;
    onDidChange: vscode.Event<void>;
}

interface Commit {
    hash: string;
    message: string;
    authorName?: string;
    authorDate?: Date;
}

interface Change {
    uri: vscode.Uri;
    status: number;
}

/**
 * Get the previous version of a file from git.
 *
 * For uncommitted changes: returns file content at HEAD.
 * For committed files: returns file content at the parent of the last commit that touched the file.
 *
 * Returns undefined if file is not in a git repo or has no history.
 */
export async function getPreviousVersion(
    uri: vscode.Uri
): Promise<{ oldText: string; author?: string; date?: string } | undefined> {
    const repo = getRepository(uri);
    if (!repo) {
        return undefined;
    }

    const relativePath = vscode.workspace.asRelativePath(uri, false);

    // Check if file has uncommitted changes
    const hasUncommitted = await fileHasUncommittedChanges(repo, uri);

    if (hasUncommitted) {
        // Diff against HEAD
        try {
            const oldText = await repo.show('HEAD', relativePath);
            return { oldText };
        } catch {
            // File is new (untracked) — no previous version
            return { oldText: '' };
        }
    }

    // File is committed — find last commit that touched it and get parent version
    try {
        const commits = await repo.log({ maxEntries: 2, path: relativePath });
        if (commits.length < 2) {
            // File was created in the first commit — no parent version
            return {
                oldText: '',
                author: commits[0]?.authorName,
                date: commits[0]?.authorDate?.toISOString()?.replace(/\.\d{3}Z$/, 'Z'),
            };
        }

        const parentHash = commits[1].hash;
        const oldText = await repo.show(parentHash, relativePath);
        return {
            oldText,
            author: commits[0]?.authorName,
            date: commits[0]?.authorDate?.toISOString()?.replace(/\.\d{3}Z$/, 'Z'),
        };
    } catch {
        return undefined;
    }
}

/**
 * Check if a file has uncommitted changes (staged or working tree).
 */
async function fileHasUncommittedChanges(repo: Repository, uri: vscode.Uri): Promise<boolean> {
    try {
        const changes = await repo.diffWithHEAD();
        return changes.some(c => c.uri.fsPath === uri.fsPath);
    } catch {
        return false;
    }
}

let cachedGitApi: GitAPI | null = null;

export function getGitRepository(uri: vscode.Uri): Repository | null {
    if (!cachedGitApi) {
        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (!gitExtension?.isActive) return null;
        cachedGitApi = gitExtension.exports.getAPI(1);
    }
    return cachedGitApi.getRepository(uri);
}

function getRepository(uri: vscode.Uri): Repository | null {
    return getGitRepository(uri);
}
