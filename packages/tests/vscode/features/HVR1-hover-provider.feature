@slow @HVR1 @fixture(journey-review-target)
Feature: HVR1 — Hover provider shows change metadata
  As a document reviewer
  I want to see change metadata when hovering over changes
  So that I can understand the context without reading footnotes

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: Hovering over a change shows metadata
    When I navigate to the next change
    Then hovering shows text containing "ct-"

  @wip @coverage-gap @slow @fixture(untracked-file)
  Scenario: PB-24 hover on untracked file shows no content
    Given an untracked markdown file (no changetracks header)
    When I hover over a text position
    Then no hover content is displayed
    # FIXED in hover-provider.ts — hints only shown when tracking header present.
    # @wip because @slow fixture "untracked-file" doesn't exist yet.
