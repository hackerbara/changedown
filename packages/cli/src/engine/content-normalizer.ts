/**
 * Normalize escape sequences in content payloads.
 *
 * Converts literal \n → newline, \t → tab, \\ → backslash.
 * Applied to new content (insertions, substitution new-text, amend new-text).
 * Never applied to old_text / matching text.
 */
export function normalizeContentPayload(text: string): string {
  if (!text) return text;

  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === 'n') {
        result += '\n';
        i += 2;
        continue;
      }
      if (next === 't') {
        result += '\t';
        i += 2;
        continue;
      }
      if (next === '\\') {
        result += '\\';
        i += 2;
        continue;
      }
    }
    result += text[i];
    i++;
  }
  return result;
}
