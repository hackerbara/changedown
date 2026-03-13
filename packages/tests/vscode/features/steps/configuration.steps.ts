/**
 * @integration tier step definitions for configuration tests (CFG1).
 *
 * Tests VS Code configuration contribution points via Playwright,
 * verifying that expected config keys exist, have correct types,
 * and correct default values.
 *
 * Uses the _testReadConfig bridge command instead of page.evaluate()
 * with require('vscode'), which is unavailable in the Playwright renderer.
 */

import { Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { Page } from 'playwright';
import type { ChangeTracksWorld } from './world';
import { executeCommand } from '../../journeys/playwrightHarness';

const CONFIG_STATE_PATH = path.join(os.tmpdir(), 'changetracks-test-config.json');

async function queryConfig(page: Page): Promise<Record<string, unknown> | null> {
    const beforeTs = Date.now();
    await executeCommand(page, 'ChangeTracks: Test Read Config');
    await page.waitForTimeout(300);
    try {
        if (!fs.existsSync(CONFIG_STATE_PATH)) return null;
        const raw = fs.readFileSync(CONFIG_STATE_PATH, 'utf8');
        const state = JSON.parse(raw);
        if (state.timestamp < beforeTs) return null;
        return state;
    } catch { return null; }
}

/**
 * Strip the "changetracks." prefix from a full config key to get the
 * lookup key in the bridge command's output. Nested keys like
 * "changetracks.editBoundary.pauseThresholdMs" become "editBoundary.pauseThresholdMs".
 */
function toConfigKey(fullKey: string): string {
    return fullKey.startsWith('changetracks.') ? fullKey.slice('changetracks.'.length) : fullKey;
}

// ── Then steps — configuration key assertions ────────────────────────

Then(
    'configuration key {string} exists',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, key: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const configKey = toConfigKey(key);
        assert.ok(
            configKey in config,
            `Configuration key "${key}" does not exist (looked up as "${configKey}")`
        );
    }
);

Then(
    'configuration key {string} does not exist',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, key: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const configKey = toConfigKey(key);
        // Key is "not exist" if it is absent from the dump or its value is undefined
        const exists = configKey in config && config[configKey] !== undefined;
        assert.strictEqual(
            exists,
            false,
            `Configuration key "${key}" should not exist`
        );
    }
);

Then(
    'configuration key {string} has type {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, key: string, expectedType: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const configKey = toConfigKey(key);
        const actualType = typeof config[configKey];
        assert.strictEqual(
            actualType,
            expectedType,
            `Configuration key "${key}" expected type "${expectedType}", got "${actualType}"`
        );
    }
);

Then(
    'configuration key {string} has value {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, key: string, expectedValue: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const configKey = toConfigKey(key);
        const value = config[configKey];
        assert.strictEqual(
            value,
            expectedValue,
            `Configuration key "${key}" expected value "${expectedValue}", got "${value}"`
        );
    }
);

Then(
    'configuration key {string} has boolean value {word}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, key: string, expectedStr: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const configKey = toConfigKey(key);
        const expected = expectedStr === 'true';
        const value = config[configKey];
        assert.strictEqual(
            value,
            expected,
            `Configuration key "${key}" expected boolean ${expected}, got ${value}`
        );
    }
);

Then(
    'scmIntegrationMode is one of {string}, {string}, {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, opt1: string, opt2: string, opt3: string) {
        assert.ok(this.page, 'Page not available');
        const config = await queryConfig(this.page!);
        assert.ok(config, 'Failed to read config via bridge command');

        const value = config['scmIntegrationMode'] ?? 'scm-first';
        const validValues = [opt1, opt2, opt3];
        assert.ok(
            validValues.includes(value as string),
            `scmIntegrationMode "${value}" is not one of ${validValues.join(', ')}`
        );
    }
);
