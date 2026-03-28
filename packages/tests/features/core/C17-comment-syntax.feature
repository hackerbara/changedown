@core @comment-syntax
Feature: Comment syntax — language-aware sidecar annotations
  The comment-syntax module maps VS Code language IDs to line-comment prefixes
  and provides wrap/strip functions for sidecar annotation markers on code lines.

  # --- getCommentSyntax ---

  Scenario: Python uses hash comment
    When I get comment syntax for "python"
    Then the comment prefix is "#"

  Scenario: TypeScript uses double-slash comment
    When I get comment syntax for "typescript"
    Then the comment prefix is "//"

  Scenario: JavaScript uses double-slash comment
    When I get comment syntax for "javascript"
    Then the comment prefix is "//"

  Scenario: Go uses double-slash comment
    When I get comment syntax for "go"
    Then the comment prefix is "//"

  Scenario: Rust uses double-slash comment
    When I get comment syntax for "rust"
    Then the comment prefix is "//"

  Scenario: Ruby uses hash comment
    When I get comment syntax for "ruby"
    Then the comment prefix is "#"

  Scenario: Lua uses double-dash comment
    When I get comment syntax for "lua"
    Then the comment prefix is "--"

  Scenario: Unknown language returns no syntax
    When I get comment syntax for "brainfuck"
    Then the comment syntax is undefined

  Scenario: Markdown returns no syntax
    When I get comment syntax for "markdown"
    Then the comment syntax is undefined

  # --- wrapLineComment ---

  Scenario: Wrap deletion in Python
    When I wrap "x = 1" as deletion with tag "cn-1" for language "#"
    Then the wrapped line is "# - x = 1  # cn-1"

  Scenario: Wrap insertion in Python
    When I wrap "y = 2" as insertion with tag "cn-3" for language "#"
    Then the wrapped line is "y = 2  # cn-3"

  Scenario: Wrap deletion in TypeScript
    When I wrap "const x = 1;" as deletion with tag "cn-2" for language "//"
    Then the wrapped line is "// - const x = 1;  // cn-2"

  Scenario: Wrap preserves indentation for deletion
    When I wrap "    x = 1" as deletion with tag "cn-5" for language "#"
    Then the wrapped line is "    # - x = 1  # cn-5"

  # --- stripLineComment ---

  Scenario: Strip deletion line in Python
    When I strip "# - x = 1  # cn-1" with prefix "#"
    Then the stripped code is "x = 1"
    And the stripped tag is "cn-1"
    And the stripped line is a deletion

  Scenario: Strip insertion line in Python
    When I strip "y = 2  # cn-3" with prefix "#"
    Then the stripped code is "y = 2"
    And the stripped tag is "cn-3"
    And the stripped line is not a deletion

  Scenario: Strip returns null for line without sc tag
    When I strip "x = 1" with prefix "#"
    Then the strip result is null

  Scenario: Strip handles dotted sc IDs
    When I strip "y = 2  # cn-17.3" with prefix "#"
    Then the stripped tag is "cn-17.3"
    And the stripped line is not a deletion

  # --- Additional comment syntax gap coverage ---

  Scenario: Shellscript uses hash comment
    When I get comment syntax for "shellscript"
    Then the comment prefix is "#"

  Scenario: Wrap insertion in TypeScript
    When I wrap "const y = 2;" as insertion with tag "cn-4" for language "//"
    Then the wrapped line is "const y = 2;  // cn-4"

  Scenario: Wrap preserves indentation for insertion
    When I wrap "    y = 2" as insertion with tag "cn-6" for language "#"
    Then the wrapped line is "    y = 2  # cn-6"

  Scenario: Wrap preserves tab indentation for deletion in TypeScript
    When I wrap "\tconst x = 1;" as deletion with tag "cn-7" for language "//"
    Then the wrapped line is "\t// - const x = 1;  // cn-7"

  Scenario: Wrap preserves tab indentation for insertion in TypeScript
    When I wrap "\tconst y = 2;" as insertion with tag "cn-8" for language "//"
    Then the wrapped line is "\tconst y = 2;  // cn-8"

  Scenario: Strip indented deletion in TypeScript
    When I strip "    // - const x = 1;  // cn-5" with prefix "//"
    Then the stripped code is "const x = 1;"
    And the stripped tag is "cn-5"
    And the stripped line is a deletion

  Scenario: Strip returns null for regular comment without sc tag
    When I strip "# this is a normal comment" with prefix "#"
    Then the strip result is null
