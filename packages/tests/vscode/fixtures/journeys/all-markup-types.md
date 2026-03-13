# All Markup Types - Test Fixture

This file contains comprehensive examples of all CriticMarkup types for testing.

## Single-Line Examples

### Addition
This is {++inserted text++} in the middle.

### Deletion
This is {--removed text--} that was deleted.

### Substitution
This is {~~old text~>new text~~} that was changed.

### Comment
This is text{>>This is a standalone comment<<} with a comment.

### Highlight
This is {==highlighted text==} that needs attention.

### Highlight with Comment
This is {==important text==}{>>Why this is important<<} with context.

## Multi-Line Examples

### Multi-Line Addition
Here is a multi-line addition:

{++First line of addition
Second line of addition
Third line of addition++}

Continuing after the addition.

### Multi-Line Deletion
Here is a multi-line deletion:

{--First line to remove
Second line to remove
Third line to remove--}

Continuing after the deletion.

### Multi-Line Substitution
Here is a multi-line substitution:

{~~Old first line
Old second line
Old third line~>New first line
New second line
New third line~~}

Continuing after the substitution.

### Multi-Line Highlight
Here is a multi-line highlight:

{==First line highlighted
Second line highlighted
Third line highlighted==}

Continuing after the highlight.

### Multi-Line Comment
Here is a multi-line comment:

This needs review{>>This is a comment that spans
multiple lines and provides
detailed feedback<<} before proceeding.

## Adjacent Markup

Two changes{++addition++}{--deletion--}back to back.

Multiple{++first++}{++second++}{++third++}additions together.

## Markup in Different Contexts

### In Headings

#### This is a {++new++} heading with {==markup==}

### In Lists

- Item with {++addition++}
- Item with {--deletion--}
- Item with {~~old~>new~~} substitution
- Item with {==highlight==}{>>comment<<}

### In Bold/Italic

This is **bold with {++addition++}** text.

This is *italic with {--deletion--}* text.

This is ***bold italic with {~~old~>new~~}*** text.

### In Code Blocks

This is `inline code with {++markup++}` though it won't be parsed.

```javascript
// This {++markup++} in code blocks should not be parsed
function test() {
    return {--deleted--};
}
```

## Edge Cases

### Empty Changes

Empty addition: {++++}

Empty deletion: {----}

Empty substitution: {~~~>~~}

Empty highlight: {====}

Empty comment: {>><<}

### Very Long Content

{++This is a very long addition that goes on and on and on and contains many words to test how the parser handles extremely long content within a single markup block without line breaks but just keeps going with more and more text until it finally ends++}

{--This is a very long deletion that goes on and on and on and contains many words to test how the parser handles extremely long content within a single markup block without line breaks but just keeps going with more and more text until it finally ends--}

### Special Characters

{++Special chars: @#$%^&*()_+-=[]{}|;':",./<>?++}

{--Unicode: émojis 🎉 中文 العربية עברית--}

{~~old with "quotes" and 'apostrophes'~>new with "quotes" and 'apostrophes'~~}

{==Markdown **bold** and *italic* and [links](http://example.com)==}

{>>Comment with `code` and **formatting** and [link](http://example.com)<<}

### Nested Markup (Edge Case)

This tests how {++nested {==markup==} handling++} works.

This tests {~~old with {++addition++}~>new text~~} patterns.

### Complex Realistic Scenarios

The {~~Acme Corporation~>TechCorp Industries~~} announced {++today++} that it will {--be shutting down--}{++continue to operate++} its {==manufacturing facility==}{>>Need to verify this claim with sources<<} in Detroit.

## Standalone Comments

{>>This is a comment not attached to any highlight - it should appear as a standalone annotation in the text.<<}

Regular text here.

{>>Another standalone comment providing feedback on the section above.<<}

## Mixed Content

Here's a paragraph with {++multiple++} different {--types--} of {~~old~>new~~} markup {==combined==}{>>with comments<<} to test the parser's ability to handle complex real-world scenarios where many changes appear together.

---

End of test fixture file.
