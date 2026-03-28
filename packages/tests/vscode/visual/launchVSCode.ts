import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';

export interface VSCodeInstance {
    app: ElectronApplication;
    page: Page;
    instanceId?: string;
}

export interface LaunchOptions {
    headless?: boolean;
    windowWidth?: number;
    windowHeight?: number;
    theme?: 'dark' | 'light';
}

/**
 * Launch VS Code with the ChangeDown extension loaded.
 * Returns handles for controlling the editor via Playwright.
 * 
 * Includes retry logic (max 3 attempts) for flaky VS Code launches.
 */
export async function launchVSCode(
    fixtureFile?: string,
    options: LaunchOptions = {}
): Promise<VSCodeInstance> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await launchVSCodeInternal(fixtureFile, options);
        } catch (error) {
            lastError = error as Error;
            console.log(`  Launch attempt ${attempt} failed: ${lastError.message}`);
            if (attempt < maxRetries) {
                console.log(`  Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    throw new Error(`Failed to launch VS Code after ${maxRetries} attempts: ${lastError?.message}`);
}

async function launchVSCodeInternal(
    fixtureFile?: string,
    options: LaunchOptions = {}
): Promise<VSCodeInstance> {
    // Extension development path: packages/vscode-extension/
    // __dirname is out/visual/ (compiled from packages/tests/vscode/)
    // Package root = 2 levels up: out/visual -> out -> packages/tests/vscode
    const packageRoot = path.resolve(__dirname, '../../');
    const extensionDevelopmentPath = path.resolve(packageRoot, '../../vscode-extension');

    // Determine which file to open
    // Fixtures live in packages/tests/vscode/fixtures/visual/
    const fileToOpen = fixtureFile
        ? path.resolve(packageRoot, 'fixtures/visual', fixtureFile)
        : undefined;

    // Create a temp user-data-dir with settings that disable cursor blink
    // to prevent flaky screenshot comparisons from cursor animation
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-visual-test-'));
    const userSettingsDir = path.join(userDataDir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
    const settings: Record<string, any> = {
        "editor.cursorBlinking": "solid",
        "editor.cursorSmoothCaretAnimation": "off",
        "editor.smoothScrolling": false,
        "workbench.enableExperiments": false,
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "problems.decorations.enabled": false,
        "editor.codeLens": false,
        // Show CriticMarkup delimiters so D1/D2 decoration tests can distinguish view modes
        "changedown.showDelimiters": true,
        // Suppress walkthroughs
        "workbench.welcomePage.walkthroughs.openOnInstall": false,
        "workbench.startupEditor": "none",
    };

    // Pre-seed VS Code global state database to mark walkthroughs as completed.
    // Without this, VS Code opens the walkthrough tab over the editor on first launch.
    const stateDbDir = path.join(userDataDir, 'User', 'globalStorage');
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
        console.log('  Pre-seeded state.vscdb for visual test (walkthrough suppressed)');
    } catch (e: any) {
        console.log(`  Warning: Could not pre-seed state.vscdb: ${e.message}`);
    }

    // Apply theme if specified
    if (options.theme === 'light') {
        settings["workbench.colorTheme"] = "Default Light Modern";
    }

    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify(settings));

    const args = [
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--user-data-dir=${userDataDir}`,
        `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
        `--window-size=${options.windowWidth || 1280},${options.windowHeight || 720}`,
    ];

    // Force theme via CLI arg (settings.json alone doesn't work for fresh profiles)
    if (options.theme === 'light') {
        args.push('--force-color-theme=Default Light Modern');
    }

    if (fileToOpen) {
        args.push(fileToOpen);
    }

    // Launch VS Code as an Electron app via Playwright
    // We need the VS Code executable path. @vscode/test-electron downloads it.
    const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
    const vscodeExecutablePath = await downloadAndUnzipVSCode();

    // On macOS, the executable is the .app bundle
    // Playwright needs the actual electron binary path
    let electronPath: string;
    if (process.platform === 'darwin') {
        // macOS: VS Code.app/Contents/MacOS/Electron
        electronPath = path.join(
            path.dirname(path.dirname(vscodeExecutablePath)),
            'MacOS', 'Electron'
        );
    } else if (process.platform === 'win32') {
        electronPath = vscodeExecutablePath;
    } else {
        electronPath = vscodeExecutablePath;
    }

    const app = await electron.launch({
        executablePath: electronPath,
        args,
        env: {
            ...process.env,
            VSCODE_SKIP_PRELAUNCH: '1',
        },
    });

    // Get the first window
    const page = await app.firstWindow();

    // Wait for VS Code to be fully loaded
    // The editor area has a specific CSS class we can wait for
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });

    // If we opened a file, wait for it to load and extension to activate
    if (fileToOpen) {
        console.log(`  Waiting for file to load: ${path.basename(fileToOpen)}`);
        await page.waitForTimeout(3000); // Give VS Code time to open the file
        
        // Check if file opened by looking for content in editor
        const editorText = await page.$eval('.monaco-editor .view-lines', el => el.textContent).catch(() => null);
        console.log(`  Editor content preview: ${editorText?.substring(0, 100) || '(empty)'}`);
    }

    // Give decorations time to apply
    await page.waitForTimeout(2000);

    return { app, page };
}

/**
 * Close VS Code cleanly.
 */
export async function closeVSCode(instance: VSCodeInstance): Promise<void> {
    await instance.app.close();
}

/**
 * Execute a VS Code command via the command palette.
 */
export async function executeCommand(page: Page, command: string): Promise<void> {
    // Open command palette
    await page.keyboard.press('Meta+Shift+P');
    await page.waitForTimeout(300);

    // Type command name
    await page.keyboard.type(command, { delay: 50 });
    await page.waitForTimeout(500);

    // Press Enter to execute
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
}

/**
 * Toggle smart view mode.
 */
export async function toggleSmartView(page: Page): Promise<void> {
    await executeCommand(page, 'ChangeDown: Toggle Smart View');
}

/**
 * Toggle tracking mode.
 */
export async function toggleTracking(page: Page): Promise<void> {
    await executeCommand(page, 'ChangeDown: Toggle Tracking Mode');
}

/**
 * Move cursor to a specific line and character.
 */
export async function setCursorPosition(page: Page, line: number, character: number): Promise<void> {
    // Use Ctrl+G (Go to Line) to navigate — on macOS, VS Code binds
    // Go to Line to Ctrl+G (not Cmd+G which is "Find Next")
    await page.keyboard.press('Control+G');
    await page.waitForTimeout(200);
    await page.keyboard.type(`${line + 1}`, { delay: 50 }); // VS Code uses 1-based lines
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Move to specific character with Home then Right arrows
    await page.keyboard.press('Home');
    for (let i = 0; i < character; i++) {
        await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(300);
}
