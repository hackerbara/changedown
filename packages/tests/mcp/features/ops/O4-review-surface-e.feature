Feature: Review changes via Surface E (committed view)
  As an AI agent reviewing from the committed view
  I want to see the clean document, identify changes by their markers,
  then approve/reject using the same review_changes tool

  Background:
    Given a tracked file with pending changes visible in committed view as [P] markers
    And the config has hashline.enabled = true

  Scenario: Read committed view shows change markers for review
    When I call read_tracked_file with view = "committed"
    Then pending changes appear with [P] line annotations
    And accepted changes appear with [A] line annotations
    And the text shows the reverted (original) content for pending items

  Scenario: Identify change from committed view then approve
    When I call read_tracked_file with view = "committed"
    And I identify ct-1 from the [P] marker
    And I call get_change for ct-1 to see full context
    And I call review_changes approving ct-1
    Then ct-1 is approved
    And a subsequent committed view read shows ct-1 text as accepted (no [P] marker)

  Scenario: Auto-settlement after approval in committed view
    Given the config has settlement.auto_on_approve = true
    When I approve ct-1 via review_changes
    Then the inline CriticMarkup for ct-1 is removed (settled)
    And the footnote status is "accepted"
    And the footnote persists (Layer 1 only)
    And subsequent reads show clean text at that location
