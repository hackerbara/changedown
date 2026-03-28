@slow @J9 @fixture(journey-review-target)
Feature: Settings tab — project configuration GUI
  As a project maintainer
  I want to configure ChangeDown's tracking policies from a visual form
  So I don't have to manually edit .changedown/config.toml

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  Scenario: Settings Panel can be opened
    And I open the Settings Panel
    Then the status bar shows "changes"

  # @wip — Two blockers:
  # 1. WebView iframe form interaction (#author-default fill, Save click)
  #    requires reliable frame detection that is not yet stable.
  # 2. The assertion `the editor text contains ""` is a tautology —
  #    String.includes("") is always true. A meaningful assertion would
  #    verify that .changedown/config.toml was written with the new
  #    author value, but that requires workspace-level file assertions
  #    not yet implemented.
  @wip
  Scenario: Change author identity
    And I open the Settings Panel
    When I change author to "reviewer-alice" in Settings
    And I save settings
    Then the editor text contains ""
