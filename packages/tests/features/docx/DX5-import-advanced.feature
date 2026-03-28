@docx
Feature: DX5 - Advanced Import Scenarios
  As a user importing complex DOCX files,
  I need the importer to handle multiple authors, various fixtures,
  multi-paragraph changes, and produce correct footnote metadata.

  Background:
    Given pandoc is available on PATH

  @import @fast
  Scenario: Import preserves multiple authors
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the import stats list at least 1 author

  @import @fast
  Scenario: Import tracking header present in output
    Given a DOCX fixture "word-online-minimal-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the imported markdown contains "changedown.com/v1"

  @import @fast
  Scenario: Import handles multi-paragraph insertions
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the markdown contains CriticMarkup insertions

  @import @fast
  Scenario: Import handles multi-paragraph deletions
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the imported markdown contains "{--"

  @import @fast
  Scenario: Import with substitution merging disabled keeps separate del and ins
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file with substitution merging disabled
    Then the import succeeds
    And the import stats show 0 substitutions

  @import @fast
  Scenario: Import stats author list is deduplicated
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the import stats authors are unique

  @import @slow
  Scenario: Import from stress-test fixture
    Given a DOCX fixture "stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the import stats show at least 1 tracked change

  @import @fast
  Scenario: Import from mid-test fixture
    Given a DOCX fixture "word-online-mid-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the import stats show at least 1 tracked change

  @import @fast
  Scenario: Import from spec-fixture-v2.docx
    Given a DOCX fixture "spec-fixture-v2.docx"
    When I import the DOCX file
    Then the import succeeds

  @import @fast
  Scenario: Import markdown structure preserves document structure
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the imported markdown contains "Overview"

  @import @fast
  Scenario: Import footnote metadata has correct type fields
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file with substitution merging enabled
    Then the import succeeds
    And the imported markdown footnotes contain type "ins" or "del" or "sub" or "comment"

  @import @fast
  Scenario: Import footnote metadata has proposed status
    Given a DOCX fixture "word-online-minimal-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the imported markdown footnotes all have status "proposed"
