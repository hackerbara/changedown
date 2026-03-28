export type TextSegment = {
  kind: 'text';
  text: string;
  bold?: boolean;
  italics?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
};

export type LinkSegment = {
  kind: 'link';
  text: string;
  url: string;
  bold?: boolean;
  italics?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
};

export type ImageSegment = {
  kind: 'image';
  altText: string;
  path: string;
};

export type InlineSegment = TextSegment | LinkSegment | ImageSegment;

/**
 * State-machine inline parser. Walks text character by character,
 * toggling formatting flags on delimiters, emitting segments on transitions.
 *
 * Delimiter precedence: longest match first (*** before ** before *).
 * Code spans are exclusive — no inner delimiters recognized until closing `.
 * Link/image detection uses regex lookahead at [ and ![ positions.
 */
export function parseInlineSegments(text: string): InlineSegment[] {
  if (!text) return [];

  const segments: InlineSegment[] = [];
  let pos = 0;
  let acc = ''; // text accumulator

  // Formatting state
  let bold = false;
  let italics = false;
  let strikethrough = false;
  let underline = false;
  let code = false;

  function flush(): void {
    if (acc) {
      const seg: TextSegment = { kind: 'text', text: acc };
      if (bold) seg.bold = true;
      if (italics) seg.italics = true;
      if (strikethrough) seg.strikethrough = true;
      if (underline) seg.underline = true;
      if (code) seg.code = true;
      segments.push(seg);
      acc = '';
    }
  }

  while (pos < text.length) {
    // Inside code span — only look for closing backtick
    if (code) {
      if (text[pos] === '`') {
        flush();
        code = false;
        pos++;
      } else {
        acc += text[pos];
        pos++;
      }
      continue;
    }

    // *** — toggle bold + italics
    if (text.startsWith('***', pos)) {
      flush();
      bold = !bold;
      italics = !italics;
      pos += 3;
      continue;
    }

    // ** — toggle bold
    if (text.startsWith('**', pos)) {
      flush();
      bold = !bold;
      pos += 2;
      continue;
    }

    // * — toggle italics (already ruled out ** and ***)
    if (text[pos] === '*') {
      flush();
      italics = !italics;
      pos++;
      continue;
    }

    // ~~ — toggle strikethrough
    if (text.startsWith('~~', pos)) {
      flush();
      strikethrough = !strikethrough;
      pos += 2;
      continue;
    }

    // </u> — end underline (check before <u> for longest match)
    if (text.startsWith('</u>', pos)) {
      flush();
      underline = false;
      pos += 4;
      continue;
    }

    // <u> — start underline
    if (text.startsWith('<u>', pos)) {
      flush();
      underline = true;
      pos += 3;
      continue;
    }

    // ` — start code span
    if (text[pos] === '`') {
      flush();
      code = true;
      pos++;
      continue;
    }

    // ![alt](path) — image (check before [ to avoid matching as link)
    if (text[pos] === '!' && text[pos + 1] === '[') {
      const imgMatch = text.slice(pos).match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        flush();
        segments.push({ kind: 'image', altText: imgMatch[1], path: imgMatch[2] });
        pos += imgMatch[0].length;
        continue;
      }
    }

    // [text](url) — link
    if (text[pos] === '[') {
      const linkMatch = text.slice(pos).match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        flush();
        const seg: LinkSegment = { kind: 'link', text: linkMatch[1], url: linkMatch[2] };
        if (bold) seg.bold = true;
        if (italics) seg.italics = true;
        if (strikethrough) seg.strikethrough = true;
        if (underline) seg.underline = true;
        segments.push(seg);
        pos += linkMatch[0].length;
        continue;
      }
    }

    // Default: accumulate character
    acc += text[pos];
    pos++;
  }

  flush();
  return segments;
}
