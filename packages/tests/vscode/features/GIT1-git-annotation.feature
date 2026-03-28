@integration @git @GIT1
Feature: GIT1 — Git integration, annotation command, and auto-annotate
  As a ChangeDown user with git-tracked files
  I want to annotate changes from git history
  So that I can review what changed since the last commit

  # ── getPreviousVersion ─────────────────────────────────────────────

  Scenario: Returns previous version for uncommitted changes
    Given a git repo with file "test.md" committed as "Initial content\n"
    And a second commit with content "Initial content\nSecond line\n"
    When I modify the file to "Initial content\nSecond line\nThird line\n"
    And I get the previous version
    Then the previous version old text is "Initial content\nSecond line\n"

  Scenario: Returns previous version for committed file
    Given a git repo with file "test.md" committed as "Initial content\n"
    And a second commit with content "Initial content\nSecond line\n"
    And a third commit with content "Initial content\nSecond line\nThird line\n"
    When I get the previous version
    Then the previous version old text is "Initial content\nSecond line\n"
    And the previous version author is "Test User"
    And the previous version has a date

  Scenario: Returns empty string for new untracked file
    Given a git repo with file "test.md" committed as "Initial content\n"
    When I create a new untracked file "new.md" with content "New content\n"
    And I get the previous version of "new.md"
    Then the previous version old text is ""

  Scenario: Returns empty string for file created in first commit
    Given a git repo with file "first.md" committed as "First commit content\n"
    When I get the previous version
    Then the previous version old text is ""
    And the previous version author is "Test User"

  Scenario: Returns undefined for file not in git repo
    Given a file outside any git repo
    When I get the previous version
    Then the previous version is undefined

  # ── annotateFromGit ────────────────────────────────────────────────

  Scenario: Returns false for unsaved file with non-file scheme
    Given an untitled document with content "Test content"
    When I run annotateFromGit on the editor
    Then annotateFromGit returns false

  Scenario: Returns false for already annotated file with sidecar block
    Given a git repo with Python file "test.py" containing sidecar block
    When I run annotateFromGit on the editor
    Then annotateFromGit returns false

  Scenario: Returns false for already annotated file with CriticMarkup
    Given a git repo with markdown file "annotated.md" containing CriticMarkup
    When I run annotateFromGit on the editor
    Then annotateFromGit returns false

  Scenario: Returns false when file has no git history
    Given a file outside any git repo
    When I run annotateFromGit on the editor
    Then annotateFromGit returns false

  Scenario: Annotates markdown file with CriticMarkup
    Given a git repo with file "test.md" committed as "Hello world\n"
    When I modify the file to "Hello world!\nNew line here\n"
    And I run annotateFromGit on the editor
    Then annotateFromGit returns true
    And the document contains CriticMarkup annotations

  Scenario: Annotates Python file with sidecar annotations
    Given a git repo with file "script.py" committed as "def hello():\n    print(\"hello\")\n"
    When I modify the file to "def hello():\n    print(\"hello world\")\n"
    And I run annotateFromGit on the editor
    Then annotateFromGit returns true
    And the document contains sidecar block "# -- ChangeDown"
    And the git document contains "# cn-"

  Scenario: Returns false for unsupported language
    Given a git repo with file "data.bin" committed as "binary content\n"
    When I modify the file to "binary content updated\n"
    And I run annotateFromGit on the editor
    Then annotateFromGit returns false

  Scenario: Persists annotations to disk when configured
    Given a git repo with file "persist.md" committed as "Original text\n"
    And persistAnnotations config is true
    When I modify the file to "Original text\nAdded line\n"
    And I run annotateFromGit on the editor
    Then annotateFromGit returns true
    And the document is not dirty

  # ── Auto-annotate on file open ─────────────────────────────────────

  Scenario: Auto-annotates when annotateOnOpen is true
    Given a git repo with file "auto.md" committed as "Original text\n"
    And annotateOnOpen config is true
    When I modify the file to "Original text\nNew line added\n"
    And I open the file in the editor
    Then the document contains CriticMarkup annotations

  Scenario: Does not auto-annotate when annotateOnOpen is false
    Given a git repo with file "test.md" committed as "Hello world\n"
    And annotateOnOpen config is false
    When I modify the file to "Hello world!\nNew content\n"
    And I open the file in the editor
    Then the document does not contain CriticMarkup annotations
    And the document does not contain sidecar block

  Scenario: Skips already-annotated files
    Given a git repo with file "already-annotated.md" committed as "Text with {++insertion++}\n"
    And annotateOnOpen config is true
    When I open the file in the editor
    Then the document content is unchanged

  Scenario: Skips non-file scheme documents
    Given annotateOnOpen config is true
    And an untitled document with content "Untitled content\n"
    When I wait for potential auto-annotation
    Then the document content is "Untitled content\n"

  Scenario: Skips code files with sidecar blocks
    Given a git repo with Python file "with-sidecar.py" containing sidecar block
    And annotateOnOpen config is true
    When I open the file in the editor
    Then the document content is unchanged

  # ── SCM integration ────────────────────────────────────────────────

  Scenario: scmIntegrationMode configuration is valid
    Then the scmIntegrationMode config value is one of "scm-first,hybrid,legacy"

  Scenario: SCM commands are registered
    Then the command "changedown.openDiffForResource" is registered
    And the command "changedown.acceptAllInFile" is registered
    And the command "changedown.rejectAllInFile" is registered

  # ── Code file annotations ──────────────────────────────────────────

  Scenario: Python file with sidecar annotations supports accept
    Given the fixture file "annotated.py" is open in the editor
    When I position cursor at line 0 character 18
    And I run acceptChangeAtCursor
    Then the document text changed

  Scenario: Code file annotations support navigation
    Given the fixture file "annotated.py" is open in the editor
    When I position cursor at line 0 character 0
    And I run nextChange
    Then the cursor position changed

  Scenario: Markdown files still work after code file support
    Given the fixture file "all-markup-types.md" is open in the editor
    When I position cursor at line 0 character 0
    And I run nextChange
    Then the cursor position changed
