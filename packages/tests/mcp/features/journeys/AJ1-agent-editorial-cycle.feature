Feature: Agent editorial cycle (orient -> propose -> review -> settle)
  As an AI agent performing a copy-editing task
  I want to read a document, propose improvements, review my own work, and settle
  So the full editorial lifecycle works end-to-end

  Background:
    Given a tracked markdown file "article.md" with content:
      """
      # Caching Strategy

      The system uses no caching. All requests hit the database directly.
      Response times average 500ms under load.
      The API has no rate limiting.
      """
    And the config has:
      | protocol.mode              | classic     |
      | author.default             | ai:editor   |
      | settlement.auto_on_approve | true        |
      | hashline.enabled           | true        |

  Scenario: Full editorial pass -- read, batch propose, self-review, settle
    # Phase 1: Orient
    When I call read_tracked_file with view = "meta"
    Then the response shows 0 proposed changes
    And the document content is returned

    # Phase 2: Propose batch
    When I call propose_change with a changes array:
      | old_text                          | new_text                                  | reasoning                     |
      | no caching                        | Redis caching with 5-minute TTL           | Reduce DB load                |
      | 500ms                             | 50ms                                      | Caching brings p99 under 100ms |
      | no rate limiting                  | rate limiting at 1000 req/min             | Prevent abuse                 |
    Then the response contains grouped IDs ct-1.1, ct-1.2, ct-1.3
    And the file contains 3 CriticMarkup substitutions
    And all 3 footnotes exist with status "proposed"

    # Phase 3: Verify via read
    When I call read_tracked_file with view = "meta"
    Then the response shows 3 proposed changes
    And the inline annotations show each change at its location

    # Phase 4: Self-review (approve all)
    When I call review_changes approving ct-1.1, ct-1.2, ct-1.3
    Then all 3 changes are accepted
    And auto-settlement removes inline markup (Layer 1)

    # Phase 5: Verify clean state
    When I call read_tracked_file with view = "content"
    Then the document contains "Redis caching with 5-minute TTL"
    And the document contains "50ms"
    And the document contains "rate limiting at 1000 req/min"
    And no CriticMarkup delimiters appear in the body
    And 3 footnotes persist with status "accepted"

  Scenario: Editorial pass on committed view (Surface E)
    # Phase 1: Orient via committed view
    When I call read_tracked_file with view = "committed"
    Then LINE:HASH coordinates are present
    And no CriticMarkup delimiters appear

    # Phase 2: Propose using hash coordinates
    When I propose a substitution using line:hash from the read
    Then the change is applied correctly

    # Phase 3: Re-read committed view
    When I call read_tracked_file with view = "committed"
    Then the pending change appears with [P] marker
    And the original text is shown (pending reverted)

    # Phase 4: Approve and settle
    When I approve and settle the change
    Then the committed view shows the new text without markers

  Scenario: Sequential single changes (non-batch) across full cycle
    When I propose change 1 (substitution)
    And I read the file to verify
    And I propose change 2 (insertion)
    And I read the file to verify
    And I approve both changes
    Then the file has 2 accepted footnotes
    And the settled text reflects both changes
