@fast @visual @VS1
Feature: VS1 — Visual semantics shared color palette and style mapping
  As a rendering surface (editor decorator or markdown preview)
  I want a shared color palette and style mapping for change types
  So that all surfaces render changes consistently

  # ── Color palette completeness ─────────────────────────────────────

  Scenario: CHANGE_COLORS has all five types
    Then the color palette has entry "insertion"
    And the color palette has entry "deletion"
    And the color palette has entry "highlight"
    And the color palette has entry "comment"
    And the color palette has entry "move"

  Scenario: Each foreground color has light and dark variants
    Then insertion foreground has light and dark variants
    And deletion foreground has light and dark variants

  Scenario: AUTHOR_PALETTE has 5 entries with light and dark
    Then the author palette has 5 entries
    And each author palette entry has light and dark variants

  # ── Style mapping: insertion ───────────────────────────────────────

  Scenario: getChangeStyle returns correct class for insertion
    When I get the change style for "insertion" with status "proposed"
    Then the CSS class is "cn-ins cn-proposed"
    And the HTML tag is "ins"
    And strikethrough is false
    And the foreground matches the insertion color

  # ── Style mapping: deletion ────────────────────────────────────────

  Scenario: getChangeStyle returns correct class for deletion
    When I get the change style for "deletion" with status "proposed"
    Then the CSS class is "cn-del cn-proposed"
    And the HTML tag is "del"
    And strikethrough is true

  # ── Style mapping: substitution ────────────────────────────────────

  Scenario: getChangeStyle returns correct class for substitution
    When I get the change style for "substitution" with status "accepted"
    Then the CSS class is "cn-sub cn-accepted"
    And the HTML tag is "span"
    And strikethrough is false

  # ── Style mapping: highlight ───────────────────────────────────────

  Scenario: getChangeStyle returns correct class for highlight
    When I get the change style for "highlight" with status "proposed"
    Then the CSS class is "cn-hl"
    And the HTML tag is "mark"

  # ── Style mapping: comment ─────────────────────────────────────────

  Scenario: getChangeStyle returns correct class for comment
    When I get the change style for "comment" with status "proposed"
    Then the CSS class is "cn-comment"
    And the HTML tag is "span"

  # ── Style mapping: move roles ──────────────────────────────────────

  Scenario: getChangeStyle returns move-from for deletion with moveRole
    When I get the change style for "deletion" with status "proposed" and move role "from"
    Then the CSS class contains "cn-move-from"
    And the foreground matches the move color

  Scenario: getChangeStyle returns move-to for insertion with moveRole
    When I get the change style for "insertion" with status "proposed" and move role "to"
    Then the CSS class contains "cn-move-to"
    And the foreground matches the move color
