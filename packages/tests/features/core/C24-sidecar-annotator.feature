@core @sidecar-annotator @C24
Feature: C24 — Sidecar Annotator
  annotateSidecar produces language-aware sidecar annotations for code files.

  It uses diffLines for line-level diffs, then emits deletion markers and
  insertion tags using the language's line-comment syntax. Adjacent remove+add
  produce substitution pairs sharing the same cn-N tag.

  A sidecar metadata block is appended at the bottom of the file.

  # ── Unsupported languages ─────────────────────────────────────────

  Scenario: Returns undefined for markdown (unsupported)
    Given the original sidecar text is "x = 1"
    When the sidecar text is changed to "y = 2" for language "markdown"
    Then the sidecar result is undefined

  Scenario: Returns undefined for unknown language
    Given the original sidecar text is "x = 1"
    When the sidecar text is changed to "y = 2" for language "brainfuck"
    Then the sidecar result is undefined

  # ── Identical texts ───────────────────────────────────────────────

  Scenario: Identical texts return unchanged
    Given the original sidecar text is "x = 1\ny = 2\n"
    When the sidecar text is changed to "x = 1\ny = 2\n" for language "python"
    Then the sidecar result equals the new text

  # ── Single line changes (Python) ──────────────────────────────────

  Scenario: Single line insertion in Python
    Given the original sidecar text:
      """
      x = 1
      y = 2
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      x = 1
      z = 3
      y = 2
      """
    Then the sidecar result contains "z = 3  # cn-1"
    And the sidecar result contains "# [^cn-1]: ins | pending"

  Scenario: Single line deletion in Python
    Given the original sidecar text:
      """
      x = 1
      y = 2
      z = 3
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      x = 1
      z = 3
      """
    Then the sidecar result contains "# - y = 2  # cn-1"
    And the sidecar result contains "# [^cn-1]: del | pending"

  Scenario: Single line substitution in Python
    Given the original sidecar text:
      """
      x = 1
      results = []
      z = 3
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      x = 1
      results = {}
      z = 3
      """
    Then the sidecar result contains "# - results = []  # cn-1"
    And the sidecar result contains "results = {}  # cn-1"
    And the sidecar result contains "# [^cn-1]: sub | pending"

  # ── Language-specific comment syntax ──────────────────────────────

  Scenario: JavaScript line comment syntax uses double-slash
    Given the original sidecar text:
      """
      const x = 1;
      const y = 2;
      """
    And the sidecar language is "javascript"
    When the sidecar text is changed to:
      """
      const x = 1;
      const z = 3;
      const y = 2;
      """
    Then the sidecar result contains "const z = 3;  // cn-1"
    And the sidecar result contains "// [^cn-1]: ins | pending"

  Scenario: Ruby uses hash comment syntax
    Given the original sidecar text:
      """
      x = 1
      y = 2
      z = 3
      """
    And the sidecar language is "ruby"
    When the sidecar text is changed to:
      """
      x = 1
      z = 3
      """
    Then the sidecar result contains "# - y = 2  # cn-1"
    And the sidecar result contains "# [^cn-1]: del | pending"

  # ── Multi-line changes ────────────────────────────────────────────

  Scenario: Multi-line deletion shows plus-N-more-lines in sidecar block
    Given the original sidecar text:
      """
      a = 1
      b = 2
      c = 3
      d = 4
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      a = 1
      d = 4
      """
    Then the sidecar result contains "# - b = 2  # cn-1"
    And the sidecar result contains "# - c = 3  # cn-1"
    And the sidecar result contains "+1 more lines"

  Scenario: Multi-line insertion tags each line with same cn-N
    Given the original sidecar text:
      """
      a = 1
      d = 4
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      a = 1
      b = 2
      c = 3
      d = 4
      """
    Then the sidecar result contains "b = 2  # cn-1"
    And the sidecar result contains "c = 3  # cn-1"
    And the sidecar result contains "# [^cn-1]: ins | pending"

  # ── Sequential numbering ──────────────────────────────────────────

  Scenario: Multiple changes produce sequential cn-N tags
    Given the original sidecar text:
      """
      a = 1
      b = 2
      c = 3
      d = 4
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      a = 1
      c = 3
      e = 5
      """
    Then the sidecar result contains "cn-1"
    And the sidecar result contains "cn-2"
    And the sidecar result contains "# [^cn-1]:"
    And the sidecar result contains "# [^cn-2]:"

  # ── Sidecar block structure ───────────────────────────────────────

  Scenario: Sidecar block has correct marker line
    Given the original sidecar text:
      """
      x = 1
      """
    And the sidecar language is "python"
    When the sidecar text is changed to:
      """
      y = 2
      """
    Then the sidecar result contains "# -- ChangeDown"

  # ── Metadata ──────────────────────────────────────────────────────

  Scenario: Metadata author included when provided
    Given the original sidecar text:
      """
      x = 1
      """
    And the sidecar language is "python"
    And the sidecar metadata author is "jane"
    When the sidecar text is changed to:
      """
      y = 2
      """
    Then the sidecar result contains "#     author: jane"

  Scenario: Metadata date included when provided
    Given the original sidecar text:
      """
      x = 1
      """
    And the sidecar language is "python"
    And the sidecar metadata date is "2026-02-08"
    When the sidecar text is changed to:
      """
      y = 2
      """
    Then the sidecar result contains "#     date: 2026-02-08"
