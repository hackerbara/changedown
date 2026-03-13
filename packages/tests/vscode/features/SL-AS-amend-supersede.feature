@slow @SL-AS @destructive @wip @red
Feature: SL-AS — Amend and supersede in running VS Code

  Background:
    Given VS Code is launched with fixture "lifecycle-amend-supersede.md"
    And the extension has finished parsing
    And the current reviewer identity is "@carol"

  @SL-AS-01
  Scenario: Amend blocked for wrong author
    When I position cursor inside the ct-1 insertion "Alice's addition"
    And I execute "changetracks.amendChange"
    Then an error message appears saying "same author"
    And I capture evidence screenshot "amend-blocked-wrong-author"

  @SL-AS-02
  Scenario: Amend own change succeeds
    Given the current reviewer identity is "@alice"
    When I position cursor inside the ct-1 insertion "Alice's addition"
    And I execute "changetracks.amendChange"
    Then an InputBox appears pre-populated with "Alice's addition"
    And I capture evidence screenshot "amend-inputbox-prepopulated"
    When I clear and type "Alice's improved addition" in the InputBox
    Then a second InputBox appears for reason
    When I type "Incorporated feedback" in the InputBox
    Then the current document text includes "Alice's improved addition"
    And the document footnote for ct-1 contains "revised @alice"
    And the document footnote for ct-1 contains "previous:"
    And I capture evidence screenshot "after-amend"

  @SL-AS-03
  Scenario: Supersede another author's proposed change
    When I position cursor inside the ct-2 insertion "Bob's addition"
    And I execute "changetracks.supersedeChange"
    Then an InputBox appears for new text
    And I capture evidence screenshot "supersede-new-text-inputbox"
    When I type "Carol's alternative" in the InputBox
    Then a second InputBox appears for reason
    When I type "Better approach" in the InputBox
    Then the document footnote for ct-2 contains "rejected:"
    And the document footnote for ct-2 contains "superseded-by:"
    And a new change exists with text "Carol's alternative"
    And I capture evidence screenshot "after-supersede"

  @SL-AS-04
  Scenario: Supersede blocked on already-accepted change
    When I position cursor inside the ct-3 insertion "accepted text"
    And I execute "changetracks.supersedeChange"
    Then an error message appears saying "already accepted"
    And I capture evidence screenshot "supersede-blocked-accepted"

  @SL-AS-05
  Scenario: Supersede blocked on own proposed change
    Given the current reviewer identity is "@alice"
    When I position cursor inside the ct-1 insertion
    And I execute "changetracks.supersedeChange"
    Then an error message appears saying "same author"
    And I capture evidence screenshot "supersede-blocked-same-author"
