import JSZip from "jszip";
import type {
  ContentTypeIndex,
  OoxmlPackageCapabilities,
  OoxmlPackageSnapshot,
  OoxmlPart,
  RelationshipGraph,
} from "./index.js";
import {
  parseRelationshipPartNameToSourcePartName,
  parseRelationshipGraph,
  relationshipPartNameForSourcePartName,
  serializeRelationshipTableXml,
} from "./relationships.js";
import type { ParsedRelationshipTable } from "./relationships.js";

export type OoxmlPackageInput = Uint8Array | ArrayBuffer | string;

export interface DecodeOoxmlPackageOptions {
  trace?: (
    phase: string,
    detail?: Record<string, string | number | boolean | undefined>
  ) => void;
  yieldEveryParts?: number;
  yieldToHost?: () => Promise<void>;
}

const CONTENT_TYPES_PART = "[Content_Types].xml";
const ROOT_RELATIONSHIPS_PART = "_rels/.rels";
const OFFICE_DOCUMENT_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

const FULL_PACKAGE_CAPABILITIES: OoxmlPackageCapabilities = {
  hasFullPackage: true,
  canPreserveUntouchedParts: true,
  canAllocateRelationships: true,
};

export async function decodeOoxmlPackage(
  input: OoxmlPackageInput,
  options: DecodeOoxmlPackageOptions = {}
): Promise<OoxmlPackageSnapshot> {
  const startedAt = Date.now();
  const trace = options.trace;
  const yieldEveryParts = Math.max(0, Math.floor(options.yieldEveryParts ?? 0));
  const yieldToHost = options.yieldToHost ?? yieldToEventLoop;
  trace?.("ZIP_LOAD_STARTED", {
    inputKind:
      typeof input === "string"
        ? "base64"
        : input instanceof ArrayBuffer
          ? "arraybuffer"
          : "uint8array",
  });
  const zip = await JSZip.loadAsync(
    input,
    typeof input === "string" ? { base64: true } : undefined
  );
  trace?.("ZIP_LOAD_DONE", {
    elapsedMs: Date.now() - startedAt,
    zipEntryCount: Object.keys(zip.files).length,
  });
  trace?.("CONTENT_TYPES_TEXT_STARTED", { partName: CONTENT_TYPES_PART });
  const contentTypesPart = zip.file(CONTENT_TYPES_PART);
  const contentTypesText = contentTypesPart
    ? await contentTypesPart.async("text")
    : "";
  trace?.("CONTENT_TYPES_TEXT_DONE", {
    elapsedMs: Date.now() - startedAt,
    chars: contentTypesText.length,
  });
  const contentTypes = parseContentTypes(contentTypesText);
  trace?.("CONTENT_TYPES_PARSED", {
    defaults: contentTypes.defaults.size,
    overrides: contentTypes.overrides.size,
  });


  const parts = new Map<string, OoxmlPart>();
  const hashes = new Map<string, string>();

  const fileNames = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  trace?.("PARTS_DISCOVERED", { fileCount: fileNames.length });

  let visited = 0;
  let decoded = 0;
  let skipped = 0;
  for (const name of fileNames) {
    if (yieldEveryParts > 0 && visited > 0 && visited % yieldEveryParts === 0) {
      trace?.("PARTS_YIELD_STARTED", {
        visited,
        decoded,
        skipped,
        nextPartName: name,
      });
      await yieldToHost();
      trace?.("PARTS_YIELDED", {
        visited,
        decoded,
        skipped,
        nextPartName: name,
      });
    }

    visited += 1;
    const file = zip.file(name);
    if (!file) {
      continue;
    }

    const contentType = getContentTypeForPart(name, contentTypes);
    const textPart = isTextPart(name, contentType);
    const partMeta = {
      visited,
      decoded,
      skipped,
      partName: name,
      contentType,
      textPart,
      fileCount: fileNames.length,
    };
    trace?.("PART_TEXT_STARTED", {
      ...partMeta,
    });
    const textStartedAt = Date.now();
    const text = textPart ? await file.async("text") : undefined;
    if (textPart) {
      trace?.("PART_TEXT_DONE", {
        ...partMeta,
        elapsedMs: elapsedMsSince(textStartedAt),
        totalElapsedMs: elapsedMsSince(startedAt),
        chars: text?.length ?? 0,
      });
    } else {
      trace?.("PART_TEXT_SKIPPED", {
        ...partMeta,
        elapsedMs: elapsedMsSince(textStartedAt),
        totalElapsedMs: elapsedMsSince(startedAt),
        reason: "non-text-part",
      });
    }
    trace?.("PART_BYTES_STARTED", {
      ...partMeta,
    });
    const bytesStartedAt = Date.now();
    const bytes = await file.async("uint8array");
    trace?.("PART_BYTES_DONE", {
      ...partMeta,
      elapsedMs: elapsedMsSince(bytesStartedAt),
      totalElapsedMs: elapsedMsSince(startedAt),
      bytes: bytes.byteLength,
    });
    trace?.("PART_HASH_STARTED", {
      visited,
      decoded,
      skipped,
      partName: name,
      bytes: bytes.byteLength,
    });
    const hash = stableBytesHash(bytes);
    trace?.("PART_HASH_DONE", {
      visited,
      decoded,
      skipped,
      partName: name,
      bytes: bytes.byteLength,
      hash,
    });
    const part: OoxmlPart = {
      name,
      contentType,
      hash,
      bytes,
    };
    if (text !== undefined) part.text = text;

    parts.set(name, part);
    hashes.set(name, hash);
    decoded += 1;
    trace?.("PART_DONE", {
      visited,
      decoded,
      skipped,
      partName: name,
      textPart,
    });
  }


  trace?.("RELATIONSHIPS_PARSE_STARTED", { partCount: parts.size });
  const relationships = parseRelationshipGraph(parts);
  trace?.("RELATIONSHIPS_PARSE_DONE", {
    relationshipPartCount: relationships.byPart.size,
  });
  const documentPartName =
    findDocumentPartName(relationships) ?? "word/document.xml";
  trace?.("DONE", {
    elapsedMs: Date.now() - startedAt,
    partCount: parts.size,
    decoded,
    skipped,
    documentPartName,
  });

  return {
    source: "package-ooxml",
    freshnessVersion: "decoded",
    parts,
    relationships,
    contentTypes,
    documentPartName,
    rootRelationshipsPartName: ROOT_RELATIONSHIPS_PART,
    hashes,
    capabilities: FULL_PACKAGE_CAPABILITIES,
  };
}


function elapsedMsSince(start: number): number {
  return Math.max(0, Date.now() - start);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function encodeOoxmlPackage(
  snapshot: OoxmlPackageSnapshot
): Promise<Uint8Array> {
  const zip = new JSZip();
  const relationshipPartUpdates = relationshipPartUpdatesForSnapshot(snapshot);
  const partNames = new Set([
    ...snapshot.parts.keys(),
    ...relationshipPartUpdates.keys(),
  ]);

  for (const partName of [...partNames].sort()) {
    const part = snapshot.parts.get(partName);
    const relationshipBytes = relationshipPartUpdates.get(partName);
    if (relationshipBytes) {
      zip.file(partName, toArrayBuffer(relationshipBytes));
      continue;
    }

    if (isRelationshipsPart(partName)) {
      const sourcePartName =
        parseRelationshipPartNameToSourcePartName(partName);
      if (!snapshot.relationships.byPart.has(sourcePartName)) {
        continue;
      }
    }

    if (part?.bytes === undefined) {
      throw new Error(`Cannot encode OOXML part without bytes: ${partName}`);
    }

    zip.file(partName, toArrayBuffer(part.bytes));
  }

  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function isRelationshipsPart(partName: string): boolean {
  return partName === ROOT_RELATIONSHIPS_PART || partName.endsWith(".rels");
}

function relationshipPartUpdatesForSnapshot(
  snapshot: OoxmlPackageSnapshot
): Map<string, Uint8Array> {
  const updates = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();

  for (const [sourcePartName, table] of snapshot.relationships.byPart) {
    const parsedTable = table as Partial<ParsedRelationshipTable>;
    const canonicalXml = serializeRelationshipTableXml(table);
    if (parsedTable.originalCanonicalXml === canonicalXml) {
      continue;
    }

    const relationshipPartName =
      parsedTable.relationshipPartName ??
      relationshipPartNameForSourcePartName(sourcePartName);
    updates.set(relationshipPartName, encoder.encode(canonicalXml));
  }

  return updates;
}

function parseContentTypes(xml: string): ContentTypeIndex {
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();

  for (const tag of xml.matchAll(/<Default\b[^>]*>/g)) {
    const attrs = parseXmlAttributes(tag[0]);
    const extension = attrs.Extension ?? attrs.extension;
    const contentType = attrs.ContentType ?? attrs.contentType;
    if (extension && contentType) {
      defaults.set(extension, contentType);
    }
  }

  for (const tag of xml.matchAll(/<Override\b[^>]*>/g)) {
    const attrs = parseXmlAttributes(tag[0]);
    const partName = attrs.PartName ?? attrs.partName;
    const contentType = attrs.ContentType ?? attrs.contentType;
    if (partName && contentType) {
      overrides.set(stripLeadingSlash(partName), contentType);
    }
  }

  return { defaults, overrides };
}

function findDocumentPartName(
  relationships: RelationshipGraph
): string | undefined {
  const rootRelationships = relationships.byPart.get(
    ROOT_RELATIONSHIPS_PART
  )?.relationships;
  if (!rootRelationships) {
    return undefined;
  }

  for (const relationship of rootRelationships.values()) {
    if (
      relationship.type === OFFICE_DOCUMENT_RELATIONSHIP_TYPE ||
      relationship.type.endsWith("/officeDocument")
    ) {
      return stripLeadingSlash(relationship.target);
    }
  }

  return undefined;
}

function getContentTypeForPart(
  partName: string,
  contentTypes: ContentTypeIndex
): string | undefined {
  const override = contentTypes.overrides.get(partName);
  if (override) {
    return override;
  }

  const extension = partName.includes(".")
    ? partName.slice(partName.lastIndexOf(".") + 1)
    : "";
  return extension ? contentTypes.defaults.get(extension) : undefined;
}

function isTextPart(
  partName: string,
  contentType: string | undefined
): boolean {
  return (
    partName.endsWith(".xml") ||
    partName.endsWith(".rels") ||
    contentType?.includes("xml") === true ||
    contentType?.startsWith("text/") === true
  );
}


function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  )) {
    attrs[match[1]] = decodeXmlAttribute(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

/** Stable FNV-1a byte hash for preservation checks; not cryptographic. */
function stableBytesHash(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
