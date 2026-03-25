@slow @L3P @fixture(l3-promotion-test) @destructive
Feature: LSP-driven L3 promotion with view mode cycling
  As a reviewer opening an L2 document with tracked changes
  I want the LSP to auto-promote it to L3 format (clean body + footnote ops)
  So I see decorated clean text, not raw CriticMarkup delimiters

  Background:
    Given I open "l3-promotion-test.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    # Poll for L3 edit-op lines as proof that workspace/applyEdit completed
    Then the document contains L3 edit-op lines

  Scenario: L2 document auto-promotes to L3 on open
    # After promotion, the body (before footnotes) should have no inline CriticMarkup
    Then the document body has no inline CriticMarkup
    # But the footnote section correctly contains edit-ops with CriticMarkup
    And the document contains "{~~extended~>shortened~~}"
    And the document contains "{++add comprehensive integration tests++}"
    # Decorations should be rendering the L3 changes
    And inline decorations are visible

  Scenario: Promoted L3 body contains clean settled text
    # Substitution: old text gone from body, new text present
    Then the document contains "shortened"
    And the document contains "add comprehensive integration tests"
    # Inline footnote refs stripped from body (check body only — footnote defs still have [^ct-N]:)
    And the document body does not contain "[^ct-101]"
    And the document body does not contain "[^ct-102]"

  Scenario: Decorations visible in each view mode after promotion
    When I switch to "all-markup" view mode
    And I wait 1000 milliseconds
    Then inline decorations are visible
    When I switch to "simple" view mode
    And I wait 1000 milliseconds
    Then inline decorations are visible
    When I switch to "all-markup" view mode
    And I wait 1000 milliseconds
    Then inline decorations are visible
    # After cycling, re-promotion may be needed — poll for L3 edit-op lines
    And the document contains L3 edit-op lines
    And the document body has no inline CriticMarkup
