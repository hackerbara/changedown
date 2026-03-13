Feature: I6 — Gitignore handling
  Init manages .gitignore entries for ChangeTracks transient state files.

  @fast @I6
  Scenario: Appends entries to existing .gitignore
    Given a project directory with a .gitignore containing "node_modules/"
    When I call ensureGitignoreEntries on the project directory
    Then the .gitignore contains "# ChangeTracks transient state"
    And the .gitignore contains ".changetracks/pending.json"
    And the .gitignore still contains "node_modules/"

  @fast @I6
  Scenario: Does not duplicate entries if already present
    Given a project directory with a .gitignore containing ".changetracks/pending.json"
    When I call ensureGitignoreEntries on the project directory
    Then the .gitignore contains exactly 1 line matching ".changetracks/pending.json"

  @fast @I6
  Scenario: Creates new .gitignore when requested
    Given a project directory with no .gitignore
    When I call createGitignore on the project directory
    Then a .gitignore file exists
    And the .gitignore contains "# ChangeTracks transient state"
    And the .gitignore contains ".changetracks/pending.json"

  @fast @I6
  Scenario: Reports whether .gitignore existed
    Given a project directory with a .gitignore containing "node_modules/"
    When I call ensureGitignoreEntries on the project directory
    Then the result action is "appended"

  @fast @I6
  Scenario: Reports creation when .gitignore is new
    Given a project directory with no .gitignore
    When I call createGitignore on the project directory
    Then the result action is "created"
