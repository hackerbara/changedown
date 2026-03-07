/**
 * Server-side Git Integration Module
 *
 * Provides git operations via child_process.execFile (async) for the LSP server.
 * This is the editor-agnostic equivalent of the VS Code extension's
 * git-integration.ts, which uses the vscode.git extension API.
 *
 * All functions are async and use promisified execFile to avoid blocking the
 * Node.js event loop. execFile does not spawn a shell, so file paths with
 * special characters are safe from injection. This works from any LSP client
 * (Neovim, VS Code, etc.).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

/** Timeout in milliseconds for all git subprocess calls. */
const GIT_TIMEOUT = 10_000;

/**
 * Result of getPreviousVersion: the old file content plus optional
 * author/date metadata from the most recent commit that touched the file.
 */
export interface PreviousVersionResult {
    oldText: string;
    author?: string;
    date?: string;
}

/**
 * Get the git workspace root for a given file path.
 *
 * Runs `git rev-parse --show-toplevel` from the file's directory.
 *
 * @param filePath - Absolute path to a file
 * @returns The absolute path to the git repo root, or undefined if not in a git repo
 */
export async function getWorkspaceRoot(filePath: string): Promise<string | undefined> {
    const dir = path.dirname(filePath);
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
            cwd: dir,
            timeout: GIT_TIMEOUT,
            encoding: 'utf-8',
        });
        return stdout.trim();
    } catch {
        return undefined;
    }
}

/**
 * Check if a file has uncommitted changes (staged, unstaged, or untracked).
 *
 * Uses `git status --porcelain` to detect any changes for the given file.
 * This catches working tree modifications, staged changes, and untracked files.
 *
 * @param filePath - Absolute path to the file
 * @param rootDir - Git repository root directory
 * @returns true if the file has uncommitted changes, false otherwise
 */
export async function fileHasUncommittedChanges(filePath: string, rootDir: string): Promise<boolean> {
    try {
        const relativePath = path.relative(rootDir, filePath);

        // Use git status --porcelain to detect any kind of change.
        // This handles: modified (M), added (A), untracked (??) files.
        // git diff --name-only HEAD would miss untracked files and also fails
        // when there are no commits (HEAD doesn't exist).
        const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', relativePath], {
            cwd: rootDir,
            timeout: GIT_TIMEOUT,
            encoding: 'utf-8',
        });

        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

/**
 * Get the previous version of a file from git.
 *
 * For uncommitted changes: returns file content at HEAD.
 * For committed (clean) files: returns file content at the parent of the
 * last commit that touched the file.
 *
 * @param filePath - Absolute path to the file
 * @param rootDir - Git repository root directory
 * @returns Object with oldText, optional author and date, or undefined if not in git / no history
 */
export async function getPreviousVersion(
    filePath: string,
    rootDir: string
): Promise<PreviousVersionResult | undefined> {
    const relativePath = path.relative(rootDir, filePath);

    // Verify we're in a git repo and HEAD exists
    try {
        await execFileAsync('git', ['rev-parse', 'HEAD'], {
            cwd: rootDir,
            timeout: GIT_TIMEOUT,
        });
    } catch {
        return undefined;
    }

    const hasUncommitted = await fileHasUncommittedChanges(filePath, rootDir);

    if (hasUncommitted) {
        // File has uncommitted changes -- diff against HEAD
        try {
            const { stdout } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], {
                cwd: rootDir,
                timeout: GIT_TIMEOUT,
                encoding: 'utf-8',
            });
            return { oldText: stdout };
        } catch {
            // File is new (untracked or not in HEAD) -- no previous version
            return { oldText: '' };
        }
    }

    // File is clean (committed) -- find the last two commits that touched it
    try {
        const { stdout: logOutput } = await execFileAsync(
            'git',
            ['log', '--max-count=2', '--format=%H%n%an%n%aI', '--', relativePath],
            {
                cwd: rootDir,
                timeout: GIT_TIMEOUT,
                encoding: 'utf-8',
            }
        );

        const lines = logOutput.trim().split('\n').filter(l => l.length > 0);

        if (lines.length === 0) {
            // File has no git history (shouldn't happen for clean tracked file, but handle it)
            return undefined;
        }

        // Each commit produces 3 lines: hash, author name, ISO date
        const latestAuthor = lines[1];
        const latestDate = lines[2]?.replace(/[+-]\d{2}:\d{2}$/, 'Z'); // Normalize git offset to UTC Z suffix

        if (lines.length < 6) {
            // Only one commit touches this file -- no parent version
            return {
                oldText: '',
                author: latestAuthor,
                date: latestDate,
            };
        }

        // Two commits found -- get content from the parent (second) commit
        const parentHash = lines[3]; // hash of the older commit
        try {
            const { stdout } = await execFileAsync('git', ['show', `${parentHash}:${relativePath}`], {
                cwd: rootDir,
                timeout: GIT_TIMEOUT,
                encoding: 'utf-8',
            });
            return {
                oldText: stdout,
                author: latestAuthor,
                date: latestDate,
            };
        } catch {
            // Parent commit didn't have this file (file was created in the latest commit)
            return {
                oldText: '',
                author: latestAuthor,
                date: latestDate,
            };
        }
    } catch {
        return undefined;
    }
}
