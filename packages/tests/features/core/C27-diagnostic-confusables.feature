@core @diagnostic-confusables
Feature: Diagnostic confusable detection in text matching
  When findUniqueMatch fails at all 5 levels, a diagnostic-only confusable
  check runs. If the target would match under confusable normalization, the
  error message reports exact codepoints, character names, and copy-pasteable
  file text. Confusable normalization is NEVER applied to actual matching.

  Scenario: Em dash vs hyphen produces diagnostic error
    Given a document text with em dash "Running \u2014 STUB=true"
    When I search for "Running - STUB=true" with normalizer
    Then the search throws a confusable error mentioning "EM DASH" and "HYPHEN-MINUS"
    And the error includes codepoint "U+2014"
    And the error includes copy-pasteable file text

  Scenario: Smart double quotes produce diagnostic error
    Given a document text with smart quotes "She said \u201Chello\u201D today"
    When I search for "She said \"hello\" today" with normalizer
    Then the search throws a confusable error mentioning "LEFT DOUBLE QUOTATION MARK"
    And the error includes codepoint "U+201C"

  Scenario: No confusable match gives generic error
    Given a document text "Hello world."
    When I search for "completely missing" with normalizer
    Then the search throws a not-found error

  Scenario: En dash vs hyphen produces diagnostic error
    Given a document text with en dash "2020\u20132025 report"
    When I search for "2020-2025 report" with normalizer
    Then the search throws a confusable error mentioning "EN DASH"

  Scenario: Right smart quote vs ASCII apostrophe produces diagnostic error
    Given a document text with smart quotes "it\u2019s working"
    When I search for "it's working" with normalizer
    Then the search throws a confusable error mentioning "RIGHT SINGLE QUOTATION MARK"
