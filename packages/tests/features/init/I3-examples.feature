Feature: I3 - Example Files
  Copy bundled example files into a project directory.

  @fast @I3
  Scenario: Creates examples directory and getting-started.md
    Given a temporary empty directory
    When I copy examples to that directory
    Then the file "examples/getting-started.md" exists in that directory
    And the example file contains "ctrcks.com/v1: tracked"
    And the example file contains "Getting Started"
    And the example file contains "{++This text was added by a collaborator.++}"
    And the example file contains "{--This paragraph was removed during editing.--}"

  @fast @I3
  Scenario: Does not overwrite existing getting-started.md
    Given a temporary empty directory
    And the file "examples/getting-started.md" already exists with content "custom content"
    When I copy examples to that directory
    Then the init file "examples/getting-started.md" contains "custom content"

  @fast @I3
  Scenario: Creates examples subdirectory if it does not exist
    Given a temporary empty directory
    When I copy examples to that directory
    Then the directory "examples" exists in that directory

  @fast @I3
  Scenario: Getting-started file showcases multiple authors and all change types
    Given a temporary empty directory
    When I copy examples to that directory
    Then the example file contains "alice"
    And the example file contains "bob"
    And the example file contains "ai:claude-opus-4.6"
    And the example file contains "{++"
    And the example file contains "{--"
    And the example file contains "{~~"
    And the example file contains "{=="
    And the example file contains "{>>"
    And the example file contains "[^ct-1]"
    And the example file contains "In your editor"
    And the example file contains "With an AI agent"
    And the example file contains "From the command line"
