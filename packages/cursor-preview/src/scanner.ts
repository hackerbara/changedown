import type { ScanMatch, ScanMatchType, MatchRegion } from './types.js';

/**
 * Scan concatenated text for CriticMarkup patterns and return structured matches.
 * Purely functional — no DOM dependency.
 *
 * Supported patterns:
 *   {++text++}         insertion
 *   {--text--}         deletion
 *   {~~old~>new~~}     substitution
 *   {==text==}         highlight
 *   {>>text<<}         comment
 *   [^cn-N] / [^cn-N.M]  footnote reference
 */
export function scanCriticMarkup(text: string): ScanMatch[] {
  const matches: ScanMatch[] = [];

  // Insertions: {++content++}
  for (const m of text.matchAll(/\{\+\+([\s\S]*?)\+\+\}/g)) {
    matches.push(buildSimpleMatch('insertion', m));
  }

  // Deletions: {--content--}
  for (const m of text.matchAll(/\{--([\s\S]*?)--\}/g)) {
    matches.push(buildSimpleMatch('deletion', m));
  }

  // Substitutions: {~~old~>new~~}
  for (const m of text.matchAll(/\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const openEnd = start + 3;            // past {~~
    const sepStart = openEnd + m[1].length; // start of ~>
    const sepEnd = sepStart + 2;           // past ~>
    const closeStart = end - 3;            // start of ~~}

    matches.push({
      type: 'substitution',
      start,
      end,
      separatorStart: sepStart,
      separatorEnd: sepEnd,
      regions: [
        { role: 'open-delim', start, end: openEnd },
        { role: 'old-content', start: openEnd, end: sepStart },
        { role: 'separator', start: sepStart, end: sepEnd },
        { role: 'new-content', start: sepEnd, end: closeStart },
        { role: 'close-delim', start: closeStart, end },
      ],
    });
  }

  // Highlights: {==content==}
  for (const m of text.matchAll(/\{==([\s\S]*?)==\}/g)) {
    matches.push(buildSimpleMatch('highlight', m));
  }

  // Comments: {>>content<<}
  for (const m of text.matchAll(/\{>>([\s\S]*?)<<\}/g)) {
    matches.push(buildSimpleMatch('comment', m));
  }

  // Footnote references: [^cn-N] or [^cn-N.M]
  for (const m of text.matchAll(/\[\^cn-\d+(?:\.\d+)?\]/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    matches.push({
      type: 'footnote-ref',
      start,
      end,
      regions: [{ role: 'content', start, end }],
    });
  }

  // Sort by document position
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

/** Build a ScanMatch for simple types (insertion, deletion, highlight, comment). */
function buildSimpleMatch(type: ScanMatchType, m: RegExpMatchArray): ScanMatch {
  const start = m.index!;
  const end = start + m[0].length;
  const delimLen = 3;
  return {
    type,
    start,
    end,
    regions: [
      { role: 'open-delim', start, end: start + delimLen },
      { role: 'content', start: start + delimLen, end: end - delimLen },
      { role: 'close-delim', start: end - delimLen, end },
    ],
  };
}
