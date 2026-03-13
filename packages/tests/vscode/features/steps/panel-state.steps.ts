/**
 * @fast tier step definitions for panel state tests (PNL1, PNL2).
 *
 * These tests run in-process via cucumber-js (no VS Code launch).
 * A vscode mock is installed before importing ProjectStatusModel
 * and settings-panel which both `require('vscode')`.
 */

// ── MUST be first: install vscode mock before any vscode-dependent imports ──
import { installVscodeMock } from './vscode-mock';
installVscodeMock();

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    ProjectStatusModel,
    generateSettingsHtml,
    parseFormData,
    parseEditorPreferences,
    serializeToToml,
    DEFAULT_SETTINGS_CONFIG,
    DEFAULT_EDITOR_PREFS,
} from 'changetracks-vscode/internals';
import type { ProjectStatusField, SettingsConfig, EditorPreferencesConfig } from 'changetracks-vscode/internals';
import type { ChangeTracksWorld } from './world';

// ── Extend World with panel state test fields ────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        statusModel?: ProjectStatusModel;
        changeEventFired?: boolean;
        changeEventCount?: number;
        settingsHtml?: string;
        parsedConfig?: SettingsConfig;
        parsedEditorPrefs?: EditorPreferencesConfig;
        tomlOutput?: string;
        roundTripResult?: Record<string, any>;
        settingsConfig?: SettingsConfig;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and (@PNL1 or @PNL2)' }, function (this: ChangeTracksWorld) {
    this.statusModel = undefined;
    this.changeEventFired = undefined;
    this.changeEventCount = undefined;
    this.settingsHtml = undefined;
    this.parsedConfig = undefined;
    this.parsedEditorPrefs = undefined;
    this.tomlOutput = undefined;
    this.roundTripResult = undefined;
    this.settingsConfig = undefined;
});

// ── Given steps: ProjectStatusModel ──────────────────────────────────

Given('a fresh ProjectStatusModel', function (this: ChangeTracksWorld) {
    this.statusModel = new ProjectStatusModel();
});

Given('I load TOML config:', function (this: ChangeTracksWorld, docString: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    this.statusModel.updateFromToml(docString);
});

Given('I load TOML config {string}', function (this: ChangeTracksWorld, toml: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    // Unescape \\n to actual newlines from Gherkin string params
    this.statusModel.updateFromToml(toml.replace(/\\n/g, '\n'));
});

Given('I am listening for change events', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    this.changeEventFired = false;
    this.statusModel.onDidChange(() => { this.changeEventFired = true; });
});

Given('I am counting change events', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    this.changeEventCount = 0;
    this.statusModel.onDidChange(() => { this.changeEventCount!++; });
});

// ── Given steps: SettingsPanel ───────────────────────────────────────

Given('a settings config with tracking default {string} and author enforcement {string}', function (
    this: ChangeTracksWorld, trackingDefault: string, authorEnforcement: string
) {
    this.settingsConfig = {
        tracking: { default: trackingDefault as 'tracked' | 'untracked', auto_header: true, include: ['**/*.md'], exclude: [] },
        author: { default: 'alice', enforcement: authorEnforcement as 'optional' | 'required' },
        hooks: { enforcement: 'warn', exclude: [] },
        hashline: { enabled: false },
        matching: { mode: 'normalized' },
        settlement: { auto_on_approve: true, auto_on_reject: true },
        policy: { mode: 'safety-net', creation_tracking: 'footnote' },
        protocol: { mode: 'classic', level: 2, reasoning: 'required', batch_reasoning: 'required' },
    };
});

Given('a settings config with tracking default {string} and author enforcement {string} and hooks enforcement {string} and hashline enabled {word} and include {string} and exclude {string}', function (
    this: ChangeTracksWorld, trackingDefault: string, authorEnforcement: string,
    hooksEnforcement: string, hashlineEnabled: string, include: string, exclude: string
) {
    this.settingsConfig = {
        tracking: { default: trackingDefault as 'tracked' | 'untracked', auto_header: true, include: [include], exclude: [exclude] },
        author: { default: 'alice', enforcement: authorEnforcement as 'optional' | 'required' },
        hooks: { enforcement: hooksEnforcement as 'warn' | 'block', exclude: ['*.draft.md'] },
        hashline: { enabled: hashlineEnabled === 'true' },
        matching: { mode: 'normalized' },
        settlement: { auto_on_approve: true, auto_on_reject: true },
        policy: { mode: 'safety-net', creation_tracking: 'footnote' },
        protocol: { mode: 'classic', level: 2, reasoning: 'required', batch_reasoning: 'required' },
    };
});

Given('default settings config', function (this: ChangeTracksWorld) {
    this.settingsConfig = { ...DEFAULT_SETTINGS_CONFIG };
});

// ── When steps: ProjectStatusModel ───────────────────────────────────

When('I set file tracking override to {string}', function (this: ChangeTracksWorld, value: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    this.statusModel.setFileTrackingOverride(value as 'tracked' | 'untracked');
});

When('I set file tracking override to null', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    this.statusModel.setFileTrackingOverride(null);
});

When('I set session tracking override to {word}', function (this: ChangeTracksWorld, value: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    if (value === 'null') {
        this.statusModel.setSessionTrackingOverride(null);
    } else {
        this.statusModel.setSessionTrackingOverride(value === 'true');
    }
});

When('I set visible fields to {string}', function (this: ChangeTracksWorld, fieldsStr: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const fields = fieldsStr.split(',') as ProjectStatusField[];
    this.statusModel.setVisibleFields(fields);
});

// ── When steps: SettingsPanel ────────────────────────────────────────

When('I generate settings HTML', function (this: ChangeTracksWorld) {
    const config = this.settingsConfig ?? DEFAULT_SETTINGS_CONFIG;
    this.settingsHtml = generateSettingsHtml(config, DEFAULT_EDITOR_PREFS, 'fake-csp-nonce');
});

When('I parse form data with tracking {string} and author enforcement {string} and hooks {string}', function (
    this: ChangeTracksWorld, trackingDefault: string, authorEnforcement: string, hooksEnforcement: string
) {
    this.parsedConfig = parseFormData({
        'tracking-default': trackingDefault,
        'tracking-auto-header': true,
        'tracking-include': 'docs/**',
        'tracking-exclude': 'node_modules/**',
        'author-default': 'bob',
        'author-enforcement': authorEnforcement,
        'hooks-enforcement': hooksEnforcement,
        'hashline-enabled': false,
        'matching-mode': 'strict',
        'settlement-auto-approve': true,
        'settlement-auto-reject': false,
        'protocol-reasoning': 'optional',
        'protocol-batch-reasoning': 'required',
    });
});

When('I parse editor preferences with commentsExpanded {word} and format {string} and groupBy {string}', function (
    this: ChangeTracksWorld, commentsExpanded: string, format: string, groupBy: string
) {
    this.parsedEditorPrefs = parseEditorPreferences({
        'editor-comments-expanded': commentsExpanded === 'true',
        'editor-comment-format': format,
        'editor-group-by': groupBy,
    });
});

When('I parse editor preferences with empty payload', function (this: ChangeTracksWorld) {
    this.parsedEditorPrefs = parseEditorPreferences({});
});

When('I serialize to TOML', function (this: ChangeTracksWorld) {
    assert.ok(this.settingsConfig, 'No settings config created');
    this.tomlOutput = serializeToToml(this.settingsConfig);
});

When('I serialize to TOML and parse back', function (this: ChangeTracksWorld) {
    assert.ok(this.settingsConfig, 'No settings config created');
    this.tomlOutput = serializeToToml(this.settingsConfig);
    const { parse } = require('smol-toml');
    this.roundTripResult = parse(this.tomlOutput);
});

// ── Then steps: ProjectStatusModel ───────────────────────────────────

Then('tracking is enabled', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.strictEqual(status.tracking.enabled, true);
});

Then('tracking is disabled', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.strictEqual(status.tracking.enabled, false);
});

Then('tracking source is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.strictEqual(status.tracking.source, expected);
});

Then('required fields list is empty', function (this: ChangeTracksWorld) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.strictEqual(status.required.length, 0);
});

Then('required fields list contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.ok(status.required.includes(expected), `Expected required to include "${expected}", got ${JSON.stringify(status.required)}`);
});

Then('amend policy is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const status = this.statusModel.getStatus();
    assert.strictEqual(status.amend, expected);
});

Then('the change event fired', function (this: ChangeTracksWorld) {
    assert.strictEqual(this.changeEventFired, true, 'Change event did not fire');
});

Then('the change event fired {int} times', function (this: ChangeTracksWorld, expected: number) {
    assert.strictEqual(this.changeEventCount, expected, `Expected ${expected} change events, got ${this.changeEventCount}`);
});

Then('visible fields are {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.statusModel, 'No ProjectStatusModel created');
    const fields = this.statusModel.getVisibleFields();
    assert.deepStrictEqual(fields, expected.split(','));
});

// ── Then steps: SettingsPanel HTML ────────────────────────────────────

Then('the HTML contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.settingsHtml, 'No settings HTML generated');
    assert.ok(
        this.settingsHtml.includes(expected),
        `HTML does not contain "${expected}"`
    );
});

Then('the identity section has class {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.settingsHtml, 'No settings HTML generated');
    const identityMatch = this.settingsHtml.match(/class="accordion open"[^>]*data-section="identity"/);
    assert.ok(identityMatch, 'Identity section should have class "accordion open"');
});

Then('the tracking section has class {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.settingsHtml, 'No settings HTML generated');
    const trackingMatch = this.settingsHtml.match(/class="accordion open"[^>]*data-section="tracking"/);
    assert.ok(trackingMatch, 'Tracking section should have class "accordion open"');
});

// ── Then steps: parseFormData ────────────────────────────────────────

Then('parsed tracking default is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedConfig, 'No parsed config');
    assert.strictEqual(this.parsedConfig.tracking.default, expected);
});

Then('parsed author enforcement is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedConfig, 'No parsed config');
    assert.strictEqual(this.parsedConfig.author.enforcement, expected);
});

Then('parsed hooks enforcement is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedConfig, 'No parsed config');
    assert.strictEqual(this.parsedConfig.hooks.enforcement, expected);
});

// ── Then steps: parseEditorPreferences ───────────────────────────────

Then('parsed commentsExpandedByDefault is {word}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedEditorPrefs, 'No parsed editor preferences');
    assert.strictEqual(this.parsedEditorPrefs.commentsExpandedByDefault, expected === 'true');
});

Then('parsed commentInsertFormat is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedEditorPrefs, 'No parsed editor preferences');
    assert.strictEqual(this.parsedEditorPrefs.commentInsertFormat, expected);
});

Then('parsed changeExplorerGroupBy is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedEditorPrefs, 'No parsed editor preferences');
    assert.strictEqual(this.parsedEditorPrefs.changeExplorerGroupBy, expected);
});

// ── Then steps: TOML serialization ───────────────────────────────────

Then('the TOML contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.tomlOutput, 'No TOML output');
    // Unescape \" from Gherkin
    const unescaped = expected.replace(/\\"/g, '"');
    assert.ok(
        this.tomlOutput.includes(unescaped),
        `TOML does not contain "${unescaped}". TOML:\n${this.tomlOutput}`
    );
});

// ── Then steps: round-trip ───────────────────────────────────────────

Then('the round-trip tracking default is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.strictEqual(this.roundTripResult.tracking.default, expected);
});

Then('the round-trip author enforcement is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.strictEqual(this.roundTripResult.author.enforcement, expected);
});

Then('the round-trip hooks enforcement is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.strictEqual(this.roundTripResult.hooks.enforcement, expected);
});

Then('the round-trip hashline enabled is {word}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.strictEqual(this.roundTripResult.hashline.enabled, expected === 'true');
});

Then('the round-trip tracking include is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.deepStrictEqual(this.roundTripResult.tracking.include, [expected]);
});

Then('the round-trip tracking exclude is {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.roundTripResult, 'No round-trip result');
    assert.deepStrictEqual(this.roundTripResult.tracking.exclude, [expected]);
});
