/**
 * Journey Test Helpers
 *
 * Builds on launchVSCode.ts to provide higher-level assertions for
 * Gherkin-style journey verification. These are functional tests, not
 * pixel-comparison visual regressions.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { Page, ElectronApplication } from 'playwright';
import { launchVSCode, closeVSCode, executeCommand, toggleSmartView, setCursorPosition } from '../visual/launchVSCode';
import type { VSCodeInstance } from '../visual/launchVSCode';

// At runtime __dirname = out/journeys/ (compiled from packages/tests/vscode/)
// Package root = 2 levels up from out/journeys/
const PACKAGE_ROOT = path.resolve(__dirname, '../../');
const JOURNEY_FIXTURES_DIR = path.resolve(PACKAGE_ROOT, 'fixtures/journeys');

// Extension root for extensionDevelopmentPath
const EXTENSION_ROOT = path.resolve(PACKAGE_ROOT, '../../vscode-extension');

/**
 * Map from command palette titles to VS Code command IDs.
 * Used by executeCommandViaBridge() to bypass the command palette entirely.
 */
const COMMAND_TITLE_TO_ID: Record<string, string> = {
    'ChangeTracks: Next Change': 'changetracks.nextChange',
    'ChangeTracks: Previous Change': 'changetracks.previousChange',
    'ChangeTracks: Accept Change': 'changetracks.acceptChange',
    'ChangeTracks: Reject Change': 'changetracks.rejectChange',
    'ChangeTracks: Accept All Changes': 'changetracks.acceptAll',
    'ChangeTracks: Reject All Changes': 'changetracks.rejectAll',
    'ChangeTracks: Compact Change': 'changetracks.compactChange',
    'ChangeTracks: Compact Change Fully': 'changetracks.compactChangeFully',
    'ChangeTracks: Toggle Tracking': 'changetracks.toggleTracking',
    'ChangeTracks: Toggle Smart View': 'changetracks.toggleView',
    'ChangeTracks: Add Comment': 'changetracks.addComment',
    'ChangeTracks: Show Diff': 'changetracks.showDiff',
    'ChangeTracks: Go to Linked Change': 'changetracks.goToLinkedChange',
    'ChangeTracks: Export to DOCX': 'changetracks.exportToDocx',
    'ChangeTracks: Open Panel': 'changetracks.revealPanel',
    'ChangeTracks: Open Settings Panel': 'changetracks.revealSettingsPanel',
    'ChangeTracks: Annotate from Git': 'changetracks.annotateFromGit',
    // Test bridge commands (still useful to map for consistency)
    'ChangeTracks: Test Query Panel State': 'changetracks._testQueryPanelState',
    'ChangeTracks: Test Get Document Text': 'changetracks._testGetDocumentText',
    'ChangeTracks: Test Get Cursor Position': 'changetracks._testGetCursorPosition',
    'ChangeTracks: Test Wait For Changes': 'changetracks._testWaitForChanges',
    'ChangeTracks: Test Paste Clipboard': 'changetracks._testPasteClipboard',
    'ChangeTracks: Test Reset Document': 'changetracks._testResetDocument',
    'ChangeTracks: Test Update Setting': 'changetracks._testUpdateSetting',
    'ChangeTracks: Test Select And Replace': 'changetracks._testSelectAndReplace',
    'ChangeTracks: Test Position Cursor': 'changetracks._testPositionCursor',
    'ChangeTracks: Test Select Text': 'changetracks._testSelectText',
    'ChangeTracks: Test Get Comment Threads': 'changetracks._testGetCommentThreads',
    'ChangeTracks: Test Get CodeLens Items': 'changetracks._testGetCodeLensItems',
    'ChangeTracks: Test Get Review Panel Cards': 'changetracks._testGetReviewPanelCards',
};

/**
 * Execute a VS Code command via the Extension Host bridge, bypassing the
 * command palette entirely. This avoids fuzzy-matching ambiguity (e.g.,
 * "Compact Change" vs "Compact Change Fully") and cursor movement side effects.
 *
 * Writes the command ID (and optional args) to a temp file, then presses
 * Ctrl+Shift+F12 to trigger changetracks._testExecuteCommand, which reads the
 * file and calls vscode.commands.executeCommand(commandId, ...(args ?? [])).
 *
 * Falls back to command palette execution for unknown commands.
 *
 * @param args Optional positional arguments spread into executeCommand(commandId, ...args)
 */
export async function executeCommandViaBridge(page: Page, command: string, args?: unknown[]): Promise<boolean> {
    const commandId = COMMAND_TITLE_TO_ID[command] ?? command;

    // If no mapping found and it doesn't look like a command ID, fall back to palette
    if (!COMMAND_TITLE_TO_ID[command] && !command.includes('.')) {
        await executeCommand(page, command);
        return false;
    }

    const inputPath = path.join(require('os').tmpdir(), 'changetracks-test-exec-input.json');
    const resultPath = path.join(require('os').tmpdir(), 'changetracks-test-exec.json');

    // Clean stale result
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }

    // Write command to input file
    fs.writeFileSync(inputPath, JSON.stringify({ command: commandId, args }));

    // Press the bridge keybinding (Ctrl+Shift+F12)
    await page.keyboard.press('Control+Shift+F12');

    // Wait for the command to execute and write result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        try {
            if (fs.existsSync(resultPath)) {
                const raw = fs.readFileSync(resultPath, 'utf-8');
                const result = JSON.parse(raw);
                return result.ok === true;
            }
        } catch { /* not ready */ }
    }

    // Timeout — command didn't acknowledge
    console.log(`  [WARN] executeCommandViaBridge timed out for ${commandId}, falling back to command palette`);
    await executeCommand(page, command);
    return false;
}

/** Evidence screenshots are saved here */
const EVIDENCE_DIR = path.resolve(PACKAGE_ROOT, 'journeys/evidence');

export interface JourneyResult {
    journey: string;
    scenario: string;
    status: 'pass' | 'fail' | 'skip';
    assertions: AssertionResult[];
    evidence?: string; // path to screenshot
    error?: string;
    durationMs: number;
}

export interface AssertionResult {
    description: string;
    passed: boolean;
    actual?: string;
    expected?: string;
}

// ───────────────────────────────────────────────
// Launch helpers
// ───────────────────────────────────────────────

/**
 * Launch VS Code with a journey fixture file.
 * Uses the journey fixtures directory (not visual fixtures).
 */
export async function launchWithJourneyFixture(
    fixtureName: string,
    options: { codeLens?: boolean; disableOtherExtensions?: boolean } = {}
): Promise<VSCodeInstance> {
    const fixturePath = path.resolve(JOURNEY_FIXTURES_DIR, fixtureName);
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Journey fixture not found: ${fixturePath}`);
    }

    // Launch VS Code pointing at the fixture file directly
    // We use the raw launchVSCode but override the fixture resolution
    const instance = await launchVSCodeDirect(fixturePath, options);
    return instance;
}

/**
 * Launch VS Code with an absolute path to a fixture (not relative to visual dir).
 * Pre-seeds user-data-dir global state to simulate a normal session where the
 * VS Code built-in walkthrough has already been completed, preventing the
 * "Get Started" tab from stealing focus.
 */
async function launchVSCodeDirect(
    absoluteFixturePath: string,
    options: { codeLens?: boolean; disableOtherExtensions?: boolean } = {}
): Promise<VSCodeInstance> {
    const { _electron: electron } = require('playwright');
    const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
    const { execSync } = require('child_process');

    const extensionDevelopmentPath = EXTENSION_ROOT;
    const vscodeExecutablePath = await downloadAndUnzipVSCode();

    let electronPath: string;
    if (process.platform === 'darwin') {
        electronPath = path.join(
            path.dirname(path.dirname(vscodeExecutablePath)),
            'MacOS', 'Electron'
        );
    } else {
        electronPath = vscodeExecutablePath;
    }

    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vscode-journey-'));
    const userSettingsDir = path.join(tmpDir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });

    const settings: Record<string, unknown> = {
        'editor.cursorBlinking': 'solid',
        'editor.cursorSmoothCaretAnimation': 'off',
        'editor.smoothScrolling': false,
        'workbench.enableExperiments': false,
        'workbench.startupEditor': 'none',
        'workbench.welcomePage.walkthroughs.openOnInstall': false,
        'workbench.tips.enabled': false,
        'telemetry.telemetryLevel': 'off',
        'update.mode': 'none',
        'extensions.autoCheckUpdates': false,
        'editor.codeLens': options.codeLens !== false,
        'changetracks.authorColors': 'auto',
        'changetracks.author': 'test-reviewer',
        'changetracks.clickToShowComments': true,
        // Use 2000ms pause threshold for test speed (production default is 30000ms).
        'changetracks.editBoundary.pauseThresholdMs': 2000,
        // Prevent OUR walkthrough from opening too (firstInstall check)
        'changetracks.showWalkthroughOnStartup': 'never',
        // Disable bulk-action confirmation dialog (modal returns undefined in Playwright)
        'changetracks.confirmBulkThreshold': 0,
        // Show CriticMarkup delimiters so D1/D2 decoration tests can distinguish view modes
        'changetracks.showDelimiters': true,
    };
    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify(settings));

    // Pre-seed VS Code global state database to mark walkthroughs as completed.
    // This simulates a NORMAL session where the user has already been through
    // the initial setup — matching what the user actually experiences.
    const stateDbDir = path.join(tmpDir, 'User', 'globalStorage');
    fs.mkdirSync(stateDbDir, { recursive: true });
    const stateDbPath = path.join(stateDbDir, 'state.vscdb');
    try {
        execSync(`sqlite3 "${stateDbPath}" "` +
            `CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);` +
            `INSERT INTO ItemTable VALUES ('workbench.welcomePageStartup', '\\\"none\\\"');` +
            `INSERT INTO ItemTable VALUES ('workbench.welcome.hasShownWelcome', 'true');` +
            `INSERT INTO ItemTable VALUES ('workbench.welcomePageHasBeenShown', '1');` +
            `INSERT INTO ItemTable VALUES ('workbench.welcomePage.walkthroughHasBeenShown', 'true');` +
            `INSERT INTO ItemTable VALUES ('workbench.welcomePageSetup.hasRun', 'true');` +
            `INSERT INTO ItemTable VALUES ('workbench.welcomePageSetup.dismissed', 'true');` +
            `INSERT INTO ItemTable VALUES ('workbench.getStarted.dismissed', 'true');` +
            `INSERT INTO ItemTable VALUES ('workbench.activity.pinnedViewlets2', '[]');` +
            `"`, { timeout: 5000 });
        console.log('  Pre-seeded state.vscdb for normal session (walkthrough completed)');
    } catch (e: any) {
        console.log(`  Warning: Could not pre-seed state.vscdb: ${e.message}`);
        // Fallback: will use runtime dismiss if needed
    }

    const args = [
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--user-data-dir=${tmpDir}`,
        `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
        '--window-size=1280,720',
        ...(options.disableOtherExtensions ? ['--disable-extensions'] : []),
        absoluteFixturePath,
    ];

    // Unique instance ID for per-instance temp files. Prevents cross-instance
    // contamination when multiple VS Code instances (or concurrent agents)
    // write to the same /tmp/ directory.
    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const app: ElectronApplication = await electron.launch({
        executablePath: electronPath,
        args,
        env: { ...process.env, VSCODE_SKIP_PRELAUNCH: '1', CHANGETRACKS_TEST_INSTANCE_ID: instanceId },
    });

    const page: Page = await app.firstWindow();
    // Store user-data-dir so updateSettingDirect can find settings.json
    userDataDirByPage.set(page, tmpDir);
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    // Wait for extension activation + decorations
    await page.waitForTimeout(4000);

    // Safety fallback: if the walkthrough still appeared despite pre-seeding,
    // dismiss it so the test can proceed. This handles VS Code versions where
    // the pre-seeded keys don't match.
    const hasWalkthrough = await page.$$eval(
        '.getting-started, [id*="gettingStarted"]',
        els => els.length > 0
    ).catch(() => false);
    if (hasWalkthrough) {
        console.log('  Warning: Walkthrough still appeared despite pre-seeding, dismissing...');
        await page.keyboard.press('Meta+w');
        await page.waitForTimeout(1500);
    }

    return { app, page, instanceId };
}

// ───────────────────────────────────────────────
// DOM query helpers
// ───────────────────────────────────────────────

/**
 * Get text content from the editor view-lines.
 */
export async function getEditorText(page: Page): Promise<string> {
    return page.$eval('.monaco-editor .view-lines', el => el.textContent ?? '').catch(() => '');
}

/**
 * Check if a CSS class is present anywhere in the editor.
 */
export async function hasDecorationType(page: Page, className: string): Promise<boolean> {
    const count = await page.$$eval(
        `.monaco-editor .view-lines .${className}`,
        els => els.length
    ).catch(() => 0);
    return count > 0;
}

/**
 * Count elements matching a selector in the editor.
 */
export async function countElements(page: Page, selector: string): Promise<number> {
    return page.$$eval(selector, els => els.length).catch(() => 0);
}

/**
 * Get the status bar text content.
 */
export async function getStatusBarText(page: Page): Promise<string> {
    return page.$eval('.statusbar', el => el.textContent ?? '').catch(() => '');
}

/**
 * Check if CodeLens elements are present.
 */
export async function getCodeLensCount(page: Page): Promise<number> {
    return page.$$eval(
        '.monaco-editor .codelens-decoration',
        els => els.length
    ).catch(() => 0);
}

/**
 * Get all CodeLens text labels.
 */
export async function getCodeLensLabels(page: Page): Promise<string[]> {
    return page.$$eval(
        '.monaco-editor .codelens-decoration a',
        els => els.map(el => el.textContent ?? '')
    ).catch(() => []);
}

/**
 * Check for ChangeTracks decorations using computed-color detection + polling.
 *
 * Detects decorations by checking computed `color` and `backgroundColor` on
 * spans against known decoration colors from decorator.ts. Falls back to
 * checking <style> tags for hex colors if no spans match (proves types were
 * created even if spans haven't rendered yet). Polls up to 3 seconds to
 * handle async decoration application.
 */
export async function getDecorationCounts(page: Page): Promise<{
    total: number;
    withStrikethrough: number;
}> {
    const deadline = Date.now() + 3000;
    let lastResult = { total: 0, withStrikethrough: 0 };

    while (Date.now() < deadline) {
        const result = await page.evaluate(`(() => {
            let total = 0;
            let withStrikethrough = 0;

            var viewLines = document.querySelector('.monaco-editor .view-lines');
            if (!viewLines) return { total: 0, withStrikethrough: 0 };

            // Known computed RGB colors from decorator.ts (verified)
            var knownRgb = new Set([
                'rgb(102, 187, 106)', 'rgb(30, 130, 76)',
                'rgb(239, 83, 80)', 'rgb(192, 57, 43)',
                'rgb(206, 147, 216)', 'rgb(108, 52, 131)',
            ]);
            // Background colors for highlights/comments
            var knownBg = [
                'rgba(255, 255, 0,',
                'rgba(173, 216, 230,',
            ];

            var spans = viewLines.querySelectorAll('span');
            var seen = new Set();
            for (var i = 0; i < spans.length; i++) {
                var cs = getComputedStyle(spans[i]);

                // Check text color
                if (knownRgb.has(cs.color) && !seen.has(spans[i])) {
                    total++;
                    seen.add(spans[i]);
                }

                // Check background color (prefix match for alpha variants)
                var bg = cs.backgroundColor;
                for (var j = 0; j < knownBg.length; j++) {
                    if (bg.startsWith(knownBg[j]) && !seen.has(spans[i])) {
                        total++;
                        seen.add(spans[i]);
                        break;
                    }
                }

                // Check strikethrough
                if (cs.textDecorationLine && cs.textDecorationLine.includes('line-through')) {
                    withStrikethrough++;
                    if (!seen.has(spans[i])) {
                        total++;
                        seen.add(spans[i]);
                    }
                }
            }

            // Fallback: check style tags for hex colors (proves types were created)
            if (total === 0) {
                var knownHex = ['#66BB6A', '#1E824C', '#EF5350', '#C0392B', '#CE93D8', '#6C3483'];
                var styles = document.querySelectorAll('style');
                for (var si = 0; si < styles.length; si++) {
                    var text = styles[si].textContent || '';
                    for (var ci = 0; ci < knownHex.length; ci++) {
                        if (text.includes(knownHex[ci])) {
                            total = -1;
                            break;
                        }
                    }
                    if (total === -1) break;
                }
            }

            return { total: total, withStrikethrough: withStrikethrough };
        })()`).catch(() => ({ total: 0, withStrikethrough: 0 }));

        lastResult = result as { total: number; withStrikethrough: number };
        if (lastResult.total > 0) return lastResult;
        await page.waitForTimeout(200);
    }

    return lastResult;
}

/**
 * Check if Smart View is active by looking for hidden (display:none) delimiters.
 */
export async function hasHiddenDecorations(page: Page): Promise<boolean> {
    return page.$$eval(
        '.monaco-editor .view-lines span[style*="display: none"], .monaco-editor .view-lines span[style*="display:none"]',
        els => els.length > 0
    ).catch(() => false);
}

/**
 * Wait for LSP change data to be available for the active document (Section 11).
 *
 * Strategy: delete the decoration-ready signal file, then poll until the
 * extension writes a fresh one. The extension writes this file in the
 * decorationDataHandler callback when LSP pushes changetracks/decorationData.
 * This confirms the decoration cache is populated and accept/reject commands
 * will find changes.
 */
export async function waitForChanges(page: Page, timeoutMs = 10000): Promise<{ ready: boolean; changeCount?: number }> {
    const signalPath = path.join(require('os').tmpdir(), 'changetracks-test-decoration-ready.json');

    // Delete stale signal from previous test run
    try { fs.unlinkSync(signalPath); } catch { /* ignore */ }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (fs.existsSync(signalPath)) {
                const raw = fs.readFileSync(signalPath, 'utf-8');
                const data = JSON.parse(raw);
                if (data.changeCount > 0) {
                    return { ready: true, changeCount: data.changeCount };
                }
            }
        } catch { /* file not ready yet */ }
        await page.waitForTimeout(200);
    }

    // Timeout: return ready anyway to avoid blocking test suite.
    // The step assertion will fail with a clearer message if data isn't available.
    return { ready: true };
}

/**
 * Get cursor line (1-based) via auto-synced bridge file.
 * The extension writes cursor position to a temp file on every selection
 * change (onDidChangeTextEditorSelection). This avoids command palette
 * overhead entirely.
 */
export async function getCursorLineViaBridge(page: Page): Promise<number> {
    const docPath = path.join(require('os').tmpdir(), 'changetracks-test-cursor.json');

    // Give the selection change event time to fire and write the file
    await page.waitForTimeout(300);

    try {
        if (fs.existsSync(docPath)) {
            const raw = fs.readFileSync(docPath, 'utf-8');
            const data = JSON.parse(raw);
            return typeof data.line === 'number' ? data.line : -1;
        }
    } catch { /* file not ready */ }

    return -1;
}

/**
 * Construct the per-instance temp file path for document text.
 * Each VS Code instance gets a unique path based on its instance ID,
 * preventing cross-instance contamination from concurrent test runs.
 */
export function docBridgePath(instanceId?: string): string {
    const suffix = instanceId ? `-${instanceId}` : '';
    return path.join(require('os').tmpdir(), `changetracks-test-doc${suffix}.json`);
}

/**
 * Read the raw text content of the file via the Extension Host bridge.
 *
 * The extension writes document text to a per-instance temp JSON file on every
 * document change and editor switch (via onDidChangeTextDocument / onDidChangeActiveTextEditor).
 * This runs in the Extension Host where document.getText() always works,
 * regardless of Monaco renderer state.
 *
 * If the file is stale or missing, falls back to the _testGetDocumentText
 * command via the command palette.
 */
export async function getDocumentTextViaBridge(page: Page, options?: { expectedFilename?: string; instanceId?: string }): Promise<string> {
    const docPath = docBridgePath(options?.instanceId);

    const expectedFilename = options?.expectedFilename;
    const uriMatchesExpected = (uri?: string): boolean => {
        if (!expectedFilename || !uri) return true;
        return uri.endsWith(expectedFilename);
    };

    // Fast path: if the temp file already has fresh content (written < 2s ago),
    // return immediately without waiting. This avoids adding 200ms latency in
    // polling loops where the extension has already synced.
    try {
        if (fs.existsSync(docPath)) {
            const raw = fs.readFileSync(docPath, 'utf-8');
            const data = JSON.parse(raw);
            if (typeof data.text === 'string' && data.text.length > 0 &&
                typeof data.timestamp === 'number' && (Date.now() - data.timestamp) < 2000 &&
                uriMatchesExpected(data.uri)) {
                return data.text;
            }
        }
    } catch {
        // Fall through to slow path
    }

    // Give Extension Host a moment to process any pending document change events
    await page.waitForTimeout(200);

    // Try reading the per-instance auto-synced temp file.
    // Per-instance files are immune to cross-instance contamination,
    // so no staleness check is needed.
    try {
        if (fs.existsSync(docPath)) {
            const raw = fs.readFileSync(docPath, 'utf-8');
            const data = JSON.parse(raw);
            if (typeof data.text === 'string' && data.text.length > 0 &&
                uriMatchesExpected(data.uri)) {
                return data.text;
            }
        }
    } catch {
        // Fall through to command palette approach
    }

    // Fallback: invoke the bridge command explicitly via command palette.
    // Retry up to 3 times — activeTextEditor can be temporarily undefined
    // after full-document edits (compaction, accept all).
    for (let attempt = 0; attempt < 3; attempt++) {
        const beforeTs = Date.now();
        await executeCommand(page, 'ChangeTracks: Test Get Document Text');
        await page.waitForTimeout(500);

        try {
            if (!fs.existsSync(docPath)) continue;
            const raw = fs.readFileSync(docPath, 'utf-8');
            const data = JSON.parse(raw);
            if (data.timestamp < beforeTs && attempt < 2) continue;
            if (typeof data.text === 'string' && data.text.length > 0 &&
                uriMatchesExpected(data.uri)) {
                return data.text;
            }
        } catch {
            // retry
        }
        if (attempt < 2) await page.waitForTimeout(1000);
    }
    return '';
}

/**
 * Read the raw text content of the file via the VS Code API.
 *
 * Uses the Extension Host bridge (auto-synced temp file) which is immune to
 * Monaco renderer staleness after command palette interactions. The bridge
 * includes 3-retry fallback via explicit command palette invocation, so no
 * Monaco API fallback is needed.
 *
 * NOTE: A globalThis.monaco fallback was removed here because Monaco API is
 * unavailable in VS Code 1.109+ (nodeIntegration disabled in renderer).
 * Optional chaining masked the failure, silently returning '' and giving
 * false passes. The bridge handles cold-start scenarios via its retry logic.
 */
export async function getDocumentText(page: Page, options?: { expectedFilename?: string; instanceId?: string }): Promise<string> {
    // Extension Host auto-syncs document text to a per-instance temp file on
    // every change. getDocumentTextViaBridge reads the file, with 3-retry
    // fallback via explicit _testGetDocumentText command palette invocation.
    return await getDocumentTextViaBridge(page, options);
}

/**
 * Check if comments panel has threads.
 */
export async function getCommentThreadCount(page: Page): Promise<number> {
    return page.$$eval(
        '.comments-panel .comment-thread',
        els => els.length
    ).catch(() => {
        // Fallback: count comment gutter decorations (linesDecorationsClassName)
        return page.$$eval(
            '.monaco-editor .margin-view-overlays .comment-range-glyph',
            els => els.length
        ).catch(() => 0);
    });
}

/**
 * Query comment gutter icon count (line-decoration icons in the margin).
 * VS Code's Comments API renders gutter icons via linesDecorationsClassName
 * using the class `comment-range-glyph` (with optional `comment-thread-unresolved`
 * or `comment-thread-draft` suffixes). These appear in the line-decorations lane
 * of .margin-view-overlays, not the glyph margin.
 */
export async function getCommentGutterIconCount(page: Page): Promise<number> {
    return page.$$eval(
        '.monaco-editor .margin-view-overlays .comment-range-glyph',
        els => els.length
    ).catch(() => 0);
}

/**
 * Extract text from all visible comment peek widgets (zone widgets).
 * Returns an array of { body: string, isResolved: boolean } for each visible thread.
 * Relies on clickToShowComments: true in journey settings.
 */
export async function getVisibleCommentPeeks(page: Page): Promise<Array<{ body: string; isResolved: boolean }>> {
    const result = await page.evaluate(`(() => {
        const peeks = [];
        // VS Code renders comment threads in zone widgets or in the comments peekview
        const widgets = document.querySelectorAll('.zone-widget');
        for (const widget of widgets) {
            const bodyEl = widget.querySelector('.comment-body, .review-comment-body');
            const body = bodyEl?.textContent ?? '';
            // Check if the thread widget has a resolved indicator
            const isResolved = widget.classList.contains('resolved') ||
                widget.querySelector('.codicon-comment-resolved') !== null;
            if (body.length > 0) {
                peeks.push({ body, isResolved });
            }
        }
        // Also check inline comment threads rendered as overlays
        const inlineThreads = document.querySelectorAll('.comment-thread');
        for (const thread of inlineThreads) {
            const bodyEl = thread.querySelector('.comment-body, .review-comment-body');
            const body = bodyEl?.textContent ?? '';
            const isResolved = thread.classList.contains('resolved') ||
                thread.querySelector('.codicon-comment-resolved') !== null;
            if (body.length > 0) {
                peeks.push({ body, isResolved });
            }
        }
        return peeks;
    })()`).catch(() => []);
    return result as Array<{ body: string; isResolved: boolean }>;
}

/**
 * Check if any visible comment peek/thread contains the given text.
 */
export async function commentPeekContainsText(page: Page, text: string): Promise<boolean> {
    const peeks = await getVisibleCommentPeeks(page);
    return peeks.some(p => p.body.includes(text));
}

/**
 * Get the count of resolved vs unresolved comment gutter icons.
 * VS Code Comments API uses linesDecorationsClassName with these classes:
 *   - comment-range-glyph comment-thread          → resolved
 *   - comment-range-glyph comment-thread-unresolved → unresolved
 *   - comment-range-glyph comment-thread-draft     → draft (counted as unresolved)
 */
export async function getCommentResolvedCounts(page: Page): Promise<{ resolved: number; unresolved: number }> {
    const result = await page.evaluate(`(() => {
        const all = document.querySelectorAll('.monaco-editor .margin-view-overlays .comment-range-glyph');
        let resolved = 0;
        let unresolved = 0;
        for (const el of all) {
            if (el.classList.contains('comment-thread-unresolved') || el.classList.contains('comment-thread-draft')) {
                unresolved++;
            } else {
                // comment-range-glyph with comment-thread (or bare) = resolved
                resolved++;
            }
        }
        return { resolved, unresolved };
    })()`).catch(() => ({ resolved: 0, unresolved: 0 }));
    return result as { resolved: number; unresolved: number };
}

/**
 * Open the bottom Comments panel via command palette.
 */
export async function openCommentsPanel(page: Page): Promise<void> {
    await executeCommand(page, 'Comments: Focus Comments');
    await page.waitForTimeout(1500);
}

/**
 * Query the bottom Comments panel for thread items.
 * Returns array of { text: string, isResolved: boolean } for each listed row.
 * The Comments panel renders threads as tree rows in a monaco-list.
 */
export async function getCommentsPanelThreads(page: Page): Promise<Array<{
    text: string;
    isResolved: boolean;
}>> {
    const result = await page.evaluate(`(() => {
        const threads = [];

        // The Comments panel renders as a tree with .monaco-list-row items
        const panel = document.querySelector('.part.panel');
        if (!panel) return threads;

        const rows = panel.querySelectorAll('.monaco-list-row, [role="treeitem"]');
        for (const row of rows) {
            const text = row.textContent?.trim() ?? '';
            if (text.length === 0) continue;
            // Check for resolved indicators — only use specific VS Code classes,
            // not broad [class*="resolved"] which gives false positives on reply indicators
            const isResolved = row.querySelector('.codicon-comment-resolved') !== null ||
                row.classList.contains('resolved');
            threads.push({ text, isResolved });
        }

        return threads;
    })()`).catch(() => []);
    return result as Array<{ text: string; isResolved: boolean }>;
}

/**
 * Get all text content from the bottom Comments panel (broad scrape).
 * Useful for debugging what's actually rendered.
 */
export async function getCommentsPanelText(page: Page): Promise<string> {
    const result = await page.evaluate(`(() => {
        // Try multiple known selectors for the comments panel area
        const candidates = [
            '.comments-panel',
            '[id*="commentsPanel"]',
            '[id*="workbench.panel.comments"]',
            '.pane-body [class*="comment"]',
        ];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && el.textContent && el.textContent.trim().length > 0) {
                return el.textContent;
            }
        }
        // Fallback: dump all bottom panel text
        const bottomPanel = document.querySelector('.part.panel .content');
        return bottomPanel?.textContent ?? '';
    })()`).catch(() => '');
    return result as string;
}

// ───────────────────────────────────────────────
// Evidence capture
// ───────────────────────────────────────────────

/**
 * Capture an evidence screenshot with a descriptive name.
 */
export async function captureEvidence(
    page: Page,
    journey: string,
    scenario: string,
    step: string
): Promise<string> {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const sanitized = `${journey}-${scenario}-${step}`
        .replace(/[^a-zA-Z0-9-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100);
    const filePath = path.join(EVIDENCE_DIR, `${sanitized}.png`);
    await page.screenshot({ path: filePath });
    return filePath;
}

// ───────────────────────────────────────────────
// Task 0A: Comment thread bridge helper
// ───────────────────────────────────────────────

/**
 * Get comment thread metadata from the extension via bridge command.
 * Returns thread data including changeId, state, commentCount, and label.
 */
export async function getCommentThreads(page: Page): Promise<{
    threads: Array<{ changeId: string; state: string; commentCount: number; label: string }>;
    count: number;
}> {
    const resultPath = path.join(require('os').tmpdir(), 'changetracks-test-comment-threads.json');

    // Clean stale result
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }

    await executeCommandViaBridge(page, 'changetracks._testGetCommentThreads');

    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        try {
            if (fs.existsSync(resultPath)) {
                const raw = fs.readFileSync(resultPath, 'utf-8');
                const data = JSON.parse(raw);
                if (typeof data.timestamp === 'number') {
                    return { threads: data.threads ?? [], count: data.count ?? 0 };
                }
            }
        } catch { /* not ready */ }
    }

    return { threads: [], count: 0 };
}

// ───────────────────────────────────────────────
// Task 0B: CodeLens bridge helper
// ───────────────────────────────────────────────

/**
 * Get CodeLens items from the active editor via bridge command.
 * Returns array of {line, title, command} objects.
 */
export async function getCodeLensItems(page: Page): Promise<{
    items: Array<{ line: number; title: string; command: string }>;
    count: number;
}> {
    const resultPath = path.join(require('os').tmpdir(), 'changetracks-test-codelens.json');

    // Clean stale result
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }

    await executeCommandViaBridge(page, 'changetracks._testGetCodeLensItems');

    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        try {
            if (fs.existsSync(resultPath)) {
                const raw = fs.readFileSync(resultPath, 'utf-8');
                const data = JSON.parse(raw);
                if (typeof data.timestamp === 'number') {
                    return { items: data.items ?? [], count: data.count ?? 0 };
                }
            }
        } catch { /* not ready */ }
    }

    return { items: [], count: 0 };
}

// ───────────────────────────────────────────────
// Task 0C: Review panel cards bridge helper
// ───────────────────────────────────────────────

/**
 * Get review panel card data from the extension via bridge command.
 * Returns array of card objects with changeId, type, status, author, textPreview, replyCount.
 */
export async function getReviewPanelCards(page: Page): Promise<{
    cards: Array<{ changeId: string; type: string; status: string; author: string; textPreview: string; replyCount: number }>;
    count: number;
}> {
    const resultPath = path.join(require('os').tmpdir(), 'changetracks-test-review-panel-cards.json');

    // Clean stale result
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }

    await executeCommandViaBridge(page, 'changetracks._testGetReviewPanelCards');

    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        try {
            if (fs.existsSync(resultPath)) {
                const raw = fs.readFileSync(resultPath, 'utf-8');
                const data = JSON.parse(raw);
                if (typeof data.timestamp === 'number') {
                    return { cards: data.cards ?? [], count: data.count ?? 0 };
                }
            }
        } catch { /* not ready */ }
    }

    return { cards: [], count: 0 };
}

// ───────────────────────────────────────────────
// Task 0E: QuickPick and InputBox helpers
// ───────────────────────────────────────────────

/**
 * Wait for QuickPick to appear and return its items as text strings.
 */
export async function waitForQuickPick(page: Page, timeout = 3000): Promise<string[]> {
    await page.waitForSelector('.quick-input-widget[style*="display: flex"]', { timeout });
    const items = await page.$$eval(
        '.quick-input-list .monaco-list-row .label-name',
        els => els.map(el => el.textContent ?? '')
    );
    return items;
}

/**
 * Select a QuickPick item by label text.
 * Throws if the item is not found.
 */
export async function selectQuickPickItem(page: Page, label: string): Promise<void> {
    const items = await page.$$('.quick-input-list .monaco-list-row');
    for (const item of items) {
        const text = await item.textContent();
        if (text?.includes(label)) {
            await item.click();
            return;
        }
    }
    throw new Error(`QuickPick item "${label}" not found`);
}

/**
 * Wait for InputBox, type text, and submit with Enter.
 */
export async function typeInInputBox(page: Page, text: string): Promise<void> {
    const input = await page.waitForSelector('.quick-input-widget input[type="text"]', { timeout: 3000 });
    if (!input) throw new Error('InputBox input element not found');
    await input.fill(text);
    await page.keyboard.press('Enter');
}

/**
 * Dismiss QuickPick/InputBox without selecting (press Escape).
 */
export async function dismissQuickInput(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
}

// ───────────────────────────────────────────────
// Assertion builder
// ───────────────────────────────────────────────

export class ScenarioRunner {
    private results: AssertionResult[] = [];
    private evidencePaths: string[] = [];
    private startTime = Date.now();

    constructor(
        private page: Page,
        private journey: string,
        private scenario: string
    ) {}

    async assert(description: string, fn: () => Promise<boolean>, expected?: string): Promise<void> {
        try {
            const passed = await fn();
            this.results.push({ description, passed, expected: expected ?? 'true', actual: String(passed) });
            if (!passed) {
                console.log(`    FAIL: ${description}`);
            } else {
                console.log(`    PASS: ${description}`);
            }
        } catch (err: any) {
            this.results.push({ description, passed: false, actual: err.message, expected: expected ?? 'no error' });
            console.log(`    ERROR: ${description} — ${err.message}`);
        }
    }

    async evidence(step: string): Promise<string> {
        const p = await captureEvidence(this.page, this.journey, this.scenario, step);
        this.evidencePaths.push(p);
        return p;
    }

    toResult(): JourneyResult {
        const allPassed = this.results.every(r => r.passed);
        return {
            journey: this.journey,
            scenario: this.scenario,
            status: allPassed ? 'pass' : 'fail',
            assertions: this.results,
            evidence: this.evidencePaths[this.evidencePaths.length - 1],
            durationMs: Date.now() - this.startTime,
        };
    }
}

// ───────────────────────────────────────────────
// Walkthrough helpers
// ───────────────────────────────────────────────

/**
 * Check if a walkthrough panel is visible in the editor.
 */
export async function isWalkthroughVisible(page: Page): Promise<boolean> {
    const count = await page.$$eval(
        '.getting-started',
        els => els.length
    ).catch(() => 0);
    return count > 0;
}

/**
 * Get walkthrough step titles from the DOM.
 */
export async function getWalkthroughSteps(page: Page): Promise<string[]> {
    const result = await page.evaluate(`(() => {
        const steps = document.querySelectorAll('.getting-started .step-list-container .step-title, .getting-started .steps-container h3');
        return Array.from(steps).map(el => el.textContent?.trim() ?? '');
    })()`).catch(() => []);
    return result as string[];
}

/**
 * Count the number of editor groups (tab columns).
 * 1 = single editor, 2 = side-by-side, etc.
 */
export async function getEditorGroupCount(page: Page): Promise<number> {
    const count = await page.$$eval(
        '.editor-group-container',
        els => els.filter(el => {
            const style = (el.ownerDocument.defaultView || (globalThis as any)).getComputedStyle(el);
            return style.display !== 'none' && el.querySelector('.editor-container');
        }).length
    ).catch(() => 0);
    return count;
}

/**
 * Check if a sidebar view is visible by view ID.
 */
export async function isSidebarViewVisible(page: Page, viewId: string): Promise<boolean> {
    const visible = await page.$$eval(
        `[id*="${viewId}"]`,
        (els) => els.some(el => {
            const style = (el.ownerDocument.defaultView || (globalThis as any)).getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        })
    ).catch(() => false);
    return visible;
}

/**
 * Launch VS Code with a workspace folder (for walkthrough tests).
 * Unlike launchWithJourneyFixture which opens a single file,
 * this opens a folder so setupProject can write into it.
 */
export async function launchWithWorkspaceFolder(
    workspaceDir: string,
    options: { settings?: Record<string, unknown> } = {}
): Promise<VSCodeInstance> {
    const { _electron: electron } = require('playwright');
    const { downloadAndUnzipVSCode } = require('@vscode/test-electron');

    const extensionDevelopmentPath = EXTENSION_ROOT;
    const vscodeExecutablePath = await downloadAndUnzipVSCode();

    let electronPath: string;
    if (process.platform === 'darwin') {
        electronPath = path.join(
            path.dirname(path.dirname(vscodeExecutablePath)),
            'MacOS', 'Electron'
        );
    } else {
        electronPath = vscodeExecutablePath;
    }

    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vscode-walkthrough-'));
    const userSettingsDir = path.join(tmpDir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });

    const settings: Record<string, unknown> = {
        'editor.cursorBlinking': 'solid',
        'editor.cursorSmoothCaretAnimation': 'off',
        'editor.smoothScrolling': false,
        'workbench.enableExperiments': false,
        'telemetry.telemetryLevel': 'off',
        'update.mode': 'none',
        'changetracks.showWalkthroughOnStartup': 'always',
        ...options.settings,
    };
    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify(settings));

    const args = [
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--user-data-dir=${tmpDir}`,
        `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
        '--window-size=1280,720',
        workspaceDir,
    ];

    const app: ElectronApplication = await electron.launch({
        executablePath: electronPath,
        args,
        env: { ...process.env, VSCODE_SKIP_PRELAUNCH: '1' },
    });

    const page: Page = await app.firstWindow();
    await page.waitForSelector('.monaco-workbench', { timeout: 30000 });
    // Wait for extension activation + walkthrough deferred open (2s delay + buffer)
    await page.waitForTimeout(5000);

    return { app, page };
}

// ───────────────────────────────────────────────
// Preview DOM helpers (frame-based access)
// ───────────────────────────────────────────────

/**
 * Open markdown preview to the side via command palette.
 * Requires the markdown file to be the active editor.
 */
export async function openMarkdownPreview(page: Page): Promise<void> {
    await executeCommand(page, 'Markdown: Open Preview to the Side');
    await page.waitForTimeout(3000);
}

/**
 * Find the preview frame within VS Code's webview iframe structure.
 *
 * VS Code's built-in markdown preview renders inside:
 *   Main page → iframe (index.html) → iframe (fake.html)
 * The fake.html frame has body class "vscode-body" and contains the
 * rendered markdown with CriticMarkup CSS classes.
 */
export function findPreviewFrame(page: Page): import('playwright').Frame | null {
    for (const frame of page.frames()) {
        const url = frame.url();
        if (url.includes('vscode-webview') && url.includes('fake.html')) {
            return frame;
        }
    }
    return null;
}

/**
 * Execute a JS expression inside the markdown preview frame.
 */
export async function queryPreviewDOM(
    page: Page,
    jsExpression: string
): Promise<unknown> {
    const frame = findPreviewFrame(page);
    if (!frame) return null;
    try {
        return await frame.evaluate(jsExpression);
    } catch {
        return null;
    }
}

/**
 * Poll queryPreviewDOM until checkExpr returns truthy or timeout.
 */
export async function waitForPreviewContent(
    page: Page,
    checkExpr: string,
    timeout = 10000
): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const result = await queryPreviewDOM(page, checkExpr);
        if (result) return true;
        await page.waitForTimeout(500);
    }
    return false;
}

/**
 * Count DOM elements matching a CSS selector in the preview frame.
 */
export async function countPreviewElements(
    page: Page,
    selector: string
): Promise<number> {
    const count = await queryPreviewDOM(
        page,
        `document.querySelectorAll(${JSON.stringify(selector)}).length`
    );
    return (count as number) ?? 0;
}

/**
 * Check if a CSS class is present anywhere in the preview frame body.
 */
export async function previewHasClass(
    page: Page,
    className: string
): Promise<boolean> {
    const count = await countPreviewElements(page, `.${className}`);
    return count > 0;
}

/**
 * Get full text content of the preview frame body.
 */
export async function getPreviewText(page: Page): Promise<string> {
    const text = await queryPreviewDOM(page, 'document.body?.textContent ?? ""');
    return (text as string) ?? '';
}

/**
 * Get innerHTML of the preview frame body.
 */
export async function getPreviewHTML(page: Page): Promise<string> {
    const html = await queryPreviewDOM(page, 'document.body?.innerHTML ?? ""');
    return (html as string) ?? '';
}

/**
 * Dismiss walkthrough overlay and focus the markdown editor.
 * Needed when VS Code opens the walkthrough on first launch,
 * which steals focus from the markdown file tab.
 */
export async function focusMarkdownEditor(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await executeCommand(page, 'View: Close All Editors');
    await page.waitForTimeout(500);
    // Reopen via quick open
    await page.keyboard.press('Meta+p');
    await page.waitForTimeout(500);
    // Type just enough to match — quick open searches file names
    await page.keyboard.type('journey-preview', { delay: 30 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
}

/**
 * Execute a VS Code command by ID, bypassing the command palette entirely.
 * Uses the Electron app handle to call vscode.commands.executeCommand
 * in the extension host via Playwright's evaluate.
 */
/**
 * Update a VS Code setting by modifying settings.json directly.
 * VS Code watches this file and auto-reloads configuration.
 * This bypasses the command palette entirely — no fuzzy-match issues.
 */
/** Stores the user-data-dir for each launched VS Code instance. */
const userDataDirByPage = new WeakMap<Page, string>();

/**
 * Update a VS Code setting by modifying settings.json directly.
 * VS Code watches this file and auto-reloads configuration.
 * This bypasses the command palette entirely — no fuzzy-match issues.
 */
export async function updateSettingDirect(page: Page, key: string, value: unknown): Promise<void> {
    const userDataDir = userDataDirByPage.get(page);
    if (!userDataDir) {
        throw new Error('No user-data-dir known for this page. Was it launched via launchVSCodeDirect?');
    }

    const settingsPath = path.join(userDataDir, 'User', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Wait for VS Code's file watcher to pick up the change
    await page.waitForTimeout(800);
}

// Re-export launch helpers for convenience
export { closeVSCode, executeCommand, toggleSmartView, setCursorPosition };
