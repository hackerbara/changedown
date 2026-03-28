@slow @SL-TH @destructive @wip @red
Feature: SL-TH — Comment thread lifecycle in running VS Code

  Background:
    Given VS Code is launched with fixture "lifecycle-threads.md"
    And the extension has finished parsing

  @SL-TH-01
  Scenario: Threads render for all L2 changes
    Then comment threads exist for cn-1, cn-2, cn-3
    And the thread count is 3
    And I capture evidence screenshot "threads-rendered"

  @SL-TH-02
  Scenario: Thread shows correct comment count
    Then the thread for cn-1 has 2 discussion comments
    And the thread for cn-2 has 1 discussion comment
    And the thread for cn-3 has 1 discussion comment

  @SL-TH-03
  Scenario: Resolved thread uses CommentThreadState.Resolved
    Then the thread for cn-2 has state "resolved"
    And the thread for cn-1 has state "unresolved"
    And the thread for cn-3 has state "unresolved"
    And I capture evidence screenshot "thread-states"

  @SL-TH-04
  Scenario: Reply via peek widget appends to footnote
    When I position cursor inside the cn-1 insertion "discussed change"
    And I open the comment thread for cn-1
    And I capture evidence screenshot "peek-before-reply"
    And I type "Ship it!" in the reply box
    And I click the Reply button
    Then the document footnote for cn-1 contains "Ship it!"
    And the thread for cn-1 has 3 discussion comments
    And I capture evidence screenshot "peek-after-reply"

  @SL-TH-05
  Scenario: Resolve thread from command
    When I execute "changedown.resolveThread" on cn-1
    Then the thread for cn-1 has state "resolved"
    And the document footnote for cn-1 contains "resolved:"
    And I capture evidence screenshot "thread-resolved"

  @SL-TH-06
  Scenario: Unresolve restores thread state
    When I execute "changedown.unresolveThread" on cn-2
    Then the thread for cn-2 has state "unresolved"
    And the document footnote for cn-2 does not contain "resolved:"
    And I capture evidence screenshot "thread-unresolved"

  @SL-TH-07
  Scenario: View mode hides threads in Final mode
    And I capture evidence screenshot "threads-all-markup-mode"
    When I set view mode to "final"
    Then the thread count is 0
    And I capture evidence screenshot "threads-final-mode-hidden"
    When I set view mode to "all-markup"
    Then the thread count is 3
    And I capture evidence screenshot "threads-restored"
