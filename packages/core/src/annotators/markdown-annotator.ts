import { diffLines, diffChars, Change } from 'diff';

/**
 * Converts old text + new text into CriticMarkup-annotated text
 * with character-level precision.
 *
 * Strategy: Line-level diff first for efficiency (diffLines),
 * then character-level diff (diffChars) on each pair of adjacent
 * removed+added blocks to produce substitutions instead of
 * coarse delete+insert.
 */
export function annotateMarkdown(oldText: string, newText: string): string {
  if (oldText === newText) {
    return newText;
  }

  const lineChanges = diffLines(oldText, newText);
  let result = '';

  for (let i = 0; i < lineChanges.length; i++) {
    const change = lineChanges[i];
    const next = lineChanges[i + 1];

    if (change.removed && next?.added) {
      // Adjacent remove+add: drill down to character-level
      result += charLevelAnnotation(change.value, next.value);
      i++; // Skip the next (added) change
    } else if (change.removed) {
      result += `{--${change.value}--}`;
    } else if (change.added) {
      result += `{++${change.value}++}`;
    } else {
      result += change.value;
    }
  }

  return result;
}

function charLevelAnnotation(oldText: string, newText: string): string {
  const changes = diffChars(oldText, newText);
  let result = '';

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];

    if (change.removed && next?.added) {
      result += `{~~${change.value}~>${next.value}~~}`;
      i++;
    } else if (change.removed) {
      result += `{--${change.value}--}`;
    } else if (change.added) {
      result += `{++${change.value}++}`;
    } else {
      result += change.value;
    }
  }

  return result;
}
