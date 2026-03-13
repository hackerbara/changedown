@slow @SL-AR @destructive @wip @red
Feature: SL-AR — Accept/reject with reason in running VS Code

  Full end-to-end Playwright verification of the QuickPick/InputBox
  reason flow for accept and reject operations.

  Background:
    Given VS Code is launched with fixture "lifecycle-accept-reason.md"
    And the extension has finished parsing

  @SL-AR-01
  Scenario: Quick accept (no reason) via QuickPick when reason optional
    Given reasonRequired is set to false
    When I position cursor inside the ct-1 insertion
    And I execute "changetracks.acceptChange"
    Then a QuickPick appears with items "Accept", "Accept with reason...", "Request Changes..."
    And I capture evidence screenshot "before-quick-accept"
    When I select QuickPick item "Accept"
    Then the document footnote for ct-1 contains "accepted"
    And the document footnote for ct-1 contains "approved:"
    And I capture evidence screenshot "after-quick-accept"

  @SL-AR-02
  Scenario: Accept with reason via QuickPick
    Given reasonRequired is set to false
    When I position cursor inside the ct-2 substitution
    And I execute "changetracks.acceptChange"
    And I select QuickPick item "Accept with reason..."
    Then an InputBox appears with prompt containing "Reason"
    And I capture evidence screenshot "accept-reason-inputbox"
    When I type "Clear improvement" in the InputBox
    Then the document footnote for ct-2 contains "approved:"
    And the document footnote for ct-2 contains "Clear improvement"
    And I capture evidence screenshot "after-accept-with-reason"

  @SL-AR-03
  Scenario: Request changes from accept QuickPick
    Given reasonRequired is set to false
    When I position cursor inside the ct-1 insertion
    And I execute "changetracks.acceptChange"
    And I select QuickPick item "Request Changes..."
    Then an InputBox appears
    When I type "Too vague, add specifics" in the InputBox
    Then the document footnote for ct-1 contains "request-changes:"
    And the document footnote for ct-1 contains "Too vague, add specifics"
    And the footnote status for ct-1 is still "proposed"
    And I capture evidence screenshot "after-request-changes"

  @SL-AR-04
  Scenario: Accept with mandatory reason (InputBox, no QuickPick)
    Given reasonRequired is set to true
    When I position cursor inside the ct-1 insertion
    And I execute "changetracks.acceptChange"
    Then an InputBox appears (not a QuickPick)
    And I capture evidence screenshot "mandatory-reason-inputbox"
    When I type "Approved after review" in the InputBox
    Then the document footnote for ct-1 contains "approved:"
    And the document footnote for ct-1 contains "Approved after review"

  @SL-AR-05
  Scenario: Mandatory reason blocks empty submission
    Given reasonRequired is set to true
    When I position cursor inside the ct-1 insertion
    And I execute "changetracks.acceptChange"
    Then an InputBox appears
    When I press Enter without typing (empty submission)
    Then the InputBox shows validation error "Reason is required"
    And I capture evidence screenshot "empty-reason-blocked"
    When I press Escape to cancel
    Then the footnote status for ct-1 is still "proposed"

  @SL-AR-06
  Scenario: Reject with reason via QuickPick
    Given reasonRequired is set to false
    When I position cursor inside the ct-3 highlight
    And I execute "changetracks.rejectChange"
    And I select QuickPick item "Reject with reason..."
    Then an InputBox appears
    When I type "Not relevant to this section" in the InputBox
    Then the document footnote for ct-3 contains "rejected:"
    And the document footnote for ct-3 contains "Not relevant to this section"
    And I capture evidence screenshot "after-reject-with-reason"
