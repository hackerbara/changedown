@slow @SL-XS @destructive @wip @red
Feature: SL-XS — Cross-surface sync in running VS Code

  Verify that operations on one surface update all other surfaces.

  Background:
    Given VS Code is launched with fixture "lifecycle-cross-surface.md"
    And CodeLens is enabled
    And the extension has finished parsing
    And I open the Review Panel

  @SL-XS-01
  Scenario: Accept from CodeLens updates panel and thread
    And I capture evidence screenshot "cross-surface-before"
    When I click Accept on the CodeLens for cn-1
    And I select QuickPick item "Accept"
    Then the panel card for cn-1 shows status "accepted"
    And the thread for cn-1 footnote contains "approved:"
    And the CodeLens for cn-1 no longer shows Accept | Reject
    And I capture evidence screenshot "cross-surface-after-accept"

  @SL-XS-02
  Scenario: Reply from peek updates CodeLens indicator and panel count
    And I capture evidence screenshot "cross-reply-before"
    When I position cursor inside cn-1 insertion
    And I open the comment thread for cn-1
    And I type "Additional feedback" in the reply box
    And I click the Reply button
    Then the CodeLens for cn-1 shows updated discussion count
    And the panel card for cn-1 shows updated reply count
    And I capture evidence screenshot "cross-reply-after"

  @SL-XS-03
  Scenario: Resolve updates CodeLens and panel state
    When I execute "changedown.resolveThread" on cn-2
    Then the CodeLens for cn-2 does not show discussion indicator
    And the panel card for cn-2 shows resolved state
    And the thread for cn-2 has state "resolved"
    And I capture evidence screenshot "cross-resolve-after"
