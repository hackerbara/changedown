/**
 * Post-processing for .docx buffers.
 *
 * Applies JSZip-based patches for broad docx compatibility:
 * 1. Wraps bare <w:commentReference> in a run with CommentReference style
 * 2. Fixes empty <w:rPrChange> elements (adds required child <w:rPr/>)
 * 3. Adds w14:paraId and w14:textId attributes to all <w:p> elements
 * 4. Patches comment paraIds in word/comments.xml
 * 5. Injects word/commentsExtended.xml for comment threading
 * 6. Adds CommentReference character style to word/styles.xml
 */

import JSZip from 'jszip';
import type { ImagePatchInfo, MediaInjection } from '../shared/image-types.js';
import type { CommentPatchInfo, HyperlinkPatchInfo } from '../shared/patch-types.js';
import { wrapTrackedImages, injectMediaFiles } from './image-patch.js';
import { wrapTrackedHyperlinks } from './hyperlink-patch.js';

export type { CommentPatchInfo } from '../shared/patch-types.js';

/**
 * Pandoc-compatible heading style definitions (levels 1–6).
 * The docx npm package emits heading styles that lack w:outlineLvl,
 * w:keepNext, w:keepLines, and proper w:name casing — pandoc won't
 * recognize them as headings without these. We replace the generated
 * styles with these pandoc-reference definitions during post-processing.
 */
const PANDOC_HEADING_STYLES = [
  '<w:style w:styleId="Heading1" w:type="paragraph"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="80" w:before="360"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>',
  '<w:style w:styleId="Heading2" w:type="paragraph"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="80" w:before="160"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>',
  '<w:style w:styleId="Heading3" w:type="paragraph"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="80" w:before="160"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>',
  '<w:style w:styleId="Heading4" w:type="paragraph"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="40" w:before="80"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:i/><w:iCs/></w:rPr></w:style>',
  '<w:style w:styleId="Heading5" w:type="paragraph"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="40" w:before="80"/><w:outlineLvl w:val="4"/></w:pPr><w:rPr/></w:style>',
  '<w:style w:styleId="Heading6" w:type="paragraph"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="0" w:before="40"/><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:i/><w:iCs/></w:rPr></w:style>',
];

/**
 * Generate an 8-character uppercase hex ID suitable for w14:paraId attributes.
 * Values range from 00000001 to 7FFFFFFE.
 */
export function randomParaId(): string {
  const val = Math.floor(Math.random() * 0x7ffffffe) + 1;
  return val.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Post-process a docx buffer for Word Online compatibility.
 *
 * @param buffer - The raw docx buffer from Packer.toBuffer()
 * @param commentPatchInfos - Array of comment info objects for paraId patching and threading
 * @returns A new buffer with all patches applied
 */
export async function patchDocxForWordOnline(
  buffer: Uint8Array,
  commentPatchInfos: CommentPatchInfo[],
  imagePatchInfos?: ImagePatchInfo[],
  mediaInjections?: MediaInjection[],
  hyperlinkPatchInfos?: HyperlinkPatchInfo[],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);

  // --- 1. Fix document.xml ---
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml not found in docx');
  let docXml = await docFile.async('string');

  // Wrap bare commentReference in a run with CommentReference style
  docXml = docXml.replace(
    /<w:commentReference w:id="(\d+)"\/>/g,
    '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="$1"/></w:r>'
  );

  // Fix empty rPrChange — OOXML schema requires <w:rPr/> child
  docXml = docXml.replace(
    /<w:rPrChange([^>]*)\/>/g,
    '<w:rPrChange$1><w:rPr/></w:rPrChange>'
  );
  docXml = docXml.replace(
    /<w:rPrChange([^>]*)><\/w:rPrChange>/g,
    '<w:rPrChange$1><w:rPr/></w:rPrChange>'
  );

  // Add w14:paraId and w14:textId to every <w:p>
  docXml = docXml.replace(/<w:p(?=>|[\s])/g, () => {
    return `<w:p w14:paraId="${randomParaId()}" w14:textId="${randomParaId()}"`;
  });

  // --- Image tracked change wrapping ---
  if (imagePatchInfos && imagePatchInfos.length > 0) {
    docXml = wrapTrackedImages(docXml, imagePatchInfos);
  }

  // --- Hyperlink tracked change wrapping ---
  if (hyperlinkPatchInfos && hyperlinkPatchInfos.length > 0) {
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      let relsXml = await relsFile.async('string');
      const result = wrapTrackedHyperlinks(docXml, relsXml, hyperlinkPatchInfos);
      docXml = result.docXml;
      zip.file('word/_rels/document.xml.rels', result.relsXml);
    }
  }

  zip.file('word/document.xml', docXml);

  // --- 2. Patch comments.xml with paraIds ---
  const commentsFile = zip.file('word/comments.xml');
  if (commentsFile && commentPatchInfos.length > 0) {
    let commentsXml = await commentsFile.async('string');

    // Deduplicate w:comment entries — the docx npm library may emit
    // duplicate entries for the same w:id (first with text, second empty).
    // Keep only the entry with non-empty <w:t> content for each ID.
    const commentEntryPattern =
      /<w:comment\b[^>]*?w:id="(\d+)"[^>]*?>[\s\S]*?<\/w:comment>/g;
    const seenIds = new Map<string, { hasText: boolean; isDuplicated: boolean }>();
    let commentMatch;
    while ((commentMatch = commentEntryPattern.exec(commentsXml)) !== null) {
      const [fullMatch] = commentMatch;
      const id = commentMatch[1];
      const hasText = /<w:t[^>]*>[^<]+<\/w:t>/.test(fullMatch);
      const existing = seenIds.get(id);
      if (!existing) {
        seenIds.set(id, { hasText, isDuplicated: false });
      } else if (hasText && !existing.hasText) {
        seenIds.set(id, { hasText, isDuplicated: true });
      } else {
        existing.isDuplicated = true;
      }
    }
    // Remove empty duplicates for IDs that have a text-containing entry
    for (const [id, { hasText, isDuplicated }] of seenIds) {
      if (!hasText || !isDuplicated) continue;
      const emptyPattern = new RegExp(
        `<w:comment\\b[^>]*?w:id="${id}"[^>]*?>\\s*<w:p[^>]*>\\s*<\\/w:p>\\s*<\\/w:comment>`,
        'g'
      );
      commentsXml = commentsXml.replace(emptyPattern, '');
    }

    for (const ci of commentPatchInfos) {
      const commentPattern = new RegExp(
        `(<w:comment[^>]*w:id="${ci.id}"[^>]*>)<w:p>`,
        'g'
      );
      commentsXml = commentsXml.replace(
        commentPattern,
        `$1<w:p w14:paraId="${ci.paraId}" w14:textId="${randomParaId()}">`
      );
    }
    zip.file('word/comments.xml', commentsXml);
  }

  // --- 3. Inject commentsExtended.xml for threading ---
  if (commentPatchInfos.length > 0) {
    const entries = commentPatchInfos.map((ci) => {
      const parentAttr = ci.parentParaId ? ` w15:paraIdParent="${ci.parentParaId}"` : '';
      return `  <w15:commentEx w15:paraId="${ci.paraId}"${parentAttr} w15:done="0"/>`;
    });

    zip.file(
      'word/commentsExtended.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"\n` +
        `  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"\n` +
        `  mc:Ignorable="w15">\n` +
        entries.join('\n') +
        `\n</w15:commentsEx>`
    );

    // Register relationship
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      let rels = await relsFile.async('string');
      const rIdMatches = [...rels.matchAll(/rId(\d+)/g)];
      const maxRId =
        rIdMatches.length > 0
          ? Math.max(...rIdMatches.map((m) => parseInt(m[1], 10)))
          : 10;
      if (!rels.includes('commentsExtended')) {
        rels = rels.replace(
          '</Relationships>',
          `<Relationship Id="rId${maxRId + 1}" ` +
            `Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" ` +
            `Target="commentsExtended.xml"/></Relationships>`
        );
        zip.file('word/_rels/document.xml.rels', rels);
      }
    }

    // Register content type
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let ct = await ctFile.async('string');
      if (!ct.includes('commentsExtended')) {
        ct = ct.replace(
          '</Types>',
          `<Override ` +
            `ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml" ` +
            `PartName="/word/commentsExtended.xml"/></Types>`
        );
        zip.file('[Content_Types].xml', ct);
      }
    }
  }

  // --- 4. Add CommentReference character style if missing ---
  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    let stylesXml = await stylesFile.async('string');
    if (!stylesXml.includes('w:styleId="CommentReference"')) {
      stylesXml = stylesXml.replace(
        '</w:styles>',
        `<w:style w:type="character" w:styleId="CommentReference">` +
          `<w:name w:val="annotation reference"/>` +
          `<w:basedOn w:val="DefaultParagraphFont"/>` +
          `<w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>` +
          `</w:style></w:styles>`
      );
      zip.file('word/styles.xml', stylesXml);
    }
  }

  // --- 5. Replace heading styles with pandoc-compatible definitions ---
  // The docx npm package generates Heading1–Heading6 styles that lack
  // w:outlineLvl and other properties pandoc needs to recognize them as
  // real headings. Replace them wholesale with pandoc-reference definitions.
  {
    const sf = zip.file('word/styles.xml');
    if (sf) {
      let sx = await sf.async('string');
      let patched = false;

      // Ensure Normal style exists (heading styles are basedOn Normal)
      if (!sx.includes('w:styleId="Normal"')) {
        sx = sx.replace(
          '</w:styles>',
          '<w:style w:default="1" w:styleId="Normal" w:type="paragraph">' +
            '<w:name w:val="Normal"/><w:qFormat/>' +
            '</w:style></w:styles>',
        );
        patched = true;
      }

      for (let level = 1; level <= 6; level++) {
        const styleId = `Heading${level}`;
        const re = new RegExp(
          `<w:style[^>]*w:styleId="${styleId}"[^>]*>.*?</w:style>`,
          's',
        );
        if (re.test(sx)) {
          sx = sx.replace(re, PANDOC_HEADING_STYLES[level - 1]);
          patched = true;
        }
      }
      if (patched) {
        zip.file('word/styles.xml', sx);
      }
    }
  }

  // --- Inject unsupported-format media files ---
  if (mediaInjections && mediaInjections.length > 0) {
    await injectMediaFiles(zip, mediaInjections);
  }

  return await zip.generateAsync({ type: 'uint8array' });
}
