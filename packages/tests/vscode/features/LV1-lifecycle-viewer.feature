@fast @LV1
Feature: LV1 — cn-ID lifecycle viewer

  Every L1/L2 change gets a lifecycle viewer, regardless of change type.
  The viewer shows proposal metadata, discussion, amendments, and reviews.

  Scenario: Insertion with footnote gets lifecycle thread
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added for clarity
      """
    When I build comment threads
    Then a thread exists for "cn-1"
    And the thread label is "Insertion by @alice"
    And comment 2 body contains "Added for clarity"

  Scenario: Deletion with footnote gets lifecycle thread
    Given a lifecycle document with text:
      """
      Hello {--removed--}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | deletion | proposed
          reason: Redundant paragraph
      """
    When I build comment threads
    Then a thread exists for "cn-1"
    And the thread label is "Deletion by @alice"

  Scenario: Substitution with footnote gets lifecycle thread
    Given a lifecycle document with text:
      """
      Hello {~~old~>new~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
          reason: Clearer wording
      """
    When I build comment threads
    Then a thread exists for "cn-1"
    And the thread label is "Substitution by @alice"

  Scenario: L1 insertion with inline metadata gets lifecycle thread
    Given a lifecycle document with text:
      """
      Hello {++world++}{>>@alice | 2026-03-09<<}
      """
    When I build comment threads
    Then 1 thread exists
    And the thread label is "Insertion by @alice"
    And the first comment body contains "insertion"

  Scenario: L0 change without metadata gets no thread
    Given a lifecycle document with text:
      """
      Hello {++world++}
      """
    When I build comment threads
    Then no threads exist

  Scenario: Thread shows discussion entries
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added for clarity
          @bob 2026-03-09: Looks good but consider rewording
          @alice 2026-03-09: Will amend
      """
    When I build comment threads
    Then a thread exists for "cn-1"
    And the thread has 4 comments
    And comment 3 author is "@bob"
    And comment 3 body contains "Looks good but consider rewording"

  Scenario: Thread shows approval entry
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | accepted
          approved: @bob 2026-03-09 "Clear and correct"
      """
    When I build comment threads
    Then a thread exists for "cn-1"
    And the thread has 2 comments
    And the last comment body contains "Clear and correct"

  Scenario: L2 changes produce threads but L0 do not
    Given a lifecycle document with text:
      """
      Hello {++inserted++}[^cn-1]

      Another {++bare insertion++}

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I build comment threads
    Then 1 thread exists
    And a thread exists for "cn-1"
