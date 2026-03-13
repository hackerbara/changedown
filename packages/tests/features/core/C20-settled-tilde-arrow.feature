@core @settled-tilde-arrow
Feature: Settled text — tilde-arrow handling in substitutions
  The settled text computation uses accept-all semantics: insertions are kept,
  deletions are removed, and substitutions keep the new (modified) text. The
  tilde-arrow (~>) is the substitution separator; only the FIRST ~> separates
  old from new text. Subsequent ~> in the new text are literal content.

  # --- computeSettledText (parser-based) ---

  Scenario: Literal ~> in new text of substitution is preserved
    Given the markup text "Use {~~old syntax~>new arrow ~> function~~} here."
    When I compute the settled text
    Then the settled text contains "new arrow ~> function"

  Scenario: ~> in code backticks inside substitution new text
    Given the markup text "The operator {~~is `=>`~>is `~>`~~} for substitution."
    When I compute the settled text
    Then the settled text contains "is `~>`"

  Scenario: Multiple ~> in new text
    Given the markup text "{~~A~>B ~> C ~> D~~} end."
    When I compute the settled text
    Then the settled text contains "B ~> C ~> D"

  Scenario: ~> as the entire new text
    Given the markup text "{~~old~>~>~~} done"
    When I compute the settled text
    Then the settled text contains "~>"
    And the settled text contains "done"

  Scenario: ~> immediately after separator
    Given the markup text "{~~before~>~>after~~}"
    When I compute the settled text
    Then the settled text is "~>after"

  # --- Parser: modifiedText correctness ---

  Scenario: Parser splits on first ~> only
    Given the markup text "{~~old~>new ~> more~~}"
    When I parse the markup
    Then there is 1 change
    And change 1 has original text "old"
    And change 1 has modified text "new ~> more"

  Scenario: Parser handles ~> at start of new text
    Given the markup text "{~~old~>~> new~~}"
    When I parse the markup
    Then there is 1 change
    And change 1 has original text "old"
    And change 1 has modified text "~> new"

  # --- settledLine (regex-based, single-line) ---

  Scenario: settledLine preserves ~> in substitution new text
    Given the single line "Use {~~old syntax~>new arrow ~> function~~} here."
    When I compute the settled line
    Then the settled line is "Use new arrow ~> function here."

  Scenario: settledLine handles ~> in code backticks
    Given the single line "The operator {~~is `=>`~>is `~>`~~} for substitution."
    When I compute the settled line
    Then the settled line is "The operator is `~>` for substitution."

  Scenario: settledLine handles multiple ~> in new text
    Given the single line "{~~A~>B ~> C ~> D~~} end."
    When I compute the settled line
    Then the settled line is "B ~> C ~> D end."

  Scenario: settledLine handles ~> as the entire new text
    Given the single line "{~~old~>~>~~} done"
    When I compute the settled line
    Then the settled line is "~> done"

  Scenario: settledLine handles ~> immediately after separator
    Given the single line "{~~before~>~>after~~}"
    When I compute the settled line
    Then the settled line is "~>after"
