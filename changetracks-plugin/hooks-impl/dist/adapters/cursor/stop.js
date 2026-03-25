#!/usr/bin/env node

// ../../packages/core/dist-esm/config/index.js
var DEFAULT_CONFIG = {
  tracking: {
    include: ["**/*.md"],
    exclude: ["node_modules/**", "dist/**"],
    default: "tracked",
    auto_header: true
  },
  author: {
    default: "",
    enforcement: "optional"
  },
  matching: { mode: "normalized" },
  hashline: { enabled: false, auto_remap: true },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  coherence: { threshold: 98 },
  review: {
    may_review: { human: true, agent: true },
    self_acceptance: { human: true, agent: true },
    cross_withdrawal: { human: false, agent: false },
    blocking_labels: {}
  },
  reasoning: {
    propose: { human: false, agent: true },
    review: { human: false, agent: true }
  },
  policy: {
    mode: "safety-net",
    creation_tracking: "footnote",
    default_view: "review",
    view_policy: "suggest"
  }
};

// ../../packages/core/dist-esm/timestamp.js
var TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s?([AaPp][Mm])?(Z)?)?$/;
function normalizeHour(hour, ampm) {
  if (!ampm)
    return hour;
  const upper = ampm.toUpperCase();
  if (upper === "AM")
    return hour === 12 ? 0 : hour;
  if (upper === "PM")
    return hour === 12 ? 12 : hour + 12;
  return hour;
}
function parseTimestamp(raw) {
  const m = TIMESTAMP_RE.exec(raw.trim());
  if (!m) {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
    const date2 = dateMatch ? dateMatch[1] : raw.trim();
    return { raw, date: date2, sortable: date2 ? `${date2}T00:00:00Z` : raw };
  }
  const date = m[1];
  const hourRaw = m[2];
  const minuteRaw = m[3];
  const secondRaw = m[4];
  const ampm = m[5];
  const zulu = m[6];
  if (hourRaw === void 0) {
    return { raw, date, sortable: `${date}T00:00:00Z` };
  }
  const hour = normalizeHour(parseInt(hourRaw, 10), ampm);
  const minute = parseInt(minuteRaw, 10);
  const second = secondRaw ? parseInt(secondRaw, 10) : 0;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  const utc = zulu === "Z";
  const sortable = `${date}T${time}${utc ? "Z" : ""}`;
  return { raw, date, time, utc, sortable };
}
function nowTimestamp() {
  const iso = (/* @__PURE__ */ new Date()).toISOString();
  const raw = iso.replace(/\.\d{3}Z$/, "Z");
  return parseTimestamp(raw);
}

// ../../packages/core/dist-esm/model/types.js
var ChangeType;
(function(ChangeType2) {
  ChangeType2["Insertion"] = "Insertion";
  ChangeType2["Deletion"] = "Deletion";
  ChangeType2["Substitution"] = "Substitution";
  ChangeType2["Highlight"] = "Highlight";
  ChangeType2["Comment"] = "Comment";
})(ChangeType || (ChangeType = {}));
var ChangeStatus;
(function(ChangeStatus2) {
  ChangeStatus2["Proposed"] = "Proposed";
  ChangeStatus2["Accepted"] = "Accepted";
  ChangeStatus2["Rejected"] = "Rejected";
})(ChangeStatus || (ChangeStatus = {}));
function isGhostNode(change) {
  return change.anchored === false && change.level >= 2 && !change.consumedBy;
}

// ../../packages/core/dist-esm/model/document.js
var VirtualDocument = class _VirtualDocument {
  constructor(changes = [], coherenceRate = 100, unresolvedDiagnostics = [], resolvedText) {
    this.changes = changes;
    this.coherenceRate = coherenceRate;
    this.unresolvedDiagnostics = unresolvedDiagnostics;
    this.resolvedText = resolvedText;
  }
  /**
   * Create a VirtualDocument from a pending overlay only (no parse).
   * Used when LSP is disconnected and overlay exists — enables display of
   * pending insertion before LSP connects.
   */
  static fromOverlayOnly(overlay) {
    const change = {
      id: overlay.scId ?? `ct-pending-${overlay.range.start}`,
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: overlay.range,
      contentRange: overlay.range,
      modifiedText: overlay.text,
      level: 1,
      anchored: false
    };
    return new _VirtualDocument([change]);
  }
  getChanges() {
    return this.changes;
  }
  /** Returns L2+ ghost nodes that failed anchor resolution. L0/L1 unanchored nodes are excluded. */
  getUnresolvedChanges() {
    return this.changes.filter((c) => isGhostNode(c));
  }
  changeAtOffset(offset) {
    for (const change of this.changes) {
      if (change.range.start === change.range.end ? offset === change.range.start : offset >= change.range.start && offset < change.range.end) {
        return change;
      }
    }
    return null;
  }
  acceptChange(id) {
    const change = this.changes.find((c) => c.id === id);
    if (change) {
      change.status = ChangeStatus.Accepted;
    }
  }
  rejectChange(id) {
    const change = this.changes.find((c) => c.id === id);
    if (change) {
      change.status = ChangeStatus.Rejected;
    }
  }
  /**
   * Returns all changes belonging to a given group (e.g., a move operation).
   * Changes are identified by their groupId field.
   */
  getGroupMembers(groupId) {
    return this.changes.filter((c) => c.groupId === groupId);
  }
};

// ../../packages/core/dist-esm/parser/tokens.js
var TokenType;
(function(TokenType2) {
  TokenType2["AdditionOpen"] = "{++";
  TokenType2["AdditionClose"] = "++}";
  TokenType2["DeletionOpen"] = "{--";
  TokenType2["DeletionClose"] = "--}";
  TokenType2["SubstitutionOpen"] = "{~~";
  TokenType2["SubstitutionClose"] = "~~}";
  TokenType2["SubstitutionSeparator"] = "~>";
  TokenType2["HighlightOpen"] = "{==";
  TokenType2["HighlightClose"] = "==}";
  TokenType2["CommentOpen"] = "{>>";
  TokenType2["CommentClose"] = "<<}";
})(TokenType || (TokenType = {}));

// ../../packages/core/dist-esm/parser/code-zones.js
function findCodeZones(text) {
  const zones = [];
  let position = 0;
  let atLineStart = true;
  let inFence = false;
  let fenceStart = 0;
  let fenceMarkerCode = 0;
  let fenceLength = 0;
  while (position < text.length) {
    const ch = text.charCodeAt(position);
    if (inFence) {
      if (atLineStart) {
        const closeResult = tryMatchFenceClose(text, position, fenceMarkerCode, fenceLength);
        if (closeResult >= 0) {
          zones.push({ start: fenceStart, end: closeResult, type: "fence" });
          inFence = false;
          position = closeResult;
          atLineStart = true;
          continue;
        }
      }
      const nextNewline = text.indexOf("\n", position);
      if (nextNewline === -1) {
        position = text.length;
      } else {
        position = nextNewline + 1;
        atLineStart = true;
      }
      continue;
    }
    if (atLineStart) {
      const fenceResult = tryMatchFenceOpen(text, position);
      if (fenceResult) {
        inFence = true;
        fenceStart = position;
        fenceMarkerCode = fenceResult.markerCode;
        fenceLength = fenceResult.length;
        position = fenceResult.nextPos;
        atLineStart = true;
        continue;
      }
    }
    if (ch === 96) {
      const codeStart = position;
      let openEnd = position;
      while (openEnd < text.length && text.charCodeAt(openEnd) === 96) {
        openEnd++;
      }
      const runLength = openEnd - position;
      let scanPos = openEnd;
      let found = false;
      while (scanPos < text.length) {
        if (text.charCodeAt(scanPos) !== 96) {
          scanPos++;
          continue;
        }
        const closeRunStart = scanPos;
        while (scanPos < text.length && text.charCodeAt(scanPos) === 96) {
          scanPos++;
        }
        if (scanPos - closeRunStart === runLength) {
          zones.push({ start: codeStart, end: scanPos, type: "inline" });
          atLineStart = text.charCodeAt(scanPos - 1) === 10;
          position = scanPos;
          found = true;
          break;
        }
      }
      if (!found) {
        atLineStart = false;
        position = openEnd;
      }
      continue;
    }
    atLineStart = ch === 10;
    position++;
  }
  if (inFence) {
    zones.push({ start: fenceStart, end: text.length, type: "fence" });
  }
  return zones;
}
function tryMatchFenceOpen(text, position) {
  let pos = position;
  let spaces = 0;
  while (spaces < 3 && pos < text.length && text.charCodeAt(pos) === 32) {
    spaces++;
    pos++;
  }
  if (pos >= text.length)
    return null;
  const markerCode = text.charCodeAt(pos);
  if (markerCode !== 96 && markerCode !== 126)
    return null;
  let runLength = 0;
  while (pos < text.length && text.charCodeAt(pos) === markerCode) {
    runLength++;
    pos++;
  }
  if (runLength < 3)
    return null;
  if (markerCode === 96) {
    const lineEnd = text.indexOf("\n", pos);
    const infoEnd = lineEnd === -1 ? text.length : lineEnd;
    const infoString = text.substring(pos, infoEnd);
    if (infoString.includes("`"))
      return null;
  }
  const nextNewline = text.indexOf("\n", pos);
  const nextPos = nextNewline === -1 ? text.length : nextNewline + 1;
  return { markerCode, length: runLength, nextPos };
}
function tryMatchFenceClose(text, position, fenceMarkerCode, fenceLength) {
  let pos = position;
  let spaces = 0;
  while (spaces < 3 && pos < text.length && text.charCodeAt(pos) === 32) {
    spaces++;
    pos++;
  }
  if (pos >= text.length)
    return -1;
  if (text.charCodeAt(pos) !== fenceMarkerCode)
    return -1;
  let runLength = 0;
  while (pos < text.length && text.charCodeAt(pos) === fenceMarkerCode) {
    runLength++;
    pos++;
  }
  if (runLength < fenceLength)
    return -1;
  while (pos < text.length && text.charCodeAt(pos) !== 10) {
    const c = text.charCodeAt(pos);
    if (c !== 32 && c !== 9)
      return -1;
    pos++;
  }
  if (pos < text.length && text.charCodeAt(pos) === 10) {
    pos++;
  }
  return pos;
}
function skipInlineCode(text, position) {
  let openEnd = position;
  while (openEnd < text.length && text.charCodeAt(openEnd) === 96) {
    openEnd++;
  }
  const runLength = openEnd - position;
  let scanPos = openEnd;
  while (scanPos < text.length) {
    if (text.charCodeAt(scanPos) !== 96) {
      scanPos++;
      continue;
    }
    const closeRunStart = scanPos;
    while (scanPos < text.length && text.charCodeAt(scanPos) === 96) {
      scanPos++;
    }
    if (scanPos - closeRunStart === runLength) {
      return scanPos;
    }
  }
  return position;
}

// ../../packages/core/dist-esm/footnote-patterns.js
var FOOTNOTE_ID_PATTERN = "ct-\\d+(?:\\.\\d+)?";
var FOOTNOTE_ID_NUMERIC_PATTERN = "ct-(\\d+)(?:\\.\\d+)?";
var FOOTNOTE_REF_ANCHORED = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`);
function footnoteRefNumericGlobal() {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_NUMERIC_PATTERN}\\]`, "g");
}
var FOOTNOTE_DEF_START = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:`);
var FOOTNOTE_DEF_LENIENT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s*@(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)`);
var FOOTNOTE_DEF_STRICT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:(@\\S+)\\s+\\|\\s+)?(\\S+)\\s+\\|\\s+(\\S+)\\s+\\|\\s+(\\S+)`);
var FOOTNOTE_DEF_STATUS = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:@\\S+\\s+\\|\\s+)?\\S+\\s+\\|\\s+\\S+\\s+\\|\\s+(\\S+)`);
var FOOTNOTE_DEF_STATUS_VALUE = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:\\s.*\\|\\s*(proposed|accepted|rejected)`);
var FOOTNOTE_L3_EDIT_OP = /^ {4}(\d+):([0-9a-fA-F]{2,}) (.*)/;
var CTX_RE = /@ctx:"((?:[^"\\]|\\.)*)"\|\|"((?:[^"\\]|\\.)*)"/;
function unescapeCtxString(s) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function splitBodyAndFootnotes(lines) {
  const text = lines.join("\n");
  const zones = findCodeZones(text);
  let firstFootnoteLine = lines.length;
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const inCodeZone = zones.some((z) => charOffset >= z.start && charOffset < z.end);
    if (!inCodeZone && FOOTNOTE_DEF_START.test(lines[i])) {
      firstFootnoteLine = i;
      break;
    }
    charOffset += lines[i].length + 1;
  }
  let bodyEnd = firstFootnoteLine;
  while (bodyEnd > 0 && lines[bodyEnd - 1].trim() === "") {
    bodyEnd--;
  }
  return {
    bodyLines: lines.slice(0, bodyEnd),
    footnoteLines: lines.slice(firstFootnoteLine),
    bodyEndIndex: bodyEnd
  };
}
var FOOTNOTE_THREAD_REPLY = /^\s+@\S+\s+\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?Z?)?:/;

// ../../packages/core/dist-esm/operations/footnote-generator.js
function generateFootnoteDefinition(id, type, author, date) {
  const d = date ?? nowTimestamp().date;
  const authorPart = author ? `@${author} | ` : "";
  return `

[^${id}]: ${authorPart}${d} | ${type} | proposed`;
}
function buildEditOpFromParts(changeType, originalText, currentText) {
  switch (changeType) {
    case "insertion":
      return `{++${currentText}++}`;
    case "deletion":
      return `{--${originalText}--}`;
    case "highlight":
      return `{==${originalText}==}`;
    case "comment":
      return `{>>${originalText}<<}`;
    default:
      return `{~~${originalText}~>${currentText}~~}`;
  }
}
function formatL3EditOpLine(lineNumber, hash, editOp) {
  return `    ${lineNumber}:${hash} ${editOp}`;
}
var CHANGE_TYPE_KEY = {
  [ChangeType.Insertion]: "insertion",
  [ChangeType.Deletion]: "deletion",
  [ChangeType.Substitution]: "substitution",
  [ChangeType.Highlight]: "highlight",
  [ChangeType.Comment]: "comment"
};
function buildContextualL3EditOp(params) {
  const { changeType, originalText, currentText, lineContent, lineNumber, hash, column, anchorLen } = params;
  const rawOp = buildEditOpFromParts(CHANGE_TYPE_KEY[changeType], originalText, currentText);
  if (!lineContent) {
    return formatL3EditOpLine(lineNumber, hash, rawOp);
  }
  const clampedCol = Math.max(0, Math.min(column, lineContent.length));
  const clampedEnd = Math.max(clampedCol, Math.min(clampedCol + anchorLen, lineContent.length));
  let spanStart = clampedCol;
  let spanEnd = clampedEnd;
  let expandLeft = false;
  let unique = false;
  while (!unique) {
    if (!expandLeft) {
      if (spanEnd < lineContent.length)
        spanEnd++;
      expandLeft = true;
    } else {
      if (spanStart > 0)
        spanStart--;
      expandLeft = false;
    }
    const candidate = lineContent.slice(spanStart, spanEnd);
    const first = lineContent.indexOf(candidate);
    const second = lineContent.indexOf(candidate, first + 1);
    unique = second === -1;
    if (spanStart === 0 && spanEnd === lineContent.length) {
      unique = true;
    }
  }
  const preSnapStart = spanStart;
  const preSnapEnd = spanEnd;
  while (spanEnd < lineContent.length && lineContent[spanEnd] !== " ")
    spanEnd++;
  while (spanStart > 0 && lineContent[spanStart - 1] !== " ")
    spanStart--;
  const snapped = lineContent.slice(spanStart, spanEnd);
  const snapFirst = lineContent.indexOf(snapped);
  const snapSecond = lineContent.indexOf(snapped, snapFirst + 1);
  if (snapSecond !== -1) {
    spanStart = preSnapStart;
    spanEnd = preSnapEnd;
  }
  const contextBefore = lineContent.slice(spanStart, clampedCol);
  const contextAfter = lineContent.slice(clampedEnd, spanEnd);
  return `    ${lineNumber}:${hash} ${contextBefore}${rawOp}${contextAfter}`;
}
function scanMaxCtId(text) {
  const pattern = footnoteRefNumericGlobal();
  let max = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > max) {
      max = n;
    }
  }
  return max;
}

// ../../packages/core/dist-esm/parser/parser.js
function parseInlineMetadata(raw) {
  const result = { raw };
  const fields = raw.split("|").map((f) => f.trim());
  for (const field of fields) {
    if (!field)
      continue;
    if (field.startsWith("@")) {
      result.author = field;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(field)) {
      result.date = field;
    } else if (["ins", "del", "sub", "highlight", "comment"].includes(field)) {
      result.type = field;
    } else if (["proposed", "accepted", "rejected", "approved"].includes(field)) {
      result.status = field;
    } else {
      result.freeText = result.freeText ? `${result.freeText}|${field}` : field;
    }
  }
  return result;
}
function applyImageExtraMetadata(def, metadata) {
  if (!def.extraMetadata)
    return;
  const dimStr = def.extraMetadata["image-dimensions"];
  if (dimStr) {
    const dimMatch = dimStr.match(/^([\d.]+)in\s*x\s*([\d.]+)in$/);
    if (dimMatch) {
      metadata.imageDimensions = {
        widthIn: parseFloat(dimMatch[1]),
        heightIn: parseFloat(dimMatch[2])
      };
    }
  }
  const imageMeta = {};
  for (const [key, value] of Object.entries(def.extraMetadata)) {
    if (key.startsWith("image-") && key !== "image-dimensions") {
      imageMeta[key] = value;
    }
  }
  if (Object.keys(imageMeta).length > 0) {
    metadata.imageMetadata = imageMeta;
  }
}
var CriticMarkupParser = class _CriticMarkupParser {
  constructor() {
    this.idBase = 0;
  }
  parse(text, options) {
    this.idBase = scanMaxCtId(text);
    const changes = [];
    let position = 0;
    let changeCounter = 0;
    const skipCodeBlocks = options?.skipCodeBlocks !== false;
    const settledRefs = /* @__PURE__ */ new Map();
    let atLineStart = true;
    let inFence = false;
    let fenceMarkerCode = 0;
    let fenceLength = 0;
    while (position < text.length) {
      const ch = text.charCodeAt(position);
      if (skipCodeBlocks && inFence) {
        if (atLineStart) {
          const closeResult = tryMatchFenceClose(text, position, fenceMarkerCode, fenceLength);
          if (closeResult >= 0) {
            inFence = false;
            position = closeResult;
            atLineStart = true;
            continue;
          }
        }
        const nextNewline = text.indexOf("\n", position);
        if (nextNewline === -1) {
          position = text.length;
        } else {
          position = nextNewline + 1;
          atLineStart = true;
        }
        continue;
      }
      if (skipCodeBlocks && atLineStart) {
        const fenceResult = tryMatchFenceOpen(text, position);
        if (fenceResult) {
          inFence = true;
          fenceMarkerCode = fenceResult.markerCode;
          fenceLength = fenceResult.length;
          position = fenceResult.nextPos;
          atLineStart = true;
          continue;
        }
      }
      if (skipCodeBlocks && ch === 96) {
        const skipTo = skipInlineCode(text, position);
        if (skipTo > position) {
          atLineStart = text.charCodeAt(skipTo - 1) === 10;
          position = skipTo;
          continue;
        }
        let runEnd = position + 1;
        while (runEnd < text.length && text.charCodeAt(runEnd) === 96) {
          runEnd++;
        }
        atLineStart = false;
        position = runEnd;
        continue;
      }
      const node = this.tryParseNode(text, position, changeCounter);
      if (node) {
        this.tryAttachAdjacentComment(text, node);
        this.tryAttachFootnoteRef(text, node);
        changeCounter++;
        changes.push(node);
        position = node.range.end;
        atLineStart = position > 0 && text.charCodeAt(position - 1) === 10;
      } else {
        if (ch === 91 && text.charCodeAt(position + 1) === 94) {
          const remaining = text.substring(position, position + 30);
          const refMatch = remaining.match(_CriticMarkupParser.FOOTNOTE_REF);
          if (refMatch) {
            const afterRef = position + refMatch[0].length;
            if (text.charCodeAt(afterRef) !== 58) {
              const refId = refMatch[1];
              if (!changes.some((c) => c.id === refId)) {
                settledRefs.set(refId, position);
              }
              position = afterRef;
              atLineStart = false;
              continue;
            }
          }
        }
        atLineStart = ch === 10;
        position++;
      }
    }
    const footnotes = this.parseFootnoteDefinitions(text);
    this.mergeFootnoteMetadata(changes, footnotes, settledRefs);
    this.resolveMoveGroups(changes, footnotes);
    const usedIds = /* @__PURE__ */ new Set();
    for (const c of changes) {
      if (c.anchored) {
        const m = c.id.match(/^ct-(\d+)(?:\.\d+)?$/);
        if (m)
          usedIds.add(parseInt(m[1], 10));
      }
    }
    let nextId = this.idBase;
    const unanchored = changes.filter((c) => !c.anchored && c.id.startsWith("ct-"));
    for (const c of unanchored) {
      do {
        nextId++;
      } while (usedIds.has(nextId));
      c.id = `ct-${nextId}`;
    }
    return new VirtualDocument(changes);
  }
  tryParseNode(text, startPos, counter) {
    if (this.matchesAt(text, startPos, TokenType.AdditionOpen)) {
      return this.parseInsertion(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.DeletionOpen)) {
      return this.parseDeletion(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.SubstitutionOpen)) {
      return this.parseSubstitution(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.HighlightOpen)) {
      return this.parseHighlight(text, startPos, counter);
    }
    if (this.matchesAt(text, startPos, TokenType.CommentOpen)) {
      return this.parseComment(text, startPos, counter);
    }
    return null;
  }
  parseInsertion(text, startPos, counter) {
    const contentStart = startPos + TokenType.AdditionOpen.length;
    const closePos = text.indexOf(TokenType.AdditionClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.AdditionClose.length;
    const content = text.substring(contentStart, closePos);
    return {
      id: this.assignId(counter),
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      modifiedText: content,
      level: 0,
      anchored: false
    };
  }
  parseDeletion(text, startPos, counter) {
    const contentStart = startPos + TokenType.DeletionOpen.length;
    const closePos = text.indexOf(TokenType.DeletionClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.DeletionClose.length;
    const content = text.substring(contentStart, closePos);
    return {
      id: this.assignId(counter),
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalText: content,
      level: 0,
      anchored: false
    };
  }
  /**
   * Finds the next ~~} at or after searchStart that is not inside a backtick-quoted
   * span (so that substitutions whose new text contains literal `` `~~}` `` parse correctly).
   */
  indexOfSubstitutionCloseOutsideBackticks(text, searchStart) {
    const close = TokenType.SubstitutionClose;
    let pos = searchStart;
    while (pos < text.length) {
      const next = text.indexOf(close, pos);
      if (next === -1)
        return -1;
      const between = text.substring(searchStart, next);
      const backtickCount = (between.match(/`/g) ?? []).length;
      if (backtickCount % 2 === 0)
        return next;
      pos = next + close.length;
    }
    return -1;
  }
  parseSubstitution(text, startPos, counter) {
    const contentStart = startPos + TokenType.SubstitutionOpen.length;
    const separatorPos = text.indexOf(TokenType.SubstitutionSeparator, contentStart);
    if (separatorPos === -1)
      return null;
    const modifiedStart = separatorPos + TokenType.SubstitutionSeparator.length;
    const closePos = this.indexOfSubstitutionCloseOutsideBackticks(text, modifiedStart);
    if (closePos === -1 || separatorPos >= closePos) {
      return null;
    }
    const originalText = text.substring(contentStart, separatorPos);
    const modifiedText = text.substring(modifiedStart, closePos);
    const endPos = closePos + TokenType.SubstitutionClose.length;
    return {
      id: this.assignId(counter),
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalRange: { start: contentStart, end: separatorPos },
      modifiedRange: { start: modifiedStart, end: closePos },
      originalText,
      modifiedText,
      level: 0,
      anchored: false
    };
  }
  parseHighlight(text, startPos, counter) {
    const contentStart = startPos + TokenType.HighlightOpen.length;
    const closePos = text.indexOf(TokenType.HighlightClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const highlightedText = text.substring(contentStart, closePos);
    let endPos = closePos + TokenType.HighlightClose.length;
    let comment;
    if (this.matchesAt(text, endPos, TokenType.CommentOpen)) {
      const commentContentStart = endPos + TokenType.CommentOpen.length;
      const commentClosePos = text.indexOf(TokenType.CommentClose, commentContentStart);
      if (commentClosePos !== -1) {
        comment = text.substring(commentContentStart, commentClosePos);
        endPos = commentClosePos + TokenType.CommentClose.length;
      }
    }
    return {
      id: this.assignId(counter),
      type: ChangeType.Highlight,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      originalText: highlightedText,
      metadata: comment !== void 0 ? { comment } : void 0,
      level: 0,
      anchored: false
    };
  }
  parseComment(text, startPos, counter) {
    const contentStart = startPos + TokenType.CommentOpen.length;
    const closePos = text.indexOf(TokenType.CommentClose, contentStart);
    if (closePos === -1) {
      return null;
    }
    const endPos = closePos + TokenType.CommentClose.length;
    const comment = text.substring(contentStart, closePos);
    return {
      id: this.assignId(counter),
      type: ChangeType.Comment,
      status: ChangeStatus.Proposed,
      range: { start: startPos, end: endPos },
      contentRange: { start: contentStart, end: closePos },
      metadata: { comment },
      level: 0,
      anchored: false
    };
  }
  parseFootnoteDefinitions(text) {
    const map = /* @__PURE__ */ new Map();
    let searchStart = 0;
    if (text.startsWith("[^ct-")) {
      searchStart = 0;
    } else {
      const firstDef = text.indexOf("\n[^ct-");
      if (firstDef === -1)
        return map;
      searchStart = firstDef + 1;
    }
    const lines = text.substring(searchStart).split(/\r?\n/);
    let lineOffset2 = 0;
    for (let k = 0; k < searchStart; k++) {
      if (text.charCodeAt(k) === 10)
        lineOffset2++;
    }
    let currentId = null;
    let currentDef = null;
    let lastDiscussionComment = null;
    let inRevisions = false;
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const absLine = lineIdx + lineOffset2;
      const defMatch = line.match(_CriticMarkupParser.FOOTNOTE_DEF);
      if (defMatch) {
        currentId = defMatch[1];
        currentDef = {
          author: defMatch[2],
          date: defMatch[3],
          type: defMatch[4],
          status: defMatch[5],
          startLine: absLine,
          endLine: absLine,
          replyCount: 0
        };
        map.set(currentId, currentDef);
        lastDiscussionComment = null;
        inRevisions = false;
        continue;
      }
      if (!currentId || !currentDef) {
        continue;
      }
      if (line.trim() === "") {
        continue;
      }
      if (!/^[\t ]/.test(line)) {
        currentId = null;
        currentDef = null;
        lastDiscussionComment = null;
        inRevisions = false;
        continue;
      }
      currentDef.endLine = absLine;
      const rawIndent = line.length - line.replace(/^[\t ]+/, "").length;
      const trimmed = line.trim();
      if (trimmed === "revisions:") {
        inRevisions = true;
        lastDiscussionComment = null;
        continue;
      }
      if (inRevisions) {
        const revMatch = trimmed.match(_CriticMarkupParser.REVISION_RE);
        if (revMatch) {
          if (!currentDef.revisions)
            currentDef.revisions = [];
          currentDef.revisions.push({
            label: revMatch[1],
            author: revMatch[2],
            date: revMatch[3],
            timestamp: parseTimestamp(revMatch[3]),
            text: revMatch[4]
          });
          continue;
        }
        inRevisions = false;
      }
      const ctxMatch = trimmed.match(_CriticMarkupParser.CONTEXT_RE);
      if (ctxMatch) {
        currentDef.context = ctxMatch[1];
        lastDiscussionComment = null;
        continue;
      }
      const apprMatch = trimmed.match(_CriticMarkupParser.APPROVAL_RE);
      if (apprMatch) {
        const approval = {
          author: apprMatch[2],
          date: apprMatch[3],
          timestamp: parseTimestamp(apprMatch[3])
        };
        if (apprMatch[4] !== void 0) {
          approval.reason = apprMatch[4];
        }
        switch (apprMatch[1]) {
          case "approved":
            if (!currentDef.approvals)
              currentDef.approvals = [];
            currentDef.approvals.push(approval);
            break;
          case "rejected":
            if (!currentDef.rejections)
              currentDef.rejections = [];
            currentDef.rejections.push(approval);
            break;
          case "request-changes":
            if (!currentDef.requestChanges)
              currentDef.requestChanges = [];
            currentDef.requestChanges.push(approval);
            break;
        }
        lastDiscussionComment = null;
        continue;
      }
      const resolvedMatch = trimmed.match(_CriticMarkupParser.RESOLVED_RE);
      if (resolvedMatch) {
        currentDef.resolution = {
          type: "resolved",
          author: resolvedMatch[1],
          date: resolvedMatch[2],
          timestamp: parseTimestamp(resolvedMatch[2]),
          reason: resolvedMatch[3] || void 0
        };
        lastDiscussionComment = null;
        continue;
      }
      const openMatch = trimmed.match(_CriticMarkupParser.OPEN_RE);
      if (openMatch) {
        currentDef.resolution = {
          type: "open",
          reason: openMatch[1] || void 0
        };
        lastDiscussionComment = null;
        continue;
      }
      const reasonMatch = trimmed.match(_CriticMarkupParser.REASON_RE);
      if (reasonMatch) {
        const comment = {
          author: currentDef.author || "unknown",
          date: currentDef.date || "unknown",
          timestamp: parseTimestamp(currentDef.date || "unknown"),
          text: reasonMatch[1],
          depth: 0
        };
        if (!currentDef.discussion)
          currentDef.discussion = [];
        currentDef.discussion.push(comment);
        lastDiscussionComment = comment;
        continue;
      }
      const discMatch = trimmed.match(_CriticMarkupParser.DISCUSSION_RE);
      if (discMatch) {
        const depth = Math.max(0, Math.floor((rawIndent - 4) / 2));
        const comment = {
          author: discMatch[1],
          date: discMatch[2],
          timestamp: parseTimestamp(discMatch[2]),
          text: discMatch[4],
          depth
        };
        if (discMatch[3]) {
          comment.label = discMatch[3];
        }
        if (!currentDef.discussion)
          currentDef.discussion = [];
        currentDef.discussion.push(comment);
        lastDiscussionComment = comment;
        currentDef.replyCount = (currentDef.replyCount ?? 0) + 1;
        continue;
      }
      if (lastDiscussionComment) {
        lastDiscussionComment.text += "\n" + trimmed;
        continue;
      }
      const kvMatch = trimmed.match(/^([\w-]+):\s+(.*)/);
      if (kvMatch) {
        if (!currentDef.extraMetadata)
          currentDef.extraMetadata = {};
        currentDef.extraMetadata[kvMatch[1]] = kvMatch[2];
        lastDiscussionComment = null;
        continue;
      }
    }
    return map;
  }
  mergeFootnoteMetadata(changes, footnotes, settledRefs) {
    for (const node of changes) {
      const def = footnotes.get(node.id);
      if (!def)
        continue;
      node.level = 2;
      if (def.status === "accepted") {
        node.status = ChangeStatus.Accepted;
      } else if (def.status === "rejected") {
        node.status = ChangeStatus.Rejected;
      }
      const existingComment = node.metadata?.comment;
      node.metadata = {
        ...node.metadata,
        author: def.author,
        date: def.date
      };
      if (existingComment !== void 0) {
        node.metadata.comment = existingComment;
      }
      if (def.context !== void 0) {
        node.metadata.context = def.context;
      }
      if (def.approvals) {
        node.metadata.approvals = def.approvals;
      }
      if (def.rejections) {
        node.metadata.rejections = def.rejections;
      }
      if (def.requestChanges) {
        node.metadata.requestChanges = def.requestChanges;
      }
      if (def.revisions) {
        node.metadata.revisions = def.revisions;
      }
      if (def.discussion) {
        node.metadata.discussion = def.discussion;
      }
      if (def.resolution) {
        node.metadata.resolution = def.resolution;
      }
      applyImageExtraMetadata(def, node.metadata);
      if (def.startLine !== void 0) {
        node.footnoteLineRange = { startLine: def.startLine, endLine: def.endLine ?? def.startLine };
      }
      node.replyCount = def.replyCount ?? 0;
    }
    if (settledRefs) {
      const claimedIds = new Set(changes.map((c) => c.id));
      for (const [id, offset] of settledRefs) {
        if (claimedIds.has(id))
          continue;
        const def = footnotes.get(id);
        if (!def)
          continue;
        const refLength = `[^${id}]`.length;
        let status = ChangeStatus.Proposed;
        if (def.status === "accepted")
          status = ChangeStatus.Accepted;
        else if (def.status === "rejected")
          status = ChangeStatus.Rejected;
        const TYPE_MAP = {
          ins: ChangeType.Insertion,
          del: ChangeType.Deletion,
          sub: ChangeType.Substitution,
          highlight: ChangeType.Highlight,
          comment: ChangeType.Comment,
          insertion: ChangeType.Insertion,
          deletion: ChangeType.Deletion,
          substitution: ChangeType.Substitution
        };
        const type = TYPE_MAP[def.type ?? ""] ?? ChangeType.Substitution;
        const node = {
          id,
          type,
          status,
          range: { start: offset, end: offset + refLength },
          contentRange: { start: offset, end: offset + refLength },
          // covers [^ct-N] ref
          level: 2,
          settled: true,
          anchored: true,
          metadata: {
            author: def.author,
            date: def.date,
            type: def.type,
            status: def.status
          }
        };
        if (def.context !== void 0)
          node.metadata.context = def.context;
        if (def.approvals)
          node.metadata.approvals = def.approvals;
        if (def.rejections)
          node.metadata.rejections = def.rejections;
        if (def.requestChanges)
          node.metadata.requestChanges = def.requestChanges;
        if (def.revisions)
          node.metadata.revisions = def.revisions;
        if (def.discussion)
          node.metadata.discussion = def.discussion;
        if (def.resolution)
          node.metadata.resolution = def.resolution;
        applyImageExtraMetadata(def, node.metadata);
        if (def.startLine !== void 0) {
          node.footnoteLineRange = { startLine: def.startLine, endLine: def.endLine ?? def.startLine };
        }
        node.replyCount = def.replyCount ?? 0;
        changes.push(node);
      }
      changes.sort((a, b) => a.range.start - b.range.start);
    }
  }
  resolveMoveGroups(changes, footnotes) {
    for (const [id, def] of footnotes) {
      if (def.type !== "move")
        continue;
      const parentId = id;
      const prefix = parentId + ".";
      for (const node of changes) {
        if (!node.id.startsWith(prefix))
          continue;
        node.groupId = parentId;
        if (node.type === ChangeType.Deletion) {
          node.moveRole = "from";
        } else if (node.type === ChangeType.Insertion) {
          node.moveRole = "to";
        }
      }
    }
  }
  tryAttachAdjacentComment(text, node) {
    const pos = node.range.end;
    if (!this.matchesAt(text, pos, TokenType.CommentOpen))
      return;
    const contentStart = pos + TokenType.CommentOpen.length;
    const closePos = text.indexOf(TokenType.CommentClose, contentStart);
    if (closePos === -1)
      return;
    const content = text.substring(contentStart, closePos);
    const endPos = closePos + TokenType.CommentClose.length;
    node.inlineMetadata = parseInlineMetadata(content);
    node.level = 1;
    node.range = { start: node.range.start, end: endPos };
  }
  tryAttachFootnoteRef(text, node) {
    if (text.charCodeAt(node.range.end) !== 91)
      return;
    const remaining = text.substring(node.range.end, node.range.end + 30);
    const match = remaining.match(_CriticMarkupParser.FOOTNOTE_REF);
    if (match) {
      node.id = match[1];
      node.footnoteRefStart = node.range.end;
      node.range = { start: node.range.start, end: node.range.end + match[0].length };
      node.level = 2;
      node.anchored = true;
    }
  }
  matchesAt(text, position, delimiter) {
    return text.startsWith(delimiter, position);
  }
  assignId(counter) {
    return `ct-${this.idBase + counter + 1}`;
  }
};
CriticMarkupParser.FOOTNOTE_REF = FOOTNOTE_REF_ANCHORED;
CriticMarkupParser.FOOTNOTE_DEF = FOOTNOTE_DEF_STRICT;
CriticMarkupParser.APPROVAL_RE = /^(approved|rejected|request-changes):\s+(@\S+)\s+(\S+)(?:\s+"([^"]*)")?$/;
CriticMarkupParser.DISCUSSION_RE = /^(@\S+)\s+(\S+)(?:\s+\[([^\]]+)\])?:\s*(.*)$/;
CriticMarkupParser.RESOLVED_RE = /^resolved:?\s+(@\S+)\s+(\S+)(?::\s*(.*))?$/;
CriticMarkupParser.OPEN_RE = /^open(?:\s+--\s+(.*))?$/;
CriticMarkupParser.REVISION_RE = /^(r\d+)\s+(@\S+)\s+(\S+):\s+"([^"]*)"$/;
CriticMarkupParser.CONTEXT_RE = /^context:\s+"([^"]*)"$/;
CriticMarkupParser.REASON_RE = /^reason:\s+(.+)$/;

// ../../packages/core/dist-esm/footnote-utils.js
function parseFootnoteHeader(headerLine) {
  const colonIdx = headerLine.indexOf(":");
  if (colonIdx === -1)
    return null;
  const content = headerLine.slice(colonIdx + 1).trim();
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length < 4)
    return null;
  return {
    author: parts[0].replace(/^@/, ""),
    date: parts[1],
    type: parts[2],
    status: parts[3]
  };
}
var FOOTNOTE_ID_AND_STATUS_RE = /^\[\^(ct-\d+(?:\.\d+)?)\]:.*\|\s*(\S+)\s*$/;
function extractFootnoteStatuses(text) {
  const statuses = /* @__PURE__ */ new Map();
  const lines = text.split("\n");
  for (const line of lines) {
    const m = FOOTNOTE_ID_AND_STATUS_RE.exec(line);
    if (m) {
      statuses.set(m[1], m[2].toLowerCase());
    }
  }
  return statuses;
}

// ../../node_modules/xxhash-wasm/esm/xxhash-wasm.js
var t = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 48, 8, 96, 3, 127, 127, 127, 1, 127, 96, 3, 127, 127, 127, 0, 96, 2, 127, 127, 0, 96, 1, 127, 1, 127, 96, 3, 127, 127, 126, 1, 126, 96, 3, 126, 127, 127, 1, 126, 96, 2, 127, 126, 0, 96, 1, 127, 1, 126, 3, 11, 10, 0, 0, 2, 1, 3, 4, 5, 6, 1, 7, 5, 3, 1, 0, 1, 7, 85, 9, 3, 109, 101, 109, 2, 0, 5, 120, 120, 104, 51, 50, 0, 0, 6, 105, 110, 105, 116, 51, 50, 0, 2, 8, 117, 112, 100, 97, 116, 101, 51, 50, 0, 3, 8, 100, 105, 103, 101, 115, 116, 51, 50, 0, 4, 5, 120, 120, 104, 54, 52, 0, 5, 6, 105, 110, 105, 116, 54, 52, 0, 7, 8, 117, 112, 100, 97, 116, 101, 54, 52, 0, 8, 8, 100, 105, 103, 101, 115, 116, 54, 52, 0, 9, 10, 251, 22, 10, 242, 1, 1, 4, 127, 32, 0, 32, 1, 106, 33, 3, 32, 1, 65, 16, 79, 4, 127, 32, 3, 65, 16, 107, 33, 6, 32, 2, 65, 168, 136, 141, 161, 2, 106, 33, 3, 32, 2, 65, 137, 235, 208, 208, 7, 107, 33, 4, 32, 2, 65, 207, 140, 162, 142, 6, 106, 33, 5, 3, 64, 32, 3, 32, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 4, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 4, 32, 2, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 5, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 6, 32, 0, 65, 4, 106, 34, 0, 79, 13, 0, 11, 32, 2, 65, 12, 119, 32, 5, 65, 18, 119, 106, 32, 4, 65, 7, 119, 106, 32, 3, 65, 1, 119, 106, 5, 32, 2, 65, 177, 207, 217, 178, 1, 106, 11, 32, 1, 106, 32, 0, 32, 1, 65, 15, 113, 16, 1, 11, 146, 1, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 1, 65, 4, 106, 32, 2, 75, 69, 4, 64, 32, 0, 32, 1, 40, 2, 0, 65, 189, 220, 202, 149, 124, 108, 106, 65, 17, 119, 65, 175, 214, 211, 190, 2, 108, 33, 0, 32, 1, 65, 4, 106, 33, 1, 12, 1, 11, 11, 3, 64, 32, 1, 32, 2, 79, 69, 4, 64, 32, 0, 32, 1, 45, 0, 0, 65, 177, 207, 217, 178, 1, 108, 106, 65, 11, 119, 65, 177, 243, 221, 241, 121, 108, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 65, 15, 118, 115, 65, 247, 148, 175, 175, 120, 108, 34, 0, 65, 13, 118, 32, 0, 115, 65, 189, 220, 202, 149, 124, 108, 34, 0, 65, 16, 118, 32, 0, 115, 11, 63, 0, 32, 0, 65, 8, 106, 32, 1, 65, 168, 136, 141, 161, 2, 106, 54, 2, 0, 32, 0, 65, 12, 106, 32, 1, 65, 137, 235, 208, 208, 7, 107, 54, 2, 0, 32, 0, 65, 16, 106, 32, 1, 54, 2, 0, 32, 0, 65, 20, 106, 32, 1, 65, 207, 140, 162, 142, 6, 106, 54, 2, 0, 11, 195, 4, 1, 6, 127, 32, 1, 32, 2, 106, 33, 6, 32, 0, 65, 24, 106, 33, 4, 32, 0, 65, 40, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 40, 2, 0, 32, 2, 106, 54, 2, 0, 32, 0, 65, 4, 106, 34, 5, 32, 5, 40, 2, 0, 32, 2, 65, 16, 79, 32, 0, 40, 2, 0, 65, 16, 79, 114, 114, 54, 2, 0, 32, 2, 32, 3, 106, 65, 16, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 16, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 12, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 4, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 8, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 20, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 12, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 40, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 32, 6, 65, 16, 107, 77, 4, 64, 32, 6, 65, 16, 107, 33, 8, 32, 0, 65, 8, 106, 40, 2, 0, 33, 2, 32, 0, 65, 12, 106, 40, 2, 0, 33, 3, 32, 0, 65, 16, 106, 40, 2, 0, 33, 5, 32, 0, 65, 20, 106, 40, 2, 0, 33, 7, 3, 64, 32, 2, 32, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 3, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 5, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 7, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 7, 32, 8, 32, 1, 65, 4, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 2, 54, 2, 0, 32, 0, 65, 12, 106, 32, 3, 54, 2, 0, 32, 0, 65, 16, 106, 32, 5, 54, 2, 0, 32, 0, 65, 20, 106, 32, 7, 54, 2, 0, 11, 32, 1, 32, 6, 73, 4, 64, 32, 4, 32, 1, 32, 6, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 1, 54, 2, 0, 11, 11, 97, 1, 1, 127, 32, 0, 65, 16, 106, 40, 2, 0, 33, 1, 32, 0, 65, 4, 106, 40, 2, 0, 4, 127, 32, 1, 65, 12, 119, 32, 0, 65, 20, 106, 40, 2, 0, 65, 18, 119, 106, 32, 0, 65, 12, 106, 40, 2, 0, 65, 7, 119, 106, 32, 0, 65, 8, 106, 40, 2, 0, 65, 1, 119, 106, 5, 32, 1, 65, 177, 207, 217, 178, 1, 106, 11, 32, 0, 40, 2, 0, 106, 32, 0, 65, 24, 106, 32, 0, 65, 40, 106, 40, 2, 0, 16, 1, 11, 255, 3, 2, 3, 126, 1, 127, 32, 0, 32, 1, 106, 33, 6, 32, 1, 65, 32, 79, 4, 126, 32, 6, 65, 32, 107, 33, 6, 32, 2, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 33, 3, 32, 2, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 33, 4, 32, 2, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 33, 5, 3, 64, 32, 3, 32, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 3, 32, 4, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 4, 32, 2, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 2, 32, 5, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 5, 32, 6, 32, 0, 65, 8, 106, 34, 0, 79, 13, 0, 11, 32, 2, 66, 12, 137, 32, 5, 66, 18, 137, 124, 32, 4, 66, 7, 137, 124, 32, 3, 66, 1, 137, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 2, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 2, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 1, 173, 124, 32, 0, 32, 1, 65, 31, 113, 16, 6, 11, 134, 2, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 2, 32, 1, 65, 8, 106, 79, 4, 64, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 32, 0, 133, 66, 27, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 33, 0, 32, 1, 65, 8, 106, 33, 1, 12, 1, 11, 11, 32, 1, 65, 4, 106, 32, 2, 77, 4, 64, 32, 0, 32, 1, 53, 2, 0, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 23, 137, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 124, 33, 0, 32, 1, 65, 4, 106, 33, 1, 11, 3, 64, 32, 1, 32, 2, 73, 4, 64, 32, 0, 32, 1, 49, 0, 0, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 126, 133, 66, 11, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 66, 33, 136, 133, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 34, 0, 32, 0, 66, 29, 136, 133, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 126, 34, 0, 32, 0, 66, 32, 136, 133, 11, 77, 0, 32, 0, 65, 8, 106, 32, 1, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 55, 3, 0, 32, 0, 65, 16, 106, 32, 1, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 55, 3, 0, 32, 0, 65, 24, 106, 32, 1, 55, 3, 0, 32, 0, 65, 32, 106, 32, 1, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 55, 3, 0, 11, 244, 4, 2, 3, 127, 4, 126, 32, 1, 32, 2, 106, 33, 5, 32, 0, 65, 40, 106, 33, 4, 32, 0, 65, 200, 0, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 41, 3, 0, 32, 2, 173, 124, 55, 3, 0, 32, 2, 32, 3, 106, 65, 32, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 32, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 8, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 24, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 16, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 32, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 24, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 200, 0, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 65, 32, 106, 32, 5, 77, 4, 64, 32, 5, 65, 32, 107, 33, 2, 32, 0, 65, 8, 106, 41, 3, 0, 33, 6, 32, 0, 65, 16, 106, 41, 3, 0, 33, 7, 32, 0, 65, 24, 106, 41, 3, 0, 33, 8, 32, 0, 65, 32, 106, 41, 3, 0, 33, 9, 3, 64, 32, 6, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 6, 32, 7, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 7, 32, 8, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 8, 32, 9, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 9, 32, 2, 32, 1, 65, 8, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 6, 55, 3, 0, 32, 0, 65, 16, 106, 32, 7, 55, 3, 0, 32, 0, 65, 24, 106, 32, 8, 55, 3, 0, 32, 0, 65, 32, 106, 32, 9, 55, 3, 0, 11, 32, 1, 32, 5, 73, 4, 64, 32, 4, 32, 1, 32, 5, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 1, 54, 2, 0, 11, 11, 188, 2, 1, 5, 126, 32, 0, 65, 24, 106, 41, 3, 0, 33, 1, 32, 0, 41, 3, 0, 34, 2, 66, 32, 90, 4, 126, 32, 0, 65, 8, 106, 41, 3, 0, 34, 3, 66, 1, 137, 32, 0, 65, 16, 106, 41, 3, 0, 34, 4, 66, 7, 137, 124, 32, 1, 66, 12, 137, 32, 0, 65, 32, 106, 41, 3, 0, 34, 5, 66, 18, 137, 124, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 1, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 1, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 2, 124, 32, 0, 65, 40, 106, 32, 2, 66, 31, 131, 167, 16, 6, 11]);

// ../../packages/core/dist-esm/hashline.js
var HASH_LEN = 2;
var RADIX = 16;
var HASH_MOD = RADIX ** HASH_LEN;
var DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));
var encoder = new TextEncoder();
var HASHLINE_KEY = "__changetracks_xxhash__";
function getXXHash() {
  return globalThis[HASHLINE_KEY] ?? null;
}
function stripForHash(line) {
  return line.replace(/\r$/, "").replace(/\[\^ct-[\w.]+\]/g, "").replace(/\s+/g, "");
}
function computeLineHash(idx, line, allLines) {
  const h = getXXHash();
  if (!h) {
    throw new Error("xxhash-wasm not initialized. Call `await initHashline()` or `await ensureHashlineReady()` before using hashline functions.");
  }
  const stripped = stripForHash(line);
  if (stripped.length > 0 || !allLines) {
    return DICT[h.h32Raw(encoder.encode(stripped)) % HASH_MOD];
  }
  let prevNonBlank = "";
  let distFromPrev = 0;
  for (let i = idx - 1; i >= 0; i--) {
    distFromPrev++;
    const s = stripForHash(allLines[i]);
    if (s.length > 0) {
      prevNonBlank = s;
      break;
    }
  }
  if (distFromPrev === 0)
    distFromPrev = idx + 1;
  let nextNonBlank = "";
  for (let i = idx + 1; i < allLines.length; i++) {
    const s = stripForHash(allLines[i]);
    if (s.length > 0) {
      nextNonBlank = s;
      break;
    }
  }
  const contextKey = prevNonBlank + "\0" + nextNonBlank + "\0" + distFromPrev;
  return DICT[h.h32Raw(encoder.encode(contextKey)) % HASH_MOD];
}

// ../../packages/core/dist-esm/op-parser.js
function splitReasoning(op) {
  const idx = op.lastIndexOf("{>>");
  if (idx <= 0)
    return [op, void 0];
  const afterOpen = op.slice(idx + 3);
  const closeIdx = afterOpen.indexOf("<<}");
  if (closeIdx !== -1) {
    const afterClose = afterOpen.slice(closeIdx + 3).trim();
    if (afterClose.length > 0) {
      return [op, void 0];
    }
    const reasoning2 = afterOpen.slice(0, closeIdx).trimStart();
    const editPart2 = op.slice(0, idx).trimEnd();
    if (reasoning2 === "")
      return [op, void 0];
    return [editPart2, reasoning2];
  }
  const editPart = op.slice(0, idx).trimEnd();
  const reasoning = afterOpen.trimStart();
  if (reasoning === "")
    return [op, void 0];
  return [editPart, reasoning];
}
function extractBetween(text, opener, closer) {
  if (!text.startsWith(opener))
    return null;
  const closerIdx = text.lastIndexOf(closer);
  if (closerIdx < opener.length)
    return null;
  return text.slice(opener.length, closerIdx);
}
function parseOp(op) {
  if (op === "") {
    throw new Error("Op string is empty \u2014 nothing to parse.");
  }
  if (op.startsWith("{>>")) {
    let reasoning2 = op.slice(3);
    if (reasoning2.endsWith("<<}")) {
      reasoning2 = reasoning2.slice(0, -3);
    }
    return {
      type: "comment",
      oldText: "",
      newText: "",
      reasoning: reasoning2
    };
  }
  const [withoutReasoning, reasoning] = splitReasoning(op);
  const insContent = extractBetween(withoutReasoning, "{++", "++}");
  if (insContent !== null) {
    return {
      type: "ins",
      oldText: "",
      newText: insContent,
      reasoning
    };
  }
  const delContent = extractBetween(withoutReasoning, "{--", "--}");
  if (delContent !== null) {
    return {
      type: "del",
      oldText: delContent,
      newText: "",
      reasoning
    };
  }
  const subContent = extractBetween(withoutReasoning, "{~~", "~~}");
  if (subContent !== null) {
    const arrowIdx = subContent.indexOf("~>");
    if (arrowIdx === -1) {
      throw new Error(`Cannot parse op: "${op}". Substitution {~~...~~} requires ~> separator between old and new text.`);
    }
    const oldText = subContent.slice(0, arrowIdx);
    const newText = subContent.slice(arrowIdx + 2);
    return {
      type: "sub",
      oldText,
      newText,
      reasoning
    };
  }
  const hlContent = extractBetween(withoutReasoning, "{==", "==}");
  if (hlContent !== null) {
    return {
      type: "highlight",
      oldText: hlContent,
      newText: "",
      reasoning
    };
  }
  throw new Error(`Cannot parse op: "${op}". Expected CriticMarkup syntax: {++text++} (ins), {--text--} (del), {~~old~>new~~} (sub), {==text==} (highlight), {>>comment.`);
}

// ../../packages/core/dist-esm/hashline-cleanup.js
function relocateHashRef(ref, fileLines, computeHash) {
  if (fileLines.length === 0)
    return null;
  const lineIdx = ref.line - 1;
  if (lineIdx >= 0 && lineIdx < fileLines.length) {
    const currentHash = computeHash(lineIdx, fileLines[lineIdx], fileLines);
    if (currentHash.toLowerCase() === ref.hash.toLowerCase()) {
      return null;
    }
  }
  const hashToLine = /* @__PURE__ */ new Map();
  const duplicateHashes = /* @__PURE__ */ new Set();
  for (let i = 0; i < fileLines.length; i++) {
    const h = computeHash(i, fileLines[i], fileLines).toLowerCase();
    if (duplicateHashes.has(h))
      continue;
    if (hashToLine.has(h)) {
      duplicateHashes.add(h);
      hashToLine.delete(h);
    } else {
      hashToLine.set(h, i + 1);
    }
  }
  const targetHash = ref.hash.toLowerCase();
  const newLine = hashToLine.get(targetHash);
  if (newLine === void 0) {
    return null;
  }
  return { relocated: true, newLine };
}

// ../../packages/core/dist-esm/text-normalizer.js
function defaultNormalizer(text) {
  return text.normalize("NFKC");
}
function normalizedIndexOf(text, target, normalizer, startFrom) {
  const norm = normalizer ?? defaultNormalizer;
  const normalizedText = norm(text);
  const normalizedTarget = norm(target);
  return normalizedText.indexOf(normalizedTarget, startFrom ?? 0);
}
function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ");
}
function buildWhitespaceCollapseMap(original) {
  const map = [];
  let oi = 0;
  while (oi < original.length) {
    if (/\s/.test(original[oi])) {
      map.push(oi);
      while (oi < original.length && /\s/.test(original[oi])) {
        oi++;
      }
    } else {
      map.push(oi);
      oi++;
    }
  }
  map.push(oi);
  return map;
}
function whitespaceCollapsedFind(text, target, startFrom) {
  const collapsedText = collapseWhitespace(text);
  const collapsedTarget = collapseWhitespace(target);
  if (collapsedTarget.length === 0)
    return null;
  const map = buildWhitespaceCollapseMap(text);
  let collapsedStartFrom = 0;
  if (startFrom !== void 0 && startFrom > 0) {
    for (let ci = 0; ci < map.length; ci++) {
      if (map[ci] >= startFrom) {
        collapsedStartFrom = ci;
        break;
      }
    }
  }
  const collapsedIdx = collapsedText.indexOf(collapsedTarget, collapsedStartFrom);
  if (collapsedIdx === -1)
    return null;
  const originalStart = map[collapsedIdx];
  const collapsedEnd = collapsedIdx + collapsedTarget.length;
  const originalEnd = map[collapsedEnd];
  return {
    index: originalStart,
    length: originalEnd - originalStart,
    originalText: text.slice(originalStart, originalEnd)
  };
}
function whitespaceCollapsedIsAmbiguous(text, target) {
  const first = whitespaceCollapsedFind(text, target);
  if (!first)
    return false;
  const second = whitespaceCollapsedFind(text, target, first.index + 1);
  return second !== null;
}
var CONFUSABLE_MAP = /* @__PURE__ */ new Map([
  [8216, { replacement: "'", name: "LEFT SINGLE QUOTATION MARK" }],
  [8217, { replacement: "'", name: "RIGHT SINGLE QUOTATION MARK" }],
  [8218, { replacement: "'", name: "SINGLE LOW-9 QUOTATION MARK" }],
  [8220, { replacement: '"', name: "LEFT DOUBLE QUOTATION MARK" }],
  [8221, { replacement: '"', name: "RIGHT DOUBLE QUOTATION MARK" }],
  [8222, { replacement: '"', name: "DOUBLE LOW-9 QUOTATION MARK" }],
  [8212, { replacement: "-", name: "EM DASH" }],
  [8211, { replacement: "-", name: "EN DASH" }]
]);
var UNICODE_NAMES = {
  32: "SPACE",
  45: "HYPHEN-MINUS",
  34: "QUOTATION MARK",
  39: "APOSTROPHE",
  46: "FULL STOP",
  8216: "LEFT SINGLE QUOTATION MARK",
  8217: "RIGHT SINGLE QUOTATION MARK",
  8218: "SINGLE LOW-9 QUOTATION MARK",
  8220: "LEFT DOUBLE QUOTATION MARK",
  8221: "RIGHT DOUBLE QUOTATION MARK",
  8222: "DOUBLE LOW-9 QUOTATION MARK",
  8211: "EN DASH",
  8212: "EM DASH"
};
function unicodeName(codepoint) {
  return UNICODE_NAMES[codepoint] ?? `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
function diagnosticConfusableNormalize(text) {
  let result = text;
  for (const [codepoint, entry] of CONFUSABLE_MAP) {
    const char = String.fromCodePoint(codepoint);
    result = result.split(char).join(entry.replacement);
  }
  return result;
}
function findConfusableDifferences(agentText, fileText) {
  const diffs = [];
  const len = Math.min(agentText.length, fileText.length);
  for (let i = 0; i < len; i++) {
    if (agentText[i] !== fileText[i]) {
      const agentCp = agentText.codePointAt(i);
      const fileCp = fileText.codePointAt(i);
      diffs.push({
        position: i,
        agentChar: agentText[i],
        fileChar: fileText[i],
        agentCodepoint: agentCp,
        fileCodepoint: fileCp,
        agentName: unicodeName(agentCp),
        fileName: unicodeName(fileCp)
      });
    }
  }
  return diffs;
}
function tryDiagnosticConfusableMatch(documentText, target) {
  const normDoc = diagnosticConfusableNormalize(documentText);
  const normTarget = diagnosticConfusableNormalize(target);
  const normIdx = normDoc.indexOf(normTarget);
  if (normIdx === -1)
    return null;
  if (normDoc.indexOf(normTarget, normIdx + 1) !== -1)
    return null;
  const matchedText = documentText.slice(normIdx, normIdx + target.length);
  const diffs = findConfusableDifferences(target, matchedText);
  return diffs.length > 0 ? { matchedText, differences: diffs } : null;
}

// ../../packages/core/dist-esm/operations/l2-to-l3.js
function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n")
      starts.push(i + 1);
  }
  return starts;
}
function offsetToLineNumber(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (lineStarts[mid] <= offset)
      lo = mid;
    else
      hi = mid - 1;
  }
  return lo + 1;
}

// ../../packages/core/dist-esm/operations/scrub.js
function stripLineHashPrefix(line) {
  return line.replace(/^\s*\d+:[a-f0-9]+\s*/, "");
}
function isParticipating(op) {
  return op.status !== "rejected" && op.type !== "highlight" && op.type !== "comment";
}
function extractOpTexts(opString) {
  const ctxParsed = parseContextualEditOp(opString);
  const parsed = parseOp(ctxParsed ? ctxParsed.opString : opString);
  return { modifiedText: parsed.newText, originalText: parsed.oldText };
}
function searchInLineWindow(lines, targetIdx, searchText, maxDelta) {
  for (let delta = 0; delta <= maxDelta; delta++) {
    const deltas = delta === 0 ? [0] : [-delta, delta];
    for (const d of deltas) {
      const searchIdx = targetIdx + d;
      if (searchIdx < 0 || searchIdx >= lines.length)
        continue;
      const match = tryFindUniqueMatch(lines[searchIdx], searchText);
      if (match)
        return { lineIdx: searchIdx, match };
    }
  }
  return null;
}
function applySplice(body, op, offset, direction) {
  if (direction === "apply") {
    if (op.type === "insertion")
      return body.slice(0, offset) + op.modifiedText + body.slice(offset);
    if (op.type === "deletion")
      return body.slice(0, offset) + body.slice(offset + op.originalText.length);
    if (op.type === "substitution")
      return body.slice(0, offset) + op.modifiedText + body.slice(offset + op.originalText.length);
  } else {
    if (op.type === "insertion")
      return body.slice(0, offset) + body.slice(offset + op.modifiedText.length);
    if (op.type === "deletion")
      return body.slice(0, offset) + op.originalText + body.slice(offset);
    if (op.type === "substitution")
      return body.slice(0, offset) + op.originalText + body.slice(offset + op.modifiedText.length);
  }
  return body;
}
function buildSearchTarget(op, parsed) {
  return op.type === "deletion" ? parsed.contextBefore + parsed.contextAfter : parsed.contextBefore + op.modifiedText + parsed.contextAfter;
}
var MAX_DELTA = 5;
function scrubBackward(body, operations) {
  const positions = /* @__PURE__ */ new Map();
  let currentBody = body;
  const participating = operations.filter(isParticipating);
  for (let i = participating.length - 1; i >= 0; i--) {
    const op = participating[i];
    const stripped = stripLineHashPrefix(op.editOpLine);
    const parsed = parseContextualEditOp(stripped);
    const lines = currentBody.split("\n");
    const lineStarts = buildLineStarts(currentBody);
    const targetLineIdx = Math.min(Math.max(op.lineNumber - 1, 0), lines.length - 1);
    let offset = -1;
    let resolved = false;
    if (parsed) {
      const hit = searchInLineWindow(lines, targetLineIdx, buildSearchTarget(op, parsed), MAX_DELTA);
      if (hit) {
        offset = lineStarts[hit.lineIdx] + hit.match.index + parsed.contextBefore.length;
        resolved = true;
      }
    }
    if (!resolved && !parsed && op.modifiedText && (op.type === "insertion" || op.type === "substitution")) {
      const hit = searchInLineWindow(lines, targetLineIdx, op.modifiedText, MAX_DELTA);
      if (hit) {
        offset = lineStarts[hit.lineIdx] + hit.match.index;
        resolved = true;
      }
    }
    positions.set(op.id, { offset, lineIdx: targetLineIdx, resolved });
    if (resolved) {
      currentBody = applySplice(currentBody, op, offset, "unapply");
    }
  }
  return { body0: currentBody, positions };
}
function scrubForward(body0, operations, positions) {
  const anchors = /* @__PURE__ */ new Map();
  const consumption = /* @__PURE__ */ new Map();
  const activeSpans = /* @__PURE__ */ new Map();
  let currentBody = body0;
  const participating = operations.filter(isParticipating);
  for (const op of participating) {
    const pos = positions.get(op.id);
    if (!pos || !pos.resolved)
      continue;
    const offset = pos.offset;
    let targetStart = offset;
    let targetEnd = offset;
    if (op.type === "deletion" || op.type === "substitution") {
      targetEnd = offset + op.originalText.length;
    }
    if (op.type === "deletion" || op.type === "substitution") {
      for (const [earlierId, span] of activeSpans) {
        if (span.start >= targetStart && span.end <= targetEnd) {
          consumption.set(earlierId, { consumedBy: op.id, type: "full" });
        } else if (span.start < targetEnd && span.end > targetStart) {
          consumption.set(earlierId, { consumedBy: op.id, type: "partial" });
        }
      }
    }
    currentBody = applySplice(currentBody, op, offset, "apply");
    const lines = currentBody.split("\n");
    const lineStarts = buildLineStarts(currentBody);
    const lineIdx = offsetToLineNumber(lineStarts, offset) - 1;
    const lineContent = lines[lineIdx] ?? "";
    const hash = computeLineHash(lineIdx, lineContent, lines);
    const lineStartOff = lineIdx > 0 ? lineStarts[lineIdx] : 0;
    const column = offset - lineStartOff;
    const anchorLen = op.type === "insertion" || op.type === "substitution" ? op.modifiedText.length : 0;
    const changeType = op.type === "insertion" ? ChangeType.Insertion : op.type === "deletion" ? ChangeType.Deletion : ChangeType.Substitution;
    const freshAnchor = buildContextualL3EditOp({
      changeType,
      originalText: op.originalText,
      currentText: op.modifiedText,
      lineContent,
      lineNumber: lineIdx + 1,
      hash,
      column,
      anchorLen
    });
    anchors.set(op.id, freshAnchor);
    const spanStart = offset;
    let spanEnd = offset;
    if (op.type === "insertion")
      spanEnd = offset + op.modifiedText.length;
    else if (op.type === "substitution")
      spanEnd = offset + op.modifiedText.length;
    activeSpans.set(op.id, { start: spanStart, end: spanEnd });
    const lengthDelta = (op.type === "insertion" ? op.modifiedText.length : 0) - (op.type === "deletion" ? op.originalText.length : 0) + (op.type === "substitution" ? op.modifiedText.length - op.originalText.length : 0);
    if (lengthDelta !== 0) {
      for (const [id, span] of activeSpans) {
        if (id === op.id)
          continue;
        if (span.start > offset) {
          span.start += lengthDelta;
          span.end += lengthDelta;
        }
      }
    }
  }
  return { anchors, consumption, finalPositions: activeSpans, finalBody: currentBody };
}
var ABBREV_TO_TYPE = {
  ins: "insertion",
  del: "deletion",
  sub: "substitution",
  hig: "highlight",
  com: "comment"
};
function resolveReplayFromParsedFootnotes(bodyText, footnotes) {
  const operations = [];
  for (const fn of footnotes) {
    if (!fn.editOpLine || fn.lineNumber === void 0 || !fn.hash)
      continue;
    const opType = ABBREV_TO_TYPE[fn.type] ?? fn.type;
    let modifiedText = "";
    let originalText = "";
    if (fn.opString) {
      try {
        ({ modifiedText, originalText } = extractOpTexts(fn.opString));
      } catch {
      }
    }
    operations.push({
      id: fn.id,
      type: opType,
      modifiedText,
      originalText,
      editOpLine: fn.editOpLine,
      lineNumber: fn.lineNumber,
      hash: fn.hash,
      status: fn.status
    });
  }
  const active = operations.filter(isParticipating);
  if (active.length === 0) {
    return {
      freshAnchors: /* @__PURE__ */ new Map(),
      consumption: /* @__PURE__ */ new Map(),
      finalPositions: /* @__PURE__ */ new Map()
    };
  }
  const backward = scrubBackward(bodyText, active);
  const forward = scrubForward(backward.body0, active, backward.positions);
  return {
    freshAnchors: forward.anchors,
    consumption: forward.consumption,
    finalPositions: forward.finalPositions
  };
}

// ../../packages/core/dist-esm/comment-syntax.js
function lineOffset(lines, lineIndex) {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

// ../../packages/core/dist-esm/parser/footnote-native-parser.js
var CM_OPENERS = {
  "{++": "++}",
  "{--": "--}",
  "{~~": "~~}",
  "{==": "==}",
  "{>>": "<<}"
  // optional closer for comments
};
function parseContextualEditOp(opString) {
  let opStart = -1;
  let opener = "";
  for (const o of Object.keys(CM_OPENERS)) {
    const idx = opString.indexOf(o);
    if (idx !== -1 && (opStart === -1 || idx < opStart)) {
      opStart = idx;
      opener = o;
    }
  }
  if (opStart === -1)
    return null;
  const contextBefore = opString.slice(0, opStart);
  const expectedCloser = CM_OPENERS[opener];
  let opEnd = -1;
  if (opener === "{~~") {
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf("~~}", searchFrom);
    opEnd = closerIdx !== -1 ? closerIdx + 3 : -1;
  } else if (opener === "{>>") {
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf("<<}", searchFrom);
    if (closerIdx !== -1) {
      opEnd = closerIdx + 3;
    } else {
      opEnd = opString.length;
    }
  } else {
    const searchFrom = opStart + opener.length;
    const closerIdx = opString.indexOf(expectedCloser, searchFrom);
    opEnd = closerIdx !== -1 ? closerIdx + expectedCloser.length : -1;
  }
  if (opEnd === -1)
    return null;
  const extractedOp = opString.slice(opStart, opEnd);
  const contextAfter = opString.slice(opEnd);
  if (contextBefore.trim() === "" && contextAfter.trim() === "")
    return null;
  if (contextBefore.trim() === "" && contextAfter.trimStart().startsWith("@ctx:"))
    return null;
  if (contextBefore.trim() === "" && contextAfter.trimStart().startsWith("{>>"))
    return null;
  return { contextBefore, opString: extractedOp, contextAfter };
}
function parseDeletionContext(opString) {
  const closerIdx = opString.indexOf("--}");
  if (closerIdx < 0)
    return null;
  const remainder = opString.slice(closerIdx + 3);
  const match = remainder.match(CTX_RE);
  if (!match)
    return null;
  return { before: unescapeCtxString(match[1]), after: unescapeCtxString(match[2]) };
}
var APPROVED_RE = /^ {4}approved:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;
var REJECTED_META_RE = /^ {4}rejected:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;
var FootnoteNativeParser = class {
  parse(text) {
    const lines = text.split("\n");
    const { bodyLines, footnoteLines } = splitBodyAndFootnotes(lines);
    const footnotes = this.parseFootnotes(lines);
    if (footnotes.length === 0) {
      return new VirtualDocument([]);
    }
    const changes = this.resolveChanges(footnotes, bodyLines);
    let freshAnchors = /* @__PURE__ */ new Map();
    if (changes.some((c) => !c.anchored)) {
      try {
        const bodyText = bodyLines.join("\n");
        const replayFootnotes = footnotes.map((fn) => ({
          id: fn.id,
          type: fn.type,
          status: fn.status,
          lineNumber: fn.lineNumber,
          hash: fn.hash,
          opString: fn.opString,
          editOpLine: fn.opString && fn.lineNumber !== void 0 && fn.hash ? `    ${fn.lineNumber}:${fn.hash} ${fn.opString}` : void 0
        }));
        const replay = resolveReplayFromParsedFootnotes(bodyText, replayFootnotes);
        for (const node of changes) {
          if (node.anchored)
            continue;
          const finalPos = replay.finalPositions.get(node.id);
          const isConsumed = replay.consumption.has(node.id);
          if (finalPos && !isConsumed) {
            node.anchored = true;
            node.range = { start: finalPos.start, end: finalPos.end };
            node.contentRange = { ...node.range };
            node.resolutionPath = "replay";
          }
          const freshAnchor = replay.freshAnchors.get(node.id);
          if (freshAnchor)
            node.freshAnchor = freshAnchor;
          const consumed = replay.consumption.get(node.id);
          if (consumed) {
            node.consumedBy = consumed.consumedBy;
            node.consumptionType = consumed.type;
            if (node.footnoteLineRange) {
              const start = lineOffset(lines, node.footnoteLineRange.startLine);
              const end = lineOffset(lines, node.footnoteLineRange.endLine) + lines[node.footnoteLineRange.endLine].length;
              node.range = { start, end };
              node.contentRange = { ...node.range };
            }
          }
        }
        freshAnchors = replay.freshAnchors;
      } catch {
      }
    }
    const resolvableCount = changes.length;
    const resolvedCount = changes.filter((c) => c.anchored || !!c.consumedBy).length;
    const coherenceRate = resolvableCount > 0 ? Math.round(resolvedCount / resolvableCount * 100) : 100;
    let resolvedText;
    if (freshAnchors.size > 0) {
      const rebuiltFootnotes = [];
      let anyChanged = false;
      let fi = 0;
      while (fi < footnoteLines.length) {
        const fline = footnoteLines[fi];
        const idMatch = fline.match(/^\[\^(ct-[\w.]+)\]:/);
        if (idMatch) {
          const freshAnchor = freshAnchors.get(idMatch[1]);
          rebuiltFootnotes.push(fline);
          fi++;
          let editOpReplaced = false;
          while (fi < footnoteLines.length) {
            const contLine = footnoteLines[fi];
            if (FOOTNOTE_DEF_START.test(contLine))
              break;
            if (!editOpReplaced && FOOTNOTE_L3_EDIT_OP.test(contLine) && freshAnchor) {
              if (freshAnchor !== contLine)
                anyChanged = true;
              rebuiltFootnotes.push(freshAnchor);
              editOpReplaced = true;
              fi++;
            } else if (/^\s/.test(contLine) || contLine.trim() === "") {
              rebuiltFootnotes.push(contLine);
              fi++;
            } else {
              break;
            }
          }
        } else {
          rebuiltFootnotes.push(fline);
          fi++;
        }
      }
      if (anyChanged) {
        resolvedText = bodyLines.join("\n") + "\n\n" + rebuiltFootnotes.join("\n") + "\n";
      }
    }
    return new VirtualDocument(changes, coherenceRate, [], resolvedText);
  }
  parseFootnotes(lines) {
    const entries = [];
    let current = null;
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (FOOTNOTE_DEF_START.test(line)) {
        if (current) {
          current.endLine = lineIdx - 1;
          entries.push(current);
        }
        const idMatch = line.match(/^\[\^(ct-[\w.]+)\]:/);
        const header = parseFootnoteHeader(line);
        if (idMatch && header) {
          current = {
            id: idMatch[1],
            author: "@" + header.author,
            date: header.date,
            type: header.type,
            status: header.status,
            startLine: lineIdx,
            replyCount: 0
          };
        } else {
          current = null;
        }
        continue;
      }
      if (!current)
        continue;
      const opMatch = line.match(FOOTNOTE_L3_EDIT_OP);
      if (opMatch && current.opString === void 0) {
        current.lineNumber = parseInt(opMatch[1], 10);
        current.hash = opMatch[2].toLowerCase();
        current.opString = opMatch[3];
        continue;
      }
      if (FOOTNOTE_THREAD_REPLY.test(line)) {
        current.replyCount = (current.replyCount ?? 0) + 1;
        continue;
      }
      const approvedMatch = line.match(APPROVED_RE);
      if (approvedMatch) {
        if (!current.approvals)
          current.approvals = [];
        current.approvals.push({
          author: approvedMatch[1],
          date: approvedMatch[2],
          reason: approvedMatch[3]
        });
        continue;
      }
      const rejectedMatch = line.match(REJECTED_META_RE);
      if (rejectedMatch) {
        if (!current.rejections)
          current.rejections = [];
        current.rejections.push({
          author: rejectedMatch[1],
          date: rejectedMatch[2],
          reason: rejectedMatch[3]
        });
        continue;
      }
      const imageMeta = line.match(/^\s+([\w-]+):\s*(.*)/);
      if (imageMeta) {
        const key = imageMeta[1];
        const value = imageMeta[2].trim();
        if (key === "image-dimensions") {
          const dimMatch = value.match(/^([\d.]+)in\s*x\s*([\d.]+)in$/);
          if (dimMatch) {
            current.imageDimensions = {
              widthIn: parseFloat(dimMatch[1]),
              heightIn: parseFloat(dimMatch[2])
            };
          }
        } else if (key.startsWith("image-") || key === "merge-detected") {
          if (!current.imageMetadata)
            current.imageMetadata = {};
          current.imageMetadata[key] = value;
        }
        continue;
      }
      const trimmed = line.trim();
      if (trimmed && !current.discussionText) {
        current.discussionText = trimmed;
      }
    }
    if (current) {
      let end = lines.length - 1;
      while (end > (current.startLine ?? 0) && lines[end].trim() === "")
        end--;
      current.endLine = end;
      entries.push(current);
    }
    return entries;
  }
  resolveChanges(footnotes, bodyLines) {
    const changes = [];
    const lineOffsets = [0];
    for (let i = 0; i < bodyLines.length; i++) {
      lineOffsets.push(lineOffsets[i] + bodyLines[i].length + 1);
    }
    for (const fn of footnotes) {
      const changeType = this.resolveType(fn.type);
      if (changeType === null)
        continue;
      const status = this.resolveStatus(fn.status);
      let parsedOp = null;
      let ctxResult = null;
      if (fn.opString) {
        try {
          ctxResult = parseContextualEditOp(fn.opString);
          parsedOp = parseOp(ctxResult ? ctxResult.opString : fn.opString);
        } catch {
          continue;
        }
      }
      const { range, originalText, modifiedText, comment, anchored, resolutionPath } = this.resolveRangeAndContent(fn, parsedOp, ctxResult, changeType, status, bodyLines, lineOffsets);
      const node = {
        id: fn.id,
        type: changeType,
        status,
        range,
        contentRange: { ...range },
        // L3: range === contentRange (no delimiters in body)
        level: 2,
        // anchored:false means position could not be deterministically resolved (Invariant A).
        // anchored:true (default) means either resolved uniquely or explicitly OK (deletion line-start).
        anchored: anchored !== false,
        metadata: {
          author: fn.author,
          date: fn.date,
          comment: comment ?? parsedOp?.reasoning ?? void 0
        }
      };
      if (originalText !== void 0)
        node.originalText = originalText;
      if (modifiedText !== void 0)
        node.modifiedText = modifiedText;
      if (fn.startLine !== void 0) {
        node.footnoteLineRange = { startLine: fn.startLine, endLine: fn.endLine ?? fn.startLine };
      }
      node.replyCount = fn.replyCount ?? 0;
      if (fn.imageDimensions) {
        node.metadata.imageDimensions = fn.imageDimensions;
      }
      if (fn.imageMetadata) {
        node.metadata.imageMetadata = fn.imageMetadata;
      }
      if (resolutionPath !== void 0) {
        node.resolutionPath = resolutionPath;
      }
      if (fn.approvals && fn.approvals.length > 0) {
        node.metadata.approvals = fn.approvals.map((a) => ({
          author: a.author,
          date: a.date,
          timestamp: parseTimestamp(a.date),
          reason: a.reason || void 0
        }));
      }
      if (fn.rejections && fn.rejections.length > 0) {
        node.metadata.rejections = fn.rejections.map((r) => ({
          author: r.author,
          date: r.date,
          timestamp: parseTimestamp(r.date),
          reason: r.reason || void 0
        }));
      }
      changes.push(node);
    }
    changes.sort((a, b) => a.range.start - b.range.start);
    return changes;
  }
  /**
   * Resolve the character range for a change node in the body text.
   *
   * For L3:
   * - Insertion: search for newText on the target line via findUniqueMatch; range covers the matched text
   * - Deletion: zero-width range at the anchor point; uses @ctx: field for precise positioning
   * - Substitution: search for newText (proposed/accepted) or oldText (rejected) on target line
   * - Highlight: search for the highlighted text on the target line
   * - Comment: fall back to line start (no text to anchor to)
   * - Rejected insertion: text is not in body; zero-width range at line start
   *
   * DETERMINISTIC ANCHOR RESOLUTION INVARIANTS (spec §11):
   *
   * Invariant A — Non-deletion ops (ins, sub, highlight) MUST resolve uniquely via
   * findUniqueMatch on the hash-resolved line. If the match fails (text not found or
   * ambiguous), the node is marked anchored:false. There is NO fallback to line-start
   * for non-deletion ops. Silent fallback produces wrong decoration placement.
   *
   * Invariant B — Deletion ops resolve via @ctx:"before"||"after" ONLY. The deleted
   * text is absent from the body so there is nothing to search for. Line-start fallback
   * when @ctx is missing is acceptable degradation (not a silent error).
   *
   * Invariant C — anchored:false is an error path, not a silent default. Consumers
   * must not render anchored:false nodes as correctly placed decorations.
   *
   * Task 3 enforced Invariant A by removing the fallbackRange branches for
   * ins/sub/highlight and setting anchored:false + sentinel range {0,0} instead.
   */
  resolveRangeAndContent(fn, parsedOp, ctxResult, changeType, status, bodyLines, lineOffsets) {
    let effectiveLineNumber = fn.lineNumber;
    let hashMatched = false;
    if (fn.lineNumber !== void 0 && fn.hash) {
      const hashCheckIdx = fn.lineNumber - 1;
      if (hashCheckIdx >= 0 && hashCheckIdx < bodyLines.length) {
        const actualHash = computeLineHash(hashCheckIdx, bodyLines[hashCheckIdx], bodyLines);
        if (actualHash.toLowerCase() === fn.hash.toLowerCase()) {
          hashMatched = true;
        } else {
          const relocated = relocateHashRef({ line: fn.lineNumber, hash: fn.hash }, bodyLines, computeLineHash);
          if (relocated?.relocated) {
            effectiveLineNumber = relocated.newLine;
            hashMatched = true;
          }
        }
      }
    }
    const lineIdx = (effectiveLineNumber ?? 1) - 1;
    const lineOffset2 = lineIdx >= 0 && lineIdx < lineOffsets.length ? lineOffsets[lineIdx] : 0;
    const lineContent = lineIdx >= 0 && lineIdx < bodyLines.length ? bodyLines[lineIdx] : "";
    const fallbackRange = { start: lineOffset2, end: lineOffset2 };
    if (!parsedOp) {
      return { range: fallbackRange, anchored: false, comment: fn.discussionText, resolutionPath: "rejected" };
    }
    const findOnLine = (searchText) => {
      if (!searchText || !lineContent)
        return null;
      return tryFindUniqueMatch(lineContent, searchText, defaultNormalizer);
    };
    if (ctxResult && parsedOp) {
      const { contextBefore, contextAfter } = ctxResult;
      let bodyMatch;
      switch (changeType) {
        case ChangeType.Insertion:
          if (status === ChangeStatus.Rejected) {
            bodyMatch = contextBefore + contextAfter;
          } else {
            bodyMatch = contextBefore + parsedOp.newText + contextAfter;
          }
          break;
        case ChangeType.Deletion:
          bodyMatch = contextBefore + contextAfter;
          break;
        case ChangeType.Substitution:
          if (status === ChangeStatus.Rejected) {
            bodyMatch = contextBefore + parsedOp.oldText + contextAfter;
          } else {
            bodyMatch = contextBefore + parsedOp.newText + contextAfter;
          }
          break;
        case ChangeType.Highlight:
          bodyMatch = contextBefore + parsedOp.oldText + contextAfter;
          break;
        default:
          bodyMatch = contextBefore + contextAfter;
      }
      const bodyMatchResult = findOnLine(bodyMatch);
      if (bodyMatchResult) {
        const matchStart = lineOffset2 + bodyMatchResult.index;
        const opStart = matchStart + contextBefore.length;
        let opBodyLength;
        switch (changeType) {
          case ChangeType.Insertion:
            opBodyLength = status === ChangeStatus.Rejected ? 0 : parsedOp.newText.length;
            break;
          case ChangeType.Deletion:
            opBodyLength = 0;
            break;
          case ChangeType.Substitution:
            opBodyLength = status === ChangeStatus.Rejected ? parsedOp.oldText.length : parsedOp.newText.length;
            break;
          case ChangeType.Highlight:
            opBodyLength = parsedOp.oldText.length;
            break;
          default:
            opBodyLength = 0;
        }
        const range = { start: opStart, end: opStart + opBodyLength };
        return {
          range,
          originalText: parsedOp.oldText || void 0,
          modifiedText: parsedOp.newText || void 0,
          comment: parsedOp.reasoning ?? void 0,
          // When the hash also matched, label as 'hash' (same semantics as the
          // old resolve() Phase A: hash gate passed, context match pinpointed position).
          // When only context matched (hash mismatch or relocation), label as 'context'.
          resolutionPath: hashMatched ? "hash" : "context"
        };
      }
    }
    switch (changeType) {
      case ChangeType.Insertion: {
        const text = parsedOp.newText;
        if (text === "") {
          return { range: fallbackRange, modifiedText: text, resolutionPath: hashMatched ? "hash" : void 0 };
        }
        const match = findOnLine(text);
        if (!match) {
          return { range: { start: 0, end: 0 }, modifiedText: text, anchored: false };
        }
        const range = {
          start: lineOffset2 + match.index,
          end: lineOffset2 + match.index + match.length
        };
        return { range, modifiedText: text, resolutionPath: hashMatched ? "hash" : void 0 };
      }
      case ChangeType.Deletion: {
        const text = parsedOp.oldText;
        const ctx = fn.opString ? parseDeletionContext(fn.opString) : null;
        if (ctx) {
          const joined = ctx.before + ctx.after;
          if (joined.length > 0) {
            const match = findOnLine(joined);
            if (match) {
              const delPoint = lineOffset2 + match.index + ctx.before.length;
              return {
                range: { start: delPoint, end: delPoint },
                originalText: text,
                resolutionPath: hashMatched ? "hash" : void 0
              };
            }
          }
        }
        return { range: fallbackRange, originalText: text, resolutionPath: hashMatched ? "hash" : void 0 };
      }
      case ChangeType.Substitution: {
        const oldText = parsedOp.oldText;
        const newText = parsedOp.newText;
        const searchText = newText;
        const match = searchText ? findOnLine(searchText) : null;
        if (!match) {
          return { range: { start: 0, end: 0 }, originalText: oldText, modifiedText: newText, anchored: false };
        }
        const range = {
          start: lineOffset2 + match.index,
          end: lineOffset2 + match.index + match.length
        };
        return { range, originalText: oldText, modifiedText: newText, resolutionPath: hashMatched ? "hash" : void 0 };
      }
      case ChangeType.Highlight: {
        const text = parsedOp.oldText;
        const comment = parsedOp.reasoning;
        if (!text) {
          return { range: fallbackRange, comment };
        }
        const match = findOnLine(text);
        if (!match) {
          return { range: fallbackRange, comment, resolutionPath: hashMatched ? "hash" : void 0 };
        }
        const range = {
          start: lineOffset2 + match.index,
          end: lineOffset2 + match.index + match.length
        };
        return { range, comment, resolutionPath: hashMatched ? "hash" : void 0 };
      }
      case ChangeType.Comment: {
        const comment = (parsedOp.reasoning || void 0) ?? (parsedOp.oldText || fn.discussionText);
        return { range: fallbackRange, comment, resolutionPath: hashMatched ? "hash" : void 0 };
      }
      default:
        return { range: fallbackRange, resolutionPath: hashMatched ? "hash" : void 0 };
    }
  }
  resolveType(type) {
    switch (type) {
      case "ins":
      case "insertion":
        return ChangeType.Insertion;
      case "del":
      case "deletion":
        return ChangeType.Deletion;
      case "sub":
      case "substitution":
        return ChangeType.Substitution;
      case "highlight":
      case "hi":
      case "hig":
        return ChangeType.Highlight;
      case "comment":
      case "com":
        return ChangeType.Comment;
      default:
        return null;
    }
  }
  resolveStatus(status) {
    switch (status) {
      case "accepted":
        return ChangeStatus.Accepted;
      case "rejected":
        return ChangeStatus.Rejected;
      default:
        return ChangeStatus.Proposed;
    }
  }
};

// ../../packages/core/dist-esm/format-aware-parse.js
var l2Parser = new CriticMarkupParser();
var l3Parser = new FootnoteNativeParser();

// ../../packages/core/dist-esm/view-surface.js
function buildViewSurfaceMap(raw) {
  const toRaw = [];
  let surface = "";
  let i = 0;
  while (i < raw.length) {
    const slice = raw.slice(i);
    const refMatch = slice.match(/^\[\^ct-\d+(?:\.\d+)?\]/);
    if (refMatch) {
      i += refMatch[0].length;
      continue;
    }
    toRaw.push(i);
    surface += raw[i];
    i++;
  }
  toRaw.push(i);
  return { surface, toRaw };
}
function viewAwareFind(raw, target) {
  const { surface, toRaw } = buildViewSurfaceMap(raw);
  const cleanTarget = target.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, "");
  const searchTarget = cleanTarget || target;
  const firstIdx = surface.indexOf(searchTarget);
  if (firstIdx === -1)
    return null;
  const secondIdx = surface.indexOf(searchTarget, firstIdx + 1);
  if (secondIdx !== -1)
    return null;
  const rawStart = toRaw[firstIdx];
  const rawEnd = toRaw[firstIdx + searchTarget.length];
  const rawLength = rawEnd - rawStart;
  return {
    index: rawStart,
    length: rawLength,
    rawText: raw.slice(rawStart, rawEnd)
  };
}

// ../../packages/core/dist-esm/file-ops.js
function containsCriticMarkup(text) {
  return /\{\+\+|\{--|\{~~|\{==|\{>>/.test(text);
}
function stripCriticMarkupWithMap(text) {
  const settled = [];
  const toRaw = [];
  const markupRanges = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "^" && text.startsWith("ct-", i + 2)) {
      const closeIdx = text.indexOf("]", i + 2);
      if (closeIdx !== -1 && /^\[\^ct-\d+(?:\.\d+)?\]$/.test(text.slice(i, closeIdx + 1)) && text[closeIdx + 1] !== ":") {
        markupRanges.push({ rawStart: i, rawEnd: closeIdx + 1 });
        i = closeIdx + 1;
        continue;
      }
    }
    if (text[i] === "{" && i + 2 < text.length) {
      const twoChar = text[i + 1] + text[i + 2];
      if (twoChar === "++") {
        const end = text.indexOf("++}", i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
          for (let j = contentStart; j < contentEnd; j++) {
            settled.push(text[j]);
            toRaw.push(j);
          }
          i = constructEnd;
          continue;
        }
      }
      if (twoChar === "--") {
        const end = text.indexOf("--}", i + 3);
        if (end !== -1) {
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: i, rawEnd: constructEnd });
          i = constructEnd;
          continue;
        }
      }
      if (twoChar === "~~") {
        const end = text.indexOf("~~}", i + 3);
        if (end !== -1) {
          const arrow = text.indexOf("~>", i + 3);
          if (arrow !== -1 && arrow < end) {
            const constructStart = i;
            const newStart = arrow + 2;
            const newEnd = end;
            const constructEnd = end + 3;
            markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
            for (let j = newStart; j < newEnd; j++) {
              settled.push(text[j]);
              toRaw.push(j);
            }
            i = constructEnd;
            continue;
          }
        }
      }
      if (twoChar === "==") {
        const end = text.indexOf("==}", i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
          for (let j = contentStart; j < contentEnd; j++) {
            settled.push(text[j]);
            toRaw.push(j);
          }
          i = constructEnd;
          continue;
        }
      }
      if (twoChar === ">>") {
        const end = text.indexOf("<<}", i + 3);
        if (end !== -1) {
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: i, rawEnd: constructEnd });
          i = constructEnd;
          continue;
        }
      }
    }
    settled.push(text[i]);
    toRaw.push(i);
    i++;
  }
  return { settled: settled.join(""), toRaw, markupRanges };
}
function stripCriticMarkupToCommittedWithMap(text) {
  const footnotes = extractFootnoteStatuses(text);
  const committed = [];
  const toRaw = [];
  const markupRanges = [];
  let i = 0;
  function consumeFootnoteRef(pos) {
    if (text[pos] !== "[" || text[pos + 1] !== "^" || !text.startsWith("ct-", pos + 2)) {
      return void 0;
    }
    const closeIdx = text.indexOf("]", pos + 2);
    if (closeIdx === -1)
      return void 0;
    const candidate = text.slice(pos, closeIdx + 1);
    if (!/^\[\^ct-\d+(?:\.\d+)?\]$/.test(candidate))
      return void 0;
    if (text[closeIdx + 1] === ":")
      return void 0;
    const id = text.slice(pos + 2, closeIdx);
    return { id, end: closeIdx + 1 };
  }
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "^" && text.startsWith("ct-", i + 2)) {
      const closeIdx = text.indexOf("]", i + 2);
      if (closeIdx !== -1 && /^\[\^ct-\d+(?:\.\d+)?\]$/.test(text.slice(i, closeIdx + 1)) && text[closeIdx + 1] !== ":") {
        markupRanges.push({ rawStart: i, rawEnd: closeIdx + 1 });
        i = closeIdx + 1;
        continue;
      }
    }
    if (text[i] === "{" && i + 2 < text.length) {
      const twoChar = text[i + 1] + text[i + 2];
      if (twoChar === "++") {
        const end = text.indexOf("++}", i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          const ref = consumeFootnoteRef(constructEnd);
          const refEnd = ref ? ref.end : constructEnd;
          const changeId = ref?.id;
          const status = changeId ? footnotes.get(changeId) : void 0;
          const isAccepted = status === "accepted";
          markupRanges.push({ rawStart: constructStart, rawEnd: refEnd });
          if (isAccepted) {
            for (let j = contentStart; j < contentEnd; j++) {
              committed.push(text[j]);
              toRaw.push(j);
            }
          }
          i = refEnd;
          continue;
        }
      }
      if (twoChar === "--") {
        const end = text.indexOf("--}", i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          const ref = consumeFootnoteRef(constructEnd);
          const refEnd = ref ? ref.end : constructEnd;
          const changeId = ref?.id;
          const status = changeId ? footnotes.get(changeId) : void 0;
          const isAccepted = status === "accepted";
          markupRanges.push({ rawStart: constructStart, rawEnd: refEnd });
          if (!isAccepted) {
            for (let j = contentStart; j < contentEnd; j++) {
              committed.push(text[j]);
              toRaw.push(j);
            }
          }
          i = refEnd;
          continue;
        }
      }
      if (twoChar === "~~") {
        const end = text.indexOf("~~}", i + 3);
        if (end !== -1) {
          const arrow = text.indexOf("~>", i + 3);
          if (arrow !== -1 && arrow < end) {
            const constructStart = i;
            const oldStart = i + 3;
            const oldEnd = arrow;
            const newStart = arrow + 2;
            const newEnd = end;
            const constructEnd = end + 3;
            const ref = consumeFootnoteRef(constructEnd);
            const refEnd = ref ? ref.end : constructEnd;
            const changeId = ref?.id;
            const status = changeId ? footnotes.get(changeId) : void 0;
            const isAccepted = status === "accepted";
            markupRanges.push({ rawStart: constructStart, rawEnd: refEnd });
            if (isAccepted) {
              for (let j = newStart; j < newEnd; j++) {
                committed.push(text[j]);
                toRaw.push(j);
              }
            } else {
              for (let j = oldStart; j < oldEnd; j++) {
                committed.push(text[j]);
                toRaw.push(j);
              }
            }
            i = refEnd;
            continue;
          }
        }
      }
      if (twoChar === "==") {
        const end = text.indexOf("==}", i + 3);
        if (end !== -1) {
          const constructStart = i;
          const contentStart = i + 3;
          const contentEnd = end;
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: constructStart, rawEnd: constructEnd });
          for (let j = contentStart; j < contentEnd; j++) {
            committed.push(text[j]);
            toRaw.push(j);
          }
          i = constructEnd;
          continue;
        }
      }
      if (twoChar === ">>") {
        const end = text.indexOf("<<}", i + 3);
        if (end !== -1) {
          const constructEnd = end + 3;
          markupRanges.push({ rawStart: i, rawEnd: constructEnd });
          i = constructEnd;
          continue;
        }
      }
    }
    committed.push(text[i]);
    toRaw.push(i);
    i++;
  }
  return { committed: committed.join(""), toRaw, markupRanges };
}
function findUniqueMatch(text, target, normalizer) {
  const firstIdx = text.indexOf(target);
  if (firstIdx !== -1) {
    const secondIdx = text.indexOf(target, firstIdx + 1);
    if (secondIdx !== -1) {
      throw new Error(`Text "${target}" found multiple times (ambiguous). Provide more context to uniquely identify the location. Use LINE:HASH coordinates from read_tracked_file for precise targeting (e.g., at: '15:a3').`);
    }
    return {
      index: firstIdx,
      length: target.length,
      originalText: target,
      wasNormalized: false
    };
  }
  if (text.includes("[^ct-") || target.includes("[^ct-") || target.includes("[ct-")) {
    const cleanTarget = target.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, "");
    const viewMatch = viewAwareFind(text, cleanTarget);
    if (viewMatch) {
      return {
        index: viewMatch.index,
        length: viewMatch.length,
        originalText: viewMatch.rawText,
        wasNormalized: true
      };
    }
  }
  if (normalizer) {
    const normalizedText = normalizer(text);
    const normalizedTarget = normalizer(target);
    const normIdx = normalizedText.indexOf(normalizedTarget);
    if (normIdx !== -1) {
      const normSecondIdx = normalizedText.indexOf(normalizedTarget, normIdx + 1);
      if (normSecondIdx !== -1) {
        throw new Error(`Text "${target}" found multiple times after normalization (ambiguous). Provide more context to uniquely identify the location. Use LINE:HASH coordinates from read_tracked_file for precise targeting (e.g., at: '15:a3').`);
      }
      const originalText = text.slice(normIdx, normIdx + target.length);
      return {
        index: normIdx,
        length: target.length,
        originalText,
        wasNormalized: true
      };
    }
  }
  {
    const wsMatch = whitespaceCollapsedFind(text, target);
    if (wsMatch !== null) {
      if (whitespaceCollapsedIsAmbiguous(text, target)) {
        throw new Error(`Text "${target}" found multiple times after whitespace collapsing (ambiguous). Provide more context to uniquely identify the location. Use LINE:HASH coordinates from read_tracked_file for precise targeting (e.g., at: '15:a3').`);
      }
      return {
        index: wsMatch.index,
        length: wsMatch.length,
        originalText: wsMatch.originalText,
        wasNormalized: true
      };
    }
  }
  if (containsCriticMarkup(text)) {
    const { committed, toRaw, markupRanges } = stripCriticMarkupToCommittedWithMap(text);
    if (committed !== text) {
      const committedIdx = committed.indexOf(target);
      if (committedIdx !== -1) {
        const committedSecondIdx = committed.indexOf(target, committedIdx + 1);
        if (committedSecondIdx !== -1) {
          throw new Error(`Text "${target}" found multiple times in committed text (ambiguous). Provide more context to uniquely identify the location. Use LINE:HASH coordinates from read_tracked_file for precise targeting (e.g., at: '15:a3').`);
        }
        const committedEnd = committedIdx + target.length - 1;
        let rawStart = toRaw[committedIdx];
        let rawEnd = toRaw[committedEnd] + 1;
        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const range of markupRanges) {
            if (range.rawStart < rawEnd && range.rawEnd > rawStart) {
              if (range.rawStart < rawStart) {
                rawStart = range.rawStart;
                expanded = true;
              }
              if (range.rawEnd > rawEnd) {
                rawEnd = range.rawEnd;
                expanded = true;
              }
            }
          }
        }
        for (const range of markupRanges) {
          if (range.rawStart === rawEnd && /^\[\^ct-/.test(text.slice(range.rawStart))) {
            rawEnd = range.rawEnd;
          }
        }
        return {
          index: rawStart,
          length: rawEnd - rawStart,
          originalText: text.slice(rawStart, rawEnd),
          // Return raw text covering constructs
          wasNormalized: true,
          wasCommittedMatch: true
        };
      }
    }
  }
  if (containsCriticMarkup(text)) {
    const { settled, toRaw, markupRanges } = stripCriticMarkupWithMap(text);
    const settledIdx = settled.indexOf(target);
    if (settledIdx !== -1) {
      const settledSecondIdx = settled.indexOf(target, settledIdx + 1);
      if (settledSecondIdx !== -1) {
        throw new Error(`Text "${target}" found multiple times in settled text (ambiguous). Provide more context to uniquely identify the location. Use LINE:HASH coordinates from read_tracked_file for precise targeting (e.g., at: '15:a3').`);
      }
      const settledEnd = settledIdx + target.length - 1;
      let rawStart = toRaw[settledIdx];
      let rawEnd = toRaw[settledEnd] + 1;
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const range of markupRanges) {
          if (range.rawStart < rawEnd && range.rawEnd > rawStart) {
            if (range.rawStart < rawStart) {
              rawStart = range.rawStart;
              expanded = true;
            }
            if (range.rawEnd > rawEnd) {
              rawEnd = range.rawEnd;
              expanded = true;
            }
          }
        }
      }
      for (const range of markupRanges) {
        if (range.rawStart === rawEnd && /^\[\^ct-/.test(text.slice(range.rawStart))) {
          rawEnd = range.rawEnd;
        }
      }
      return {
        index: rawStart,
        length: rawEnd - rawStart,
        originalText: target,
        // Return the settled text as originalText for clean CriticMarkup
        wasNormalized: true,
        wasSettledMatch: true
      };
    }
  }
  const hint = normalizer ? "Tried: exact match, normalized match (NFKC), whitespace-collapsed match, view-surface match, committed-text match, settled-text match." : "Tried: exact match only (no normalizer), whitespace-collapsed match, view-surface match, committed-text match, settled-text match.";
  const preview = target.length > 80 ? target.slice(0, 80) + "..." : target;
  const haystackPreview = text.length > 200 ? text.slice(0, 200) + "..." : text;
  const haystackLineCount = text.split("\n").length;
  const searchedInLine = `Searched in (${haystackLineCount} line${haystackLineCount === 1 ? "" : "s"}, first 200 chars): "${haystackPreview}"`;
  const diagnosticResult = tryDiagnosticConfusableMatch(text, target);
  if (diagnosticResult) {
    const diffLines = diagnosticResult.differences.map((d) => `  Position ${d.position}: you sent ${d.agentName} (U+${d.agentCodepoint.toString(16).toUpperCase().padStart(4, "0")}), file has ${d.fileName} (U+${d.fileCodepoint.toString(16).toUpperCase().padStart(4, "0")})`).join("\n");
    const diagPreview = diagnosticResult.matchedText.length > 80 ? diagnosticResult.matchedText.slice(0, 80) + "..." : diagnosticResult.matchedText;
    throw new Error(`Text not found in document.
${hint}
${searchedInLine}

Unicode mismatch detected -- your text would match with character substitution:
${diffLines}

Copy the exact text from file for retry:
  "${diagPreview}"`);
  }
  throw new Error(`Text not found in document.
${hint}
Input (first 80 chars): "${preview}"
${searchedInLine}
Hint: Re-read the file for current content, or use LINE:HASH addressing.`);
}
function tryFindUniqueMatch(text, target, normalizer) {
  try {
    return findUniqueMatch(text, target, normalizer);
  } catch {
    return null;
  }
}

// ../../packages/core/dist-esm/operations/compact.js
var l3Parser2 = new FootnoteNativeParser();
var RE_SUPERSEDES = new RegExp(`^\\s+supersedes:\\s+(${FOOTNOTE_ID_PATTERN})\\s*$`);

// ../../packages/core/dist-esm/tracking-header.js
var TRACKING_HEADER_RE = /<!--\s*ctrcks\.com\/v(\d+):\s*(tracked|untracked)\s*-->/;
var MAX_SCAN_LINES = 5;
function parseTrackingHeader(text) {
  const lines = text.split("\n");
  const scanLimit = Math.min(lines.length, MAX_SCAN_LINES);
  let offset = 0;
  for (let i = 0; i < scanLimit; i++) {
    const match = TRACKING_HEADER_RE.exec(lines[i]);
    if (match) {
      return {
        version: parseInt(match[1], 10),
        status: match[2],
        line: i,
        offset: offset + match.index,
        length: match[0].length
      };
    }
    offset += lines[i].length + 1;
  }
  return null;
}
function generateTrackingHeader(status) {
  return `<!-- ctrcks.com/v1: ${status} -->`;
}
function insertTrackingHeader(text) {
  if (parseTrackingHeader(text) !== null) {
    return { newText: text, headerInserted: false };
  }
  const header = generateTrackingHeader("tracked");
  if (text === "") {
    return { newText: header + "\n", headerInserted: true };
  }
  if (text.startsWith("---")) {
    const lines = text.split("\n");
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trimEnd() === "---") {
        const before = lines.slice(0, i + 1).join("\n");
        const after = lines.slice(i + 1).join("\n");
        return {
          newText: before + "\n" + header + "\n" + after,
          headerInserted: true
        };
      }
    }
  }
  return { newText: header + "\n" + text, headerInserted: true };
}

// ../../packages/core/dist-esm/renderers/decoration-intents.js
var SUB_SEPARATOR_LEN = TokenType.SubstitutionSeparator.length;

// ../../node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// ../../node_modules/smol-toml/dist/util.js
function isEscaped(str, ptr) {
  let i = 0;
  while (str[ptr - ++i] === "\\")
    ;
  return --i && i % 2;
}
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep2, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep2) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && isEscaped(str, seek));
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// ../../node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// ../../node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{2,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "	",
  n: "\n",
  f: "\f",
  r: "\r",
  e: "\x1B",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === "\n")
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === "\n" || c === "\r" && str[ptr] === "\n") {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "x" || c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "x" ? 2 : c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === "\n" || c === " " || c === "	" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== "\n" && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// ../../node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr);
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== "\n" && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// ../../node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t2 = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t2 = hasOwn ? t2[k] : t2[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t2, k)) && (typeof t2[k] !== "object" || seen.has(t2[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t2, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t2[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e2 = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e2[0]);
      ptr = e2[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// ../../node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t2 = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t2 = hasOwn ? t2[k] : t2[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t2.length - 1;
        t2 = t2[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t2, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t2, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t2[k] = [];
    }
    t2[k].push(t2 = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t2 = hasOwn ? t2[k] : t2[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t2, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// ../../packages/cli/dist/config/loader.js
import * as fs from "node:fs/promises";
import * as path from "node:path";
function asStringArray(value) {
  if (!Array.isArray(value))
    return void 0;
  if (value.every((v) => typeof v === "string"))
    return value;
  return void 0;
}
function derivePolicyMode(legacyEnforcement) {
  if (legacyEnforcement === "block")
    return "strict";
  if (legacyEnforcement === "warn")
    return "safety-net";
  return "safety-net";
}
function parseHumanAgentSplit(raw, fallback) {
  if (!raw || typeof raw !== "object")
    return { ...fallback };
  return {
    human: typeof raw["human"] === "boolean" ? raw["human"] : fallback.human,
    agent: typeof raw["agent"] === "boolean" ? raw["agent"] : fallback.agent
  };
}
function parseConfigToml(raw) {
  const parsed = parse(raw);
  const tracking = parsed["tracking"];
  const author = parsed["author"];
  const hooks = parsed["hooks"];
  const matching = parsed["matching"];
  const hashline = parsed["hashline"];
  const settlement = parsed["settlement"];
  const policy = parsed["policy"];
  const protocol = parsed["protocol"];
  const response = parsed["response"];
  const review = parsed["review"];
  const reasoning = parsed["reasoning"];
  const legacyReasonRequired = review?.["reason_required"];
  return {
    tracking: {
      include: asStringArray(tracking?.["include"]) ?? DEFAULT_CONFIG2.tracking.include,
      exclude: asStringArray(tracking?.["exclude"]) ?? DEFAULT_CONFIG2.tracking.exclude,
      default: tracking?.["default"] === "tracked" || tracking?.["default"] === "untracked" ? tracking["default"] : DEFAULT_CONFIG2.tracking.default,
      auto_header: typeof tracking?.["auto_header"] === "boolean" ? tracking["auto_header"] : DEFAULT_CONFIG2.tracking.auto_header
    },
    author: {
      default: typeof author?.["default"] === "string" ? author["default"] : DEFAULT_CONFIG2.author.default,
      enforcement: author?.["enforcement"] === "optional" || author?.["enforcement"] === "required" ? author["enforcement"] : DEFAULT_CONFIG2.author.enforcement
    },
    hooks: {
      enforcement: hooks?.["enforcement"] === "warn" || hooks?.["enforcement"] === "block" ? hooks["enforcement"] : DEFAULT_CONFIG2.hooks.enforcement,
      exclude: asStringArray(hooks?.["exclude"]) ?? DEFAULT_CONFIG2.hooks.exclude,
      intercept_tools: typeof hooks?.["intercept_tools"] === "boolean" ? hooks["intercept_tools"] : DEFAULT_CONFIG2.hooks.intercept_tools,
      intercept_bash: typeof hooks?.["intercept_bash"] === "boolean" ? hooks["intercept_bash"] : DEFAULT_CONFIG2.hooks.intercept_bash,
      patch_wrap_experimental: typeof hooks?.["patch_wrap_experimental"] === "boolean" ? hooks["patch_wrap_experimental"] : DEFAULT_CONFIG2.hooks.patch_wrap_experimental
    },
    matching: {
      mode: matching?.["mode"] === "strict" || matching?.["mode"] === "normalized" ? matching["mode"] : DEFAULT_CONFIG2.matching.mode
    },
    hashline: {
      enabled: typeof hashline?.["enabled"] === "boolean" ? hashline["enabled"] : DEFAULT_CONFIG2.hashline.enabled,
      auto_remap: typeof hashline?.["auto_remap"] === "boolean" ? hashline["auto_remap"] : DEFAULT_CONFIG2.hashline.auto_remap
    },
    settlement: {
      auto_on_approve: typeof settlement?.["auto_on_approve"] === "boolean" ? settlement["auto_on_approve"] : DEFAULT_CONFIG2.settlement.auto_on_approve,
      auto_on_reject: typeof settlement?.["auto_on_reject"] === "boolean" ? settlement["auto_on_reject"] : DEFAULT_CONFIG2.settlement.auto_on_reject
    },
    coherence: {
      threshold: parsed["coherence"] && typeof parsed["coherence"]["threshold"] === "number" ? Math.max(0, Math.min(100, parsed["coherence"]["threshold"])) : DEFAULT_CONFIG2.coherence.threshold
    },
    review: {
      may_review: parseHumanAgentSplit(review?.["may_review"], DEFAULT_CONFIG2.review.may_review),
      self_acceptance: parseHumanAgentSplit(review?.["self_acceptance"], DEFAULT_CONFIG2.review.self_acceptance),
      cross_withdrawal: parseHumanAgentSplit(review?.["cross_withdrawal"], DEFAULT_CONFIG2.review.cross_withdrawal),
      blocking_labels: review?.["blocking_labels"] && typeof review["blocking_labels"] === "object" ? review["blocking_labels"] : { ...DEFAULT_CONFIG2.review.blocking_labels }
    },
    reasoning: {
      // If explicit [reasoning] section exists, use it.
      // Otherwise fall back to legacy [review.reason_required] for backward compat.
      propose: parseHumanAgentSplit(reasoning?.["propose"] ?? legacyReasonRequired, DEFAULT_CONFIG2.reasoning.propose),
      review: parseHumanAgentSplit(reasoning?.["review"] ?? legacyReasonRequired, DEFAULT_CONFIG2.reasoning.review)
    },
    policy: {
      mode: policy?.["mode"] === "strict" || policy?.["mode"] === "safety-net" || policy?.["mode"] === "permissive" ? policy["mode"] : derivePolicyMode(hooks?.["enforcement"]),
      creation_tracking: policy?.["creation_tracking"] === "none" || policy?.["creation_tracking"] === "footnote" || policy?.["creation_tracking"] === "inline" ? policy["creation_tracking"] : DEFAULT_CONFIG2.policy.creation_tracking,
      default_view: policy?.["default_view"] === "review" || policy?.["default_view"] === "changes" || policy?.["default_view"] === "settled" ? policy["default_view"] : DEFAULT_CONFIG2.policy.default_view,
      view_policy: policy?.["view_policy"] === "suggest" || policy?.["view_policy"] === "require" ? policy["view_policy"] : DEFAULT_CONFIG2.policy.view_policy
    },
    protocol: {
      mode: protocol?.["mode"] === "classic" || protocol?.["mode"] === "compact" ? protocol["mode"] : DEFAULT_CONFIG2.protocol.mode,
      level: protocol?.["level"] === 1 || protocol?.["level"] === 2 ? protocol["level"] : DEFAULT_CONFIG2.protocol.level,
      reasoning: protocol?.["reasoning"] === "optional" || protocol?.["reasoning"] === "required" ? protocol["reasoning"] : DEFAULT_CONFIG2.protocol.reasoning,
      batch_reasoning: protocol?.["batch_reasoning"] === "optional" || protocol?.["batch_reasoning"] === "required" ? protocol["batch_reasoning"] : DEFAULT_CONFIG2.protocol.batch_reasoning
    },
    response: {
      affected_lines: typeof response?.["affected_lines"] === "boolean" ? response["affected_lines"] : false
    }
  };
}
async function findConfigFile(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, ".changetracks", "config.toml");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      return void 0;
    }
    dir = parent;
  }
}
async function loadConfig(projectDir) {
  const configPath = await findConfigFile(projectDir);
  if (!configPath) {
    console.error(`changetracks: no .changetracks/config.toml found (searched from ${projectDir} to /), using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
  let raw;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    console.error(`changetracks: found ${configPath} but could not read it, using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
  try {
    return parseConfigToml(raw);
  } catch (err) {
    console.error(`changetracks: ${configPath} contains invalid TOML (${err instanceof Error ? err.message : String(err)}), using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
}

// ../../packages/cli/dist/config/index.js
var DEFAULT_CONFIG2 = {
  ...DEFAULT_CONFIG,
  hooks: {
    enforcement: "warn",
    exclude: [],
    intercept_tools: true,
    intercept_bash: false,
    patch_wrap_experimental: false
  },
  protocol: {
    mode: "classic",
    level: 2,
    reasoning: "optional",
    batch_reasoning: "optional"
  }
};

// src/core/batch-wrapper.ts
import * as fs3 from "node:fs/promises";

// src/pending.ts
import * as fs2 from "node:fs/promises";
import * as path2 from "node:path";
function pendingPath(projectDir) {
  return path2.join(projectDir, ".changetracks", "pending.json");
}
async function atomicWriteJson(filePath, data) {
  const tmpPath = filePath + ".tmp." + process.pid;
  await fs2.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs2.rename(tmpPath, filePath);
}
async function readPendingEdits(projectDir) {
  try {
    const raw = await fs2.readFile(pendingPath(projectDir), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function clearSessionEdits(projectDir, sessionId) {
  const filePath = pendingPath(projectDir);
  const all = await readPendingEdits(projectDir);
  const remaining = all.filter((e2) => e2.session_id !== sessionId);
  if (remaining.length === 0) {
    try {
      await fs2.unlink(filePath);
    } catch {
    }
  } else {
    await atomicWriteJson(filePath, remaining);
  }
}

// src/core/edit-positioning.ts
function findEditPosition(fileContent, targetText, contextBefore, contextAfter) {
  const notFound = { start: -1, end: -1 };
  if (!targetText) return notFound;
  if (contextBefore && contextAfter) {
    const combined = contextBefore + targetText + contextAfter;
    let idx2 = fileContent.indexOf(combined);
    if (idx2 === -1) {
      idx2 = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx2 >= 0) {
      const start = idx2 + contextBefore.length;
      return { start, end: start + targetText.length };
    }
  }
  if (contextBefore) {
    const combined = contextBefore + targetText;
    let idx2 = fileContent.indexOf(combined);
    if (idx2 === -1) {
      idx2 = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx2 >= 0) {
      const start = idx2 + contextBefore.length;
      return { start, end: start + targetText.length };
    }
  }
  if (contextAfter) {
    const combined = targetText + contextAfter;
    let idx2 = fileContent.indexOf(combined);
    if (idx2 === -1) {
      idx2 = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx2 >= 0) {
      return { start: idx2, end: idx2 + targetText.length };
    }
  }
  let idx = fileContent.indexOf(targetText);
  if (idx === -1) {
    idx = normalizedIndexOf(fileContent, targetText, defaultNormalizer);
  }
  if (idx >= 0) {
    return { start: idx, end: idx + targetText.length };
  }
  return notFound;
}
function findDeletionInsertionPoint(fileContent, edit) {
  if (edit.context_before && edit.context_after) {
    const combined = edit.context_before + edit.context_after;
    let idx = fileContent.indexOf(combined);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, combined, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx + edit.context_before.length;
    }
  }
  if (edit.context_before) {
    let idx = fileContent.indexOf(edit.context_before);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, edit.context_before, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx + edit.context_before.length;
    }
  }
  if (edit.context_after) {
    let idx = fileContent.indexOf(edit.context_after);
    if (idx === -1) {
      idx = normalizedIndexOf(fileContent, edit.context_after, defaultNormalizer);
    }
    if (idx >= 0) {
      return idx;
    }
  }
  return -1;
}

// src/core/batch-wrapper.ts
function isCreationEdit(edit, fileContent) {
  if (edit.edit_class === "creation") return true;
  if (edit.old_text === "" && edit.new_text !== "" && fileContent.length > 0) {
    const ratio = edit.new_text.length / fileContent.length;
    if (ratio >= 0.95) return true;
  }
  return false;
}
async function applyPendingEdits(projectDir, sessionId, config) {
  const emptyResult = { editsApplied: 0, changeIds: [], message: "" };
  const pending = await readPendingEdits(projectDir);
  if (pending.length === 0) {
    return emptyResult;
  }
  const sessionEdits = pending.filter((e2) => e2.session_id === sessionId);
  if (sessionEdits.length === 0) {
    return emptyResult;
  }
  const editsByFile = /* @__PURE__ */ new Map();
  for (const edit of sessionEdits) {
    const existing = editsByFile.get(edit.file) || [];
    existing.push(edit);
    editsByFile.set(edit.file, existing);
  }
  const totalEdits = sessionEdits.length;
  const needsGroup = totalEdits > 1;
  const author = config.author.default || "unknown";
  const date = nowTimestamp().date;
  let globalMaxId = 0;
  for (const [filePath] of editsByFile) {
    try {
      const content = await fs3.readFile(filePath, "utf-8");
      globalMaxId = Math.max(globalMaxId, scanMaxCtId(content));
    } catch {
    }
  }
  const parentId = needsGroup ? globalMaxId + 1 : 0;
  let nextFlatId = globalMaxId;
  const allEditsWithIds = [];
  let childCounter = 0;
  for (const [, edits] of editsByFile) {
    for (const edit of edits) {
      let changeId;
      if (needsGroup) {
        childCounter++;
        changeId = `ct-${parentId}.${childCounter}`;
      } else {
        nextFlatId++;
        changeId = `ct-${nextFlatId}`;
      }
      allEditsWithIds.push({ ...edit, changeId });
    }
  }
  const allChangeIds = allEditsWithIds.map((e2) => e2.changeId);
  const editsWithIdsByFile = /* @__PURE__ */ new Map();
  for (const edit of allEditsWithIds) {
    const existing = editsWithIdsByFile.get(edit.file) || [];
    existing.push(edit);
    editsWithIdsByFile.set(edit.file, existing);
  }
  let isFirstFile = true;
  for (const [filePath, edits] of editsWithIdsByFile) {
    let fileContent;
    try {
      fileContent = await fs3.readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    const footnotes = [];
    if (needsGroup && isFirstFile) {
      const parentFootnote = generateFootnoteDefinition(`ct-${parentId}`, "group", author, date);
      footnotes.push(parentFootnote);
      isFirstFile = false;
    } else if (isFirstFile) {
      isFirstFile = false;
    }
    const sortedEdits = [...edits].reverse();
    for (const edit of sortedEdits) {
      const changeId = edit.changeId;
      if (isCreationEdit(edit, fileContent)) {
        const creationMode = config.policy.creation_tracking;
        if (creationMode === "none") {
          continue;
        }
        if (creationMode === "footnote") {
          const { newText, headerInserted } = insertTrackingHeader(fileContent);
          if (headerInserted) {
            fileContent = newText;
          }
          const footnote2 = generateFootnoteDefinition(changeId, "creation", author, date);
          footnotes.push(footnote2);
          continue;
        }
      }
      let changeType;
      if (edit.old_text === "" && edit.new_text !== "") {
        changeType = "ins";
        const markup = `{++${edit.new_text}++}[^${changeId}]`;
        const { start: pos } = findEditPosition(
          fileContent,
          edit.new_text,
          edit.context_before,
          edit.context_after
        );
        if (pos >= 0) {
          fileContent = fileContent.slice(0, pos) + markup + fileContent.slice(pos + edit.new_text.length);
        }
      } else if (edit.new_text === "" && edit.old_text !== "") {
        changeType = "del";
        const markup = `{--${edit.old_text}--}[^${changeId}]`;
        const insertPos = findDeletionInsertionPoint(fileContent, edit);
        if (insertPos >= 0) {
          fileContent = fileContent.slice(0, insertPos) + markup + fileContent.slice(insertPos);
        }
      } else {
        changeType = "sub";
        const markup = `{~~${edit.old_text}~>${edit.new_text}~~}[^${changeId}]`;
        const { start: pos } = findEditPosition(
          fileContent,
          edit.new_text,
          edit.context_before,
          edit.context_after
        );
        if (pos >= 0) {
          fileContent = fileContent.slice(0, pos) + markup + fileContent.slice(pos + edit.new_text.length);
        }
      }
      const footnote = generateFootnoteDefinition(changeId, changeType, author, date);
      footnotes.push(footnote);
    }
    if (footnotes.length > 0) {
      const footnoteBlock = footnotes.map((f) => f.trimStart()).join("\n");
      fileContent = fileContent.trimEnd() + "\n\n" + footnoteBlock + "\n";
    }
    await fs3.writeFile(filePath, fileContent, "utf-8");
    footnotes.length = 0;
  }
  await clearSessionEdits(projectDir, sessionId);
  const summary = allChangeIds.map((id) => `  [^${id}]`).join("\n");
  const message = `ChangeTracks recorded ${totalEdits} edit(s) this turn:
${summary}
Consider adding reasoning with review_changes for non-obvious changes.`;
  return {
    editsApplied: totalEdits,
    changeIds: allChangeIds,
    message
  };
}

// src/adapters/shared.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return { hook_event_name: "unknown" };
  return JSON.parse(raw);
}
function writeStdout(data) {
  process.stdout.write(JSON.stringify(data));
}
function deriveProjectDir(input) {
  if (input.cwd) return input.cwd;
  if (input.workspace_roots?.length) return input.workspace_roots[0];
  return process.cwd();
}
function deriveSessionId(input) {
  return input.session_id ?? input.conversation_id ?? "unknown";
}

// src/adapters/cursor/stop.ts
async function handleCursorStop(input) {
  const projectDir = deriveProjectDir(input);
  const sessionId = deriveSessionId(input);
  const config = await loadConfig(projectDir);
  if (config.policy.mode !== "safety-net") {
    await clearSessionEdits(projectDir, sessionId);
    return {};
  }
  await applyPendingEdits(projectDir, sessionId, config);
  return {};
}
async function main() {
  try {
    const input = await readStdin();
    const result = await handleCursorStop(input);
    writeStdout(result);
  } catch {
    writeStdout({});
  }
}
main();
export {
  handleCursorStop
};
/*! Bundled license information:

smol-toml/dist/error.js:
smol-toml/dist/util.js:
smol-toml/dist/date.js:
smol-toml/dist/primitive.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
//# sourceMappingURL=stop.js.map
