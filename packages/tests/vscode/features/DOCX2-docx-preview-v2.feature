@fast @DOCX2
Feature: DOCX2 — DOCX preview editor v2 components
  As a document author
  I want DOCX files to show an immediate preview with comment margin
  So I can review tracked changes without manual import

  # -- Comment pair extraction -------------------------------------------

  Scenario: DOCX2-01 Extract highlight+comment pair
    Given docx preview source text "{==highlighted text==}{>>this needs work<<}"
    When I extract comment pairs
    Then there is 1 comment pair
    And comment pair 0 has highlightText "highlighted text"
    And comment pair 0 has commentText "this needs work"
    And comment pair 0 has a pairId matching "cn-pair-"

  Scenario: DOCX2-02 No comments produces empty array
    Given docx preview source text "{++inserted text++}"
    When I extract comment pairs
    Then there are 0 comment pairs

  Scenario: DOCX2-03 Standalone comment without highlight
    Given docx preview source text "text {>>standalone comment<<} more text"
    When I extract comment pairs
    Then there is 1 comment pair
    And comment pair 0 has no highlightText
    And comment pair 0 has commentText "standalone comment"

  Scenario: DOCX2-04 Multiple comment pairs in one document
    Given docx preview source text "{==first==}{>>note one<<} plain {==second==}{>>note two<<}"
    When I extract comment pairs
    Then there are 2 comment pairs
    And comment pair 0 has highlightText "first"
    And comment pair 0 has commentText "note one"
    And comment pair 1 has highlightText "second"
    And comment pair 1 has commentText "note two"

  Scenario: DOCX2-05 Highlight without adjacent comment is ignored
    Given docx preview source text "{==just highlighted==} some gap {>>orphan comment<<}"
    When I extract comment pairs
    Then there is 1 comment pair
    And comment pair 0 has no highlightText
    And comment pair 0 has commentText "orphan comment"

  # ── Markdown to HTML rendering ────────────────────────────

  Scenario: DOCX2-06 Render plain markdown to HTML
    Given docx preview markdown "# Hello\n\nWorld"
    When I render markdown to preview HTML
    Then the docx preview HTML contains "<h1>Hello</h1>"
    And the docx preview HTML contains "<p>World</p>"

  Scenario: DOCX2-07 Render CriticMarkup insertions
    Given docx preview markdown "Some {++added++} text"
    When I render markdown to preview HTML
    Then the docx preview HTML contains "cn-ins"
    And the docx preview HTML contains "added"

  Scenario: DOCX2-08 Render CriticMarkup deletions
    Given docx preview markdown "Some {--removed--} text"
    When I render markdown to preview HTML
    Then the docx preview HTML contains "cn-del"
    And the docx preview HTML contains "removed"

  Scenario: DOCX2-09 Render highlights
    Given docx preview markdown "{==highlighted==}"
    When I render markdown to preview HTML
    Then the docx preview HTML contains "cn-hl"

  # ── Webview HTML generation ─────────────────────────────

  Scenario: DOCX2-10 Loading HTML includes spinner
    Given a docx file named "test.docx"
    When I build loading HTML
    Then the webview HTML contains "cn-docx-spinner"
    And the webview HTML contains "test.docx"

  Scenario: DOCX2-11 Error HTML shows message and pandoc link
    Given a docx file named "test.docx"
    When I build error HTML with message "pandoc not found"
    Then the webview HTML contains "pandoc not found"
    And the webview HTML contains "pandoc.org"

  Scenario: DOCX2-12 Choice HTML shows both options
    Given a docx file named "test.docx"
    And an existing markdown file "test-changedown.md"
    When I build choice HTML
    Then the webview HTML contains "Open existing"
    And the webview HTML contains "Re-import"
    And the webview HTML contains "overwrites"

  Scenario: DOCX2-13 Preview HTML includes toolbar, body, and margin panel
    Given a docx preview with body "<p>content</p>"
    And a comment pair with pairId "cn-pair-0" and text "a comment" by "@alice"
    And import stats of 3 insertions, 1 deletion, 0 substitutions by "@alice"
    When I build preview HTML
    Then the webview HTML contains "cn-docx-toolbar"
    And the webview HTML contains "cn-preview-body"
    And the webview HTML contains "cn-sidebar"
    And the webview HTML contains "content"
    And the webview HTML contains "a comment"
    And the webview HTML contains "@alice"
    And the webview HTML contains "3 ins"

  # ── data-cn-pair attribute injection ────────────────────

  Scenario: DOCX2-14 Preview renders data-cn-pair on highlight with merged comment
    Given preview source text "{==highlighted==}{>>a comment<<}"
    When I build preview replacements
    Then the preview HTML contains "data-cn-pair="

  Scenario: DOCX2-15 Preview renders matching data-cn-pair on adjacent highlight and comment
    Given preview source text "{==text==}{>>note<<}"
    When I build preview replacements
    Then the preview HTML contains "<mark class=\"cn-hl\" data-cn-pair=\"cn-pair-0\">"
    And the preview HTML contains "data-cn-pair=\"cn-pair-0\""

  Scenario: DOCX2-16 Preview renders data-cn-pair on standalone comment
    Given preview source text "hello {>>orphan<<} world"
    When I build preview replacements
    Then the preview HTML contains "data-cn-pair=\"cn-pair-6\""

  Scenario: DOCX2-17 Highlight without comment has data-cn-pair
    Given preview source text "{==just highlighted==}"
    When I build preview replacements
    Then the preview HTML contains "data-cn-pair"

  # ── Bidirectional sidebar linking (v3) ─────────────────────

  Scenario: DOCX2-18 Preview HTML has data-view-mode attribute
    Given a docx preview with body "<p>content</p>"
    When I build preview HTML with view mode "allMarkup"
    Then the webview HTML contains "data-view-mode=\"allMarkup\""

  Scenario: DOCX2-19 Preview HTML has data-view-mode simple
    Given a docx preview with body "<p>content</p>"
    When I build preview HTML with view mode "simple"
    Then the webview HTML contains "data-view-mode=\"simple\""

  Scenario: DOCX2-20 Sidebar cards have data-cn-id attribute
    Given a docx preview with body "<p>content</p>"
    And a comment pair with pairId "cn-pair-0" and text "a note" by "@bob"
    When I build preview HTML
    Then the webview HTML contains "data-cn-id=\"cn-pair-0\""

  Scenario: DOCX2-21 Preview HTML has inline anchor click handler
    Given a docx preview with body "<p>content</p>"
    When I build preview HTML
    Then the webview HTML contains "Inline anchor click"
    And the webview HTML contains "activateCard"

  Scenario: DOCX2-22 Preview HTML has footnote ref badge click handler
    Given a docx preview with body "<p>content</p>"
    When I build preview HTML
    Then the webview HTML contains "Footnote ref badge click"
    And the webview HTML contains "closest('.cn-ref')"

  # ── Simple view mode rendering ─────────────────────────────

  Scenario: DOCX2-23 Simple mode renders insertion as plain text with ref badge
    Given docx preview markdown "Hello {++world++}[^cn-1]\n\n[^cn-1]: @alice | 2026-03-01 | ins | proposed"
    When I render markdown to preview HTML in "simple" mode
    Then the docx preview HTML contains "world"
    And the docx preview HTML contains "cn-ins"
    And the docx preview HTML contains "cn-ref"

  Scenario: DOCX2-24 Simple mode keeps footnote ref badges visible
    Given docx preview markdown "Some {++text++}[^cn-1]\n\n[^cn-1]: @alice | 2026-03-01 | ins | proposed"
    When I render markdown to preview HTML in "simple" mode
    Then the docx preview HTML contains "cn-fn-ref-cn-1"

  Scenario: DOCX2-25 Simple mode preserves author colors
    Given docx preview markdown "Some {++text++}[^cn-1]\n\n[^cn-1]: @alice | 2026-03-01 | ins | proposed"
    When I render markdown to preview HTML in "simple" mode
    Then the docx preview HTML contains "cn-ins"

  Scenario: DOCX2-26 Simple mode CSS hides deletions and keeps insertions
    Given a docx preview with body "<p><ins class='cn-ins'>added</ins></p>"
    When I build preview HTML with view mode "simple"
    Then the webview HTML contains "[data-view-mode=\"simple\"] .cn-del"
    And the webview HTML contains "[data-view-mode=\"simple\"] .cn-ins"
    And the webview HTML contains "display: none"
    And the webview HTML contains "text-decoration: none"

  Scenario: DOCX2-27 Simple mode CSS has gutter indicators
    Given a docx preview with body "<p><ins class='cn-ins'>text</ins></p>"
    When I build preview HTML with view mode "simple"
    Then the webview HTML contains "Gutter: insertion"
    And the webview HTML contains "Gutter: deletion"
    And the webview HTML contains "Gutter: substitution"
    And the webview HTML contains "border-left: 3px solid"

  Scenario: DOCX2-28 Simple mode hides footnote definitions via CSS
    Given a docx preview with body "<p>content</p>"
    When I build preview HTML with view mode "simple"
    Then the webview HTML contains "[data-view-mode=\"simple\"] .cn-footnotes { display: none; }"

  Scenario: DOCX2-29 allMarkup mode renders footnote ref badges (provider hides via showFootnotes config)
    Given docx preview markdown "Some {++text++}[^cn-1]\n\n[^cn-1]: @alice | 2026-03-01 | ins | proposed"
    When I render markdown to preview HTML in "allMarkup" mode
    Then the docx preview HTML contains "cn-fn-ref-cn-1"

  Scenario: DOCX2-30 Simple mode renders deletion markup for gutter detection
    Given docx preview markdown "Text {--removed--} here"
    When I render markdown to preview HTML in "simple" mode
    Then the docx preview HTML contains "cn-del"

  Scenario: DOCX2-31 Simple mode preserves content underlines while removing ins underline
    Given docx preview markdown "Some {++Hello <u>world</u>++} text"
    When I render markdown to preview HTML in "simple" mode
    Then the docx preview HTML contains "<u>world</u>"
    And the docx preview HTML contains "cn-ins"

  Scenario: DOCX2-32 Simple mode CSS removes ins text-decoration but not content underlines
    Given a docx preview with body "<p><ins class='cn-ins'>Hello <u>world</u></ins></p>"
    When I build preview HTML with view mode "simple"
    Then the webview HTML contains "text-decoration: none"
    And the webview HTML contains "Hello <u>world</u>"
