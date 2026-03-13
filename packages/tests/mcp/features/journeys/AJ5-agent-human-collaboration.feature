Feature: Agent-human collaboration across surfaces
  As a team of AI agents and human editors
  I want changes proposed by agents to be reviewable by humans (and vice versa)
  So the deliberation protocol works across both surfaces

  Background:
    Given a tracked file "shared.md" with content:
      """
      # Shared Document

      The deployment uses manual processes.
      Monitoring is done via server logs.
      """

  Scenario: Agent proposes via MCP -> Human reviews in VS Code
    # Agent side (MCP handler)
    When agent "ai:assistant" proposes changing "manual processes" to "CI/CD pipeline"
    Then the file contains CriticMarkup substitution with footnote ct-1

    # Human side (VS Code extension -- verified via file state)
    When the VS Code extension parses the file
    Then the parser finds 1 substitution change
    And the change has id "ct-1"
    And the Change Explorer shows 1 proposed change

    # Human accepts via extension (simulated via core accept operation)
    When the human accepts ct-1 via the core accept function
    Then the file contains "CI/CD pipeline" without CriticMarkup delimiters
    And the footnote status is "accepted"

    # Agent verifies the result
    When agent reads the file with view = "meta"
    Then the meta view shows 0 proposed, 1 accepted

  Scenario: Human tracks changes -> Agent reads and reviews
    # Human side: tracking mode wraps edits
    Given the file has human-authored tracking markup:
      """
      The deployment uses {~~manual processes~>automated deployment~~}[^ct-1].
      {++Alerts are sent via PagerDuty.++}[^ct-2]

      [^ct-1]: @human-editor | 2026-02-20 | sub | proposed
          Manual deploys are error-prone
      [^ct-2]: @human-editor | 2026-02-20 | ins | proposed
          Need alerting beyond logs
      """

    # Agent reads and reviews
    When agent "ai:reviewer" reads with view = "meta"
    Then the meta view shows 2 proposed changes by @human-editor

    When agent "ai:reviewer" calls get_change for ct-1
    Then the response contains the reasoning "Manual deploys are error-prone"

    When agent "ai:reviewer" approves ct-1 with reasoning "Good practice"
    And agent "ai:reviewer" responds to ct-2 with "Consider also adding Datadog APM" label "suggestion"
    Then ct-1 status is "accepted"
    And ct-2 has a new discussion entry from ai:reviewer

    # Human sees agent's review in VS Code
    When the VS Code extension parses the updated file
    Then ct-1 shows as accepted
    And ct-2's comment thread contains the agent's suggestion

  Scenario: Round-trip -- agent proposes, human comments, agent amends, human accepts
    When agent "ai:assistant" proposes ct-1
    And human adds a comment to ct-1 footnote
    And agent reads the file and sees the comment via get_change
    And agent amends ct-1 incorporating feedback
    And human accepts the amended ct-1 via core accept
    Then the file is clean with the final amended text
    And the footnote contains the full deliberation trail
