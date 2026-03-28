import type { HyperlinkPatchInfo } from '../shared/patch-types.js';
export type { HyperlinkPatchInfo } from '../shared/patch-types.js';

export interface HyperlinkPatchResult {
  docXml: string;
  relsXml: string;
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wrap hyperlink inner runs in w:ins or w:del for tracked change support.
 *
 * OOXML requires w:ins/w:del INSIDE w:hyperlink (not outside).
 * CT_Hyperlink allows w:ins children; CT_RunTrackChange does NOT allow w:hyperlink children.
 */
export function wrapTrackedHyperlinks(
  docXml: string,
  relsXml: string,
  patches: HyperlinkPatchInfo[],
): HyperlinkPatchResult {
  if (patches.length === 0) return { docXml, relsXml };

  let resultDoc = docXml;
  let resultRels = relsXml;

  for (const patch of patches) {
    // Step 1: Find r:id for sentinel URL in rels
    const escapedUrl = patch.sentinelUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Two-step lookup: find Relationship element containing sentinel URL, then extract Id
    const relElementPattern = new RegExp(
      `<Relationship\\b[^>]*Target="${escapedUrl}"[^>]*>`,
    );
    const relElementMatch = resultRels.match(relElementPattern);
    if (!relElementMatch) continue;
    const idMatch = relElementMatch[0].match(/Id="(rId\d+)"/);
    if (!idMatch) continue;
    const rId = idMatch[1];

    // Step 2: Find hyperlink with that r:id and wrap its inner runs
    const wrapTag = patch.changeType === 'ins' ? 'w:ins' : 'w:del';
    const hyperlinkPattern = new RegExp(
      `(<w:hyperlink[^>]*r:id="${rId}"[^>]*>)((?:(?!</w:hyperlink>).)*)(</w:hyperlink>)`,
      's',
    );

    resultDoc = resultDoc.replace(hyperlinkPattern, (_, open, inner, close) => {
      return `${open}<${wrapTag} w:id="${patch.revisionId}" w:author="${escapeXmlAttr(patch.author)}" w:date="${patch.date}">${inner}</${wrapTag}>${close}`;
    });

    // Step 3: Replace sentinel URL with real URL in rels
    resultRels = resultRels.replaceAll(patch.sentinelUrl, escapeXmlAttr(patch.realUrl));
  }

  return { docXml: resultDoc, relsXml: resultRels };
}
