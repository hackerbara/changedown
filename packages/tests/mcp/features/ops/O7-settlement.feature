Feature: Settlement (Layer 1 compaction)
  As a reviewer or agent
  I want accepted/rejected changes to be compacted
  So the document returns to clean readable state

  Background:
    Given a tracked file with proposed changes

  Scenario: Auto-settle on approve removes inline markup
    Given the config has settlement.auto_on_approve = true
    When I approve cn-1
    Then the inline CriticMarkup for cn-1 is removed
    And the accepted text remains in place
    And the footnote status is "accepted"
    And the footnote definition persists (Layer 1)

  Scenario: Auto-settle on reject removes change entirely
    Given the config has settlement.auto_on_reject = true
    When I reject an insertion cn-1
    Then the inserted text AND delimiters are removed
    And the footnote status is "rejected"

  Scenario: Manual settle via review_changes settle flag
    Given the config has settlement.auto_on_approve = false
    When I approve cn-1 (markup persists)
    And I call review_changes with settle = true
    Then the accepted markup is compacted
    And the footnote persists

  Scenario: Settlement of substitution keeps new text
    Given a pending substitution "REST" -> "GraphQL"
    When I approve and settle
    Then the file contains "GraphQL" without CriticMarkup
    And "REST" no longer appears in the document body

  Scenario: Settlement of deletion removes text
    Given a pending deletion of "remove this"
    When I approve and settle
    Then "remove this" no longer appears in the document body

  Scenario: Footnotes persist after Layer 1 settlement
    When I settle all accepted changes
    Then every footnote is still present in the file
    And each footnote status reflects "accepted" or "rejected"
