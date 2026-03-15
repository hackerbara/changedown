/**
 * Video Recording Harness for ChangeTracks Demo Videos
 *
 * Launches VS Code Electron via Playwright with video-optimized settings
 * (1920x1080, smooth cursor, dark theme) and provides human-speed helpers
 * for scripted interactions. Uses macOS screencapture for recording.
 *
 * Usage:
 *   npm run video:record -- v1-track-changes
 *
 * Scripts register themselves via registerVideoScript(name, fixture, fn).
 * The main() entry point loads all compiled .js scripts from video/scripts/,
 * launches VS Code with the script's fixture, records, runs the script, then stops.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import type { Page, ElectronApplication } from 'playwright';

// ─── Types ───────────────────────────────────────────────────────

export interface VideoContext {
    page: Page;
    app: ElectronApplication;
    instanceId: string;
}

export type VideoScript = (ctx: VideoContext) => Promise<void>;

interface ScriptEntry {
    fixture: string;
    fn: VideoScript;
    settings?: Record<string, unknown>;
}

// ─── Script Registry ─────────────────────────────────────────────

const scriptRegistry = new Map<string, ScriptEntry>();

/**
 * Register a named video script with its fixture file.
 * Called by each script file at import time.
 *
 * @param name - Script name (used as CLI argument, e.g. "v1-track-changes")
 * @param fixture - Fixture filename in fixtures/video/ (e.g. "v1-track-changes.md")
 * @param fn - The script function that receives a VideoContext
 * @param settings - Optional per-script settings overrides merged on top of VIDEO_SETTINGS
 */
export function registerVideoScript(name: string, fixture: string, fn: VideoScript, settings?: Record<string, unknown>): void {
    scriptRegistry.set(name, { fixture, fn, settings });
}

// ─── Path Helpers ────────────────────────────────────────────────

// At runtime __dirname = out/video/ (compiled from packages/tests/vscode/)
// Package root = 2 levels up: out/video -> out -> packages/tests/vscode
const PACKAGE_ROOT = path.resolve(__dirname, '../../');
const EXTENSION_ROOT = path.resolve(PACKAGE_ROOT, '../../vscode-extension');
const FIXTURES_DIR = path.resolve(PACKAGE_ROOT, 'fixtures/video');
const SCRIPTS_DIR = path.resolve(__dirname, 'scripts');
const OUTPUT_DIR = path.resolve(PACKAGE_ROOT, 'video/output');

// ─── Human-Speed Interaction Helpers ─────────────────────────────

/**
 * Type text at human speed (~40 WPM default).
 * Each character is typed with a randomized delay for realism.
 *
 * @param page - Playwright Page handle
 * @param text - Text to type
 * @param wpm - Words per minute (default 40, ~150ms per char)
 */
export async function typeHuman(page: Page, text: string, wpm: number = 40): Promise<void> {
    // WPM -> ms per character (assuming 5 chars per word average)
    const msPerChar = Math.round(60000 / (wpm * 5));
    for (const char of text) {
        // Add +/- 30% variance for natural rhythm
        const variance = 0.7 + Math.random() * 0.6;
        await page.keyboard.type(char, { delay: 0 });
        await page.waitForTimeout(Math.round(msPerChar * variance));
    }
}

/**
 * Pause for the viewer to absorb a visual change.
 * Default 800ms -- long enough to notice, short enough to keep pace.
 */
export async function beat(page: Page, ms: number = 800): Promise<void> {
    await page.waitForTimeout(ms);
}

/**
 * Execute a VS Code command via the bridge (temp file IPC + Ctrl+Shift+F12).
 * Returns true if the command acknowledged successfully within 5 seconds.
 */
export async function command(page: Page, commandId: string): Promise<boolean> {
    const inputPath = path.join(os.tmpdir(), 'changetracks-test-exec-input.json');
    const resultPath = path.join(os.tmpdir(), 'changetracks-test-exec.json');

    // Clean stale result
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }

    // Write command to input file
    fs.writeFileSync(inputPath, JSON.stringify({ command: commandId }));

    // Press the bridge keybinding (Ctrl+Shift+F12)
    await page.keyboard.press('Control+Shift+F12');

    // Poll for result
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

    console.log(`  [WARN] command() timed out for ${commandId}`);
    return false;
}

/**
 * Position cursor before or after a string in the document via bridge.
 *
 * @param page - Playwright Page handle
 * @param target - The text string to find in the document
 * @param position - 'before' (default) or 'after' the target string
 */
export async function positionCursor(
    page: Page,
    target: string,
    position: 'before' | 'after' = 'before'
): Promise<boolean> {
    const inputPath = path.join(os.tmpdir(), 'changetracks-test-position-cursor-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ target, position }));
    return command(page, 'changetracks._testPositionCursor');
}

/**
 * Select text by content via bridge.
 *
 * @param page - Playwright Page handle
 * @param target - The text string to find and select in the document
 */
export async function selectText(page: Page, target: string): Promise<boolean> {
    const inputPath = path.join(os.tmpdir(), 'changetracks-test-select-text-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ target }));
    return command(page, 'changetracks._testSelectText');
}

// ─── VS Code Launch ──────────────────────────────────────────────

/** Video-optimized VS Code settings */
const VIDEO_SETTINGS: Record<string, unknown> = {
    'editor.cursorBlinking': 'smooth',
    'editor.cursorSmoothCaretAnimation': 'on',
    'editor.smoothScrolling': true,
    'editor.fontSize': 15,
    'editor.lineHeight': 24,
    'editor.minimap.enabled': false,
    'editor.renderWhitespace': 'none',
    'editor.scrollBeyondLastLine': false,
    'breadcrumbs.enabled': false,
    'workbench.colorTheme': 'Default Dark+',
    'workbench.activityBar.visible': false,
    'workbench.statusBar.visible': true,
    'workbench.sideBar.location': 'left',
    'workbench.panel.defaultLocation': 'bottom',
    'workbench.enableExperiments': false,
    'workbench.startupEditor': 'none',
    'workbench.welcomePage.walkthroughs.openOnInstall': false,
    'workbench.tips.enabled': false,
    'chat.editor.enabled': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.autoCheckUpdates': false,
    'editor.codeLens': true,
    'changetracks.authorColors': 'auto',
    'changetracks.author': 'you',
    'changetracks.clickToShowComments': true,
    'changetracks.trackingMode': true,
    'changetracks.editBoundary.pauseThresholdMs': 2000,
    'changetracks.showWalkthroughOnStartup': 'never',
    'changetracks.confirmBulkThreshold': 0,
    'changetracks.showDelimiters': true,
};

/**
 * Launch VS Code Electron with video-optimized settings.
 * Returns a VideoContext with the Playwright page, app handle, and instance ID.
 *
 * Uses the same launch pattern as the test harness (playwrightHarness.ts):
 * downloads VS Code via @vscode/test-electron, creates temp user-data-dir,
 * pre-seeds SQLite to suppress walkthroughs, launches via Playwright Electron.
 *
 * @param fixtureName - Filename in fixtures/video/ (e.g. "v1-track-changes.md")
 * @param settingsOverrides - Optional per-script settings merged on top of VIDEO_SETTINGS
 */
export async function launchForVideo(fixtureName: string, settingsOverrides?: Record<string, unknown>): Promise<VideoContext> {
    const { _electron: electron } = require('playwright');
    const { downloadAndUnzipVSCode } = require('@vscode/test-electron');

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

    // Resolve fixture file
    const fixtureFile = path.resolve(FIXTURES_DIR, fixtureName);
    if (!fs.existsSync(fixtureFile)) {
        throw new Error(`Fixture not found: ${fixtureFile}`);
    }

    // Create temp user-data-dir with video settings
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-video-'));
    const userSettingsDir = path.join(tmpDir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
    const mergedSettings = settingsOverrides
        ? { ...VIDEO_SETTINGS, ...settingsOverrides }
        : VIDEO_SETTINGS;
    fs.writeFileSync(
        path.join(userSettingsDir, 'settings.json'),
        JSON.stringify(mergedSettings)
    );

    // Pre-seed SQLite state.vscdb to suppress walkthroughs.
    // Pattern copied from playwrightHarness.ts (lines 209-231).
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
        console.log('  Pre-seeded state.vscdb (walkthrough suppressed)');
    } catch (e: any) {
        console.log(`  Warning: Could not pre-seed state.vscdb: ${e.message}`);
    }

    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const args = [
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--user-data-dir=${tmpDir}`,
        `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
        '--window-size=1920,1080',
        fixtureFile,
    ];

    const app: ElectronApplication = await electron.launch({
        executablePath: electronPath,
        args,
        env: {
            ...process.env,
            VSCODE_SKIP_PRELAUNCH: '1',
            CHANGETRACKS_TEST_INSTANCE_ID: instanceId,
        },
    });

    const page: Page = await app.firstWindow();
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });

    // Wait for extension activation + decorations
    await page.waitForTimeout(4000);

    // Dismiss walkthrough if it appeared despite pre-seeding
    const hasWalkthrough = await page.$$eval(
        '.getting-started, [id*="gettingStarted"]',
        els => els.length > 0
    ).catch(() => false);
    if (hasWalkthrough) {
        console.log('  Warning: Walkthrough appeared despite pre-seeding, dismissing...');
        await page.keyboard.press('Meta+w');
        await page.waitForTimeout(1500);
    }

    // Close all panels for clean video — use DOM visibility checks + correct macOS keybindings.
    // Close secondary sidebar (CHAT/SESSIONS) if visible
    const hasAuxBar = await page.evaluate(`(() => {
        const el = document.querySelector('.part.auxiliarybar');
        return el !== null && el.offsetWidth > 0;
    })()`);
    if (hasAuxBar) {
        await page.keyboard.press('Meta+Alt+b');
        await page.waitForTimeout(300);
    }

    // Close bottom panel (terminal) if visible
    const hasPanelVisible = await page.evaluate(`(() => {
        const el = document.querySelector('.part.panel');
        return el !== null && el.offsetHeight > 0;
    })()`);
    if (hasPanelVisible) {
        await page.keyboard.press('Meta+j');
        await page.waitForTimeout(300);
    }

    // Close left sidebar if visible
    const hasSidebar = await page.evaluate(`(() => {
        const el = document.querySelector('.part.sidebar');
        return el !== null && el.offsetWidth > 0;
    })()`);
    if (hasSidebar) {
        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(300);
    }

    // Ensure editor has focus by clicking on it
    const editorEl = await page.$('.monaco-editor');
    if (editorEl) {
        await editorEl.click();
        await page.waitForTimeout(500);
    }

    console.log(`  VS Code launched (video mode, 1920x1080, instance ${instanceId})`);
    return { page, app, instanceId };
}

// ─── Frame Capture (Playwright screenshots → ffmpeg stitch) ─────

/**
 * Captures screenshots from the Playwright page at a target framerate.
 * Returns a handle to stop capture and stitch frames into a video.
 *
 * This approach avoids macOS screen recording permission issues by using
 * Playwright's direct access to the Electron window content.
 */
export interface FrameCapture {
    /** Call to stop capturing and stitch frames into a video. */
    stop: () => Promise<string>;
}

export function startFrameCapture(page: Page, outputPath: string, fps: number = 10): FrameCapture {
    const framesDir = outputPath.replace(/\.[^.]+$/, '-frames');
    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    let running = true;
    let frame = 0;
    const interval = Math.round(1000 / fps);

    console.log(`  Capturing frames at ${fps}fps to: ${framesDir}`);

    // Start the capture loop (runs concurrently with the script)
    const captureLoop = (async () => {
        while (running) {
            const start = Date.now();
            try {
                await page.screenshot({
                    path: path.join(framesDir, `frame-${String(frame++).padStart(5, '0')}.png`),
                });
            } catch {
                // Page closed or navigation — stop capturing
                break;
            }
            const elapsed = Date.now() - start;
            if (elapsed < interval && running) {
                await new Promise(r => setTimeout(r, interval - elapsed));
            }
        }
    })();

    return {
        stop: async () => {
            running = false;
            await captureLoop;
            console.log(`  Captured ${frame} frames`);

            if (frame === 0) {
                console.log('  No frames captured, skipping stitch');
                return '';
            }

            // Stitch frames into video using ffmpeg
            console.log(`  Stitching ${frame} frames into video...`);
            try {
                execSync([
                    'ffmpeg', '-y',
                    '-framerate', String(fps),
                    '-i', path.join(framesDir, 'frame-%05d.png'),
                    '-c:v', 'libx264',
                    '-preset', 'slow',
                    '-crf', '18',
                    '-pix_fmt', 'yuv420p',
                    outputPath,
                ].join(' '), { timeout: 60000 });
                console.log(`  Video saved: ${outputPath}`);
            } catch (err: any) {
                console.error(`  ffmpeg stitch failed: ${err.message}`);
            }

            // Clean up frame PNGs
            try {
                for (const f of fs.readdirSync(framesDir)) {
                    fs.unlinkSync(path.join(framesDir, f));
                }
                fs.rmdirSync(framesDir);
            } catch { /* ignore cleanup errors */ }

            return outputPath;
        },
    };
}

// ─── Main CLI Entry Point ────────────────────────────────────────

async function main(): Promise<void> {
    const scriptName = process.argv[2];
    if (!scriptName) {
        console.error('Usage: node out/video/record.js <script-name>');
        console.error('Available scripts are loaded from video/scripts/');
        process.exit(1);
    }

    // Load all compiled script files from the scripts directory
    if (fs.existsSync(SCRIPTS_DIR)) {
        const scriptFiles = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js'));
        for (const file of scriptFiles) {
            require(path.join(SCRIPTS_DIR, file));
        }
    }

    const entry = scriptRegistry.get(scriptName);
    if (!entry) {
        const available = Array.from(scriptRegistry.keys());
        console.error(`Script "${scriptName}" not found.`);
        if (available.length > 0) {
            console.error(`Available scripts: ${available.join(', ')}`);
        } else {
            console.error('No scripts found in video/scripts/. Create a .ts file that calls registerVideoScript().');
        }
        process.exit(1);
    }

    console.log(`\n=== Recording video: ${scriptName} ===\n`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(OUTPUT_DIR, `${scriptName}.mp4`);
    let capture: FrameCapture | undefined;
    let ctx: VideoContext | undefined;

    try {
        // Launch VS Code with the script's fixture and optional per-script settings
        ctx = await launchForVideo(entry.fixture, entry.settings);

        // Start frame capture (Playwright screenshots at 10fps)
        capture = startFrameCapture(ctx.page, outputPath, 10);

        // Run the video script
        await entry.fn(ctx);

        console.log(`\n  Script "${scriptName}" completed successfully.`);
    } catch (err: any) {
        console.error(`\n  Script "${scriptName}" failed: ${err.message}`);
        console.error(err.stack);
    } finally {
        // Stop frame capture and stitch into video
        if (capture) {
            console.log('  Finalizing video...');
            await capture.stop();
        }

        // Close VS Code
        if (ctx?.app) {
            console.log('  Closing VS Code...');
            await ctx.app.close().catch(() => {});
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
