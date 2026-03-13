@slow @D1 @fixture(decoration-baseline-matrix)
Feature: Decoration baseline matrix — all types x all views
  As a developer
  I want to verify that every change type renders correctly in every view mode
  So I can catch decoration rendering bugs

  Background:
    Given I open "decoration-baseline-matrix.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario Outline: <change_type> decoration in <view_mode> view with cursor <cursor_state>
    When I switch to "<view_mode>" view mode
    And I move the cursor <cursor_state> the <change_type> change
    Then the <change_type> decoration in <view_mode> with cursor <cursor_state> matches the baseline

    Examples: Insertions
      | change_type | view_mode  | cursor_state |
      | insertion   | all-markup | outside      |
      | insertion   | all-markup | inside       |
      | insertion   | simple     | outside      |
      | insertion   | simple     | inside       |
      | insertion   | final      | outside      |
      | insertion   | original   | outside      |

    Examples: Deletions
      | change_type | view_mode  | cursor_state |
      | deletion    | all-markup | outside      |
      | deletion    | all-markup | inside       |
      | deletion    | simple     | outside      |
      | deletion    | simple     | inside       |
      | deletion    | final      | outside      |
      | deletion    | original   | outside      |

    Examples: Substitutions
      | change_type  | view_mode  | cursor_state |
      | substitution | all-markup | outside      |
      | substitution | all-markup | inside       |
      | substitution | simple     | outside      |
      | substitution | simple     | inside       |
      | substitution | final      | outside      |
      | substitution | original   | outside      |

    Examples: Highlights
      | change_type | view_mode  | cursor_state |
      | highlight   | all-markup | outside      |
      | highlight   | all-markup | inside       |
      | highlight   | simple     | outside      |
      | highlight   | simple     | inside       |

    Examples: Comments
      | change_type | view_mode  | cursor_state |
      | comment     | all-markup | outside      |
      | comment     | all-markup | inside       |
