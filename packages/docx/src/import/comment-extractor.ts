import * as fs from 'fs';
import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocxComment {
  id: string;
  author: string;
  date: string;
  text: string;
}

// ---------------------------------------------------------------------------
// XML entity decoding
// ---------------------------------------------------------------------------

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&amp;/g, '&'); // amp must be last
}

// ---------------------------------------------------------------------------
// Extract comments from comments.xml
// ---------------------------------------------------------------------------

export async function extractComments(
  docxPathOrBuffer: string | Buffer
): Promise<Map<string, DocxComment>> {
  const allComments = new Map<string, DocxComment>();

  const buffer = typeof docxPathOrBuffer === 'string'
    ? fs.readFileSync(docxPathOrBuffer)
    : docxPathOrBuffer;
  const zip = await JSZip.loadAsync(buffer);

  const commentsFile = zip.file('word/comments.xml');
  if (!commentsFile) {
    return allComments;
  }

  const xml = await commentsFile.async('string');

  const commentPattern =
    /<w:comment\b[^>]*?w:id="(\d+)"[^>]*?w:author="([^"]*)"[^>]*?w:date="([^"]*)"[^>]*?>([\s\S]*?)<\/w:comment>/g;

  let match;
  while ((match = commentPattern.exec(xml)) !== null) {
    const [, id, author, date, body] = match;
    // Extract text content from w:t elements
    const texts: string[] = [];
    const localTextPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let tMatch;
    while ((tMatch = localTextPattern.exec(body)) !== null) {
      texts.push(tMatch[1]);
    }
    allComments.set(id, {
      id,
      author,
      date,
      text: decodeXmlEntities(texts.join(' ').trim()),
    });
  }

  return allComments;
}

// ---------------------------------------------------------------------------
// Extract comment ranges and build reply map
// ---------------------------------------------------------------------------

export async function extractCommentRanges(
  docxPathOrBuffer: string | Buffer,
  allComments: Map<string, DocxComment>
): Promise<{ rangedIds: Set<string>; replies: Map<string, string[]> }> {
  const rangedIds = new Set<string>();
  const replies = new Map<string, string[]>();

  const buffer = typeof docxPathOrBuffer === 'string'
    ? fs.readFileSync(docxPathOrBuffer)
    : docxPathOrBuffer;
  const zip = await JSZip.loadAsync(buffer);

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    return { rangedIds, replies };
  }

  const xml = await docFile.async('string');

  const rangePattern = /w:commentRangeStart\s+w:id="(\d+)"/g;
  let match;
  while ((match = rangePattern.exec(xml)) !== null) {
    rangedIds.add(match[1]);
  }

  // Build reply map: for each ranged comment, find sequential unranged comments
  // that are replies (IDs between this ranged comment and the next ranged comment).
  const sortedRangedIds = [...rangedIds].map(Number).sort((a, b) => a - b);
  const allIds = [...allComments.keys()].map(Number).sort((a, b) => a - b);

  for (const rangedId of sortedRangedIds) {
    const replyIds: string[] = [];
    for (const cid of allIds) {
      if (cid <= rangedId) continue;
      if (rangedIds.has(String(cid))) break; // Hit next ranged comment
      replyIds.push(String(cid));
    }
    if (replyIds.length > 0) {
      replies.set(String(rangedId), replyIds);
    }
  }

  return { rangedIds, replies };
}
