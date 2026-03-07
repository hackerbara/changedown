import { defaultNormalizer, normalizedIndexOf, TextNormalizer } from '@changetracks/core';

export interface LineRangeResult {
  content: string;
  startOffset: number;
  endOffset: number;
}

export function extractLineRange(
  lines: string[],
  startLine: number,
  endLine: number
): LineRangeResult {
  // Validate inputs (1-indexed)
  if (startLine < 1 || startLine > lines.length) {
    throw new Error(`startLine ${startLine} is out of range (1-${lines.length})`);
  }
  if (endLine < 1 || endLine > lines.length) {
    throw new Error(`endLine ${endLine} is out of range (1-${lines.length})`);
  }
  if (endLine < startLine) {
    throw new Error(`endLine (${endLine}) is out of range (must be >= startLine ${startLine})`);
  }

  // Calculate start offset
  let startOffset = 0;
  for (let i = 0; i < startLine - 1; i++) {
    startOffset += lines[i].length + 1; // +1 for newline
  }

  // Extract content
  const selectedLines = lines.slice(startLine - 1, endLine);
  const content = selectedLines.join('\n');
  // endOffset is exclusive (points to the position after the last character)
  const endOffset = startOffset + content.length;

  return { content, startOffset, endOffset };
}

export interface MatchResult {
  index: number;
  length: number;
  originalText: string;
  wasNormalized: boolean;
}

export function findUniqueMatch(
  text: string,
  searchText: string,
  normalizer?: TextNormalizer
): MatchResult {
  // Try exact match first
  const exactMatches: number[] = [];
  let pos = 0;
  while ((pos = text.indexOf(searchText, pos)) !== -1) {
    exactMatches.push(pos);
    pos += 1;
  }

  if (exactMatches.length === 1) {
    const index = exactMatches[0];
    return {
      index,
      length: searchText.length,
      originalText: text.slice(index, index + searchText.length),
      wasNormalized: false,
    };
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Multiple matches found for "${searchText}" (${exactMatches.length} occurrences)`
    );
  }

  // Exact match failed - try normalized match if normalizer provided
  if (normalizer) {
    const normalizedSearch = normalizer(searchText);
    const normMatches: number[] = [];
    let searchPos = 0;

    while ((searchPos = normalizedIndexOf(text, normalizedSearch, normalizer, searchPos)) !== -1) {
      normMatches.push(searchPos);
      searchPos += 1;
    }

    if (normMatches.length === 1) {
      const index = normMatches[0];
      // Find the actual length in the original text by finding where the normalized substring ends
      const normalizedText = normalizer(text);
      const normIndex = normalizedText.indexOf(normalizedSearch);
      const normEndIndex = normIndex + normalizedSearch.length;
      
      // Map normalized positions back to original text positions
      let originalStart = -1;
      let originalEnd = -1;
      let normPos = 0;
      
      for (let i = 0; i <= text.length; i++) {
        if (normPos === normIndex) {
          originalStart = i;
        }
        if (normPos === normEndIndex) {
          originalEnd = i;
          break;
        }
        // Check if this character exists in normalized text
        const charNorm = normalizer(text[i] || '');
        if (charNorm.length > 0) {
          normPos += charNorm.length;
        }
      }
      
      if (originalStart === -1) originalStart = 0;
      if (originalEnd === -1) originalEnd = text.length;

      return {
        index: originalStart,
        length: originalEnd - originalStart,
        originalText: text.slice(originalStart, originalEnd),
        wasNormalized: true,
      };
    }

    if (normMatches.length > 1) {
      throw new Error(
        `Multiple normalized matches found for "${searchText}" (${normMatches.length} occurrences)`
      );
    }

    // Not found even with normalization
    throw new Error(
      `Text "${searchText}" not found (exact and normalized match failed)`
    );
  }

  // Not found and no normalizer provided
  throw new Error(`Text "${searchText}" not found`);
}

export function appendFootnote(text: string, footnoteBlock: string): string {
  // Split text into lines to process
  const lines = text.split('\n');
  
  // Find the last footnote definition that's not inside a code block
  let inCodeBlock = false;
  let lastFootnoteIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track code block state
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    
    // Only consider footnote definitions outside code blocks
    if (!inCodeBlock && /^\[\^[^\]]+\]:/.test(line)) {
      lastFootnoteIndex = i;
    }
  }
  
  if (lastFootnoteIndex === -1) {
    // No existing footnotes outside code blocks - append at end
    return text + footnoteBlock;
  }
  
  // Find where the footnote block ends (look for next non-indented, non-continuation line)
  let insertIndex = lastFootnoteIndex;
  for (let i = lastFootnoteIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Continuation lines are indented or empty
    if (line === '' || line.startsWith(' ') || line.startsWith('\t')) {
      insertIndex = i;
    } else {
      break;
    }
  }
  
  // Insert the new footnote after the last footnote block
  const before = lines.slice(0, insertIndex + 1).join('\n');
  const after = lines.slice(insertIndex + 1).join('\n');
  
  if (after) {
    return before + footnoteBlock + '\n' + after;
  }
  return before + footnoteBlock;
}
