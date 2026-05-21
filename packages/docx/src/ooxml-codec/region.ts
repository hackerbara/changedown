import { projectFormattedRunsToMarkdown } from "../inline-codec/index.js";
import type { FormattedRun } from "../inline-codec/index.js";
import { streamOoxmlPartEvents } from "./events.js";
import { projectOoxmlFigureToken, imageMarkdown } from "./figures.js";
import { mathMarkdown, projectOoxmlMathToken } from "./math.js";
import type {
  OoxmlEvent,
  OoxmlFigureToken,
  OoxmlMathToken,
  OoxmlMarkupToken,
  OoxmlOffsetMapEntry,
  OoxmlPackageSnapshot,
  OoxmlRegionProjection,
  OoxmlRelationship,
  OoxmlTextToken,
  OoxmlToken,
  ProtectedOoxmlToken,
  RegionHandle,
} from "./index.js";

interface RegionBuilder {
  handle: RegionHandle;
  containerPath: string;
  runs: FormattedRun[];
  events: Extract<OoxmlEvent, { kind: "text" }>[];
  markupTokens: OoxmlMarkupToken[];
  semanticTokens: Array<OoxmlMathToken | OoxmlFigureToken>;
  protectedTokens: ProtectedOoxmlToken[];
  relationshipIdsUsed: Set<string>;
  relationshipTargets: ReadonlyMap<string, string>;
  relationships: ReadonlyMap<string, OoxmlRelationship>;
  mediaHashes: ReadonlyMap<string, string>;
  contentTypesByPart: ReadonlyMap<string, string>;
  mathOrdinal: number;
}

export function projectOoxmlRegions(
  snapshot: OoxmlPackageSnapshot,
  partName = snapshot.documentPartName
): OoxmlRegionProjection[] {
  return projectOoxmlRegionsFromEvents(
    snapshot,
    streamOoxmlPartEvents(snapshot, partName),
    partName
  );
}

export function projectOoxmlRegionsFromEvents(
  snapshot: OoxmlPackageSnapshot,
  events: readonly OoxmlEvent[],
  partName = snapshot.documentPartName
): OoxmlRegionProjection[] {
  const relationshipTable = snapshot.relationships.byPart.get(partName);
  const relationshipTargets = new Map(
    [...(relationshipTable?.relationships ?? new Map()).entries()].map(
      ([id, relationship]) => [id, relationship.target]
    )
  );
  const regions: OoxmlRegionProjection[] = [];
  let current: RegionBuilder | undefined;
  let paragraphIndex = 0;

  for (const event of events) {
    if (event.kind === "elementStart" && event.name === "w:p") {
      current = {
        handle: {
          partName,
          path: event.path,
          structuralPath: event.path,
          paragraphIndex,
          paragraphId: event.attrs["w14:paraId"] ?? event.attrs.paraId,
        },
        containerPath: event.path,
        runs: [],
        events: [],
        markupTokens: [],
        semanticTokens: [],
        protectedTokens: [],
        relationshipIdsUsed: new Set(),
        relationshipTargets,
        relationships: relationshipTable?.relationships ?? new Map(),
        mediaHashes: snapshot.hashes,
        contentTypesByPart: contentTypesByPart(snapshot),
        mathOrdinal: 0,
      };
      paragraphIndex += 1;
      continue;
    }

    if (!current) {
      continue;
    }

    if (event.kind === "text") {
      const hyperlinkRelationshipId = event.runStyle.hyperlinkRelationshipId;
      if (hyperlinkRelationshipId) {
        current.relationshipIdsUsed.add(hyperlinkRelationshipId);
      }
      current.events.push(event);
      current.runs.push({
        text: event.text,
        ...(event.runStyle.bold ? { bold: true } : undefined),
        ...(event.runStyle.italic ? { italic: true } : undefined),
        ...(event.runStyle.strikethrough ? { strikethrough: true } : undefined),
        ...(event.runStyle.underline ? { underline: true } : undefined),
        ...(event.runStyle.code ? { code: true } : undefined),
        ...(hyperlinkRelationshipId
          ? {
              hyperlink:
                current.relationshipTargets.get(hyperlinkRelationshipId) ??
                hyperlinkRelationshipId,
            }
          : undefined),
      });
      continue;
    }

    if (event.kind === "elementStart" && event.name === "w:pPr") {
      current.markupTokens.push({
        kind: "markup",
        partName: event.partName,
        path: event.path,
        xml: event.xml ?? "",
        xmlStart: event.xmlStart,
        xmlEnd: event.xmlEnd,
        preservation: "protected",
        role: "paragraph-properties",
      });
      continue;
    }

    if (
      event.kind === "elementStart" &&
      event.name === "w:rPr" &&
      hasUnsupportedRunProperties(event.xml ?? "")
    ) {
      current.protectedTokens.push({
        kind: "protected",
        partName: event.partName,
        path: event.path,
        xml: event.xml ?? "",
        reason: "unsupported-run-properties",
        xmlStart: event.xmlStart,
        xmlEnd: event.xmlEnd,
        preservation: "unsupported",
      });
      continue;
    }

    if (event.kind === "protected") {
      const semanticToken = semanticTokenForProtectedEvent(current, event);
      if (semanticToken) {
        current.semanticTokens.push(semanticToken);
        const relationshipIds =
          semanticToken.kind === "figure"
            ? semanticToken.relationshipIds
            : event.relationshipIds ?? [];
        for (const relationshipId of relationshipIds) {
          current.relationshipIdsUsed.add(relationshipId);
        }
        continue;
      }

      for (const relationshipId of event.relationshipIds ?? []) {
        current.relationshipIdsUsed.add(relationshipId);
      }
      current.protectedTokens.push({
        kind: "protected",
        partName: event.partName,
        path: event.path,
        xml: event.xml,
        reason: event.reason,
        relationshipIds: event.relationshipIds,
        xmlStart: event.xmlStart,
        xmlEnd: event.xmlEnd,
        preservation: "protected",
      });
      continue;
    }

    if (event.kind === "elementEnd" && event.name === "w:p") {
      regions.push(finalizeRegion(current));
      current = undefined;
    }
  }

  return regions;
}

function hasUnsupportedRunProperties(xml: string): boolean {
  const supported = new Set([
    "w:rPr",
    "w:b",
    "w:i",
    "w:strike",
    "w:dstrike",
    "w:u",
    "w:rStyle",
  ]);
  for (const match of xml.matchAll(/<(w:[A-Za-z0-9]+)\b/g)) {
    if (!supported.has(match[1])) {
      return true;
    }
  }
  return false;
}

function semanticTokenForProtectedEvent(
  region: RegionBuilder,
  event: Extract<OoxmlEvent, { kind: "protected" }>
): OoxmlMathToken | OoxmlFigureToken | undefined {
  if (event.reason === "math") {
    const token = projectOoxmlMathToken({
      partName: event.partName,
      path: event.path,
      xml: event.xml,
      xmlStart: event.xmlStart,
      xmlEnd: event.xmlEnd,
      ordinal: region.mathOrdinal,
    });
    region.mathOrdinal += 1;
    return token.preservation === "semantic-preserved" ? token : undefined;
  }

  if (event.reason !== "drawing") {
    return undefined;
  }

  const token = projectOoxmlFigureToken({
    partName: event.partName,
    path: event.path,
    xml: event.xml,
    xmlStart: event.xmlStart,
    xmlEnd: event.xmlEnd,
    relationships: region.relationships,
    mediaHashes: region.mediaHashes,
    contentTypes: region.contentTypesByPart,
  });

  return token.primaryMediaPartName ? token : undefined;
}

function finalizeRegion(region: RegionBuilder): OoxmlRegionProjection {
  const content = projectRegionContent(region);
  const allTokens: OoxmlToken[] = [
    ...region.markupTokens,
    ...content.tokens,
    ...region.protectedTokens,
  ].sort(
    (left, right) =>
      (left.xmlStart ?? Number.MAX_SAFE_INTEGER) -
      (right.xmlStart ?? Number.MAX_SAFE_INTEGER)
  );

  return {
    handle: region.handle,
    containerPath: region.containerPath,
    plainText: content.plainText,
    markdownText: content.markdownText,
    offsetMap: content.offsetMap,
    tokens: allTokens,
    protectedTokens: region.protectedTokens,
    relationshipsUsed: [...region.relationshipIdsUsed],
  };
}

interface RegionContentProjection {
  plainText: string;
  markdownText: string;
  offsetMap: OoxmlOffsetMapEntry[];
  tokens: Array<OoxmlTextToken | OoxmlMathToken | OoxmlFigureToken>;
}

function projectRegionContent(region: RegionBuilder): RegionContentProjection {
  const items: Array<
    | { kind: "text"; index: number; xmlStart: number }
    | { kind: "semantic"; token: OoxmlMathToken | OoxmlFigureToken; xmlStart: number }
  > = [
    ...region.events.map((event, index) => ({
      kind: "text" as const,
      index,
      xmlStart: event.xmlStart ?? Number.MAX_SAFE_INTEGER,
    })),
    ...region.semanticTokens.map((token) => ({
      kind: "semantic" as const,
      token,
      xmlStart: token.xmlStart ?? Number.MAX_SAFE_INTEGER,
    })),
  ].sort((left, right) => left.xmlStart - right.xmlStart);

  let plainText = "";
  let markdownText = "";
  const offsetMap: OoxmlOffsetMapEntry[] = [];
  const tokens: Array<OoxmlTextToken | OoxmlMathToken | OoxmlFigureToken> = [];
  let pendingTextIndexes: number[] = [];

  const flushText = (): void => {
    if (pendingTextIndexes.length === 0) {
      return;
    }
    const segmentRuns = pendingTextIndexes.map((index) => region.runs[index]);
    const projection = projectFormattedRunsToMarkdown(segmentRuns);
    const plainBase = plainText.length;
    const markdownBase = markdownText.length;

    plainText += projection.plainText;
    markdownText += projection.markdownText;

    for (const [offsetIndex, eventIndex] of pendingTextIndexes.entries()) {
      const event = region.events[eventIndex];
      const offset = projection.offsetMap[offsetIndex] ?? {
        plainStart: 0,
        plainEnd: 0,
        markdownStart: 0,
        markdownEnd: 0,
      };
      const shiftedOffset = {
        plainStart: plainBase + offset.plainStart,
        plainEnd: plainBase + offset.plainEnd,
        markdownStart: markdownBase + offset.markdownStart,
        markdownEnd: markdownBase + offset.markdownEnd,
      };
      offsetMap.push(shiftedOffset);
      tokens.push(textTokenForEvent(event, shiftedOffset));
    }

    pendingTextIndexes = [];
  };

  for (const item of items) {
    if (item.kind === "text") {
      pendingTextIndexes.push(item.index);
      continue;
    }

    flushText();
    const markdown = semanticMarkdown(item.token);
    const offset = {
      plainStart: plainText.length,
      plainEnd: plainText.length + markdown.length,
      markdownStart: markdownText.length,
      markdownEnd: markdownText.length + markdown.length,
    };
    plainText += markdown;
    markdownText += markdown;
    offsetMap.push(offset);
    tokens.push({ ...item.token, ...offset });
  }

  flushText();
  return { plainText, markdownText, offsetMap, tokens };
}

function textTokenForEvent(
  event: Extract<OoxmlEvent, { kind: "text" }>,
  offset: OoxmlOffsetMapEntry
): OoxmlTextToken {
  return {
    kind: "text",
    partName: event.partName,
    path: event.path,
    text: event.text,
    style: event.runStyle,
    plainStart: offset.plainStart,
    plainEnd: offset.plainEnd,
    markdownStart: offset.markdownStart,
    markdownEnd: offset.markdownEnd,
    xmlStart: event.xmlStart,
    xmlEnd: event.xmlEnd,
    textStart: event.textStart,
    textEnd: event.textEnd,
    preservation: isPlainStyle(event.runStyle)
      ? "editable-plain"
      : "editable-modeled-style",
  };
}

function semanticMarkdown(token: OoxmlMathToken | OoxmlFigureToken): string {
  if (token.kind === "math") {
    return mathMarkdown(token.latex, token.displayMode);
  }
  return imageMarkdown(token.altText ?? "", token.markdownSrc);
}

function contentTypesByPart(
  snapshot: OoxmlPackageSnapshot
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const [partName, part] of snapshot.parts.entries()) {
    const contentType =
      part.contentType ??
      snapshot.contentTypes.overrides.get(partName) ??
      snapshot.contentTypes.defaults.get(extensionForPartName(partName));
    if (contentType) {
      result.set(partName, contentType);
    }
  }
  return result;
}

function extensionForPartName(partName: string): string {
  return partName.split(".").pop()?.toLowerCase() ?? "";
}

function isPlainStyle(style: {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  hyperlinkRelationshipId?: string;
}): boolean {
  return (
    !style.bold &&
    !style.italic &&
    !style.strikethrough &&
    !style.underline &&
    !style.code &&
    !style.hyperlinkRelationshipId
  );
}
