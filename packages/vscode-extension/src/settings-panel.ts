/**
 * Settings Panel Provider — WebviewView GUI for `.changetracks/config.toml`
 * and VS Code editor preferences.
 *
 * Renders a native-looking form using VS Code CSS variables, organized
 * into three visual tiers with collapsible accordion sections:
 *   - Tier 1: Project Configuration (green accent) — TOML settings
 *   - Tier 2: Editor Preferences (blue accent) — VS Code settings
 *   - Tier 3: Advanced (gray, collapsed by default) — TOML settings
 *
 * Communicates with the extension host via postMessage/onDidReceiveMessage.
 *
 * Exports:
 *   - SettingsConfig interface
 *   - EditorPreferencesConfig interface
 *   - DEFAULT_SETTINGS_CONFIG
 *   - DEFAULT_EDITOR_PREFS
 *   - generateSettingsHtml(config, editorPrefs, nonce) — full HTML for the webview
 *   - parseFormData(data) — message payload → SettingsConfig
 *   - parseEditorPreferences(data) — message payload → EditorPreferencesConfig
 *   - serializeToToml(config) — SettingsConfig → TOML string
 *   - SettingsPanelProvider class (WebviewViewProvider)
 */

import * as vscode from 'vscode';
import { stringify } from 'smol-toml';
import { ProjectStatusModel } from './project-status';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SettingsConfig {
    tracking: { default: 'tracked' | 'untracked'; auto_header: boolean; include: string[]; exclude: string[] };
    author: { default: string; enforcement: 'optional' | 'required' };
    hooks: { enforcement: 'warn' | 'block'; exclude: string[] };
    hashline: { enabled: boolean };
    matching: { mode: 'strict' | 'normalized' };
    settlement: { auto_on_approve: boolean; auto_on_reject: boolean };
    policy: { mode: string; creation_tracking: string };
    protocol: { mode: string; level: number; reasoning: 'optional' | 'required'; batch_reasoning: 'optional' | 'required' };
}

export interface EditorPreferencesConfig {
    showCriticMarkup: boolean;
    commentsExpandedByDefault: boolean;
    commentInsertFormat: 'inline' | 'footnote';
    changeExplorerGroupBy: 'flat' | 'author' | 'type';
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
    tracking: { default: 'tracked', auto_header: true, include: ['**/*.md'], exclude: [] },
    author: { default: '', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    hashline: { enabled: false },
    matching: { mode: 'normalized' },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
};

export const DEFAULT_EDITOR_PREFS: EditorPreferencesConfig = {
    showCriticMarkup: false,
    commentsExpandedByDefault: false,
    commentInsertFormat: 'footnote',
    changeExplorerGroupBy: 'flat',
};

// ── HTML Generation ──────────────────────────────────────────────────────────

export function generateSettingsHtml(config: SettingsConfig, editorPrefs: EditorPreferencesConfig, nonce: string): string {
    const checked = (val: boolean) => val ? 'checked' : '';
    const selected = (current: string, option: string) => current === option ? 'selected' : '';

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style nonce="${nonce}">
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            padding: 12px 16px;
        }

        /* ── Tier headers ───────────────────────────────────────────── */
        .tier {
            margin-bottom: 4px;
        }
        .tier-header {
            display: flex;
            align-items: center;
            padding: 8px 0 4px 0;
            margin-top: 16px;
            font-size: 0.8em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.7;
        }
        .tier:first-child .tier-header { margin-top: 0; }
        .tier-header.green { color: var(--vscode-terminal-ansiGreen, #4ec9b0); }
        .tier-header.blue  { color: var(--vscode-terminal-ansiBlue, #569cd6); }
        .tier-header.gray  { color: var(--vscode-descriptionForeground, #888); }

        /* ── Accordion sections ─────────────────────────────────────── */
        .accordion {
            border-left: 3px solid var(--vscode-input-border);
            margin-bottom: 2px;
            background: transparent;
        }
        .tier.green .accordion { border-left-color: var(--vscode-terminal-ansiGreen, #4ec9b0); }
        .tier.blue  .accordion { border-left-color: var(--vscode-terminal-ansiBlue, #569cd6); }
        .tier.gray  .accordion { border-left-color: var(--vscode-descriptionForeground, #888); }

        .accordion-trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 6px 10px;
            background: transparent;
            border: none;
            color: var(--vscode-editor-foreground);
            font-family: inherit;
            font-size: inherit;
            font-weight: 600;
            cursor: pointer;
            text-align: left;
        }
        .accordion-trigger:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .accordion-chevron {
            font-size: 0.8em;
            transition: transform 0.15s ease;
            opacity: 0.6;
            flex-shrink: 0;
            margin-left: 8px;
        }
        .accordion.open .accordion-chevron {
            transform: rotate(90deg);
        }

        .accordion-subtitle {
            font-size: 0.85em;
            font-weight: 400;
            opacity: 0.6;
            margin-left: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 50%;
        }
        .accordion.open .accordion-subtitle {
            display: none;
        }

        .accordion-body {
            display: none;
            padding: 8px 10px 4px 10px;
        }
        .accordion.open .accordion-body {
            display: block;
        }

        /* ── Form fields ────────────────────────────────────────────── */
        .field {
            margin-bottom: 10px;
        }
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
        }
        label.inline {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        select, input[type="text"], input[type="number"] {
            width: 100%;
            padding: 4px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: inherit;
            font-size: inherit;
        }
        select:focus, input[type="text"]:focus, input[type="number"]:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        input[type="checkbox"] {
            accent-color: var(--vscode-button-background);
        }
        .hint {
            font-size: 0.9em;
            opacity: 0.7;
            margin-top: 2px;
        }

        /* ── Buttons ────────────────────────────────────────────────── */
        .button-row {
            margin-top: 20px;
            display: flex;
            gap: 8px;
        }
        button.action-btn {
            padding: 6px 14px;
            border: none;
            border-radius: 2px;
            font-family: inherit;
            font-size: inherit;
            cursor: pointer;
        }
        button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        button.dirty {
            background: var(--vscode-button-background) !important;
            opacity: 1 !important;
        }

        /* ── Notice ─────────────────────────────────────────────────── */
        .notice {
            display: none;
            padding: 8px 12px;
            margin-bottom: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            font-size: 12px;
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div id="config-notice" class="notice"></div>
    <form id="settings-form">

        <!-- ═══════════════════════════════════════════════════════════
             TIER 1: PROJECT CONFIGURATION (green accent)
             ═══════════════════════════════════════════════════════════ -->
        <div class="tier green">
            <div class="tier-header green">Project Configuration</div>

            <!-- Identity -->
            <div class="accordion open" data-section="identity">
                <button type="button" class="accordion-trigger" aria-expanded="true">
                    <span>Identity</span>
                    <span class="accordion-subtitle" data-summary="identity">${escapeHtml(config.author.default || 'not set')} / ${escapeHtml(config.author.enforcement)}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="author-default">Default author</label>
                        <input type="text" id="author-default" name="author-default"
                               value="${escapeAttr(config.author.default)}"
                               placeholder="your-name">
                    </div>
                    <div class="field">
                        <label for="author-enforcement">Author enforcement</label>
                        <select id="author-enforcement" name="author-enforcement">
                            <option value="optional" ${selected(config.author.enforcement, 'optional')}>optional</option>
                            <option value="required" ${selected(config.author.enforcement, 'required')}>required</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Tracking Rules -->
            <div class="accordion open" data-section="tracking">
                <button type="button" class="accordion-trigger" aria-expanded="true">
                    <span>Tracking Rules</span>
                    <span class="accordion-subtitle" data-summary="tracking">${escapeHtml(config.tracking.default)} / ${config.tracking.auto_header ? 'auto-header' : 'no header'}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="tracking-default">Default tracking</label>
                        <select id="tracking-default" name="tracking-default">
                            <option value="tracked" ${selected(config.tracking.default, 'tracked')}>tracked</option>
                            <option value="untracked" ${selected(config.tracking.default, 'untracked')}>untracked</option>
                        </select>
                    </div>
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="tracking-auto-header" name="tracking-auto-header" ${checked(config.tracking.auto_header)}>
                            Auto-insert tracking header
                        </label>
                    </div>
                    <div class="field">
                        <label for="tracking-include">Include patterns</label>
                        <input type="text" id="tracking-include" name="tracking-include"
                               value="${escapeAttr(config.tracking.include.join(', '))}"
                               placeholder="**/*.md">
                        <div class="hint">Comma-separated glob patterns</div>
                    </div>
                    <div class="field">
                        <label for="tracking-exclude">Exclude patterns</label>
                        <input type="text" id="tracking-exclude" name="tracking-exclude"
                               value="${escapeAttr(config.tracking.exclude.join(', '))}"
                               placeholder="node_modules/**, dist/**">
                        <div class="hint">Comma-separated glob patterns</div>
                    </div>
                </div>
            </div>

            <!-- Hooks -->
            <div class="accordion" data-section="hooks">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Hooks</span>
                    <span class="accordion-subtitle" data-summary="hooks">${escapeHtml(config.hooks.enforcement)}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="hooks-enforcement">Enforcement mode</label>
                        <select id="hooks-enforcement" name="hooks-enforcement">
                            <option value="warn" ${selected(config.hooks.enforcement, 'warn')}>warn</option>
                            <option value="block" ${selected(config.hooks.enforcement, 'block')}>block</option>
                        </select>
                        <div class="hint">"warn" shows notifications; "block" prevents non-compliant operations</div>
                    </div>
                    <div class="field">
                        <label for="hooks-exclude">Exclude patterns</label>
                        <input type="text" id="hooks-exclude" name="hooks-exclude"
                               value="${escapeAttr(config.hooks.exclude.join(', '))}"
                               placeholder="Comma-separated glob patterns">
                    </div>
                </div>
            </div>

            <!-- Settlement -->
            <div class="accordion" data-section="settlement">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Settlement</span>
                    <span class="accordion-subtitle" data-summary="settlement">${config.settlement.auto_on_approve ? 'auto-approve' : 'manual'}${config.settlement.auto_on_reject ? ' + auto-reject' : ''}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="settlement-auto-approve" name="settlement-auto-approve" ${checked(config.settlement.auto_on_approve)}>
                            Auto-settle on approve
                        </label>
                    </div>
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="settlement-auto-reject" name="settlement-auto-reject" ${checked(config.settlement.auto_on_reject)}>
                            Auto-settle on reject
                        </label>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════════
             TIER 2: EDITOR PREFERENCES (blue accent)
             ═══════════════════════════════════════════════════════════ -->
        <div class="tier blue">
            <div class="tier-header blue">Editor Preferences</div>

            <div class="accordion" data-section="editor-prefs">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Display &amp; Comments</span>
                    <span class="accordion-subtitle" data-summary="editor-prefs">${editorPrefs.showCriticMarkup ? 'CM on' : 'CM off'} / ${escapeHtml(editorPrefs.commentInsertFormat)} / group by ${escapeHtml(editorPrefs.changeExplorerGroupBy)}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="editor-show-criticmarkup" name="editor-show-criticmarkup" ${checked(editorPrefs.showCriticMarkup)}>
                            Show CriticMarkup
                        </label>
                        <div class="hint">Show delimiters and footnote references. Review: static display. Simple: cursor-reveal.</div>
                    </div>
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="editor-comments-expanded" name="editor-comments-expanded" ${checked(editorPrefs.commentsExpandedByDefault)}>
                            Expand comments by default
                        </label>
                        <div class="hint">Comment threads start expanded when opening a file</div>
                    </div>
                    <div class="field">
                        <label for="editor-comment-format">Comment insert format</label>
                        <select id="editor-comment-format" name="editor-comment-format">
                            <option value="inline" ${selected(editorPrefs.commentInsertFormat, 'inline')}>inline</option>
                            <option value="footnote" ${selected(editorPrefs.commentInsertFormat, 'footnote')}>footnote</option>
                        </select>
                        <div class="hint">"footnote" adds reference + definition with author/date</div>
                    </div>
                    <div class="field">
                        <label for="editor-group-by">Change Explorer grouping</label>
                        <select id="editor-group-by" name="editor-group-by">
                            <option value="flat" ${selected(editorPrefs.changeExplorerGroupBy, 'flat')}>flat</option>
                            <option value="author" ${selected(editorPrefs.changeExplorerGroupBy, 'author')}>author</option>
                            <option value="type" ${selected(editorPrefs.changeExplorerGroupBy, 'type')}>type</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════════
             TIER 3: ADVANCED (gray, collapsed by default)
             ═══════════════════════════════════════════════════════════ -->
        <div class="tier gray">
            <div class="tier-header gray">Advanced</div>

            <!-- Hashline -->
            <div class="accordion" data-section="hashline">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Hashline</span>
                    <span class="accordion-subtitle" data-summary="hashline">${config.hashline.enabled ? 'enabled' : 'disabled'}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label class="inline">
                            <input type="checkbox" id="hashline-enabled" name="hashline-enabled" ${checked(config.hashline.enabled)}>
                            Enable hashline coordinates
                        </label>
                    </div>
                </div>
            </div>

            <!-- Matching -->
            <div class="accordion" data-section="matching">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Matching</span>
                    <span class="accordion-subtitle" data-summary="matching">${escapeHtml(config.matching.mode)}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="matching-mode">Matching mode</label>
                        <select id="matching-mode" name="matching-mode">
                            <option value="strict" ${selected(config.matching.mode, 'strict')}>strict</option>
                            <option value="normalized" ${selected(config.matching.mode, 'normalized')}>normalized</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Protocol -->
            <div class="accordion" data-section="protocol">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Protocol</span>
                    <span class="accordion-subtitle" data-summary="protocol">${escapeHtml(config.protocol.mode)} / level ${config.protocol.level}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="protocol-mode">Protocol mode</label>
                        <input type="text" id="protocol-mode" name="protocol-mode"
                               value="${escapeAttr(config.protocol.mode)}"
                               placeholder="classic">
                    </div>
                    <div class="field">
                        <label for="protocol-level">Protocol level</label>
                        <input type="number" id="protocol-level" name="protocol-level"
                               value="${config.protocol.level}" min="0" max="5">
                    </div>
                    <div class="field">
                        <label for="protocol-reasoning">Reasoning requirement</label>
                        <select id="protocol-reasoning" name="protocol-reasoning">
                            <option value="optional" ${selected(config.protocol.reasoning, 'optional')}>optional</option>
                            <option value="required" ${selected(config.protocol.reasoning, 'required')}>required</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="protocol-batch-reasoning">Batch reasoning requirement</label>
                        <select id="protocol-batch-reasoning" name="protocol-batch-reasoning">
                            <option value="optional" ${selected(config.protocol.batch_reasoning, 'optional')}>optional</option>
                            <option value="required" ${selected(config.protocol.batch_reasoning, 'required')}>required</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Policy -->
            <div class="accordion" data-section="policy">
                <button type="button" class="accordion-trigger" aria-expanded="false">
                    <span>Policy</span>
                    <span class="accordion-subtitle" data-summary="policy">${escapeHtml(config.policy.mode)} / ${escapeHtml(config.policy.creation_tracking)}</span>
                    <span class="accordion-chevron">&#9654;</span>
                </button>
                <div class="accordion-body">
                    <div class="field">
                        <label for="policy-mode">Policy mode</label>
                        <input type="text" id="policy-mode" name="policy-mode"
                               value="${escapeAttr(config.policy.mode)}"
                               placeholder="safety-net">
                    </div>
                    <div class="field">
                        <label for="policy-creation-tracking">Creation tracking</label>
                        <input type="text" id="policy-creation-tracking" name="policy-creation-tracking"
                               value="${escapeAttr(config.policy.creation_tracking)}"
                               placeholder="footnote">
                    </div>
                </div>
            </div>
        </div>

        <div class="button-row">
            <button type="button" class="action-btn primary" id="save-btn">Save</button>
            <button type="button" class="action-btn secondary" id="reset-btn">Reset to Defaults</button>
        </div>
    </form>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // ── Accordion behavior ───────────────────────────────────────
            document.querySelectorAll('.accordion-trigger').forEach(function(trigger) {
                trigger.addEventListener('click', function() {
                    var accordion = trigger.closest('.accordion');
                    if (accordion) {
                        accordion.classList.toggle('open');
                        var isOpen = accordion.classList.contains('open');
                        trigger.setAttribute('aria-expanded', String(isOpen));
                    }
                });
            });

            // ── Dirty state tracking ────────────────────────────────────
            let isDirty = false;
            const saveBtn = document.getElementById('save-btn');

            document.querySelectorAll('input, select').forEach(function(el) {
                el.addEventListener('change', function() {
                    markDirty();
                });
                el.addEventListener('input', function() {
                    markDirty();
                });
            });

            function markDirty() {
                if (isDirty) return;
                isDirty = true;
                if (saveBtn.textContent === 'Create config') {
                    saveBtn.textContent = 'Create config *';
                } else {
                    saveBtn.textContent = 'Save *';
                }
                saveBtn.classList.add('dirty');
            }

            function markClean() {
                isDirty = false;
                saveBtn.classList.remove('dirty');
                // Restore correct button text based on config-notice visibility
                var notice = document.getElementById('config-notice');
                if (notice && notice.style.display === 'block') {
                    saveBtn.textContent = 'Create config';
                } else {
                    saveBtn.textContent = 'Save';
                }
            }

            // ── Glob validation ─────────────────────────────────────────
            function validateGlob(value) {
                if (!value.trim()) return true;
                var patterns = value.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
                for (var i = 0; i < patterns.length; i++) {
                    var p = patterns[i];
                    if ((p.match(/\\[/g) || []).length !== (p.match(/\\]/g) || []).length) return false;
                    if ((p.match(/\\{/g) || []).length !== (p.match(/\\}/g) || []).length) return false;
                }
                return true;
            }

            function collectFormData() {
                const form = document.getElementById('settings-form');
                const data = {};
                // Selects and text/number inputs
                for (const el of form.querySelectorAll('select, input[type="text"], input[type="number"]')) {
                    data[el.name] = el.type === 'number' ? Number(el.value) : el.value;
                }
                // Checkboxes
                for (const el of form.querySelectorAll('input[type="checkbox"]')) {
                    data[el.name] = el.checked;
                }
                return data;
            }

            document.getElementById('save-btn').addEventListener('click', function() {
                var includeEl = document.querySelector('[name="tracking-include"]');
                var excludeEl = document.querySelector('[name="tracking-exclude"]');

                var includeValid = validateGlob(includeEl.value);
                var excludeValid = validateGlob(excludeEl.value);

                if (!includeValid) {
                    includeEl.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
                    return;
                }
                if (!excludeValid) {
                    excludeEl.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
                    return;
                }

                // Clear validation styles
                includeEl.style.borderColor = '';
                excludeEl.style.borderColor = '';

                saveBtn.textContent = 'Saving...';
                saveBtn.disabled = true;
                vscode.postMessage({ type: 'save', data: collectFormData() });
                // markClean() is now called when we receive saveResult confirmation
            });

            document.getElementById('reset-btn').addEventListener('click', function() {
                vscode.postMessage({ type: 'reset' });
            });

            // ── Config notice ───────────────────────────────────────────
            function showConfigNotice(isDefault) {
                var notice = document.getElementById('config-notice');
                if (isDefault) {
                    notice.textContent = 'No project config found \\u2014 using defaults';
                    notice.style.display = 'block';
                    if (!isDirty) {
                        saveBtn.textContent = 'Create config';
                    }
                } else {
                    notice.style.display = 'none';
                    if (!isDirty) {
                        saveBtn.textContent = 'Save';
                    }
                }
            }

            // Listen for config loads from extension
            window.addEventListener('message', function(event) {
                const msg = event.data;
                if (msg.type === 'load' && msg.config) {
                    populateForm(msg.config);
                    if (msg.editorPrefs) {
                        populateEditorPrefs(msg.editorPrefs);
                    }
                    showConfigNotice(!!msg.isDefault);
                    markClean();
                }
                if (msg.type === 'saveResult') {
                    saveBtn.disabled = false;
                    if (msg.success) {
                        markClean();
                        saveBtn.textContent = 'Saved';
                        setTimeout(function() {
                            if (!isDirty) {
                                var notice = document.getElementById('config-notice');
                                if (notice && notice.style.display === 'block') {
                                    saveBtn.textContent = 'Create config';
                                } else {
                                    saveBtn.textContent = 'Save';
                                }
                            }
                        }, 1500);
                    } else {
                        saveBtn.textContent = 'Save failed';
                        setTimeout(function() {
                            if (!isDirty) markDirty();
                            var notice = document.getElementById('config-notice');
                            var isCreate = notice && notice.style.display === 'block';
                            saveBtn.textContent = isDirty
                                ? (isCreate ? 'Create config *' : 'Save *')
                                : (isCreate ? 'Create config' : 'Save');
                        }, 2000);
                    }
                }
            });

            function populateForm(config) {
                setVal('tracking-default', config.tracking?.default);
                setChecked('tracking-auto-header', config.tracking?.auto_header);
                setVal('tracking-include', Array.isArray(config.tracking?.include) ? config.tracking.include.join(', ') : (config.tracking?.include || ''));
                setVal('tracking-exclude', Array.isArray(config.tracking?.exclude) ? config.tracking.exclude.join(', ') : (config.tracking?.exclude || ''));
                setVal('author-default', config.author?.default);
                setVal('author-enforcement', config.author?.enforcement);
                setVal('hooks-enforcement', config.hooks?.enforcement);
                setVal('hooks-exclude', (config.hooks?.exclude || []).join(', '));
                setChecked('hashline-enabled', config.hashline?.enabled);
                setVal('matching-mode', config.matching?.mode);
                setChecked('settlement-auto-approve', config.settlement?.auto_on_approve);
                setChecked('settlement-auto-reject', config.settlement?.auto_on_reject);
                setVal('policy-mode', config.policy?.mode);
                setVal('policy-creation-tracking', config.policy?.creation_tracking);
                setVal('protocol-mode', config.protocol?.mode);
                setVal('protocol-level', config.protocol?.level);
                setVal('protocol-reasoning', config.protocol?.reasoning);
                setVal('protocol-batch-reasoning', config.protocol?.batch_reasoning);
            }

            function populateEditorPrefs(prefs) {
                setChecked('editor-show-criticmarkup', prefs.showCriticMarkup);
                setChecked('editor-comments-expanded', prefs.commentsExpandedByDefault);
                setVal('editor-comment-format', prefs.commentInsertFormat);
                setVal('editor-group-by', prefs.changeExplorerGroupBy);
            }

            function setVal(name, value) {
                const el = document.querySelector('[name="' + name + '"]');
                if (el && value !== undefined && value !== null) el.value = String(value);
            }
            function setChecked(name, value) {
                const el = document.querySelector('[name="' + name + '"]');
                if (el) el.checked = !!value;
            }

            // Signal the extension host that the webview is ready
            vscode.postMessage({ type: 'ready' });
        })();
    </script>
</body>
</html>`;
}

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Form Data Parsing ────────────────────────────────────────────────────────

export function parseFormData(data: Record<string, unknown>): SettingsConfig {
    const str = (key: string, fallback: string): string => {
        const val = data[key];
        return typeof val === 'string' ? val : fallback;
    };
    const bool = (key: string, fallback: boolean): boolean => {
        const val = data[key];
        return typeof val === 'boolean' ? val : fallback;
    };
    const num = (key: string, fallback: number): number => {
        const val = data[key];
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const parsed = Number(val);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
    };
    const splitComma = (key: string): string[] => {
        const raw = str(key, '');
        if (!raw.trim()) return [];
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    };

    return {
        tracking: {
            default: str('tracking-default', DEFAULT_SETTINGS_CONFIG.tracking.default) as 'tracked' | 'untracked',
            auto_header: bool('tracking-auto-header', DEFAULT_SETTINGS_CONFIG.tracking.auto_header),
            include: splitComma('tracking-include'),
            exclude: splitComma('tracking-exclude'),
        },
        author: {
            default: str('author-default', DEFAULT_SETTINGS_CONFIG.author.default),
            enforcement: str('author-enforcement', DEFAULT_SETTINGS_CONFIG.author.enforcement) as 'optional' | 'required',
        },
        hooks: {
            enforcement: str('hooks-enforcement', DEFAULT_SETTINGS_CONFIG.hooks.enforcement) as 'warn' | 'block',
            exclude: splitComma('hooks-exclude'),
        },
        hashline: {
            enabled: bool('hashline-enabled', DEFAULT_SETTINGS_CONFIG.hashline.enabled),
        },
        matching: {
            mode: str('matching-mode', DEFAULT_SETTINGS_CONFIG.matching.mode) as 'strict' | 'normalized',
        },
        settlement: {
            auto_on_approve: bool('settlement-auto-approve', DEFAULT_SETTINGS_CONFIG.settlement.auto_on_approve),
            auto_on_reject: bool('settlement-auto-reject', DEFAULT_SETTINGS_CONFIG.settlement.auto_on_reject),
        },
        policy: {
            mode: str('policy-mode', DEFAULT_SETTINGS_CONFIG.policy.mode),
            creation_tracking: str('policy-creation-tracking', DEFAULT_SETTINGS_CONFIG.policy.creation_tracking),
        },
        protocol: {
            mode: str('protocol-mode', DEFAULT_SETTINGS_CONFIG.protocol.mode),
            level: num('protocol-level', DEFAULT_SETTINGS_CONFIG.protocol.level),
            reasoning: str('protocol-reasoning', DEFAULT_SETTINGS_CONFIG.protocol.reasoning) as 'optional' | 'required',
            batch_reasoning: str('protocol-batch-reasoning', DEFAULT_SETTINGS_CONFIG.protocol.batch_reasoning) as 'optional' | 'required',
        },
    };
}

// ── Editor Preferences Parsing ───────────────────────────────────────────────

export function parseEditorPreferences(data: Record<string, unknown>): EditorPreferencesConfig {
    const str = (key: string, fallback: string): string => {
        const val = data[key];
        return typeof val === 'string' ? val : fallback;
    };
    const bool = (key: string, fallback: boolean): boolean => {
        const val = data[key];
        return typeof val === 'boolean' ? val : fallback;
    };

    return {
        showCriticMarkup: bool('editor-show-criticmarkup', DEFAULT_EDITOR_PREFS.showCriticMarkup),
        commentsExpandedByDefault: bool('editor-comments-expanded', DEFAULT_EDITOR_PREFS.commentsExpandedByDefault),
        commentInsertFormat: str('editor-comment-format', DEFAULT_EDITOR_PREFS.commentInsertFormat) as 'inline' | 'footnote',
        changeExplorerGroupBy: str('editor-group-by', DEFAULT_EDITOR_PREFS.changeExplorerGroupBy) as 'flat' | 'author' | 'type',
    };
}

// ── TOML Serialization ───────────────────────────────────────────────────────

export function serializeToToml(config: SettingsConfig): string {
    const obj: Record<string, Record<string, unknown>> = {
        tracking: {
            default: config.tracking.default,
            auto_header: config.tracking.auto_header,
            include: config.tracking.include,
            exclude: config.tracking.exclude,
        },
        author: {
            default: config.author.default,
            enforcement: config.author.enforcement,
        },
        hooks: {
            enforcement: config.hooks.enforcement,
            exclude: config.hooks.exclude,
        },
        hashline: {
            enabled: config.hashline.enabled,
        },
        matching: {
            mode: config.matching.mode,
        },
        settlement: {
            auto_on_approve: config.settlement.auto_on_approve,
            auto_on_reject: config.settlement.auto_on_reject,
        },
        policy: {
            mode: config.policy.mode,
            creation_tracking: config.policy.creation_tracking,
        },
        protocol: {
            mode: config.protocol.mode,
            level: config.protocol.level,
            reasoning: config.protocol.reasoning,
            batch_reasoning: config.protocol.batch_reasoning,
        },
    };
    return stringify(obj);
}

// ── WebviewViewProvider ──────────────────────────────────────────────────────

export class SettingsPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'changetracksSettings';

    private view: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private model: ProjectStatusModel) {
        this.disposables.push(
            model.onDidChange(() => this.sendConfigToWebview()),
        );
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        const nonce = getNonce();
        const config = this.buildConfigFromModel();
        const editorPrefs = this.readEditorPreferences();
        webviewView.webview.html = generateSettingsHtml(config, editorPrefs, nonce);

        webviewView.webview.onDidReceiveMessage(
            (msg: { type: string; data?: Record<string, unknown> }) => {
                if (msg.type === 'ready') {
                    this.sendConfigToWebview();
                } else if (msg.type === 'save' && msg.data) {
                    const newConfig = parseFormData(msg.data);
                    const toml = serializeToToml(newConfig);
                    this.fireConfigSave(toml);

                    // Write editor preferences to VS Code settings
                    const editorPrefs = parseEditorPreferences(msg.data);
                    this.writeEditorPreferences(editorPrefs);
                } else if (msg.type === 'reset') {
                    const toml = serializeToToml(DEFAULT_SETTINGS_CONFIG);
                    this.fireConfigSave(toml);
                    this.writeEditorPreferences(DEFAULT_EDITOR_PREFS);
                    this.sendConfigToWebview();
                }
            },
            undefined,
            this.disposables,
        );

        // Refresh content when the panel becomes visible again so it reflects
        // any config changes that happened while the panel was hidden.
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    this.sendConfigToWebview();
                }
            }),
        );
    }

    public postMessageToWebview(message: unknown): void {
        this.view?.webview.postMessage(message);
    }

    private _onDidRequestSave = new vscode.EventEmitter<string>();
    readonly onDidRequestSave = this._onDidRequestSave.event;

    private fireConfigSave(toml: string): void {
        this._onDidRequestSave.fire(toml);
    }

    private readEditorPreferences(): EditorPreferencesConfig {
        const cfg = vscode.workspace.getConfiguration('changetracks');
        return {
            showCriticMarkup: cfg.get<boolean>('showCriticMarkup', DEFAULT_EDITOR_PREFS.showCriticMarkup),
            commentsExpandedByDefault: cfg.get<boolean>('commentsExpandedByDefault', DEFAULT_EDITOR_PREFS.commentsExpandedByDefault),
            commentInsertFormat: cfg.get<string>('commentInsertFormat', DEFAULT_EDITOR_PREFS.commentInsertFormat) as 'inline' | 'footnote',
            changeExplorerGroupBy: cfg.get<string>('changeExplorer.groupBy', DEFAULT_EDITOR_PREFS.changeExplorerGroupBy) as 'flat' | 'author' | 'type',
        };
    }

    private async writeEditorPreferences(prefs: EditorPreferencesConfig): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('changetracks');
        await cfg.update('showCriticMarkup', prefs.showCriticMarkup, vscode.ConfigurationTarget.Workspace);
        await cfg.update('commentsExpandedByDefault', prefs.commentsExpandedByDefault, vscode.ConfigurationTarget.Workspace);
        await cfg.update('commentInsertFormat', prefs.commentInsertFormat, vscode.ConfigurationTarget.Workspace);
        await cfg.update('changeExplorer.groupBy', prefs.changeExplorerGroupBy, vscode.ConfigurationTarget.Workspace);
    }

    private sendConfigToWebview(): void {
        if (!this.view) return;
        const config = this.buildConfigFromModel();
        const editorPrefs = this.readEditorPreferences();
        const rawConfig = this.model.getRawConfig();
        const isDefault = Object.keys(rawConfig).length === 0;
        this.view.webview.postMessage({ type: 'load', config, editorPrefs, isDefault });
    }

    private buildConfigFromModel(): SettingsConfig {
        const raw = this.model.getRawConfig();

        const tracking = (raw['tracking'] ?? {}) as Record<string, unknown>;
        const author = (raw['author'] ?? {}) as Record<string, unknown>;
        const hooks = (raw['hooks'] ?? {}) as Record<string, unknown>;
        const hashline = (raw['hashline'] ?? {}) as Record<string, unknown>;
        const matching = (raw['matching'] ?? {}) as Record<string, unknown>;
        const settlement = (raw['settlement'] ?? {}) as Record<string, unknown>;
        const policy = (raw['policy'] ?? {}) as Record<string, unknown>;
        const protocol = (raw['protocol'] ?? {}) as Record<string, unknown>;

        return {
            tracking: {
                default: (tracking['default'] === 'untracked' ? 'untracked' : 'tracked') as 'tracked' | 'untracked',
                auto_header: typeof tracking['auto_header'] === 'boolean' ? tracking['auto_header'] : DEFAULT_SETTINGS_CONFIG.tracking.auto_header,
                include: Array.isArray(tracking['include']) ? tracking['include'] as string[] : DEFAULT_SETTINGS_CONFIG.tracking.include,
                exclude: Array.isArray(tracking['exclude']) ? tracking['exclude'] as string[] : DEFAULT_SETTINGS_CONFIG.tracking.exclude,
            },
            author: {
                default: typeof author['default'] === 'string' ? author['default'] : DEFAULT_SETTINGS_CONFIG.author.default,
                enforcement: (author['enforcement'] === 'required' ? 'required' : 'optional') as 'optional' | 'required',
            },
            hooks: {
                enforcement: (hooks['enforcement'] === 'block' ? 'block' : 'warn') as 'warn' | 'block',
                exclude: Array.isArray(hooks['exclude']) ? hooks['exclude'] as string[] : DEFAULT_SETTINGS_CONFIG.hooks.exclude,
            },
            hashline: {
                enabled: typeof hashline['enabled'] === 'boolean' ? hashline['enabled'] : DEFAULT_SETTINGS_CONFIG.hashline.enabled,
            },
            matching: {
                mode: (matching['mode'] === 'strict' ? 'strict' : 'normalized') as 'strict' | 'normalized',
            },
            settlement: {
                auto_on_approve: typeof settlement['auto_on_approve'] === 'boolean' ? settlement['auto_on_approve'] : DEFAULT_SETTINGS_CONFIG.settlement.auto_on_approve,
                auto_on_reject: typeof settlement['auto_on_reject'] === 'boolean' ? settlement['auto_on_reject'] : DEFAULT_SETTINGS_CONFIG.settlement.auto_on_reject,
            },
            policy: {
                mode: typeof policy['mode'] === 'string' ? policy['mode'] : DEFAULT_SETTINGS_CONFIG.policy.mode,
                creation_tracking: typeof policy['creation_tracking'] === 'string' ? policy['creation_tracking'] : DEFAULT_SETTINGS_CONFIG.policy.creation_tracking,
            },
            protocol: {
                mode: typeof protocol['mode'] === 'string' ? protocol['mode'] : DEFAULT_SETTINGS_CONFIG.protocol.mode,
                level: typeof protocol['level'] === 'number' ? protocol['level'] : DEFAULT_SETTINGS_CONFIG.protocol.level,
                reasoning: (protocol['reasoning'] === 'required' ? 'required' : 'optional') as 'optional' | 'required',
                batch_reasoning: (protocol['batch_reasoning'] === 'required' ? 'required' : 'optional') as 'optional' | 'required',
            },
        };
    }

    dispose(): void {
        this._onDidRequestSave.dispose();
        for (const d of this.disposables) d.dispose();
    }
}

// ── Utilities ────────────────────────────────────────────────────────────────

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
