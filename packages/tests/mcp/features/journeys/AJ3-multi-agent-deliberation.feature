Feature: Multi-agent deliberation
  As a team of AI agents with different roles
  I want to propose, discuss, and resolve changes collaboratively
  So the document benefits from diverse perspectives

  Background:
    Given a tracked file "architecture.md"
    And three agent identities: "ai:architect", "ai:security", "ai:performance"

  Scenario: Three agents propose and cross-review
    # Agent A proposes
    When agent "ai:architect" proposes changing "PostgreSQL" to "CockroachDB" with reasoning "Need horizontal scaling"
    Then ct-1 is created by ai:architect

    # Agent B comments with concern
    When agent "ai:security" responds to ct-1 thread with "CockroachDB has different encryption-at-rest defaults. Verify compliance." label "issue"
    Then the footnote has a discussion entry by ai:security

    # Agent C comments with data
    When agent "ai:performance" responds to ct-1 thread with "Benchmarks show 2x latency for cross-region queries. Consider the trade-off." label "thought"
    Then the footnote has 3 entries total (reasoning + 2 responses)

    # Agent B proposes alternative via cross-author amend (supersede)
    When agent "ai:security" tries to amend ct-1
    Then the cross-author amend succeeds as a supersede
    And the original change ct-1 is now rejected
    And the superseding change has "supersedes: ct-1" in its footnote

    # Agent B and Agent C approve the superseding change
    When agent "ai:security" approves the superseding change
    And agent "ai:performance" approves the superseding change
    Then the footnote contains 2 approval entries for the superseding change
    And the superseding change has status "accepted"

  Scenario: Competing proposals -- one accepted, one rejected
    When agent "ai:architect" proposes ct-1: change "monolith" to "microservices"
    And agent "ai:performance" proposes ct-2: change "monolith" to "modular monolith"
    And agent "ai:security" approves ct-2 and rejects ct-1
    Then ct-1 status is "rejected" and ct-2 status is "accepted"
    And both footnotes preserve their full deliberation history

  Scenario: Discussion thread reaches depth
    When 5 agents each respond to ct-1's thread
    Then the footnote contains 5 discussion entries (plus original reasoning = 6 total)
    And threading indentation reflects reply depth
    And get_change for ct-1 returns discussion_count = 6
