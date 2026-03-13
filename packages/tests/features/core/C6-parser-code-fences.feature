Feature: Parser — Code Fence Awareness
  As a consumer of the CriticMarkup parser
  I want CriticMarkup inside code blocks to be ignored
  So that documented syntax examples are not treated as real changes

  # --- Fenced code blocks ---

  Scenario: Backtick fence suppresses CriticMarkup
    Given the text "```\n{++not a change++}\n```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Tilde fence suppresses CriticMarkup
    Given the text "~~~\n{++not a change++}\n~~~\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Fence with info string suppresses CriticMarkup
    Given the text "```javascript\n{++not a change++}\n```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Real change BEFORE fence is parsed
    Given the text "Real {++change++}\n```\n{++not a change++}\n```\n"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "change"

  Scenario: Real change AFTER fence is parsed
    Given the text "```\n{++not a change++}\n```\n{++real++}\n"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real"

  Scenario: Unclosed fence extends to end of document
    Given the text "```\n{++everything after unclosed fence is code++}\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Longer fence requires matching close length
    Given the text "````\n{++still in fence++}\n```\n{++still in fence too++}\n````\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Nested backtick inside tilde fence is content
    Given the text "~~~\n```\n{++inside both fences++}\n```\n~~~\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Changes before, between, and after fences
    Given the text "{--deleted--}\n```\n{++code example++}\n```\n{++real insertion++}\n"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Deletion"
    And change 1 has original text "deleted"
    And change 2 is type "Insertion"
    And change 2 has modified text "real insertion"

  Scenario: Substitution syntax inside tilde fence is ignored
    Given the text "~~~\n{~~old~>new~~}\n~~~\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Fence with trailing whitespace on close still closes
    Given the text "```\n{++code++}\n```   \n{++real++}\n"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real"

  Scenario: Backtick fence does not close with tildes
    Given the text "```\n{++still in fence++}\n~~~\n{++still in fence too++}\n```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Tilde fence does not close with backticks
    Given the text "~~~\n{++still in fence++}\n```\n{++still in fence too++}\n~~~\n"
    When I parse the text
    Then there are 0 changes

  # --- Inline code spans ---

  Scenario: Single-backtick inline code suppresses CriticMarkup
    Given the text "The syntax `{++text++}` for additions."
    When I parse the text
    Then there are 0 changes

  Scenario: Double-backtick inline code suppresses CriticMarkup
    Given the text "Use ``{++text++}`` for additions."
    When I parse the text
    Then there are 0 changes

  Scenario: Triple-backtick inline code suppresses CriticMarkup
    Given the text "Use ```{++text++}``` for additions."
    When I parse the text
    Then there are 0 changes

  Scenario: Unmatched backtick does not suppress CriticMarkup
    Given the text "Some `unmatched backtick and {++real change++}"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real change"

  Scenario: Multiple inline code spans on one line
    Given the text "`{++a++}` and `{--b--}` and {++real++}"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real"

  Scenario: Deletion inside inline code is ignored
    Given the text "Use `{--deletion syntax--}` to remove text."
    When I parse the text
    Then there are 0 changes

  Scenario: Substitution inside inline code is ignored
    Given the text "Use `{~~old~>new~~}` for substitutions."
    When I parse the text
    Then there are 0 changes

  Scenario: Highlight inside inline code is ignored
    Given the text "Use `{==text==}` for highlights."
    When I parse the text
    Then there are 0 changes

  Scenario: Comment inside inline code is ignored
    Given the text "Use `{>>note<<}` for comments."
    When I parse the text
    Then there are 0 changes

  # --- Mixed scenarios ---

  Scenario: Real changes plus code fences plus inline code together
    Given the text "{++real insertion++}\n```\n{++fenced code++}\n```\nUse `{--inline code--}` syntax.\n{--real deletion--}\n"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Insertion"
    And change 1 has modified text "real insertion"
    And change 2 is type "Deletion"
    And change 2 has original text "real deletion"

  Scenario: CriticMarkup cheatsheet document
    Given the text "# CriticMarkup Cheatsheet\n\nUse `{++inserted text++}` for additions.\n\n```javascript\nconst example = \"{++not a real insertion++}\";\n```\n\nInline: backtick-wrapped `{--also not real--}` should be left alone.\n\nThis is a {++real change++} in the document.\n"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real change"

  Scenario: Fence at very start of document
    Given the text "```\n{++code++}\n```"
    When I parse the text
    Then there are 0 changes

  Scenario: Inline code at very start of document
    Given the text "`{++code++}` rest"
    When I parse the text
    Then there are 0 changes

  # --- Additional code fence gap coverage ---

  Scenario: Fence with up to 3 leading spaces still treated as fence
    Given the text "   ```\n{++indented fence++}\n   ```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: 4-space indented backticks NOT a fence (indented code block)
    Given the text "    ```\n{++not a fence with 4 spaces++}\n    ```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Closing fence with trailing content is NOT a close
    Given the text "```\n{++still code++}\n``` not a close\n{++still code too++}\n```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Inline code does not start inside a fenced block
    Given the text "```\n`{++inside fence++}`\n```\n"
    When I parse the text
    Then there are 0 changes

  Scenario: Footnote defs outside code blocks still parse correctly
    Given the text "{++added text++}[^ct-1]\n\n```\n{++not a change++}\n```\n\n[^ct-1]: @alice | 2026-02-10 | ins | pending"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"

  Scenario: Real change immediately adjacent to fence boundary
    Given the text "```\ncode\n```\n{++real++}"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "real"
