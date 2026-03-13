# Malformed Markup - Test Fixture

This file contains malformed CriticMarkup examples to test parser robustness.

## Unclosed Markup

### Unclosed Addition
This has {++ text with no closing delimiter

More text after.

### Unclosed Deletion
This has {-- text with no closing delimiter

More text after.

### Unclosed Substitution
This has {~~ old text with no closing delimiter

More text after.

### Unclosed Highlight
This has {== highlighted text with no closing delimiter

More text after.

### Unclosed Comment
This has {>> comment with no closing delimiter

More text after.

## Missing Opening Delimiter

### Missing Opening for Addition
This has text with no opening ++}

More text after.

### Missing Opening for Deletion
This has text with no opening --}

More text after.

### Missing Opening for Substitution
This has text with no opening ~~}

More text after.

### Missing Opening for Highlight
This has text with no opening ==}

More text after.

### Missing Opening for Comment
This has text with no opening <<}

More text after.

## Substitution Without Separator

### No Separator
This has {~~old text without separator new text~~}

More text after.

### Multiple Separators
This has {~~old~>middle~>new~~}

More text after.

## Nested Delimiters

### Addition Inside Addition
This has {++outer {++inner++} text++} pattern.

### Deletion Inside Deletion
This has {--outer {--inner--} text--} pattern.

### Mixed Nesting
This has {++addition with {--deletion--} inside++} pattern.

This has {~~old with {++addition++}~>new text~~} pattern.

This has {==highlight with {>>comment<<} inside==} pattern.

### Deep Nesting
This has {++level1 {++level2 {++level3++}++}++} pattern.

## Mismatched Delimiters

### Wrong Closing
This has {++addition with wrong closer--} pattern.

This has {--deletion with wrong closer++} pattern.

### Partial Delimiters
This has {+ single plus +} pattern.

This has {- single minus -} pattern.

This has {~ single tilde ~} pattern.

This has {= single equals =} pattern.

This has {> single angle >} pattern.

## Empty Separator

### Substitution With Empty Separator
This has {~~~>new text~~} pattern.

This has {~~old text~>~~} pattern.

## Special Edge Cases

### Overlapping Markup
This has {++addition {--that overlaps++} with deletion--} pattern.

### Multiple Unclosed
This has {++first unclosed {++second unclosed

More text.

### Just Delimiters
{++}{--}{~~}

### Delimiter Soup
{+{-{~{={>}>}=}~}-}+}

---

End of malformed test fixture file.
