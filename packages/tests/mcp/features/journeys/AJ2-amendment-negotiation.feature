Feature: Amendment negotiation cycle
  As an AI agent receiving feedback on a proposal
  I want to amend my change based on reviewer comments
  So the proposal evolves through deliberation

  Background:
    Given a tracked file "design.md" with content:
      """
      # Auth Design

      The API uses basic authentication for all endpoints.
      """
    And the config has:
      | author.default             | ai:proposer  |
      | settlement.auto_on_approve | false         |

  Scenario: Propose -> feedback -> amend -> approve -> settle
    # Step 1: Agent proposes
    When agent "ai:proposer" proposes changing "basic authentication" to "OAuth2" with reasoning "Modern auth standard"
    Then cn-1 is created as a substitution

    # Step 2: Reviewer gives feedback
    When agent "ai:reviewer" responds to cn-1 thread with "OAuth2 is good but we need to specify the grant type. Consider Authorization Code flow." label "suggestion"
    Then the footnote for cn-1 has 2 discussion entries (original + response)

    # Step 3: Original author amends (supersede semantics)
    When agent "ai:proposer" amends cn-1 with new_text "OAuth2 with Authorization Code flow" and reasoning "Incorporated reviewer suggestion"
    Then the amend created a new superseding change
    And the original change cn-1 is now rejected
    And the superseding change has "supersedes: cn-1" in its footnote
    And the original change has "superseded-by" in its footnote

    # Step 4: Reviewer approves the superseding change (cn-2)
    When agent "ai:reviewer" approves the superseding change with reasoning "Looks good with grant type specified"
    Then the superseding change has status "accepted"

    # Step 5: Settle
    When I call review_changes with settle = true
    Then the inline markup is removed
    And the document reads "OAuth2 with Authorization Code flow"
    And the footnote persists with full deliberation history

  Scenario: Multiple amendment rounds before acceptance
    When agent "ai:proposer" proposes a change (cn-1)
    And agent "ai:reviewer" requests changes on cn-1
    And agent "ai:proposer" amends the latest change (round 1 supersede)
    And agent "ai:reviewer" requests changes on the latest superseding change
    And agent "ai:proposer" amends the latest change (round 2 supersede)
    And agent "ai:reviewer" approves the latest superseding change
    Then the supersede chain has 2 rejected predecessors
    And the latest superseding change has status "accepted"
    And the final inline text reflects round 2 amendment

  Scenario: Amendment rejected -- original author proposes new change instead
    When agent "ai:proposer" proposes cn-1
    And agent "ai:reviewer" rejects cn-1 with reasoning "Wrong approach entirely"
    Then cn-1 status is "rejected"
    When agent "ai:proposer" proposes a new change cn-2 with different approach
    Then cn-2 is independent from cn-1
    And both footnotes exist in the file
