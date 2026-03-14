/**
 * Tests for server-side git integration module.
 *
 * Uses real temporary git repos created via child_process to test
 * getPreviousVersion, fileHasUncommittedChanges, and getWorkspaceRoot.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

import {
    getPreviousVersion,
    fileHasUncommittedChanges,
    getWorkspaceRoot,
} from '@changetracks/lsp-server/internals';

/** Create a temporary directory for a test git repo */
function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'changetracks-git-test-'));
}

/** Initialize a git repo in the given directory with a deterministic config */
function initGitRepo(dir: string): void {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
    // Set default branch to main for consistency
    execSync('git checkout -b main', { cwd: dir, stdio: 'pipe' });
}

/** Clean up a temporary directory */
function cleanupDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

describe('Git Integration', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        cleanupDir(tempDir);
    });

    describe('getWorkspaceRoot', () => {
        it('returns git root for a file inside a git repo', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            const root = await getWorkspaceRoot(filePath);
            // Resolve both to handle symlinks (macOS /tmp -> /private/tmp)
            expect(fs.realpathSync(root!)).toBe(fs.realpathSync(tempDir));
        });

        it('returns git root for a file in a subdirectory', async () => {
            initGitRepo(tempDir);
            const subDir = path.join(tempDir, 'sub', 'deep');
            fs.mkdirSync(subDir, { recursive: true });
            const filePath = path.join(subDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            const root = await getWorkspaceRoot(filePath);
            expect(fs.realpathSync(root!)).toBe(fs.realpathSync(tempDir));
        });

        it('returns undefined for a file not in a git repo', async () => {
            // tempDir is NOT a git repo
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            const root = await getWorkspaceRoot(filePath);
            expect(root).toBeUndefined();
        });

        it('returns undefined for a nonexistent path', async () => {
            const root = await getWorkspaceRoot('/nonexistent/path/that/does/not/exist');
            expect(root).toBeUndefined();
        });
    });

    describe('fileHasUncommittedChanges', () => {
        it('returns false for a clean committed file', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'original content');
            execSync('git add test.md && git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

            const result = await fileHasUncommittedChanges(filePath, tempDir);
            expect(result).toBe(false);
        });

        it('returns true for a file with working tree changes', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'original content');
            execSync('git add test.md && git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

            // Modify file after commit
            fs.writeFileSync(filePath, 'modified content');

            const result = await fileHasUncommittedChanges(filePath, tempDir);
            expect(result).toBe(true);
        });

        it('returns true for a staged file', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'original content');
            execSync('git add test.md && git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

            // Stage a change
            fs.writeFileSync(filePath, 'staged content');
            execSync('git add test.md', { cwd: tempDir, stdio: 'pipe' });

            const result = await fileHasUncommittedChanges(filePath, tempDir);
            expect(result).toBe(true);
        });

        it('returns true for a new untracked file (no commits reference it)', async () => {
            initGitRepo(tempDir);
            // Need at least one commit for HEAD to exist
            const otherFile = path.join(tempDir, 'other.md');
            fs.writeFileSync(otherFile, 'something');
            execSync('git add other.md && git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

            const filePath = path.join(tempDir, 'new-file.md');
            fs.writeFileSync(filePath, 'brand new');

            const result = await fileHasUncommittedChanges(filePath, tempDir);
            expect(result).toBe(true);
        });

        it('returns false for a file not in a git repo', async () => {
            // tempDir is NOT a git repo
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            const result = await fileHasUncommittedChanges(filePath, tempDir);
            expect(result).toBe(false);
        });
    });

    describe('getPreviousVersion', () => {
        it('returns HEAD content for a file with uncommitted changes', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'version 1');
            execSync('git add test.md && git commit -m "v1"', { cwd: tempDir, stdio: 'pipe' });

            // Modify the file
            fs.writeFileSync(filePath, 'version 2 (uncommitted)');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('version 1');
        });

        it('returns parent commit content for a clean committed file', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');

            // Commit v1
            fs.writeFileSync(filePath, 'version 1');
            execSync('git add test.md && git commit -m "v1"', { cwd: tempDir, stdio: 'pipe' });

            // Commit v2
            fs.writeFileSync(filePath, 'version 2');
            execSync('git add test.md && git commit -m "v2"', { cwd: tempDir, stdio: 'pipe' });

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('version 1');
        });

        it('returns empty string for a file created in the first commit (no parent)', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');

            fs.writeFileSync(filePath, 'first version');
            execSync('git add test.md && git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('');
        });

        it('returns empty string for an untracked new file', async () => {
            initGitRepo(tempDir);
            // Need initial commit so HEAD exists
            const otherFile = path.join(tempDir, 'other.md');
            fs.writeFileSync(otherFile, 'seed');
            execSync('git add other.md && git commit -m "seed"', { cwd: tempDir, stdio: 'pipe' });

            const filePath = path.join(tempDir, 'brand-new.md');
            fs.writeFileSync(filePath, 'new content');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('');
        });

        it('includes author and date for committed files', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');

            // Commit v1
            fs.writeFileSync(filePath, 'version 1');
            execSync('git add test.md && git commit -m "v1"', { cwd: tempDir, stdio: 'pipe' });

            // Commit v2
            fs.writeFileSync(filePath, 'version 2');
            execSync('git add test.md && git commit -m "v2"', { cwd: tempDir, stdio: 'pipe' });

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.author).toBe('Test User');
            expect(result!.date).toBeTruthy();
            // Date should be full ISO timestamp (YYYY-MM-DDTHH:MM:SSZ) from git
            expect(result!.date!).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('returns undefined for a file not in a git repo', async () => {
            // tempDir is NOT a git repo
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeUndefined();
        });

        it('handles file in subdirectory correctly', async () => {
            initGitRepo(tempDir);
            const subDir = path.join(tempDir, 'docs');
            fs.mkdirSync(subDir, { recursive: true });
            const filePath = path.join(subDir, 'readme.md');

            fs.writeFileSync(filePath, 'v1 content');
            execSync('git add docs/readme.md && git commit -m "v1"', { cwd: tempDir, stdio: 'pipe' });

            fs.writeFileSync(filePath, 'v2 content');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('v1 content');
        });

        it('returns undefined for a nonexistent file path', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'nonexistent.md');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeUndefined();
        });
    });

    describe('Edge Cases', () => {
        it('handles files with special characters in name', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'file with spaces.md');
            fs.writeFileSync(filePath, 'content v1');
            execSync(`git add "file with spaces.md" && git commit -m "add file"`, { cwd: tempDir, stdio: 'pipe' });

            fs.writeFileSync(filePath, 'content v2');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe('content v1');
        });

        it('handles empty git repo (no commits yet)', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'test.md');
            fs.writeFileSync(filePath, 'hello');

            // No commits exist, but git status --porcelain still shows untracked files
            // as uncommitted changes (which they are -- they're new files in the working tree)
            const hasChanges = await fileHasUncommittedChanges(filePath, tempDir);
            expect(hasChanges).toBe(true);

            // getPreviousVersion returns undefined because HEAD doesn't exist
            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeUndefined();
        });

        it('handles binary-like file content gracefully', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'data.bin');
            // Write some binary-ish content (null bytes)
            const buf = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE]);
            fs.writeFileSync(filePath, buf);
            execSync('git add data.bin && git commit -m "add binary"', { cwd: tempDir, stdio: 'pipe' });

            fs.writeFileSync(filePath, new Uint8Array([0x03, 0x04]));

            // Should return the previous version (git show works on binary too)
            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            // The content will be a string representation of the binary
            expect(result!.oldText.length > 0).toBeTruthy();
        });

        it('multi-line content is preserved exactly', async () => {
            initGitRepo(tempDir);
            const filePath = path.join(tempDir, 'multi.md');
            const originalContent = 'line 1\nline 2\nline 3\n';
            fs.writeFileSync(filePath, originalContent);
            execSync('git add multi.md && git commit -m "multiline"', { cwd: tempDir, stdio: 'pipe' });

            fs.writeFileSync(filePath, 'changed');

            const result = await getPreviousVersion(filePath, tempDir);
            expect(result).toBeTruthy();
            expect(result!.oldText).toBe(originalContent);
        });
    });
});
