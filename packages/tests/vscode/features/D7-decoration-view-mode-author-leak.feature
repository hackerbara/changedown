@fast @D7
Feature: D7 -- Per-author decorations cleared on view mode switch
  When switching from a mode that renders per-author decoration types
  (e.g. review/markup) to a mode that does not (e.g. final/original),
  old per-author decoration types must be explicitly cleared. Otherwise
  stale colored text persists on the editor.

  # ── Bug reproduction: author decorations leak across view modes ──

  Scenario: Markup → Final clears per-author decoration types
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then total setDecorations calls is 23
    When I re-decorate the manual changes in final mode
    Then total setDecorations calls is 23
    And author decoration call 22 has 0 ranges

  Scenario: Markup → Original clears per-author decoration types
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then total setDecorations calls is 23
    When I re-decorate the manual changes in original mode
    Then total setDecorations calls is 23
    And author decoration call 22 has 0 ranges

  Scenario: Two authors in markup → Final clears both author types
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then total setDecorations calls is 24
    When I re-decorate the manual changes in final mode
    Then total setDecorations calls is 24
    And author decoration call 22 has 0 ranges
    And author decoration call 22 has 0 ranges

  Scenario: Auto mode two authors → Final clears author types
    Given author colors mode "auto"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then total setDecorations calls is 24
    When I re-decorate the manual changes in final mode
    Then total setDecorations calls is 24
    And author decoration call 22 has 0 ranges
    And author decoration call 22 has 0 ranges

  Scenario: Markup → Simple clears per-author decorations (settled-base, cursor far away)
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then total setDecorations calls is 24
    When I re-decorate the manual changes in smart view mode
    Then total setDecorations calls is 24
    And author decoration call 22 has 0 ranges
    And author decoration call 22 has 0 ranges

  Scenario: Final → Markup restores per-author decorations after clearing
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in final mode
    Then total setDecorations calls is 22
    When I re-decorate the manual changes in markup mode
    Then total setDecorations calls is 23
    And author decoration call 22 has 1 ranges
