@fast @settings-panel @PNL2
Feature: PNL2 — Settings panel HTML generation and form parsing
  As the Settings Panel provider
  I want to generate correct HTML and parse form submissions
  So that users can configure ChangeDown via the GUI

  # ── HTML generation: form fields ───────────────────────────────────

  Scenario: generateSettingsHtml produces HTML with form fields
    Given a settings config with tracking default "tracked" and author enforcement "required"
    When I generate settings HTML
    Then the HTML contains "tracking-default"
    And the HTML contains "author-enforcement"
    And the HTML contains "hooks-enforcement"
    And the HTML contains "Advanced"

  # ── HTML generation: config notice ─────────────────────────────────

  Scenario: generateSettingsHtml includes config notice element
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "config-notice"

  # ── HTML generation: validation script ─────────────────────────────

  Scenario: generateSettingsHtml includes validation script
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "validateGlob"

  # ── HTML generation: dirty state tracking ──────────────────────────

  Scenario: generateSettingsHtml includes dirty state tracking
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "isDirty"
    And the HTML contains "markDirty"
    And the HTML contains "markClean"

  # ── HTML generation: unsaved indicator CSS ─────────────────────────

  Scenario: generateSettingsHtml includes unsaved indicator CSS
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "button.dirty"

  # ── HTML generation: config creation notice CSS ────────────────────

  Scenario: generateSettingsHtml includes config creation notice CSS
    Given default settings config
    When I generate settings HTML
    Then the HTML contains ".notice"
    And the HTML contains "showConfigNotice"

  # ── HTML generation: three-tier layout ─────────────────────────────

  Scenario: generateSettingsHtml includes three-tier layout
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "Project Configuration"
    And the HTML contains "Editor Preferences"
    And the HTML contains "tier green"
    And the HTML contains "tier blue"
    And the HTML contains "tier gray"

  # ── HTML generation: accordion sections ────────────────────────────

  Scenario: generateSettingsHtml includes accordion sections
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "accordion-trigger"
    And the HTML contains "accordion-body"
    And the HTML contains "accordion-chevron"

  # ── HTML generation: Identity and Tracking open by default ─────────

  Scenario: Identity and Tracking sections are open by default
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "data-section=\"identity\""
    And the HTML contains "data-section=\"tracking\""
    And the identity section has class "accordion open"
    And the tracking section has class "accordion open"

  # ── HTML generation: editor preference fields ──────────────────────

  Scenario: generateSettingsHtml includes editor preference fields
    Given default settings config
    When I generate settings HTML
    Then the HTML contains "editor-comments-expanded"
    And the HTML contains "editor-comment-format"
    And the HTML contains "editor-group-by"

  # ── Form parsing: parseFormData ────────────────────────────────────

  Scenario: parseFormData extracts config from message payload
    When I parse form data with tracking "untracked" and author enforcement "optional" and hooks "block"
    Then parsed tracking default is "untracked"
    And parsed author enforcement is "optional"
    And parsed hooks enforcement is "block"

  # ── Form parsing: parseEditorPreferences ───────────────────────────

  Scenario: parseEditorPreferences extracts editor settings from payload
    When I parse editor preferences with commentsExpanded true and format "inline" and groupBy "author"
    Then parsed clickToShowComments is true
    And parsed commentInsertFormat is "inline"
    And parsed changeExplorerGroupBy is "author"

  # ── Form parsing: parseEditorPreferences with defaults ─────────────

  Scenario: parseEditorPreferences uses defaults for missing fields
    When I parse editor preferences with empty payload
    Then parsed clickToShowComments is false
    And parsed commentInsertFormat is "footnote"
    And parsed changeExplorerGroupBy is "flat"

  # ── TOML serialization ─────────────────────────────────────────────

  Scenario: serializeToToml produces valid TOML string
    Given a settings config with tracking default "tracked" and author enforcement "required"
    When I serialize to TOML
    Then the TOML contains "[tracking]"
    And the TOML contains "default = \"tracked\""
    And the TOML contains "[author]"
    And the TOML contains "enforcement = \"required\""

  # ── Round-trip ─────────────────────────────────────────────────────

  Scenario: Round-trip config to TOML and back preserves values
    Given a settings config with tracking default "tracked" and author enforcement "required" and hooks enforcement "warn" and hashline enabled true and include "**/*.md" and exclude "node_modules/**"
    When I serialize to TOML and parse back
    Then the round-trip tracking default is "tracked"
    And the round-trip author enforcement is "required"
    And the round-trip hooks enforcement is "warn"
    And the round-trip hashline enabled is true
    And the round-trip tracking include is "**/*.md"
    And the round-trip tracking exclude is "node_modules/**"
