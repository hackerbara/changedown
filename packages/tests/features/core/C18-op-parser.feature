@core @op-parser
Feature: Op parser — CriticMarkup-native operator parsing
  The op parser converts CriticMarkup-delimited strings into structured ParsedOp objects.
  Grammar: insertion ({++text++}), deletion ({--text--}), substitution ({~~old~>new~~}),
  highlight ({==text==}), comment ({>>text or {>>text<<}). Reasoning appended via {>>reason
  after the closing delimiter.

  # --- Substitution ---

  Scenario: Basic substitution
    When I parse the op "{~~old~>new~~}"
    Then the op type is "sub"
    And the op old text is "old"
    And the op new text is "new"
    And the op has no reasoning

  Scenario: Substitution with reasoning
    When I parse the op "{~~REST~>GraphQL~~}{>>better for this use case"
    Then the op type is "sub"
    And the op old text is "REST"
    And the op new text is "GraphQL"
    And the op reasoning is "better for this use case"

  Scenario: Empty old text (range replacement)
    When I parse the op "{~~~>replacement text~~}"
    Then the op type is "sub"
    And the op old text is ""
    And the op new text is "replacement text"

  # --- Insertion ---

  Scenario: Basic insertion
    When I parse the op "{++new text++}"
    Then the op type is "ins"
    And the op old text is ""
    And the op new text is "new text"
    And the op has no reasoning

  Scenario: Insertion with reasoning
    When I parse the op "{++added clause++}{>>required by spec"
    Then the op type is "ins"
    And the op new text is "added clause"
    And the op reasoning is "required by spec"

  # --- Deletion ---

  Scenario: Basic deletion
    When I parse the op "{--removed text--}"
    Then the op type is "del"
    And the op old text is "removed text"
    And the op new text is ""

  Scenario: Deletion with reasoning
    When I parse the op "{--obsolete--}{>>no longer needed"
    Then the op type is "del"
    And the op old text is "obsolete"
    And the op reasoning is "no longer needed"

  # --- Highlight ---

  Scenario: Basic highlight
    When I parse the op "{==important text==}"
    Then the op type is "highlight"
    And the op old text is "important text"
    And the op new text is ""

  Scenario: Highlight with reasoning
    When I parse the op "{==key finding==}{>>needs review"
    Then the op type is "highlight"
    And the op old text is "key finding"
    And the op reasoning is "needs review"

  # --- Comment ---

  Scenario: Comment-only op (unclosed)
    When I parse the op "{>>this is a comment"
    Then the op type is "comment"
    And the op reasoning is "this is a comment"

  Scenario: Comment-only op with closing delimiter
    When I parse the op "{>>this is a comment<<}"
    Then the op type is "comment"
    And the op reasoning is "this is a comment"

  # --- Error handling ---

  Scenario: Empty string throws error
    When I parse the op "" expecting an error
    Then the op error matches "empty"

  Scenario: Unparseable op throws error
    When I parse the op "no delimiters here" expecting an error
    Then the op error matches "Cannot parse op"

  Scenario: Old prefix syntax throws error (no backward compatibility)
    When I parse the op "+text" expecting an error
    Then the op error matches "Cannot parse op"

  # --- Reasoning disambiguation ---

  Scenario: CriticMarkup comment in content is not treated as reasoning
    When I parse the op "{++text with {>>inline comment<<} included++}"
    Then the op type is "ins"
    And the op new text is "text with {>>inline comment<<} included"
    And the op has no reasoning

  Scenario: Rightmost unmatched {>> is used as reasoning separator
    When I parse the op "{++text++}{>>real reasoning"
    Then the op type is "ins"
    And the op new text is "text"
    And the op reasoning is "real reasoning"
