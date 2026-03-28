/**
 * Author Identity Resolution
 *
 * Resolves the user's author identity from available sources.
 * Matches auto from profile and auto from available account.
 *
 * Resolution order:
 * 1. changedown.author setting (explicit)
 * 2. git config user.name (inferred)
 * 3. System username (last resort)
 * 4. 'unknown' (only if nothing else works)
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as os from 'os';

let cachedGitUserName: string | undefined;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Resolve author identity with fallback chain.
 * Returns a non-empty string (never undefined).
 */
export function resolveAuthorIdentity(resource?: vscode.Uri): string {
    // 1. Explicit setting
    const config = resource
        ? vscode.workspace.getConfiguration('changedown', resource)
        : vscode.workspace.getConfiguration('changedown');
    const settingValue = config.get<string>('author', '').trim();
    if (settingValue) return settingValue;

    // 2. Git config user.name (cached to avoid repeated exec calls)
    const gitName = getGitUserName();
    if (gitName) return gitName;

    // 3. System username
    try {
        const username = os.userInfo().username;
        if (username) return username;
    } catch {
        // userInfo can throw on some systems
    }

    // 4. Environment variables
    const envUser = process.env.USER || process.env.USERNAME || '';
    if (envUser) return envUser;

    // 5. Last resort
    return 'unknown';
}

/**
 * Get git user.name, cached for CACHE_TTL_MS to avoid spawning
 * a process on every keystroke during tracking mode.
 */
function getGitUserName(): string | undefined {
    const now = Date.now();
    if (cachedGitUserName !== undefined && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedGitUserName || undefined;
    }

    try {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const gitName = execSync('git config user.name', {
            encoding: 'utf8',
            timeout: 3000,
            cwd: cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        cachedGitUserName = gitName;
        cacheTimestamp = now;
        return gitName || undefined;
    } catch {
        // git not available or no user.name configured
        cachedGitUserName = '';
        cacheTimestamp = now;
        return undefined;
    }
}

/** Exported for testing: clear the git user.name cache. */
export function clearAuthorCache(): void {
    cachedGitUserName = undefined;
    cacheTimestamp = 0;
}
