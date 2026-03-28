import { World, setWorldConstructor, After, AfterAll, BeforeAll } from '@cucumber/cucumber';
import type { Page, ElectronApplication } from 'playwright';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface VSCodeInstance {
    app: ElectronApplication;
    page: Page;
    instanceId?: string;
}

/**
 * Cucumber World — shared context per scenario.
 *
 * @fast scenarios: parser + SpyEditor (no VS Code launch)
 * @slow scenarios: Playwright + VS Code Electron
 */
export class ChangeDownWorld extends World {
    // @slow tier
    instance?: VSCodeInstance;
    page?: Page;

    // shared state
    fixtureFile?: string;
    currentViewMode?: string;
    documentText?: string;
    lastCommandResult?: unknown;
    lastBulkOperation?: boolean;
    lastChangeCount?: number;
    decorationCountBefore?: number;
    lastCursorLine?: number;

    // Track which fixture tag this scenario uses (for launch batching)
    fixtureTag?: string;
}

setWorldConstructor(ChangeDownWorld);

// ── Temp file cleanup ────────────────────────────────────────────────
// Bridge commands write JSON state to /tmp. Clean stale files before
// each run so assertions never read leftovers from a previous session.

const TEMP_STATE_FILES = [
    'changedown-test-state.json',
    'changedown-test-config.json',
    'changedown-test-ext-state.json',
    'changedown-test-lsp-state.json',
    'changedown-test-doc.json',
    'changedown-test-wait-changes.json',
    'changedown-test-cursor.json',
    'changedown-test-decoration-ready.json',
].map(name => path.join(os.tmpdir(), name));

BeforeAll(async function () {
    for (const f of TEMP_STATE_FILES) {
        try { fs.unlinkSync(f); } catch { /* doesn't exist yet */ }
    }
});

// ── Launch batching ──────────────────────────────────────────────────
// VS Code instances are expensive to launch (~4s each).
// Scenarios tagged @fixture(name) share one instance per feature file.
// The instance is created on the first scenario that needs it and
// closed after the last scenario in that feature.

let sharedInstance: VSCodeInstance | undefined;
let sharedFixtureName: string | undefined;
let scenariosUsingShared = 0;

/**
 * Get or create the shared VS Code instance for the current fixture.
 * Called from interaction.steps.ts "Given I open {fixture} in VS Code".
 */
export async function getOrCreateInstance(
    fixtureName: string,
    launcher: (name: string) => Promise<VSCodeInstance>
): Promise<VSCodeInstance> {
    if (sharedInstance && sharedFixtureName === fixtureName) {
        scenariosUsingShared++;
        return sharedInstance;
    }
    // Close previous instance if fixture changed
    if (sharedInstance) {
        await sharedInstance.app.close().catch(() => {});
        sharedInstance = undefined;
    }
    sharedInstance = await launcher(fixtureName);
    sharedFixtureName = fixtureName;
    scenariosUsingShared = 1;
    return sharedInstance;
}

After(async function (this: ChangeDownWorld) {
    // If this scenario owns a non-shared instance, close it
    if (this.instance && this.instance !== sharedInstance) {
        await this.instance.app.close().catch(() => {});
        this.instance = undefined;
    }
});

After({ tags: '@destructive' }, async function (this: ChangeDownWorld) {
    // Restore fixture file from git to undo any modifications made by accept/reject scenarios.
    // All @slow scenario fixtures are opened via launchWithJourneyFixture, which resolves
    // them from packages/tests/vscode/fixtures/journeys/. The fixtureFile is just the filename.
    if (this.fixtureFile) {
        // __dirname at runtime: packages/tests/vscode/out/features/steps/
        // Package root (packages/tests/vscode/): 3 levels up
        const packageRoot = path.resolve(__dirname, '..', '..', '..');
        // Monorepo root: 3 more levels up (packages/tests/vscode -> packages/tests -> packages -> root)
        const monorepoRoot = path.resolve(packageRoot, '..', '..', '..');
        const fixturePath = path.relative(monorepoRoot, path.join(packageRoot, 'fixtures', 'journeys', this.fixtureFile));
        try {
            execSync(`git checkout -- "${fixturePath}"`, {
                cwd: monorepoRoot,
            });
        } catch (e) {
            console.warn(`[@destructive] Failed to restore fixture "${fixturePath}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }
});

AfterAll(async function () {
    // Clean up shared instance at the very end
    if (sharedInstance) {
        await sharedInstance.app.close().catch(() => {});
        sharedInstance = undefined;
    }
    // Remove temp state files so they don't leak between test runs
    for (const f of TEMP_STATE_FILES) {
        try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
});
