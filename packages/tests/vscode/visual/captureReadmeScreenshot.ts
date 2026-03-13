/**
 * Capture a README-worthy screenshot of the deliberation example.
 *
 * Shows smart view + markdown preview + comments panel,
 * scrolled to the section with visible CriticMarkup changes.
 *
 * Usage: cd packages/tests/vscode && npm run compile && node out/visual/captureReadmeScreenshot.js
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { _electron as electron } from 'playwright';
import type { Page } from 'playwright';

async function executeCmd(page: Page, command: string): Promise<void> {
    await page.keyboard.press('Meta+Shift+P');
    await page.waitForTimeout(400);
    await page.keyboard.type(command, { delay: 30 });
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
}

async function goToLine(page: Page, lineNumber: number): Promise<void> {
    // Use command palette to open Go to Line (more reliable than Ctrl+G/Meta+G)
    await page.keyboard.press('Meta+Shift+P');
    await page.waitForTimeout(400);
    await page.keyboard.type('Go to Line', { delay: 30 });
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    // Now the "Go to Line" input should be open - type the line number
    await page.keyboard.type(String(lineNumber), { delay: 80 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
}

async function main() {
    // __dirname is out/visual/ (compiled from packages/tests/vscode/)
    const packageRoot = path.resolve(__dirname, '../../');
    const outputDir = path.resolve(packageRoot, 'visual/actual');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const extensionDevelopmentPath = path.resolve(packageRoot, '../../vscode-extension');
    const fixtureFile = path.resolve(packageRoot, 'fixtures/visual/api-caching-deliberation.md');

    // Custom settings: hide activity bar, disable animations, hide sidebar on start
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-readme-screenshot-'));
    const userSettingsDir = path.join(userDataDir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify({
        "editor.cursorBlinking": "solid",
        "editor.cursorSmoothCaretAnimation": "off",
        "editor.smoothScrolling": false,
        "workbench.enableExperiments": false,
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "problems.decorations.enabled": false,
        "editor.codeLens": false,
        "workbench.activityBar.location": "hidden",
        "workbench.statusBar.visible": true,
        // Disable chat/copilot panels
        "chat.commandCenter.enabled": false,
        "github.copilot.enable": false,
        "github.copilot.chat.enabled": false,
    }));

    console.log('Launching VS Code...');
    const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
    const vscodeExecutablePath = await downloadAndUnzipVSCode();
    const electronPath = path.join(
        path.dirname(path.dirname(vscodeExecutablePath)),
        'MacOS', 'Electron'
    );

    const app = await electron.launch({
        executablePath: electronPath,
        args: [
            '--no-sandbox',
            '--disable-gpu-sandbox',
            '--disable-updates',
            '--skip-welcome',
            '--skip-release-notes',
            '--disable-workspace-trust',
            `--user-data-dir=${userDataDir}`,
            `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
            '--window-size=1920,1080',
            fixtureFile,
        ],
        env: { ...process.env, VSCODE_SKIP_PRELAUNCH: '1' },
    });

    const page = await app.firstWindow();
    // Wait for an actual editor (not the chat widget which also has .monaco-editor)
    await page.waitForSelector('.editor-instance .monaco-editor', { timeout: 30000 });
    console.log('  VS Code loaded, waiting for extension...');
    await page.waitForTimeout(4000);

    // Step 1: Dismiss any overlays and ensure editor focus
    console.log('  Setting up editor focus...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Click the editor area to ensure focus
    const editor = await page.$('.monaco-editor .view-lines');
    if (editor) {
        await editor.click();
        await page.waitForTimeout(300);
    }

    // Step 2: Navigate to line 35 using command palette (reliable)
    console.log('  Navigating to line 35...');
    await goToLine(page, 35);

    // Step 3: Enable smart view
    console.log('  Enabling smart view...');
    await executeCmd(page, 'ChangeTracks: Toggle Smart View');
    await page.waitForTimeout(1500);

    // Step 4: Open markdown preview to the side
    console.log('  Opening markdown preview...');
    await executeCmd(page, 'Markdown: Open Preview to the Side');
    await page.waitForTimeout(2500);

    // Step 5: Focus back to editor (left pane)
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);

    // Step 6: Open comments panel at bottom
    console.log('  Opening comments...');
    await executeCmd(page, 'Comments: Focus Comments');
    await page.waitForTimeout(1000);

    // Step 7: Focus editor again and re-scroll (opening preview/comments shifts view)
    console.log('  Re-scrolling to line 35...');
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(300);
    // Click editor to make sure it has focus
    const editorAfter = await page.$('.editor-instance .monaco-editor .view-lines');
    if (editorAfter) {
        await editorAfter.click();
        await page.waitForTimeout(200);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await goToLine(page, 35);
    await page.waitForTimeout(500);

    // Step 8: Close sidebar (only primary — secondary close can reopen it)
    console.log('  Closing sidebar...');
    await executeCmd(page, 'View: Close Primary Side Bar');
    await page.waitForTimeout(300);
    // Dismiss any remaining overlays
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Capture
    console.log('  Capturing screenshot...');
    const screenshotPath = path.join(outputDir, 'readme-deliberation.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`  Saved: ${screenshotPath}`);

    await app.close();
    console.log('Done.');
}

main().catch(err => {
    console.error('Screenshot capture failed:', err);
    process.exit(1);
});
