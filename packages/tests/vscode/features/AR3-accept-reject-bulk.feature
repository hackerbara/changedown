@fast @accept-reject @AR3
Feature: Accept all and reject all changes
  As a document reviewer
  I want to accept or reject every change in a document at once
  So that I can quickly resolve all tracked changes

  # ── Accept All ──────────────────────────────────────────────────────

  Scenario: Accept all changes in simple document
    Given a document with text "{++add++} middle {--del--} end {~~old~>new~~}"
    When I accept all changes in the document
    Then the document text is "add middle  end new"

  Scenario: Accept all with mixed types
    Given a document with text "Text {++insert++} and {--delete--} and {==highlight==} and {>>comment<<}"
    When I accept all changes in the document
    Then the document text is "Text insert and  and highlight and "

  Scenario: Accept all in multi-line document
    Given a document with text:
      """
      Line 1 {++addition++}
      Line 2 {--deletion--}
      Line 3 {~~old~>new~~}
      Line 4 {==highlight==}
      """
    When I accept all changes in the document
    Then the document text is:
      """
      Line 1 addition
      Line 2 
      Line 3 new
      Line 4 highlight
      """

  Scenario: Accept all with adjacent changes
    Given a document with text "{++first++}{--second--}{~~third~>fourth~~}"
    When I accept all changes in the document
    Then the document text is "firstfourth"

  Scenario: Accept all with highlight and comment
    Given a document with text "Text {==highlight==}{>>comment<<} more"
    When I accept all changes in the document
    Then the document text is "Text highlight more"

  Scenario: Accept all when no changes in document
    Given a document with text "Just plain text with no changes"
    When I accept all changes in the document
    Then the document text is "Just plain text with no changes"

  Scenario: Accept all in complex real-world document
    Given a document with text:
      """
      # Document Title

      This is a paragraph with {++an addition++} and {--a deletion--}.

      Here is a {~~substitution~>replacement~~} in the middle of a sentence.

      {==This is highlighted text==}{>>with an explanatory comment<<}

      And finally, a standalone {>>comment about the document<<}.
      """
    When I accept all changes in the document
    Then the document text is:
      """
      # Document Title

      This is a paragraph with an addition and .

      Here is a replacement in the middle of a sentence.

      This is highlighted text

      And finally, a standalone .
      """

  # ── Reject All ──────────────────────────────────────────────────────

  Scenario: Reject all changes in simple document
    Given a document with text "{++add++} middle {--del--} end {~~old~>new~~}"
    When I reject all changes in the document
    Then the document text is " middle del end old"

  Scenario: Reject all with mixed types
    Given a document with text "Text {++insert++} and {--delete--} and {==highlight==} and {>>comment<<}"
    When I reject all changes in the document
    Then the document text is "Text  and delete and highlight and "

  Scenario: Reject all in multi-line document
    Given a document with text:
      """
      Line 1 {++addition++}
      Line 2 {--deletion--}
      Line 3 {~~old~>new~~}
      Line 4 {==highlight==}
      """
    When I reject all changes in the document
    Then the document text is:
      """
      Line 1 
      Line 2 deletion
      Line 3 old
      Line 4 highlight
      """

  Scenario: Reject all with adjacent changes
    Given a document with text "{++first++}{--second--}{~~third~>fourth~~}"
    When I reject all changes in the document
    Then the document text is "secondthird"

  Scenario: Reject all in complex real-world document
    Given a document with text:
      """
      # Document Title

      This is a paragraph with {++an addition++} and {--a deletion--}.

      Here is a {~~substitution~>replacement~~} in the middle of a sentence.

      {==This is highlighted text==}{>>with an explanatory comment<<}

      And finally, a standalone {>>comment about the document<<}.
      """
    When I reject all changes in the document
    Then the document text is:
      """
      # Document Title

      This is a paragraph with  and a deletion.

      Here is a substitution in the middle of a sentence.

      This is highlighted text

      And finally, a standalone .
      """

  # ── Integration: fixture-style documents ────────────────────────────

  Scenario: Accept all in basic CriticMarkup example document
    Given a document with text:
      """
      # CriticMarkup Examples

      This document demonstrates the five types of CriticMarkup syntax:

      ## Addition
      This is {++an insertion++} in the text.

      ## Deletion
      This is {--a deletion--} in the text.

      ## Substitution
      This is {~~old text~>new text~~} in the document.

      ## Highlight
      This is {==important text==} that needs attention.

      ## Comment
      This is a note: {>>This is just a comment<<}

      ## Highlight with Comment
      This is {==highlighted==}{>>with an explanation<<} text.
      """
    When I accept all changes in the document
    Then the document text is:
      """
      # CriticMarkup Examples

      This document demonstrates the five types of CriticMarkup syntax:

      ## Addition
      This is an insertion in the text.

      ## Deletion
      This is  in the text.

      ## Substitution
      This is new text in the document.

      ## Highlight
      This is important text that needs attention.

      ## Comment
      This is a note: 

      ## Highlight with Comment
      This is highlighted text.
      """

  Scenario: Reject all in multi-line addition document
    Given a document with text:
      """
      # Multi-Line Examples

      ## Multi-line Addition
      This is a paragraph.

      {++This is a new paragraph
      that spans multiple lines
      and should be properly handled.++}

      This is the final paragraph.
      """
    When I reject all changes in the document
    Then the document text is:
      """
      # Multi-Line Examples

      ## Multi-line Addition
      This is a paragraph.



      This is the final paragraph.
      """
