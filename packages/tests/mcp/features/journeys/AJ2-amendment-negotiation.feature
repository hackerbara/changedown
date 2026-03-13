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
    Then ct-1 is created as a substitution

    # Step 2: Reviewer gives feedback
    When agent "ai:reviewer" responds to ct-1 thread with "OAuth2 is good but we need to specify the grant type. Consider Authorization Code flow." label "suggestion"
    Then the footnote for ct-1 has 2 discussion entries (original + response)

    # Step 3: Original author amends
    When agent "ai:proposer" amends ct-1 with new_text "OAuth2 with Authorization Code flow" and reasoning "Incorporated reviewer suggestion"
    Then the inline markup shows the amended substitution
    And the footnote contains "revised @ai:proposer"
    And the footnote shows previous text "OAuth2"
    And the change ID is still ct-1

    # Step 4: Reviewer approves amended version
    When agent "ai:reviewer" approves ct-1 with reasoning "Looks good with grant type specified"
    Then the footnote status is "accepted"
    And the footnote contains "approved: @ai:reviewer"

    # Step 5: Settle
    When I call review_changes with settle = true
    Then the inline markup is removed
    And the document reads "OAuth2 with Authorization Code flow"
    And the footnote persists with full deliberation history

  Scenario: Multiple amendment rounds before acceptance
    When agent "ai:proposer" proposes a change (ct-1)
    And agent "ai:reviewer" requests changes on ct-1
    And agent "ai:proposer" amends ct-1 (round 1)
    And agent "ai:reviewer" requests changes again on ct-1
    And agent "ai:proposer" amends ct-1 (round 2)
    And agent "ai:reviewer" approves ct-1
    Then the footnote contains 2 "revised" entries
    And the footnote contains 2 "request-changes" entries
    And the final inline text reflects round 2 amendment

  Scenario: Amendment rejected -- original author proposes new change instead
    When agent "ai:proposer" proposes ct-1
    And agent "ai:reviewer" rejects ct-1 with reasoning "Wrong approach entirely"
    Then ct-1 status is "rejected"
    When agent "ai:proposer" proposes a new change ct-2 with different approach
    Then ct-2 is independent from ct-1
    And both footnotes exist in the file
