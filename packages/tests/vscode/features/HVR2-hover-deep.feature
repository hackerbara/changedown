@wip @coverage-gap @red @slow @HVR2 @fixture(journey-review-target)
Feature: HVR2 — Hover provider deep coverage
  As a document reviewer
  I want rich hover metadata on every change type
  So I can understand changes without scrolling to footnotes

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  # ── Per-type metadata ────────────────────────────────────────

  Scenario: HVR2-01 Hover on deletion shows metadata
    When I navigate to the next change
    And I navigate to the next change
    Then hovering shows text containing "del"

  Scenario: HVR2-02 Hover on insertion shows author
    When I navigate to the next change
    Then hovering shows text containing "alice"

  Scenario: HVR2-03 Hover on substitution shows type
    When I position the cursor at line 21 column 30
    Then hovering shows text containing "sub"

  Scenario: HVR2-04 Hover on highlight+comment shows comment text
    When I position the cursor at line 16 column 10
    Then hovering shows text containing "critical design decision"

  # ── Discussion threads in hover ──────────────────────────────

  Scenario: HVR2-05 Hover shows discussion summary with reply count
    When I position the cursor at line 8 column 20
    Then hovering shows text containing "bob"

  # ── Discovery hints ──────────────────────────────────────────

  Scenario: HVR2-06 Hover on plain text in tracked file shows Add Comment hint
    When I position the cursor at line 63 column 5
    Then hovering shows text containing "Add Comment"

  # ── Multi-line accuracy ──────────────────────────────────────

  Scenario: HVR2-07 Hover on multi-line insertion shows metadata
    When I position the cursor at line 7 column 10
    Then hovering shows text containing "cn-"

  # ── Untracked file ───────────────────────────────────────────

  @fixture(no-header)
  Scenario: HVR2-08 Hover on untracked file shows no metadata
    Given I open "no-header.md" in VS Code
    And the ChangeDown extension is active
    When I position the cursor at line 1 column 5
    Then hovering shows text containing "Add Comment"
    # On untracked files, only the discovery hint appears — no change metadata
