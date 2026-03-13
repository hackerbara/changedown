@wip @coverage-gap @red
Feature: OVR1 — Accept with adjacent highlight+comment does not produce overlapping ranges

  Bug: When a document contains {==highlight==}{>>comment<<} (highlight with attached
  comment, no whitespace between), bulk accept via Accept All or SCM produces a
  WorkspaceEdit with overlapping ranges that VS Code rejects. Single-change accept
  via the cursor may also fail if the highlight and comment are treated as separate
  changes whose edit ranges collide.

  Background:
    Given VS Code is launched with fixture "accept-overlap-highlight-comment.md"
    And the extension has finished parsing

  @slow @OVR1-01
  Scenario: Single accept of highlight with attached comment succeeds
    When I position cursor inside the ct-2 highlight
    And I execute "changetracks.acceptChange"
    Then no error notification appeared
    And the document footnote for ct-2 contains "approved:"
    And I capture evidence screenshot "ovr1-single-accept-highlight"

  @slow @OVR1-02 @destructive
  Scenario: Accept All with highlight+comment does not produce overlapping ranges
    When I execute "changetracks.acceptAll"
    Then no error notification appeared
    And the document footnote for ct-1 contains "approved:"
    And the document footnote for ct-3 contains "approved:"
    And I capture evidence screenshot "ovr1-accept-all-no-overlap"
