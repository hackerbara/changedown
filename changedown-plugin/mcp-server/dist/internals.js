var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../packages/core/dist-esm/config/index.js
var DEFAULT_CONFIG;
var init_config = __esm({
  "../../packages/core/dist-esm/config/index.js"() {
    "use strict";
    DEFAULT_CONFIG = {
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
  }
});

// ../../packages/core/dist-esm/config/review-permissions.js
function reviewerType(author) {
  const stripped = author.startsWith("@") ? author.slice(1) : author;
  if (stripped.startsWith("ai:") || stripped.startsWith("ci:"))
    return "agent";
  return "human";
}
function canAccept(reviewer, changeAuthor, config) {
  const rt = reviewerType(reviewer);
  if (!config.review.may_review[rt]) {
    return { allowed: false, reason: `${rt} participants cannot review in this project` };
  }
  if (!config.review.self_acceptance[rt] && reviewer === changeAuthor) {
    return { allowed: false, reason: `${rt} participants cannot accept their own changes in this project` };
  }
  return { allowed: true };
}
var init_review_permissions = __esm({
  "../../packages/core/dist-esm/config/review-permissions.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/timestamp.js
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
var TIMESTAMP_RE;
var init_timestamp = __esm({
  "../../packages/core/dist-esm/timestamp.js"() {
    "use strict";
    TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s?([AaPp][Mm])?(Z)?)?$/;
  }
});

// ../../packages/core/dist-esm/model/types.js
function changeTypeToAbbrev(type) {
  switch (type) {
    case ChangeType.Insertion:
      return "ins";
    case ChangeType.Deletion:
      return "del";
    case ChangeType.Substitution:
      return "sub";
    case ChangeType.Highlight:
      return "hig";
    case ChangeType.Comment:
      return "com";
  }
}
function isGhostNode(change) {
  return change.anchored === false && change.level >= 2 && !change.consumedBy;
}
function nodeStatus(node) {
  return (node.metadata?.status ?? node.inlineMetadata?.status ?? node.status).toString().toLowerCase();
}
var ChangeType, ChangeStatus;
var init_types = __esm({
  "../../packages/core/dist-esm/model/types.js"() {
    "use strict";
    (function(ChangeType2) {
      ChangeType2["Insertion"] = "Insertion";
      ChangeType2["Deletion"] = "Deletion";
      ChangeType2["Substitution"] = "Substitution";
      ChangeType2["Highlight"] = "Highlight";
      ChangeType2["Comment"] = "Comment";
    })(ChangeType || (ChangeType = {}));
    (function(ChangeStatus2) {
      ChangeStatus2["Proposed"] = "Proposed";
      ChangeStatus2["Accepted"] = "Accepted";
      ChangeStatus2["Rejected"] = "Rejected";
    })(ChangeStatus || (ChangeStatus = {}));
  }
});

// ../../packages/core/dist-esm/model/document.js
var VirtualDocument;
var init_document = __esm({
  "../../packages/core/dist-esm/model/document.js"() {
    "use strict";
    init_types();
    VirtualDocument = class _VirtualDocument {
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
          id: overlay.scId ?? `cn-pending-${overlay.range.start}`,
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
  }
});

// ../../packages/core/dist-esm/parser/tokens.js
var TokenType;
var init_tokens = __esm({
  "../../packages/core/dist-esm/parser/tokens.js"() {
    "use strict";
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
  }
});

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
var init_code_zones = __esm({
  "../../packages/core/dist-esm/parser/code-zones.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/footnote-patterns.js
function footnoteRefGlobal() {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_PATTERN}\\]`, "g");
}
function footnoteRefNumericGlobal() {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_NUMERIC_PATTERN}\\]`, "g");
}
function isL3Format(text) {
  const zones = findCodeZones(text);
  const defRe = new RegExp(FOOTNOTE_DEF_START.source, "gm");
  let defMatch;
  let firstFootnote = -1;
  while ((defMatch = defRe.exec(text)) !== null) {
    if (!zones.some((z) => defMatch.index >= z.start && defMatch.index < z.end)) {
      firstFootnote = defMatch.index;
      break;
    }
  }
  if (firstFootnote < 0)
    return false;
  const body = text.slice(0, firstFootnote);
  const cmRe = /\{\+\+|\{--|\{~~|\{==|\{>>/g;
  if (cmRe.test(body)) {
    cmRe.lastIndex = 0;
    let m;
    while ((m = cmRe.exec(body)) !== null) {
      if (!zones.some((z) => m.index >= z.start && m.index < z.end)) {
        return false;
      }
    }
  }
  const footnoteSection = text.slice(firstFootnote);
  return footnoteSection.split("\n").some((line) => FOOTNOTE_L3_EDIT_OP.test(line));
}
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
var FOOTNOTE_ID_PATTERN, FOOTNOTE_ID_NUMERIC_PATTERN, FOOTNOTE_REF_ANCHORED, FOOTNOTE_DEF_START, FOOTNOTE_DEF_START_QUICK, FOOTNOTE_DEF_LENIENT, FOOTNOTE_DEF_STRICT, FOOTNOTE_DEF_STATUS, FOOTNOTE_DEF_STATUS_VALUE, FOOTNOTE_L3_EDIT_OP, CTX_RE, FOOTNOTE_CONTINUATION, FOOTNOTE_THREAD_REPLY;
var init_footnote_patterns = __esm({
  "../../packages/core/dist-esm/footnote-patterns.js"() {
    "use strict";
    init_code_zones();
    FOOTNOTE_ID_PATTERN = "cn-\\d+(?:\\.\\d+)?";
    FOOTNOTE_ID_NUMERIC_PATTERN = "cn-(\\d+)(?:\\.\\d+)?";
    FOOTNOTE_REF_ANCHORED = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`);
    FOOTNOTE_DEF_START = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:`);
    FOOTNOTE_DEF_START_QUICK = /^\[\^cn-\d+/;
    FOOTNOTE_DEF_LENIENT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s*@(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)`);
    FOOTNOTE_DEF_STRICT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:(@\\S+)\\s+\\|\\s+)?(\\S+)\\s+\\|\\s+(\\S+)\\s+\\|\\s+(\\S+)`);
    FOOTNOTE_DEF_STATUS = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:@\\S+\\s+\\|\\s+)?\\S+\\s+\\|\\s+\\S+\\s+\\|\\s+(\\S+)`);
    FOOTNOTE_DEF_STATUS_VALUE = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:\\s.*\\|\\s*(proposed|accepted|rejected)`);
    FOOTNOTE_L3_EDIT_OP = /^ {4}(\d+):([0-9a-fA-F]{2,}) (.*)/;
    CTX_RE = /@ctx:"((?:[^"\\]|\\.)*)"\|\|"((?:[^"\\]|\\.)*)"/;
    FOOTNOTE_CONTINUATION = /^\s+\S/;
    FOOTNOTE_THREAD_REPLY = /^\s+@\S+\s+\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?Z?)?:/;
  }
});

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
function scanMaxCnId(text) {
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
var CHANGE_TYPE_KEY;
var init_footnote_generator = __esm({
  "../../packages/core/dist-esm/operations/footnote-generator.js"() {
    "use strict";
    init_footnote_patterns();
    init_timestamp();
    init_types();
    CHANGE_TYPE_KEY = {
      [ChangeType.Insertion]: "insertion",
      [ChangeType.Deletion]: "deletion",
      [ChangeType.Substitution]: "substitution",
      [ChangeType.Highlight]: "highlight",
      [ChangeType.Comment]: "comment"
    };
  }
});

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
var CriticMarkupParser;
var init_parser = __esm({
  "../../packages/core/dist-esm/parser/parser.js"() {
    "use strict";
    init_types();
    init_document();
    init_tokens();
    init_footnote_patterns();
    init_code_zones();
    init_timestamp();
    init_footnote_generator();
    CriticMarkupParser = class _CriticMarkupParser {
      constructor() {
        this.idBase = 0;
      }
      parse(text, options) {
        this.idBase = scanMaxCnId(text);
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
            const m = c.id.match(/^cn-(\d+)(?:\.\d+)?$/);
            if (m)
              usedIds.add(parseInt(m[1], 10));
          }
        }
        let nextId = this.idBase;
        const unanchored = changes.filter((c) => !c.anchored && c.id.startsWith("cn-"));
        for (const c of unanchored) {
          do {
            nextId++;
          } while (usedIds.has(nextId));
          c.id = `cn-${nextId}`;
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
        if (text.startsWith("[^cn-")) {
          searchStart = 0;
        } else {
          const firstDef = text.indexOf("\n[^cn-");
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
            const TYPE_MAP2 = {
              ins: ChangeType.Insertion,
              del: ChangeType.Deletion,
              sub: ChangeType.Substitution,
              highlight: ChangeType.Highlight,
              comment: ChangeType.Comment,
              insertion: ChangeType.Insertion,
              deletion: ChangeType.Deletion,
              substitution: ChangeType.Substitution
            };
            const type = TYPE_MAP2[def.type ?? ""] ?? ChangeType.Substitution;
            const node = {
              id,
              type,
              status,
              range: { start: offset, end: offset + refLength },
              contentRange: { start: offset, end: offset + refLength },
              // covers [^cn-N] ref
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
        return `cn-${this.idBase + counter + 1}`;
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
  }
});

// ../../packages/core/dist-esm/footnote-utils.js
function countFootnoteHeadersWithStatus(content, status) {
  let count = 0;
  for (const s of extractFootnoteStatuses(content).values()) {
    if (s === status)
      count++;
  }
  return count;
}
function findFootnoteBlock(lines, changeId) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`[^${changeId}]:`)) {
      let end = i;
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].startsWith("[^cn-"))
          break;
        if (lines[j].startsWith("    ")) {
          end = j;
          j++;
          continue;
        }
        if (lines[j].trim() === "") {
          let k = j + 1;
          let hasMore = false;
          while (k < lines.length && !lines[k].startsWith("[^cn-")) {
            if (lines[k].startsWith("    ")) {
              hasMore = true;
              break;
            }
            if (lines[k].trim() !== "")
              break;
            k++;
          }
          if (hasMore) {
            j++;
            continue;
          }
          break;
        }
        break;
      }
      return { headerLine: i, blockEnd: end, headerContent: lines[i] };
    }
  }
  return null;
}
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
function findDiscussionInsertionIndex(lines, headerLine, blockEnd) {
  let insertAfter = headerLine;
  for (let i = headerLine + 1; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "")
      continue;
    if (isApprovalOrResolutionLine(trimmed)) {
      return i - 1;
    }
    insertAfter = i;
  }
  return insertAfter;
}
function findReviewInsertionIndex(lines, headerLine, blockEnd) {
  let insertAfter = headerLine;
  for (let i = headerLine + 1; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "")
      continue;
    if (isResolutionLine(trimmed)) {
      return i - 1;
    }
    insertAfter = i;
  }
  return insertAfter;
}
function findChildFootnoteIds(lines, parentId) {
  const prefix = `[^${parentId}.`;
  const children = [];
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      const closeBracket = line.indexOf("]:");
      if (closeBracket !== -1) {
        children.push(line.slice(2, closeBracket));
      }
    }
  }
  return children;
}
function findFootnoteBlockStart(lines) {
  let lastDefIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (FOOTNOTE_DEF_START.test(lines[i])) {
      lastDefIdx = i;
      break;
    }
  }
  if (lastDefIdx === -1) {
    return lines.length;
  }
  let candidate = lastDefIdx;
  while (candidate >= 0) {
    let j = candidate + 1;
    let isTerminal = true;
    while (j < lines.length) {
      const line = lines[j];
      if (FOOTNOTE_DEF_START.test(line) || FOOTNOTE_CONTINUATION.test(line)) {
        j++;
      } else if (line.trim() === "") {
        j++;
      } else {
        isTerminal = false;
        break;
      }
    }
    if (isTerminal) {
      lastDefIdx = candidate;
      break;
    }
    candidate--;
    while (candidate >= 0 && !FOOTNOTE_DEF_START.test(lines[candidate])) {
      candidate--;
    }
  }
  if (candidate < 0) {
    return lines.length;
  }
  let blockStart = lastDefIdx;
  for (let i = lastDefIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (FOOTNOTE_DEF_START.test(line) || FOOTNOTE_CONTINUATION.test(line)) {
      blockStart = i;
    } else if (line.trim() === "") {
      let hasFootnoteBefore = false;
      for (let k = i - 1; k >= 0; k--) {
        if (lines[k].trim() === "")
          continue;
        if (FOOTNOTE_DEF_START.test(lines[k]) || FOOTNOTE_CONTINUATION.test(lines[k])) {
          hasFootnoteBefore = true;
        }
        break;
      }
      if (hasFootnoteBefore) {
        blockStart = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return blockStart;
}
function isApprovalOrResolutionLine(trimmed) {
  return trimmed.startsWith("approved:") || trimmed.startsWith("rejected:") || trimmed.startsWith("request-changes:") || trimmed.startsWith("resolved") || trimmed.startsWith("open --") || trimmed.startsWith("open ") || trimmed === "open";
}
function isResolutionLine(trimmed) {
  return trimmed.startsWith("resolved") || trimmed.startsWith("open --") || trimmed.startsWith("open ") || trimmed === "open";
}
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
var FOOTNOTE_ID_AND_STATUS_RE;
var init_footnote_utils = __esm({
  "../../packages/core/dist-esm/footnote-utils.js"() {
    "use strict";
    init_footnote_patterns();
    FOOTNOTE_ID_AND_STATUS_RE = /^\[\^(cn-\d+(?:\.\d+)?)\]:.*\|\s*(\S+)\s*$/;
  }
});

// ../../packages/core/dist-esm/operations/accept-reject.js
function computeAcceptParts(change) {
  const rangeLength = change.range.end - change.range.start;
  const refId = change.level >= 2 ? change.id : "";
  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, text: change.modifiedText ?? "", refId };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, text: "", refId };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, text: change.modifiedText ?? "", refId };
    case ChangeType.Highlight:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? "", refId };
    case ChangeType.Comment:
      return { offset: change.range.start, length: rangeLength, text: "", refId: "" };
  }
}
function computeRejectParts(change) {
  const rangeLength = change.range.end - change.range.start;
  const refId = change.level >= 2 ? change.id : "";
  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, text: "", refId };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? "", refId };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? "", refId };
    case ChangeType.Highlight:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? "", refId };
    case ChangeType.Comment:
      return { offset: change.range.start, length: rangeLength, text: "", refId: "" };
  }
}
function computeReject(change) {
  if (change.range.start === change.contentRange.start && change.range.end === change.contentRange.end) {
    switch (change.type) {
      case ChangeType.Insertion:
        return { offset: change.range.start, length: change.range.end - change.range.start, newText: "" };
      case ChangeType.Deletion:
        return { offset: change.range.start, length: 0, newText: change.originalText ?? "" };
      case ChangeType.Substitution:
        return { offset: change.range.start, length: change.range.end - change.range.start, newText: change.originalText ?? "" };
      case ChangeType.Highlight:
        return { offset: change.range.start, length: 0, newText: "" };
      case ChangeType.Comment:
        return { offset: change.range.start, length: 0, newText: "" };
    }
  }
  const parts = computeRejectParts(change);
  const ref = parts.refId ? `[^${parts.refId}]` : "";
  return { offset: parts.offset, length: parts.length, newText: parts.text + ref };
}
var init_accept_reject = __esm({
  "../../packages/core/dist-esm/operations/accept-reject.js"() {
    "use strict";
    init_types();
    init_footnote_patterns();
    init_timestamp();
    init_footnote_utils();
  }
});

// ../../packages/core/dist-esm/operations/resolution.js
function computeResolutionEdit(text, changeId, opts) {
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return null;
  const date = opts.date ?? nowTimestamp().raw;
  const author = opts.author.startsWith("@") ? opts.author : `@${opts.author}`;
  const line = `    resolved: ${author} ${date}`;
  const offset = lines.slice(0, block.blockEnd + 1).join("\n").length;
  return { offset, length: 0, newText: "\n" + line };
}
function computeUnresolveEdit(text, changeId) {
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return null;
  for (let i = block.headerLine + 1; i <= block.blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("resolved:") || trimmed.startsWith("resolved ")) {
      const linesBefore = lines.slice(0, i).join("\n");
      const lineOffset2 = linesBefore.length;
      const lineLength = lines[i].length + 1;
      return { offset: lineOffset2, length: lineLength, newText: "" };
    }
  }
  return null;
}
var init_resolution = __esm({
  "../../packages/core/dist-esm/operations/resolution.js"() {
    "use strict";
    init_footnote_utils();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/reply.js
function computeReplyEdit(docText, changeId, opts) {
  const lines = docText.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block) {
    return { isError: true, error: `Footnote not found for ${changeId}` };
  }
  const date = opts.date ?? nowTimestamp().raw;
  const labelPart = opts.label ? ` [${opts.label}]` : "";
  const replyLines = opts.text.split("\n");
  const indent = "    ";
  const continuationIndent = "      ";
  const firstLine = `${indent}@${opts.author} ${date}${labelPart}: ${replyLines[0]}`;
  const continuationLines = replyLines.slice(1).map((l) => `${continuationIndent}${l}`);
  const newLines = [firstLine, ...continuationLines];
  const insertIndex = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd) + 1;
  lines.splice(insertIndex, 0, ...newLines);
  return { isError: false, text: lines.join("\n") };
}
var init_reply = __esm({
  "../../packages/core/dist-esm/operations/reply.js"() {
    "use strict";
    init_footnote_utils();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/navigation.js
var init_navigation = __esm({
  "../../packages/core/dist-esm/operations/navigation.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/operations/tracking.js
var init_tracking = __esm({
  "../../packages/core/dist-esm/operations/tracking.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/operations/comment.js
var init_comment = __esm({
  "../../packages/core/dist-esm/operations/comment.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/operations/apply-review.js
function decisionToKeyword(decision) {
  switch (decision) {
    case "approve":
      return "approved:";
    case "reject":
      return "rejected:";
    case "request_changes":
      return "request-changes:";
    case "withdraw":
      return "withdrew:";
    default: {
      const _exhaustive = decision;
      return _exhaustive;
    }
  }
}
function checkBlocks(lines, block) {
  const blockers = [];
  const resolved = /* @__PURE__ */ new Set();
  for (let i = block.headerLine + 1; i <= block.blockEnd; i++) {
    const line = lines[i].trim();
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1)
      continue;
    const keyword = line.slice(0, colonIdx);
    const authorMatch = line.slice(colonIdx + 1).match(/^\s*@(\S+)/);
    if (!authorMatch)
      continue;
    const author = "@" + authorMatch[1];
    if (keyword === "blocked")
      blockers.push(author);
    else if (keyword === "withdrew" || keyword === "approved")
      resolved.add(author);
  }
  const unresolvedBlockers = blockers.filter((b) => !resolved.has(b));
  return { blocked: unresolvedBlockers.length > 0, blockers: unresolvedBlockers };
}
function promoteLevel0ToLevel2(fileContent, changeId, author) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent);
  const changes = doc.getChanges();
  const change = changes.find((c) => c.id === changeId);
  if (!change) {
    return null;
  }
  if (change.level !== 0) {
    return null;
  }
  const typeAbbrev = changeTypeToAbbrev(change.type);
  const result = ensureL2(fileContent, change.range.start, { author, type: typeAbbrev });
  if (!result.promoted) {
    return null;
  }
  return result.text;
}
function applyReview(fileContent, changeId, decision, reasoning, author, config) {
  let lines = fileContent.split("\n");
  let block = findFootnoteBlock(lines, changeId);
  if (!block) {
    const promoted = promoteLevel0ToLevel2(fileContent, changeId, author);
    if (!promoted) {
      return { error: `Change "${changeId}" not found in file.` };
    }
    fileContent = promoted;
    lines = fileContent.split("\n");
    block = findFootnoteBlock(lines, changeId);
    if (!block) {
      return { error: `Change "${changeId}" not found in file after promotion attempt.` };
    }
  }
  const header = parseFootnoteHeader(lines[block.headerLine]);
  if (!header) {
    return {
      error: `Malformed metadata for change "${changeId}". Expected format: @author | date | type | status`
    };
  }
  const currentStatus = header.status;
  if (config && (decision === "approve" || decision === "reject")) {
    const acceptCheck = canAccept(author, header.author, config);
    if (!acceptCheck.allowed) {
      return { error: acceptCheck.reason };
    }
  }
  if (decision === "approve" && currentStatus === "accepted") {
    return {
      updatedContent: fileContent,
      result: { change_id: changeId, decision, status_updated: false, reason: "already_accepted" }
    };
  }
  if (decision === "reject" && currentStatus === "rejected") {
    return {
      updatedContent: fileContent,
      result: { change_id: changeId, decision, status_updated: false, reason: "already_rejected" }
    };
  }
  if (decision === "approve") {
    const blockResult = checkBlocks(lines, block);
    if (blockResult.blocked) {
      return { error: `Acceptance blocked by unresolved request-changes from ${blockResult.blockers.join(", ")}` };
    }
  }
  const keyword = decisionToKeyword(decision);
  const ts = nowTimestamp();
  const reviewLine = `    ${keyword} @${author} ${ts.raw} "${reasoning}"`;
  const insertAfterIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  lines.splice(insertAfterIdx + 1, 0, reviewLine);
  let statusUpdated = false;
  let reason;
  if (decision === "approve" && currentStatus === "proposed") {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*proposed\s*$/, "| accepted");
    statusUpdated = true;
  } else if (decision === "reject" && currentStatus === "proposed") {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*proposed\s*$/, "| rejected");
    statusUpdated = true;
  } else if (decision === "reject" && currentStatus === "accepted") {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*accepted\s*$/, "| rejected");
    statusUpdated = true;
  } else if (decision === "approve" && currentStatus === "rejected") {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*rejected\s*$/, "| accepted");
    statusUpdated = true;
  } else if (decision === "request_changes") {
    reason = "request_changes_no_status_change";
  }
  let cascadedChildren;
  if (statusUpdated && (decision === "approve" || decision === "reject")) {
    const childIds = findChildFootnoteIds(lines, changeId);
    if (childIds.length > 0) {
      cascadedChildren = [];
      const targetStatus = decision === "approve" ? "accepted" : "rejected";
      for (const childId of childIds) {
        const childBlock = findFootnoteBlock(lines, childId);
        if (!childBlock)
          continue;
        const childHeader = parseFootnoteHeader(lines[childBlock.headerLine]);
        if (!childHeader)
          continue;
        if (childHeader.status !== "proposed")
          continue;
        lines[childBlock.headerLine] = lines[childBlock.headerLine].replace(/\|\s*proposed\s*$/, `| ${targetStatus}`);
        const childInsertIdx = findReviewInsertionIndex(lines, childBlock.headerLine, childBlock.blockEnd);
        const childReviewLine = `    ${keyword} @${author} ${ts.raw} "${reasoning}" (cascaded from ${changeId})`;
        lines.splice(childInsertIdx + 1, 0, childReviewLine);
        cascadedChildren.push(childId);
      }
      if (cascadedChildren.length === 0)
        cascadedChildren = void 0;
    }
  }
  const result = { change_id: changeId, decision, status_updated: statusUpdated };
  if (reason) {
    result.reason = reason;
  }
  if (cascadedChildren) {
    result.cascaded_children = cascadedChildren;
  }
  return {
    updatedContent: lines.join("\n"),
    result
  };
}
var VALID_DECISIONS;
var init_apply_review = __esm({
  "../../packages/core/dist-esm/operations/apply-review.js"() {
    "use strict";
    init_parser();
    init_types();
    init_footnote_utils();
    init_timestamp();
    init_ensure_l2();
    init_review_permissions();
    VALID_DECISIONS = ["approve", "reject", "request_changes", "withdraw"];
  }
});

// ../../node_modules/xxhash-wasm/esm/xxhash-wasm.js
async function e() {
  return (function(t2) {
    const { exports: { mem: e2, xxh32: n, xxh64: r, init32: i, update32: a, digest32: o, init64: s, update64: u, digest64: c } } = t2;
    let h = new Uint8Array(e2.buffer);
    function g(t3, n2) {
      if (e2.buffer.byteLength < t3 + n2) {
        const r2 = Math.ceil((t3 + n2 - e2.buffer.byteLength) / 65536);
        e2.grow(r2), h = new Uint8Array(e2.buffer);
      }
    }
    function f(t3, e3, n2, r2, i2, a2) {
      g(t3);
      const o2 = new Uint8Array(t3);
      return h.set(o2), n2(0, e3), o2.set(h.subarray(0, t3)), { update(e4) {
        let n3;
        return h.set(o2), "string" == typeof e4 ? (g(3 * e4.length, t3), n3 = w.encodeInto(e4, h.subarray(t3)).written) : (g(e4.byteLength, t3), h.set(e4, t3), n3 = e4.byteLength), r2(0, t3, n3), o2.set(h.subarray(0, t3)), this;
      }, digest: () => (h.set(o2), a2(i2(0))) };
    }
    function y(t3) {
      return t3 >>> 0;
    }
    const b = 2n ** 64n - 1n;
    function d(t3) {
      return t3 & b;
    }
    const w = new TextEncoder(), l = 0, p = 0n;
    function x(t3, e3 = l) {
      return g(3 * t3.length, 0), y(n(0, w.encodeInto(t3, h).written, e3));
    }
    function L(t3, e3 = p) {
      return g(3 * t3.length, 0), d(r(0, w.encodeInto(t3, h).written, e3));
    }
    return { h32: x, h32ToString: (t3, e3 = l) => x(t3, e3).toString(16).padStart(8, "0"), h32Raw: (t3, e3 = l) => (g(t3.byteLength, 0), h.set(t3), y(n(0, t3.byteLength, e3))), create32: (t3 = l) => f(48, t3, i, a, o, y), h64: L, h64ToString: (t3, e3 = p) => L(t3, e3).toString(16).padStart(16, "0"), h64Raw: (t3, e3 = p) => (g(t3.byteLength, 0), h.set(t3), d(r(0, t3.byteLength, e3))), create64: (t3 = p) => f(88, t3, s, u, c, d) };
  })((await WebAssembly.instantiate(t)).instance);
}
var t;
var init_xxhash_wasm = __esm({
  "../../node_modules/xxhash-wasm/esm/xxhash-wasm.js"() {
    t = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 48, 8, 96, 3, 127, 127, 127, 1, 127, 96, 3, 127, 127, 127, 0, 96, 2, 127, 127, 0, 96, 1, 127, 1, 127, 96, 3, 127, 127, 126, 1, 126, 96, 3, 126, 127, 127, 1, 126, 96, 2, 127, 126, 0, 96, 1, 127, 1, 126, 3, 11, 10, 0, 0, 2, 1, 3, 4, 5, 6, 1, 7, 5, 3, 1, 0, 1, 7, 85, 9, 3, 109, 101, 109, 2, 0, 5, 120, 120, 104, 51, 50, 0, 0, 6, 105, 110, 105, 116, 51, 50, 0, 2, 8, 117, 112, 100, 97, 116, 101, 51, 50, 0, 3, 8, 100, 105, 103, 101, 115, 116, 51, 50, 0, 4, 5, 120, 120, 104, 54, 52, 0, 5, 6, 105, 110, 105, 116, 54, 52, 0, 7, 8, 117, 112, 100, 97, 116, 101, 54, 52, 0, 8, 8, 100, 105, 103, 101, 115, 116, 54, 52, 0, 9, 10, 251, 22, 10, 242, 1, 1, 4, 127, 32, 0, 32, 1, 106, 33, 3, 32, 1, 65, 16, 79, 4, 127, 32, 3, 65, 16, 107, 33, 6, 32, 2, 65, 168, 136, 141, 161, 2, 106, 33, 3, 32, 2, 65, 137, 235, 208, 208, 7, 107, 33, 4, 32, 2, 65, 207, 140, 162, 142, 6, 106, 33, 5, 3, 64, 32, 3, 32, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 4, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 4, 32, 2, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 5, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 6, 32, 0, 65, 4, 106, 34, 0, 79, 13, 0, 11, 32, 2, 65, 12, 119, 32, 5, 65, 18, 119, 106, 32, 4, 65, 7, 119, 106, 32, 3, 65, 1, 119, 106, 5, 32, 2, 65, 177, 207, 217, 178, 1, 106, 11, 32, 1, 106, 32, 0, 32, 1, 65, 15, 113, 16, 1, 11, 146, 1, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 1, 65, 4, 106, 32, 2, 75, 69, 4, 64, 32, 0, 32, 1, 40, 2, 0, 65, 189, 220, 202, 149, 124, 108, 106, 65, 17, 119, 65, 175, 214, 211, 190, 2, 108, 33, 0, 32, 1, 65, 4, 106, 33, 1, 12, 1, 11, 11, 3, 64, 32, 1, 32, 2, 79, 69, 4, 64, 32, 0, 32, 1, 45, 0, 0, 65, 177, 207, 217, 178, 1, 108, 106, 65, 11, 119, 65, 177, 243, 221, 241, 121, 108, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 65, 15, 118, 115, 65, 247, 148, 175, 175, 120, 108, 34, 0, 65, 13, 118, 32, 0, 115, 65, 189, 220, 202, 149, 124, 108, 34, 0, 65, 16, 118, 32, 0, 115, 11, 63, 0, 32, 0, 65, 8, 106, 32, 1, 65, 168, 136, 141, 161, 2, 106, 54, 2, 0, 32, 0, 65, 12, 106, 32, 1, 65, 137, 235, 208, 208, 7, 107, 54, 2, 0, 32, 0, 65, 16, 106, 32, 1, 54, 2, 0, 32, 0, 65, 20, 106, 32, 1, 65, 207, 140, 162, 142, 6, 106, 54, 2, 0, 11, 195, 4, 1, 6, 127, 32, 1, 32, 2, 106, 33, 6, 32, 0, 65, 24, 106, 33, 4, 32, 0, 65, 40, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 40, 2, 0, 32, 2, 106, 54, 2, 0, 32, 0, 65, 4, 106, 34, 5, 32, 5, 40, 2, 0, 32, 2, 65, 16, 79, 32, 0, 40, 2, 0, 65, 16, 79, 114, 114, 54, 2, 0, 32, 2, 32, 3, 106, 65, 16, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 16, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 12, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 4, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 8, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 20, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 12, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 40, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 32, 6, 65, 16, 107, 77, 4, 64, 32, 6, 65, 16, 107, 33, 8, 32, 0, 65, 8, 106, 40, 2, 0, 33, 2, 32, 0, 65, 12, 106, 40, 2, 0, 33, 3, 32, 0, 65, 16, 106, 40, 2, 0, 33, 5, 32, 0, 65, 20, 106, 40, 2, 0, 33, 7, 3, 64, 32, 2, 32, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 3, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 5, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 7, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 7, 32, 8, 32, 1, 65, 4, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 2, 54, 2, 0, 32, 0, 65, 12, 106, 32, 3, 54, 2, 0, 32, 0, 65, 16, 106, 32, 5, 54, 2, 0, 32, 0, 65, 20, 106, 32, 7, 54, 2, 0, 11, 32, 1, 32, 6, 73, 4, 64, 32, 4, 32, 1, 32, 6, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 1, 54, 2, 0, 11, 11, 97, 1, 1, 127, 32, 0, 65, 16, 106, 40, 2, 0, 33, 1, 32, 0, 65, 4, 106, 40, 2, 0, 4, 127, 32, 1, 65, 12, 119, 32, 0, 65, 20, 106, 40, 2, 0, 65, 18, 119, 106, 32, 0, 65, 12, 106, 40, 2, 0, 65, 7, 119, 106, 32, 0, 65, 8, 106, 40, 2, 0, 65, 1, 119, 106, 5, 32, 1, 65, 177, 207, 217, 178, 1, 106, 11, 32, 0, 40, 2, 0, 106, 32, 0, 65, 24, 106, 32, 0, 65, 40, 106, 40, 2, 0, 16, 1, 11, 255, 3, 2, 3, 126, 1, 127, 32, 0, 32, 1, 106, 33, 6, 32, 1, 65, 32, 79, 4, 126, 32, 6, 65, 32, 107, 33, 6, 32, 2, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 33, 3, 32, 2, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 33, 4, 32, 2, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 33, 5, 3, 64, 32, 3, 32, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 3, 32, 4, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 4, 32, 2, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 2, 32, 5, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 5, 32, 6, 32, 0, 65, 8, 106, 34, 0, 79, 13, 0, 11, 32, 2, 66, 12, 137, 32, 5, 66, 18, 137, 124, 32, 4, 66, 7, 137, 124, 32, 3, 66, 1, 137, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 2, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 2, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 1, 173, 124, 32, 0, 32, 1, 65, 31, 113, 16, 6, 11, 134, 2, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 2, 32, 1, 65, 8, 106, 79, 4, 64, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 32, 0, 133, 66, 27, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 33, 0, 32, 1, 65, 8, 106, 33, 1, 12, 1, 11, 11, 32, 1, 65, 4, 106, 32, 2, 77, 4, 64, 32, 0, 32, 1, 53, 2, 0, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 23, 137, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 124, 33, 0, 32, 1, 65, 4, 106, 33, 1, 11, 3, 64, 32, 1, 32, 2, 73, 4, 64, 32, 0, 32, 1, 49, 0, 0, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 126, 133, 66, 11, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 66, 33, 136, 133, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 34, 0, 32, 0, 66, 29, 136, 133, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 126, 34, 0, 32, 0, 66, 32, 136, 133, 11, 77, 0, 32, 0, 65, 8, 106, 32, 1, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 55, 3, 0, 32, 0, 65, 16, 106, 32, 1, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 55, 3, 0, 32, 0, 65, 24, 106, 32, 1, 55, 3, 0, 32, 0, 65, 32, 106, 32, 1, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 55, 3, 0, 11, 244, 4, 2, 3, 127, 4, 126, 32, 1, 32, 2, 106, 33, 5, 32, 0, 65, 40, 106, 33, 4, 32, 0, 65, 200, 0, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 41, 3, 0, 32, 2, 173, 124, 55, 3, 0, 32, 2, 32, 3, 106, 65, 32, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 32, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 8, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 24, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 16, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 32, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 24, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 200, 0, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 65, 32, 106, 32, 5, 77, 4, 64, 32, 5, 65, 32, 107, 33, 2, 32, 0, 65, 8, 106, 41, 3, 0, 33, 6, 32, 0, 65, 16, 106, 41, 3, 0, 33, 7, 32, 0, 65, 24, 106, 41, 3, 0, 33, 8, 32, 0, 65, 32, 106, 41, 3, 0, 33, 9, 3, 64, 32, 6, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 6, 32, 7, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 7, 32, 8, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 8, 32, 9, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 9, 32, 2, 32, 1, 65, 8, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 6, 55, 3, 0, 32, 0, 65, 16, 106, 32, 7, 55, 3, 0, 32, 0, 65, 24, 106, 32, 8, 55, 3, 0, 32, 0, 65, 32, 106, 32, 9, 55, 3, 0, 11, 32, 1, 32, 5, 73, 4, 64, 32, 4, 32, 1, 32, 5, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 1, 54, 2, 0, 11, 11, 188, 2, 1, 5, 126, 32, 0, 65, 24, 106, 41, 3, 0, 33, 1, 32, 0, 41, 3, 0, 34, 2, 66, 32, 90, 4, 126, 32, 0, 65, 8, 106, 41, 3, 0, 34, 3, 66, 1, 137, 32, 0, 65, 16, 106, 41, 3, 0, 34, 4, 66, 7, 137, 124, 32, 1, 66, 12, 137, 32, 0, 65, 32, 106, 41, 3, 0, 34, 5, 66, 18, 137, 124, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 1, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 1, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 2, 124, 32, 0, 65, 40, 106, 32, 2, 66, 31, 131, 167, 16, 6, 11]);
  }
});

// ../../packages/core/dist-esm/hashline.js
function getXXHash() {
  return globalThis[HASHLINE_KEY] ?? null;
}
async function initHashline() {
  if (!getXXHash()) {
    globalThis[HASHLINE_KEY] = await e();
  }
}
function stripForHash(line) {
  return line.replace(/\r$/, "").replace(/\[\^cn-[\w.]+\]/g, "").replace(/\s+/g, "");
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
function validateLineRef(ref, fileLines) {
  if (ref.line < 1 || ref.line > fileLines.length) {
    throw new Error(`Line ${ref.line} is out of range (file has ${fileLines.length} lines)`);
  }
  const actualHash = computeLineHash(ref.line - 1, fileLines[ref.line - 1], fileLines);
  if (ref.hash.toLowerCase() !== actualHash.toLowerCase()) {
    throw new HashlineMismatchError([{ line: ref.line, expected: ref.hash, actual: actualHash }], fileLines);
  }
}
var HASH_LEN, RADIX, HASH_MOD, DICT, encoder, HASHLINE_KEY, HashlineMismatchError;
var init_hashline = __esm({
  "../../packages/core/dist-esm/hashline.js"() {
    "use strict";
    init_xxhash_wasm();
    HASH_LEN = 2;
    RADIX = 16;
    HASH_MOD = RADIX ** HASH_LEN;
    DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));
    encoder = new TextEncoder();
    HASHLINE_KEY = "__changedown_xxhash__";
    HashlineMismatchError = class extends Error {
      constructor(mismatches, fileLines) {
        const CONTEXT = 2;
        const remapEntries = mismatches.map((m) => [`${m.line}:${m.expected}`, `${m.line}:${m.actual}`]);
        const regions = mismatches.map((m) => ({
          start: Math.max(1, m.line - CONTEXT),
          end: Math.min(fileLines.length, m.line + CONTEXT)
        }));
        const merged = [];
        for (const region of regions) {
          if (merged.length > 0 && region.start <= merged[merged.length - 1].end + 1) {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, region.end);
          } else {
            merged.push({ ...region });
          }
        }
        const mismatchLines = new Set(mismatches.map((m) => m.line));
        const outputParts = ["Hashline mismatch:"];
        for (let r = 0; r < merged.length; r++) {
          if (r > 0) {
            outputParts.push("...");
          }
          const region = merged[r];
          for (let lineNum = region.start; lineNum <= region.end; lineNum++) {
            const content = fileLines[lineNum - 1];
            const prefix = mismatchLines.has(lineNum) ? ">>>" : "   ";
            outputParts.push(`${prefix} ${lineNum}:${computeLineHash(lineNum - 1, content, fileLines)}|${content}`);
          }
        }
        outputParts.push("");
        outputParts.push("Quick-fix remaps:");
        for (const [oldRef, newRef] of remapEntries) {
          outputParts.push(`  ${oldRef} \u2192 ${newRef}`);
        }
        outputParts.push("");
        outputParts.push("Re-read the file with read_tracked_file to get updated coordinates.");
        super(outputParts.join("\n"));
        this.mismatches = mismatches;
        this.name = "HashlineMismatchError";
        this.remaps = new Map(remapEntries);
      }
    };
  }
});

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
var init_op_parser = __esm({
  "../../packages/core/dist-esm/op-parser.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/hashline-cleanup.js
function stripHashlinePrefixes(lines) {
  if (lines.length === 0)
    return lines;
  const nonEmptyLines = lines.filter((l) => l.length > 0);
  if (nonEmptyLines.length === 0)
    return lines;
  const hashlineCount = nonEmptyLines.filter((l) => HASHLINE_PREFIX.test(l)).length;
  if (hashlineCount >= nonEmptyLines.length / 2) {
    return lines.map((l) => l.replace(HASHLINE_PREFIX, ""));
  }
  const diffCount = nonEmptyLines.filter((l) => DIFF_ADD_PREFIX.test(l)).length;
  if (diffCount >= nonEmptyLines.length / 2) {
    return lines.map((l) => l.replace(DIFF_ADD_PREFIX, ""));
  }
  return lines;
}
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
function equalsIgnoringWhitespace(a, b) {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}
function stripBoundaryEcho(fileLines, startLine, endLine, newLines) {
  if (newLines.length === 0)
    return newLines;
  const originalSpan = endLine - startLine + 1;
  if (newLines.length <= originalSpan)
    return newLines;
  let result = [...newLines];
  const beforeIdx = startLine - 2;
  if (beforeIdx >= 0 && result.length > 0) {
    if (equalsIgnoringWhitespace(result[0], fileLines[beforeIdx])) {
      result = result.slice(1);
    }
  }
  const afterIdx = endLine;
  if (afterIdx < fileLines.length && result.length > 0) {
    if (equalsIgnoringWhitespace(result[result.length - 1], fileLines[afterIdx])) {
      result = result.slice(0, -1);
    }
  }
  return result;
}
var HASHLINE_PREFIX, DIFF_ADD_PREFIX;
var init_hashline_cleanup = __esm({
  "../../packages/core/dist-esm/hashline-cleanup.js"() {
    "use strict";
    HASHLINE_PREFIX = /^\d+:[0-9a-zA-Z]{1,16}\|/;
    DIFF_ADD_PREFIX = /^\+(?!\+)/;
  }
});

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
var CONFUSABLE_MAP, UNICODE_NAMES;
var init_text_normalizer = __esm({
  "../../packages/core/dist-esm/text-normalizer.js"() {
    "use strict";
    CONFUSABLE_MAP = /* @__PURE__ */ new Map([
      [8216, { replacement: "'", name: "LEFT SINGLE QUOTATION MARK" }],
      [8217, { replacement: "'", name: "RIGHT SINGLE QUOTATION MARK" }],
      [8218, { replacement: "'", name: "SINGLE LOW-9 QUOTATION MARK" }],
      [8220, { replacement: '"', name: "LEFT DOUBLE QUOTATION MARK" }],
      [8221, { replacement: '"', name: "RIGHT DOUBLE QUOTATION MARK" }],
      [8222, { replacement: '"', name: "DOUBLE LOW-9 QUOTATION MARK" }],
      [8212, { replacement: "-", name: "EM DASH" }],
      [8211, { replacement: "-", name: "EN DASH" }]
    ]);
    UNICODE_NAMES = {
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
  }
});

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
var init_l2_to_l3 = __esm({
  "../../packages/core/dist-esm/operations/l2-to-l3.js"() {
    "use strict";
    init_types();
    init_parser();
    init_hashline();
    init_footnote_patterns();
    init_footnote_generator();
  }
});

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
var MAX_DELTA, ABBREV_TO_TYPE;
var init_scrub = __esm({
  "../../packages/core/dist-esm/operations/scrub.js"() {
    "use strict";
    init_file_ops();
    init_footnote_native_parser();
    init_hashline();
    init_footnote_generator();
    init_l2_to_l3();
    init_types();
    init_footnote_patterns();
    init_footnote_utils();
    init_op_parser();
    init_format_aware_parse();
    MAX_DELTA = 5;
    ABBREV_TO_TYPE = {
      ins: "insertion",
      del: "deletion",
      sub: "substitution",
      hig: "highlight",
      com: "comment"
    };
  }
});

// ../../packages/core/dist-esm/comment-syntax.js
function lineOffset(lines, lineIndex) {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}
var init_comment_syntax = __esm({
  "../../packages/core/dist-esm/comment-syntax.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/parser/footnote-native-parser.js
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
var CM_OPENERS, APPROVED_RE, REJECTED_META_RE, FootnoteNativeParser;
var init_footnote_native_parser = __esm({
  "../../packages/core/dist-esm/parser/footnote-native-parser.js"() {
    "use strict";
    init_types();
    init_document();
    init_op_parser();
    init_timestamp();
    init_hashline();
    init_hashline_cleanup();
    init_footnote_patterns();
    init_footnote_utils();
    init_file_ops();
    init_text_normalizer();
    init_scrub();
    init_comment_syntax();
    CM_OPENERS = {
      "{++": "++}",
      "{--": "--}",
      "{~~": "~~}",
      "{==": "==}",
      "{>>": "<<}"
      // optional closer for comments
    };
    APPROVED_RE = /^ {4}approved:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;
    REJECTED_META_RE = /^ {4}rejected:\s+(\S+)\s+(\S+)\s+"([^"]*)"/;
    FootnoteNativeParser = class {
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
            const idMatch = fline.match(/^\[\^(cn-[\w.]+)\]:/);
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
            const idMatch = line.match(/^\[\^(cn-[\w.]+)\]:/);
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
  }
});

// ../../packages/core/dist-esm/format-aware-parse.js
function parseForFormat(text, options) {
  return isL3Format(text) ? l3Parser.parse(text) : l2Parser.parse(text, options);
}
var l2Parser, l3Parser;
var init_format_aware_parse = __esm({
  "../../packages/core/dist-esm/format-aware-parse.js"() {
    "use strict";
    init_footnote_patterns();
    init_parser();
    init_footnote_native_parser();
    init_footnote_utils();
    init_op_parser();
    l2Parser = new CriticMarkupParser();
    l3Parser = new FootnoteNativeParser();
  }
});

// ../../packages/core/dist-esm/operations/settled-text.js
function computeSettledReplace(change) {
  const rangeLength = change.range.end - change.range.start;
  if (change.type === ChangeType.Comment) {
    return { offset: change.range.start, length: rangeLength, newText: "" };
  }
  if (change.type === ChangeType.Highlight) {
    return { offset: change.range.start, length: rangeLength, newText: change.originalText ?? "" };
  }
  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, newText: change.modifiedText ?? "" };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, newText: "" };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, newText: change.modifiedText ?? "" };
  }
  throw new Error(`Unknown ChangeType: ${change.type}`);
}
function stripFootnoteDefinitions(text, zones) {
  const lines = text.split("\n");
  const kept = [];
  let inFootnote = false;
  let foundFootnote = false;
  let charOffset = 0;
  for (const line of lines) {
    const inCodeZone = zones.some((z) => charOffset >= z.start && charOffset < z.end);
    if (!inCodeZone && FOOTNOTE_DEF_START.test(line)) {
      inFootnote = true;
      foundFootnote = true;
      while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
        kept.pop();
      }
      charOffset += line.length + 1;
      continue;
    }
    if (inFootnote) {
      if (line.trim() === "" || /^[\t ]/.test(line)) {
        charOffset += line.length + 1;
        continue;
      }
      inFootnote = false;
    }
    kept.push(line);
    charOffset += line.length + 1;
  }
  if (foundFootnote) {
    while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
      kept.pop();
    }
  }
  return kept.join("\n");
}
function stripInlineFootnoteRefs(text, zones) {
  return text.replace(footnoteRefGlobal(), (match, offset) => {
    if (zones.some((z) => offset >= z.start && offset < z.end)) {
      return match;
    }
    return "";
  });
}
function computeSettledTextL3(text) {
  const { bodyLines } = splitBodyAndFootnotes(text.split("\n"));
  return bodyLines.join("\n") + "\n";
}
function revertChangesInBody(body, changes) {
  const sorted = [...changes].sort((a, b) => b.range.start - a.range.start);
  for (const change of sorted) {
    if (change.anchored === false)
      continue;
    switch (change.type) {
      case ChangeType.Insertion:
        body = body.slice(0, change.range.start) + body.slice(change.range.end);
        break;
      case ChangeType.Deletion:
        if (change.originalText) {
          body = body.slice(0, change.range.start) + change.originalText + body.slice(change.range.start);
        }
        break;
      case ChangeType.Substitution:
        if (change.originalText) {
          body = body.slice(0, change.range.start) + change.originalText + body.slice(change.range.end);
        }
        break;
    }
  }
  return body;
}
function computeSettledText(text, options) {
  if (isL3Format(text)) {
    return computeSettledTextL3(text);
  }
  const doc = parseForFormat(text, { skipCodeBlocks: options?.skipCodeBlocks ?? false });
  const changes = doc.getChanges();
  if (changes.length === 0) {
    const zones2 = findCodeZones(text);
    return stripInlineFootnoteRefs(stripFootnoteDefinitions(text, zones2), zones2);
  }
  const edits = [...changes].sort((a, b) => b.range.start - a.range.start).map(computeSettledReplace);
  let result = text;
  for (const edit of edits) {
    result = result.slice(0, edit.offset) + edit.newText + result.slice(edit.offset + edit.length);
  }
  const zones = findCodeZones(result);
  result = stripFootnoteDefinitions(result, zones);
  result = stripInlineFootnoteRefs(result, zones);
  return result;
}
function findContainingCodeZone(offset, zones) {
  for (const zone of zones) {
    if (offset >= zone.start && offset < zone.end)
      return zone;
  }
  return void 0;
}
function buildSegmentsWithZoneAwareness(text, parts, zones) {
  const segments = [];
  const deferredRefs = [];
  let cursor = 0;
  const lineBreaks = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n")
      lineBreaks.push(i);
  }
  function offsetToLine(offset) {
    let lo = 0;
    let hi = lineBreaks.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (lineBreaks[mid] < offset)
        lo = mid + 1;
      else
        hi = mid;
    }
    return lo;
  }
  for (const part of parts) {
    if (part.offset > cursor) {
      segments.push(text.slice(cursor, part.offset));
    } else if (part.offset < cursor) {
      continue;
    }
    const ref = part.refId ? `[^${part.refId}]` : "";
    if (ref && findContainingCodeZone(part.offset, zones)) {
      segments.push(part.text);
      deferredRefs.push({ ref, origLineIndex: offsetToLine(part.offset) });
    } else {
      segments.push(part.text + ref);
    }
    cursor = part.offset + part.length;
  }
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }
  if (deferredRefs.length === 0) {
    return segments.join("");
  }
  const result = segments.join("");
  const lines = result.split("\n");
  const refsByLine = /* @__PURE__ */ new Map();
  for (const dr of deferredRefs) {
    const existing = refsByLine.get(dr.origLineIndex) ?? [];
    existing.push(dr.ref);
    refsByLine.set(dr.origLineIndex, existing);
  }
  for (const [lineIdx, refs] of refsByLine) {
    if (lineIdx < lines.length) {
      lines[lineIdx] = lines[lineIdx] + refs.join("");
    }
  }
  return lines.join("\n");
}
function settleAcceptedChangesOnly(text) {
  if (isL3Format(text)) {
    return { settledContent: text, settledIds: [] };
  }
  const doc = parseForFormat(text, { skipCodeBlocks: false });
  const accepted = doc.getChanges().filter((c) => c.status === ChangeStatus.Accepted);
  const settledIds = accepted.map((c) => c.id);
  if (accepted.length === 0) {
    return { settledContent: text, settledIds: [] };
  }
  const parts = [...accepted].sort((a, b) => a.range.start - b.range.start).map(computeAcceptParts);
  const zones = findCodeZones(text);
  const settledContent = buildSegmentsWithZoneAwareness(text, parts, zones);
  return { settledContent, settledIds };
}
function settleRejectedChangesOnly(text) {
  if (isL3Format(text)) {
    const doc2 = parseForFormat(text);
    const rejected2 = doc2.getChanges().filter((c) => c.status === ChangeStatus.Rejected);
    const settledIds2 = rejected2.map((c) => c.id);
    if (rejected2.length === 0)
      return { settledContent: text, settledIds: [] };
    const { bodyLines, footnoteLines } = splitBodyAndFootnotes(text.split("\n"));
    const body = revertChangesInBody(bodyLines.join("\n"), rejected2);
    const settledContent2 = footnoteLines.length > 0 ? body + "\n\n" + footnoteLines.join("\n") : body;
    return { settledContent: settledContent2, settledIds: settledIds2 };
  }
  const doc = parseForFormat(text, { skipCodeBlocks: false });
  const rejected = doc.getChanges().filter((c) => c.status === ChangeStatus.Rejected);
  const settledIds = rejected.map((c) => c.id);
  if (rejected.length === 0) {
    return { settledContent: text, settledIds: [] };
  }
  const parts = [...rejected].sort((a, b) => a.range.start - b.range.start).map(computeRejectParts);
  const zones = findCodeZones(text);
  const settledContent = buildSegmentsWithZoneAwareness(text, parts, zones);
  return { settledContent, settledIds };
}
function computeSettledViewL3(rawText) {
  const { bodyLines } = splitBodyAndFootnotes(rawText.split("\n"));
  const lines = [];
  const settledToRaw = /* @__PURE__ */ new Map();
  const rawToSettled = /* @__PURE__ */ new Map();
  for (let i = 0; i < bodyLines.length; i++) {
    const settledNum = i + 1;
    const rawNum = i + 1;
    lines.push({
      settledLineNum: settledNum,
      rawLineNum: rawNum,
      text: bodyLines[i],
      hash: computeLineHash(i, bodyLines[i], bodyLines)
    });
    settledToRaw.set(settledNum, rawNum);
    rawToSettled.set(rawNum, settledNum);
  }
  return { lines, settledToRaw, rawToSettled };
}
function computeSettledView(rawText, preParsed) {
  if (isL3Format(rawText)) {
    return computeSettledViewL3(rawText);
  }
  const changes = preParsed ?? parseForFormat(rawText, { skipCodeBlocks: false }).getChanges();
  const edits = [...changes].sort((a, b) => a.range.start - b.range.start).map(computeSettledReplace);
  const deltaTable = [];
  let cumulativeDelta = 0;
  for (const edit of edits) {
    deltaTable.push({ rawOffset: edit.offset, delta: cumulativeDelta });
    const oldLen = edit.length;
    const newLen = edit.newText.length;
    cumulativeDelta += newLen - oldLen;
  }
  const editsByOffset = new Map(edits.map((e2) => [e2.offset, e2]));
  function settledOffsetToRawOffset(settledOffset) {
    let delta = 0;
    let rawConsumed = 0;
    let settledConsumed = 0;
    for (const entry of deltaTable) {
      const rawGap = entry.rawOffset - rawConsumed;
      if (settledOffset <= settledConsumed + rawGap) {
        return rawConsumed + (settledOffset - settledConsumed);
      }
      settledConsumed += rawGap;
      rawConsumed = entry.rawOffset;
      delta = entry.delta;
      const edit = editsByOffset.get(entry.rawOffset);
      if (edit) {
        const oldLen = edit.length;
        const newLen = edit.newText.length;
        if (settledOffset < settledConsumed + newLen) {
          return rawConsumed;
        }
        settledConsumed += newLen;
        rawConsumed += oldLen;
      }
    }
    return rawConsumed + (settledOffset - settledConsumed);
  }
  const settledText = computeSettledText(rawText);
  const rawLines = rawText.split("\n");
  const rawLineStarts = [0];
  for (let i = 0; i < rawLines.length - 1; i++) {
    rawLineStarts.push(rawLineStarts[i] + rawLines[i].length + 1);
  }
  function rawOffsetToLineNum(offset) {
    let lo = 0;
    let hi = rawLineStarts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (rawLineStarts[mid] <= offset)
        lo = mid;
      else
        hi = mid - 1;
    }
    return lo + 1;
  }
  const settledTextLines = settledText.split("\n");
  const settledLines = [];
  const settledToRaw = /* @__PURE__ */ new Map();
  const rawToSettled = /* @__PURE__ */ new Map();
  let settledCharOffset = 0;
  for (let i = 0; i < settledTextLines.length; i++) {
    const settledLineText = settledTextLines[i];
    const settledLineNum = i + 1;
    const rawOffset = settledOffsetToRawOffset(settledCharOffset);
    const rawLineNum = rawOffsetToLineNum(rawOffset);
    const hash = computeLineHash(settledLineNum - 1, settledLineText, settledTextLines);
    settledLines.push({
      settledLineNum,
      rawLineNum,
      text: settledLineText,
      hash
    });
    settledToRaw.set(settledLineNum, rawLineNum);
    if (!rawToSettled.has(rawLineNum)) {
      rawToSettled.set(rawLineNum, settledLineNum);
    }
    settledCharOffset += settledLineText.length + 1;
  }
  return { lines: settledLines, settledToRaw, rawToSettled, changes };
}
var init_settled_text = __esm({
  "../../packages/core/dist-esm/operations/settled-text.js"() {
    "use strict";
    init_types();
    init_accept_reject();
    init_hashline();
    init_footnote_patterns();
    init_code_zones();
    init_format_aware_parse();
  }
});

// ../../packages/core/dist-esm/view-surface.js
function buildViewSurfaceMap(raw) {
  const toRaw = [];
  let surface = "";
  let i = 0;
  while (i < raw.length) {
    const slice = raw.slice(i);
    const refMatch = slice.match(/^\[\^cn-\d+(?:\.\d+)?\]/);
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
  const cleanTarget = target.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, "");
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
var init_view_surface = __esm({
  "../../packages/core/dist-esm/view-surface.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/file-ops.js
function level1Comment(author, changeType) {
  const ts = nowTimestamp();
  const authorPrefixed = author.startsWith("@") ? author : `@${author}`;
  return `{>>${authorPrefixed}|${ts.raw}|${changeType}|proposed<<}`;
}
function containsCriticMarkup(text) {
  return /\{\+\+|\{--|\{~~|\{==|\{>>/.test(text);
}
function resolveProposedChanges(text) {
  const doc = parseForFormat(text);
  const changes = doc.getChanges();
  return { changes };
}
function checkCriticMarkupOverlap(text, matchStart, matchLength) {
  const { changes } = resolveProposedChanges(text);
  const matchEnd = matchStart + matchLength;
  for (const node of changes) {
    if (node.settled || node.status !== ChangeStatus.Proposed)
      continue;
    const spanStart = node.range.start;
    const spanEnd = node.range.end;
    if (matchStart < spanEnd && matchEnd > spanStart) {
      const changeId = node.level >= 2 ? node.id : void 0;
      let changeType;
      switch (node.type) {
        case ChangeType.Insertion:
          changeType = "ins";
          break;
        case ChangeType.Deletion:
          changeType = "del";
          break;
        case ChangeType.Substitution:
          changeType = "sub";
          break;
        case ChangeType.Highlight:
          changeType = "highlight";
          break;
        case ChangeType.Comment:
          changeType = "comment";
          break;
        default:
          changeType = "unknown";
          break;
      }
      return { changeId, changeType, spanStart, spanEnd };
    }
  }
  return null;
}
function findAllProposedOverlaps(text, matchStart, matchLength) {
  const { changes } = resolveProposedChanges(text);
  const matchEnd = matchStart + matchLength;
  const results = [];
  for (const node of changes) {
    if (node.settled || node.status !== ChangeStatus.Proposed)
      continue;
    const spanStart = node.range.start;
    const spanEnd = node.range.end;
    if (matchStart < spanEnd && matchEnd > spanStart) {
      const changeId = node.level >= 2 ? node.id : void 0;
      let changeType;
      switch (node.type) {
        case ChangeType.Insertion:
          changeType = "ins";
          break;
        case ChangeType.Deletion:
          changeType = "del";
          break;
        case ChangeType.Substitution:
          changeType = "sub";
          break;
        case ChangeType.Highlight:
          changeType = "highlight";
          break;
        case ChangeType.Comment:
          changeType = "comment";
          break;
        default:
          changeType = "unknown";
          break;
      }
      const author = node.metadata?.author;
      results.push({ changeId, changeType, author, spanStart, spanEnd });
    }
  }
  return results;
}
function guardOverlap(text, matchStart, matchLength) {
  const overlap = checkCriticMarkupOverlap(text, matchStart, matchLength);
  if (overlap) {
    const idRef = overlap.changeId ? ` (${overlap.changeId})` : "";
    throw new Error(`Target text overlaps with proposed change${idRef}. The matched text falls inside a ${overlap.changeType} change at positions ${overlap.spanStart}-${overlap.spanEnd}. Use amend_change to modify your own proposed change, or review_changes to accept/reject it.`);
  }
}
function resolveOverlapWithAuthor(text, matchStart, matchLength, author) {
  const overlaps = findAllProposedOverlaps(text, matchStart, matchLength);
  if (overlaps.length === 0)
    return null;
  if (!author) {
    guardOverlap(text, matchStart, matchLength);
    return null;
  }
  const normalizedAuthor = author.startsWith("@") ? author : `@${author}`;
  const allSameAuthor = overlaps.every((o) => o.author === normalizedAuthor);
  if (!allSameAuthor) {
    guardOverlap(text, matchStart, matchLength);
    return null;
  }
  const supersededIds = overlaps.map((o) => o.changeId).filter((id) => Boolean(id));
  let content = text;
  for (const id of supersededIds) {
    const result = applyReview(content, id, "reject", "Auto-superseded by new proposal", author);
    if ("updatedContent" in result) {
      content = result.updatedContent;
    } else {
      throw new Error(`Auto-supersede failed: could not reject change ${id}. ${"error" in result ? result.error : "Unknown error"}`);
    }
  }
  const settled = settleRejectedChangesOnly(content);
  return { settledContent: settled.settledContent, supersededIds };
}
function stripRefsFromContent(text) {
  const refs = [];
  const cleaned = text.replace(/\[\^cn-\d+(?:\.\d+)?\]/g, (match) => {
    refs.push(match);
    return "";
  });
  return { cleaned, refs };
}
function stripCriticMarkupWithMap(text) {
  const settled = [];
  const toRaw = [];
  const markupRanges = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "^" && text.startsWith("cn-", i + 2)) {
      const closeIdx = text.indexOf("]", i + 2);
      if (closeIdx !== -1 && /^\[\^cn-\d+(?:\.\d+)?\]$/.test(text.slice(i, closeIdx + 1)) && text[closeIdx + 1] !== ":") {
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
function stripCriticMarkup(text) {
  return stripCriticMarkupWithMap(text).settled;
}
function stripCriticMarkupToCommittedWithMap(text) {
  const footnotes = extractFootnoteStatuses(text);
  const committed = [];
  const toRaw = [];
  const markupRanges = [];
  let i = 0;
  function consumeFootnoteRef(pos) {
    if (text[pos] !== "[" || text[pos + 1] !== "^" || !text.startsWith("cn-", pos + 2)) {
      return void 0;
    }
    const closeIdx = text.indexOf("]", pos + 2);
    if (closeIdx === -1)
      return void 0;
    const candidate = text.slice(pos, closeIdx + 1);
    if (!/^\[\^cn-\d+(?:\.\d+)?\]$/.test(candidate))
      return void 0;
    if (text[closeIdx + 1] === ":")
      return void 0;
    const id = text.slice(pos + 2, closeIdx);
    return { id, end: closeIdx + 1 };
  }
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "^" && text.startsWith("cn-", i + 2)) {
      const closeIdx = text.indexOf("]", i + 2);
      if (closeIdx !== -1 && /^\[\^cn-\d+(?:\.\d+)?\]$/.test(text.slice(i, closeIdx + 1)) && text[closeIdx + 1] !== ":") {
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
  if (text.includes("[^cn-") || target.includes("[^cn-") || target.includes("[cn-")) {
    const cleanTarget = target.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, "");
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
          if (range.rawStart === rawEnd && /^\[\^cn-/.test(text.slice(range.rawStart))) {
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
        if (range.rawStart === rawEnd && /^\[\^cn-/.test(text.slice(range.rawStart))) {
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
function replaceUnique(text, target, replacement, normalizer) {
  const match = findUniqueMatch(text, target, normalizer);
  return text.slice(0, match.index) + replacement + text.slice(match.index + match.length);
}
function contentZoneText(fullText) {
  const lines = fullText.split("\n");
  const blockStart = findFootnoteBlockStart(lines);
  if (blockStart >= lines.length)
    return fullText;
  let offset = 0;
  for (let i = 0; i < blockStart; i++) {
    offset += lines[i].length + 1;
  }
  return fullText.slice(0, offset);
}
async function applyProposeChange(params) {
  const { text, oldText, newText, changeId, author, reasoning, insertAfter, level = 2 } = params;
  const isL3 = level === 3;
  if (isL3)
    await initHashline();
  if (!isL3 && text.includes("[^cn-") && isL3Format(text)) {
    throw new Error("L3 format detected but level is not 3. Pass level: 3 for L3 text to avoid garbled output.");
  }
  let bodyText;
  if (isL3) {
    const split = splitBodyAndFootnotes(text.split("\n"));
    bodyText = split.bodyLines.join("\n");
  } else {
    bodyText = text;
  }
  if (oldText === "" && newText === "") {
    throw new Error("Both oldText and newText are empty \u2014 nothing to change.");
  }
  let changeType;
  let inlineMarkup = "";
  let modifiedBody;
  let changeOffset = 0;
  const refSuffix = level === 2 ? `[^${changeId}]` : "";
  if (oldText === "") {
    changeType = "ins";
    if (!insertAfter) {
      throw new Error("Insertion requires an insertAfter anchor to locate where to insert.");
    }
    const searchTarget = isL3 ? bodyText : text;
    let anchorIndex = searchTarget.indexOf(insertAfter);
    let anchorLength = insertAfter.length;
    if (anchorIndex === -1) {
      anchorIndex = normalizedIndexOf(searchTarget, insertAfter, defaultNormalizer);
    }
    if (anchorIndex === -1) {
      const wsMatch = whitespaceCollapsedFind(searchTarget, insertAfter);
      if (wsMatch !== null) {
        anchorIndex = wsMatch.index;
        anchorLength = wsMatch.length;
      }
    }
    if (anchorIndex === -1) {
      throw new Error(`insertAfter anchor not found in text: "${insertAfter}"`);
    }
    if (!isL3) {
      guardOverlap(text, anchorIndex, anchorLength);
    }
    const insertPos = anchorIndex + anchorLength;
    changeOffset = insertPos;
    if (isL3) {
      modifiedBody = text.slice(0, insertPos) + newText + text.slice(insertPos);
    } else {
      const insPad = /^[+\-~]/.test(newText) ? " " : "";
      inlineMarkup = `{++${insPad}${newText}++}${refSuffix}${level === 1 ? level1Comment(author, "ins") : ""}`;
      const charBefore = insertPos > 0 ? text[insertPos - 1] : "\n";
      const needsNewlineBefore = charBefore !== "\n";
      const isBlockContent = /^[-#>*\d]/.test(newText) || newText.includes("\n");
      const prefix = needsNewlineBefore && isBlockContent ? "\n" : "";
      modifiedBody = text.slice(0, insertPos) + prefix + inlineMarkup + text.slice(insertPos);
    }
  } else if (newText === "") {
    changeType = "del";
    const delSearchText = isL3 ? bodyText : contentZoneText(text);
    const match = findUniqueMatch(delSearchText, oldText, defaultNormalizer);
    if (!isL3 && !match.wasSettledMatch && !match.wasCommittedMatch) {
      guardOverlap(text, match.index, match.length);
    }
    changeOffset = match.index;
    if (isL3) {
      modifiedBody = text.slice(0, match.index) + text.slice(match.index + match.length);
    } else {
      const actualOldText = match.originalText;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
      const delPad = /^[+\-~]/.test(cleanedOld) ? " " : "";
      inlineMarkup = `{--${delPad}${cleanedOld}--}${refSuffix}${preservedRefs.join("")}${level === 1 ? level1Comment(author, "del") : ""}`;
      modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
    }
  } else {
    changeType = "sub";
    const subSearchText = isL3 ? bodyText : contentZoneText(text);
    const match = findUniqueMatch(subSearchText, oldText, defaultNormalizer);
    if (!isL3 && !match.wasSettledMatch && !match.wasCommittedMatch) {
      guardOverlap(text, match.index, match.length);
    }
    changeOffset = match.index;
    if (isL3) {
      modifiedBody = text.slice(0, match.index) + newText + text.slice(match.index + match.length);
    } else {
      const actualOldText = match.originalText;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
      const subPad = /^[+\-~]/.test(cleanedOld) ? " " : "";
      inlineMarkup = `{~~${subPad}${cleanedOld}~>${newText}~~}${refSuffix}${preservedRefs.join("")}${level === 1 ? level1Comment(author, "sub") : ""}`;
      modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
    }
  }
  if (isL3) {
    const mutatedSplit = splitBodyAndFootnotes(modifiedBody.split("\n"));
    const mutatedBodyText = mutatedSplit.bodyLines.join("\n");
    const lineStarts = buildLineStarts(mutatedBodyText);
    const lineNumber = offsetToLineNumber(lineStarts, changeOffset);
    const lineIdx = lineNumber - 1;
    const lineContent = mutatedSplit.bodyLines[lineIdx] ?? "";
    const hash = computeLineHash(lineIdx, lineContent, mutatedSplit.bodyLines);
    const column = changeOffset - (lineStarts[lineIdx] ?? 0);
    const anchorLen = changeType === "del" ? 0 : newText.length;
    const changeTypeEnum = changeType === "ins" ? ChangeType.Insertion : changeType === "del" ? ChangeType.Deletion : ChangeType.Substitution;
    const editOpLine = buildContextualL3EditOp({
      changeType: changeTypeEnum,
      originalText: oldText,
      currentText: newText,
      lineContent,
      lineNumber,
      hash,
      column,
      anchorLen
    });
    const footnoteHeader2 = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine2 = reasoning ? `
    @${author} ${nowTimestamp().raw}: ${reasoning}` : "";
    const footnoteBlock2 = footnoteHeader2 + "\n" + editOpLine + reasonLine2;
    const modifiedText2 = appendFootnote(modifiedBody, footnoteBlock2);
    return { modifiedText: modifiedText2, changeType };
  }
  if (level === 1) {
    return { modifiedText: modifiedBody, changeType };
  }
  const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
  const reasonLine = reasoning ? `
    @${author} ${nowTimestamp().raw}: ${reasoning}` : "";
  const footnoteBlock = footnoteHeader + reasonLine;
  const modifiedText = appendFootnote(modifiedBody, footnoteBlock);
  return { modifiedText, changeType };
}
function extractLineRange(fileLines, startLine, endLine) {
  if (startLine < 1 || startLine > fileLines.length) {
    throw new Error(`start_line ${startLine} is out of range (file has ${fileLines.length} lines)`);
  }
  if (endLine < startLine || endLine > fileLines.length) {
    throw new Error(`end_line ${endLine} is out of range (file has ${fileLines.length} lines, start_line is ${startLine})`);
  }
  let startOffset = 0;
  for (let i = 0; i < startLine - 1; i++) {
    startOffset += fileLines[i].length + 1;
  }
  const extractedLines = fileLines.slice(startLine - 1, endLine);
  const content = extractedLines.join("\n");
  const endOffset = startOffset + content.length;
  return { content, startOffset, endOffset };
}
function appendFootnote(text, footnoteBlock) {
  const lines = text.split("\n");
  const blockStart = findFootnoteBlockStart(lines);
  if (blockStart >= lines.length) {
    return text + footnoteBlock;
  }
  let lastFootnoteEnd = blockStart;
  for (let i = blockStart; i < lines.length; i++) {
    if (FOOTNOTE_DEF_START.test(lines[i])) {
      lastFootnoteEnd = i;
      let j = i + 1;
      while (j < lines.length) {
        if (FOOTNOTE_CONTINUATION.test(lines[j])) {
          lastFootnoteEnd = j;
          j++;
        } else if (lines[j].trim() === "") {
          let k = j + 1;
          while (k < lines.length && lines[k].trim() === "")
            k++;
          if (k < lines.length && FOOTNOTE_CONTINUATION.test(lines[k])) {
            lastFootnoteEnd = j;
            j++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }
  const before = lines.slice(0, lastFootnoteEnd + 1).join("\n");
  const after = lines.slice(lastFootnoteEnd + 1).join("\n");
  const block = footnoteBlock.startsWith("\n") ? footnoteBlock : "\n\n" + footnoteBlock;
  if (after.length > 0) {
    return before + block + "\n" + after;
  }
  return before + block;
}
async function applySingleOperation(params) {
  const { fileContent, oldText, newText, changeId, author, reasoning, insertAfter, afterLine, startLine, endLine } = params;
  if (oldText === "" && newText === "") {
    throw new Error("Both oldText and newText are empty \u2014 nothing to change.");
  }
  const fileLines = fileContent.split("\n");
  if (afterLine !== void 0 && oldText === "") {
    const changeType = "ins";
    let cleanedNewText = newText;
    const newTextLines = cleanedNewText.split("\n");
    const strippedLines = stripHashlinePrefixes(newTextLines);
    cleanedNewText = strippedLines.join("\n");
    const insPad = /^[+\-~]/.test(cleanedNewText) ? " " : "";
    const inlineMarkup = `{++${insPad}${cleanedNewText}++}[^${changeId}]`;
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = reasoning ? `
    @${author} ${nowTimestamp().raw}: ${reasoning}` : "";
    const footnoteBlock = footnoteHeader + reasonLine;
    const insertPos = fileLines.slice(0, afterLine).join("\n").length;
    let modifiedText = fileContent.slice(0, insertPos) + "\n" + inlineMarkup + fileContent.slice(insertPos);
    modifiedText = appendFootnote(modifiedText, footnoteBlock);
    const affectedEnd = Math.min(modifiedText.split("\n").length, afterLine + 3);
    return { modifiedText, changeType, affectedStartLine: afterLine, affectedEndLine: affectedEnd };
  }
  if (startLine !== void 0) {
    const effectiveEndLine = endLine ?? startLine;
    const extracted = extractLineRange(fileLines, startLine, effectiveEndLine);
    let cleanedNewText = newText;
    let newTextLines = cleanedNewText.split("\n");
    newTextLines = stripHashlinePrefixes(newTextLines);
    newTextLines = stripBoundaryEcho(fileLines, startLine, effectiveEndLine, newTextLines);
    cleanedNewText = newTextLines.join("\n");
    let modifiedBody;
    let changeType;
    if (oldText !== "") {
      const match = findUniqueMatch(contentZoneText(extracted.content), oldText, defaultNormalizer);
      const absPos = extracted.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const actualOldText = match.originalText;
      const { cleaned: cleanedOldText, refs: preservedRefs } = stripRefsFromContent(actualOldText);
      changeType = cleanedNewText === "" ? "del" : "sub";
      const pad = /^[+\-~]/.test(cleanedOldText) ? " " : "";
      const inlineMarkup = changeType === "del" ? `{--${pad}${cleanedOldText}--}[^${changeId}]${preservedRefs.join("")}` : `{~~${pad}${cleanedOldText}~>${cleanedNewText}~~}[^${changeId}]${preservedRefs.join("")}`;
      const absEnd = absPos + match.length;
      modifiedBody = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    } else {
      const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
      changeType = cleanedNewText === "" ? "del" : "sub";
      const pad = /^[+\-~]/.test(cleanedExtracted) ? " " : "";
      const inlineMarkup = changeType === "del" ? `{--${pad}${cleanedExtracted}--}[^${changeId}]${preservedRefs.join("")}` : `{~~${pad}${cleanedExtracted}~>${cleanedNewText}~~}[^${changeId}]${preservedRefs.join("")}`;
      modifiedBody = fileContent.slice(0, extracted.startOffset) + inlineMarkup + fileContent.slice(extracted.endOffset);
    }
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = reasoning ? `
    @${author} ${nowTimestamp().raw}: ${reasoning}` : "";
    const modifiedText = appendFootnote(modifiedBody, footnoteHeader + reasonLine);
    const affectedEnd = Math.min(modifiedText.split("\n").length, effectiveEndLine + 5);
    return { modifiedText, changeType, affectedStartLine: startLine, affectedEndLine: affectedEnd };
  }
  const applied = await applyProposeChange({
    text: fileContent,
    oldText,
    newText,
    changeId,
    author,
    reasoning,
    insertAfter
  });
  const lines = applied.modifiedText.split("\n");
  let matchLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (/\{\+\+|\{--|\{~~|\{==/.test(lines[i])) {
      matchLine = i + 1;
      break;
    }
  }
  return {
    modifiedText: applied.modifiedText,
    changeType: applied.changeType,
    affectedStartLine: Math.max(1, matchLine - 2),
    affectedEndLine: Math.min(lines.length, matchLine + 5)
  };
}
var init_file_ops = __esm({
  "../../packages/core/dist-esm/file-ops.js"() {
    "use strict";
    init_footnote_generator();
    init_timestamp();
    init_apply_review();
    init_settled_text();
    init_text_normalizer();
    init_hashline_cleanup();
    init_format_aware_parse();
    init_types();
    init_footnote_utils();
    init_footnote_patterns();
    init_hashline();
    init_l2_to_l3();
    init_view_surface();
  }
});

// ../../packages/core/dist-esm/operations/ensure-l2.js
function ensureL2(text, changeOffset, opts) {
  if (opts.existingId) {
    return { text, changeId: opts.existingId, promoted: false };
  }
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  const change = changes.find((c) => c.range.start <= changeOffset && changeOffset < c.range.end);
  if (!change) {
    return { text, changeId: "", promoted: false };
  }
  if (change.level !== 0) {
    return { text, changeId: change.id, promoted: false };
  }
  const maxId = scanMaxCnId(text);
  const nextId = `cn-${maxId + 1}`;
  const typeAbbrev = changeTypeToAbbrev(change.type) ?? opts.type;
  const insertPos = change.range.end;
  const withRef = text.slice(0, insertPos) + `[^${nextId}]` + text.slice(insertPos);
  const footnoteDef = generateFootnoteDefinition(nextId, typeAbbrev, opts.author);
  const result = appendFootnote(withRef, footnoteDef);
  return { text: result, changeId: nextId, promoted: true };
}
var init_ensure_l2 = __esm({
  "../../packages/core/dist-esm/operations/ensure-l2.js"() {
    "use strict";
    init_parser();
    init_types();
    init_footnote_generator();
    init_file_ops();
  }
});

// ../../packages/core/dist-esm/operations/amend.js
var init_amend = __esm({
  "../../packages/core/dist-esm/operations/amend.js"() {
    "use strict";
    init_format_aware_parse();
    init_types();
    init_footnote_utils();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/supersede.js
async function computeSupersedeResult(text, changeId, opts) {
  const { newText, oldText = "", reason, author, insertAfter } = opts;
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block) {
    return { isError: true, error: `Change "${changeId}" not found in file.` };
  }
  const header = parseFootnoteHeader(lines[block.headerLine]);
  if (!header) {
    return {
      isError: true,
      error: `Malformed metadata for change "${changeId}". Expected format: @author | date | type | status`
    };
  }
  if (header.status === "accepted") {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": it is already accepted. Only proposed changes can be superseded.`
    };
  }
  if (header.status === "rejected") {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": it is already rejected. Only proposed changes can be superseded.`
    };
  }
  if (header.status !== "proposed") {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": unexpected status "${header.status}". Only proposed changes can be superseded.`
    };
  }
  const rejectResult = applyReview(text, changeId, "reject", reason ?? "Superseded by new change", author);
  if ("error" in rejectResult) {
    return { isError: true, error: `Failed to reject old change: ${rejectResult.error}` };
  }
  let fileContent = rejectResult.updatedContent;
  const level = isL3Format(text) ? 3 : 2;
  const doc = parseForFormat(fileContent);
  const rejectedChange = doc.getChanges().find((c) => c.id === changeId);
  const isDirectReplace = rejectedChange && !oldText && !insertAfter && (rejectedChange.type === ChangeType.Insertion || rejectedChange.type === ChangeType.Comment);
  if (isDirectReplace && rejectedChange) {
    const maxId2 = scanMaxCnId(fileContent);
    const newChangeId2 = `cn-${maxId2 + 1}`;
    let newMarkup;
    let changeType;
    if (rejectedChange.type === ChangeType.Comment) {
      newMarkup = `{>>${newText}<<}[^${newChangeId2}]`;
      changeType = "com";
    } else {
      const insPad = /^[+\-~]/.test(newText) ? " " : "";
      newMarkup = `{++${insPad}${newText}++}[^${newChangeId2}]`;
      changeType = "ins";
    }
    const rangeStart = rejectedChange.range.start;
    let rangeEnd = rejectedChange.range.end;
    const refStr = `[^${changeId}]`;
    if (fileContent.slice(rangeEnd, rangeEnd + refStr.length) === refStr) {
      rangeEnd += refStr.length;
    }
    fileContent = fileContent.slice(0, rangeStart) + newMarkup + fileContent.slice(rangeEnd);
    const footnoteHeader = generateFootnoteDefinition(newChangeId2, changeType, author);
    const reasonLine = reason ? `
    @${author} ${nowTimestamp().raw}: ${reason}` : "";
    fileContent = appendFootnote(fileContent, footnoteHeader + reasonLine);
    const modifiedLines2 = fileContent.split("\n");
    const newBlock2 = findFootnoteBlock(modifiedLines2, newChangeId2);
    if (newBlock2) {
      const supersedesLine = `    supersedes: ${changeId}`;
      modifiedLines2.splice(newBlock2.headerLine + 1, 0, supersedesLine);
      fileContent = modifiedLines2.join("\n");
    }
    const updatedLines2 = fileContent.split("\n");
    const origBlock2 = findFootnoteBlock(updatedLines2, changeId);
    if (origBlock2) {
      const supersededByLine = `    superseded-by: ${newChangeId2}`;
      updatedLines2.splice(origBlock2.headerLine + 1, 0, supersededByLine);
      fileContent = updatedLines2.join("\n");
    }
    return {
      isError: false,
      text: fileContent,
      newChangeId: newChangeId2,
      originalChangeId: changeId
    };
  }
  if (rejectedChange) {
    const rejectEdit = computeReject(rejectedChange);
    fileContent = fileContent.slice(0, rejectEdit.offset) + rejectEdit.newText + fileContent.slice(rejectEdit.offset + rejectEdit.length);
  }
  const maxId = scanMaxCnId(fileContent);
  const newChangeId = `cn-${maxId + 1}`;
  let proposeOldText = oldText;
  if (rejectedChange) {
    if (!proposeOldText) {
      if (rejectedChange.type === ChangeType.Substitution || rejectedChange.type === ChangeType.Deletion) {
        proposeOldText = rejectedChange.originalText ?? "";
      }
    }
  }
  const proposeResult = await applyProposeChange({
    text: fileContent,
    oldText: proposeOldText,
    newText,
    changeId: newChangeId,
    author,
    reasoning: reason,
    insertAfter,
    level
  });
  fileContent = proposeResult.modifiedText;
  const modifiedLines = fileContent.split("\n");
  const newBlock = findFootnoteBlock(modifiedLines, newChangeId);
  if (newBlock) {
    const supersedesLine = `    supersedes: ${changeId}`;
    modifiedLines.splice(newBlock.headerLine + 1, 0, supersedesLine);
    fileContent = modifiedLines.join("\n");
  }
  const updatedLines = fileContent.split("\n");
  const origBlock = findFootnoteBlock(updatedLines, changeId);
  if (origBlock) {
    const supersededByLine = `    superseded-by: ${newChangeId}`;
    updatedLines.splice(origBlock.headerLine + 1, 0, supersededByLine);
    fileContent = updatedLines.join("\n");
  }
  return {
    isError: false,
    text: fileContent,
    newChangeId,
    originalChangeId: changeId
  };
}
var init_supersede = __esm({
  "../../packages/core/dist-esm/operations/supersede.js"() {
    "use strict";
    init_footnote_utils();
    init_apply_review();
    init_file_ops();
    init_footnote_generator();
    init_footnote_patterns();
    init_format_aware_parse();
    init_accept_reject();
    init_types();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/level-promotion.js
var init_level_promotion = __esm({
  "../../packages/core/dist-esm/operations/level-promotion.js"() {
    "use strict";
    init_parser();
    init_tokens();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/level-descent.js
var init_level_descent = __esm({
  "../../packages/core/dist-esm/operations/level-descent.js"() {
    "use strict";
    init_parser();
    init_footnote_utils();
  }
});

// ../../packages/core/dist-esm/operations/l3-to-l2.js
var init_l3_to_l2 = __esm({
  "../../packages/core/dist-esm/operations/l3-to-l2.js"() {
    "use strict";
    init_types();
    init_footnote_native_parser();
    init_hashline();
    init_footnote_patterns();
  }
});

// ../../packages/core/dist-esm/operations/compact.js
var l3Parser2, RE_SUPERSEDES;
var init_compact = __esm({
  "../../packages/core/dist-esm/operations/compact.js"() {
    "use strict";
    init_footnote_patterns();
    init_footnote_generator();
    init_footnote_native_parser();
    init_hashline();
    init_accept_reject();
    init_types();
    init_l2_to_l3();
    init_l3_to_l2();
    init_scrub();
    l3Parser2 = new FootnoteNativeParser();
    RE_SUPERSEDES = new RegExp(`^\\s+supersedes:\\s+(${FOOTNOTE_ID_PATTERN})\\s*$`);
  }
});

// ../../packages/core/dist-esm/constants.js
var init_constants = __esm({
  "../../packages/core/dist-esm/constants.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/parser/sidecar-parser.js
var init_sidecar_parser = __esm({
  "../../packages/core/dist-esm/parser/sidecar-parser.js"() {
    "use strict";
    init_types();
    init_document();
    init_comment_syntax();
    init_constants();
  }
});

// ../../packages/core/dist-esm/operations/sidecar-accept-reject.js
var init_sidecar_accept_reject = __esm({
  "../../packages/core/dist-esm/operations/sidecar-accept-reject.js"() {
    "use strict";
    init_comment_syntax();
    init_constants();
  }
});

// ../../packages/core/dist-esm/workspace.js
var init_workspace = __esm({
  "../../packages/core/dist-esm/workspace.js"() {
    "use strict";
    init_parser();
    init_sidecar_parser();
    init_footnote_native_parser();
    init_accept_reject();
    init_sidecar_accept_reject();
    init_comment_syntax();
    init_navigation();
    init_tracking();
    init_comment();
    init_constants();
    init_footnote_patterns();
    init_format_aware_parse();
    init_settled_text();
  }
});

// ../../packages/core/dist-esm/annotators/markdown-annotator.js
var init_markdown_annotator = __esm({
  "../../packages/core/dist-esm/annotators/markdown-annotator.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/annotators/sidecar-annotator.js
var init_sidecar_annotator = __esm({
  "../../packages/core/dist-esm/annotators/sidecar-annotator.js"() {
    "use strict";
    init_comment_syntax();
    init_constants();
  }
});

// ../../packages/core/dist-esm/tracking-header.js
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
  return `<!-- changedown.com/v1: ${status} -->`;
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
var TRACKING_HEADER_RE, MAX_SCAN_LINES;
var init_tracking_header = __esm({
  "../../packages/core/dist-esm/tracking-header.js"() {
    "use strict";
    TRACKING_HEADER_RE = /<!--\s*(?:changedown\.com|ctrcks\.com)\/v(\d+):\s*(tracked|untracked)\s*-->/;
    MAX_SCAN_LINES = 5;
  }
});

// ../../packages/core/dist-esm/critic-regex.js
function singleLineSubstitution() {
  return /\{~~(?:[^~]|~(?!>))*~>((?:[^~]|~(?!~\}))*?)~~\}/g;
}
function singleLineDeletion() {
  return /\{--(?:[^-]|-(?!-\}))*--\}/g;
}
function singleLineInsertion() {
  return /\{\+\+((?:[^+]|\+(?!\+\}))*?)\+\+\}/g;
}
function singleLineHighlight() {
  return /\{==((?:[^=]|=(?!=\}))*?)==\}/g;
}
function singleLineComment() {
  return /\{>>((?:[^<]|<(?!<\}))*?)<<\}/g;
}
function multiLineSubstitution() {
  return /\{~~([\s\S]*?)~>([\s\S]*?)~~\}(\[\^(cn-\d+(?:\.\d+)?)\])?/g;
}
function multiLineInsertion() {
  return /\{\+\+([\s\S]*?)\+\+\}(\[\^(cn-\d+(?:\.\d+)?)\])?/g;
}
function multiLineDeletion() {
  return /\{--([\s\S]*?)--\}(\[\^(cn-\d+(?:\.\d+)?)\])?/g;
}
function multiLineHighlight() {
  return /\{==([\s\S]*?)==\}(\[\^(cn-\d+(?:\.\d+)?)\])?/g;
}
function multiLineComment() {
  return /\{>>([\s\S]*?)<<\}/g;
}
function hasCriticMarkup(line) {
  return HAS_CRITIC_MARKUP.test(line);
}
function inlineMarkupAll() {
  return /\{\+\+[^]*?\+\+\}|\{--[^]*?--\}|\{~~[^]*?~~\}|\{==[^]*?==\}|\{>>[^]*?<<\}/g;
}
function markupWithRef() {
  return /(?:\+\+\}|-{2}\}|~~\}|==\}|<<\})\[\^cn-\d+(?:\.\d+)?\]/g;
}
var HAS_CRITIC_MARKUP;
var init_critic_regex = __esm({
  "../../packages/core/dist-esm/critic-regex.js"() {
    "use strict";
    HAS_CRITIC_MARKUP = /\{\+\+|\{--|\{~~|\{==|\{>>|\[\^cn-\d/;
  }
});

// ../../packages/core/dist-esm/hashline-tracked.js
function settledLine(line) {
  let result = line;
  result = result.replace(singleLineSubstitution(), "$1");
  result = result.replace(singleLineDeletion(), "");
  result = result.replace(singleLineInsertion(), "$1");
  result = result.replace(singleLineHighlight(), "$1");
  result = result.replace(singleLineComment(), "");
  result = result.replace(footnoteRefGlobal(), "");
  return result;
}
function computeSettledLineHash(idx, line, allSettledLines) {
  return computeLineHash(idx, settledLine(line), allSettledLines);
}
function countChanges(content) {
  const counts = { proposed: 0, accepted: 0, rejected: 0 };
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(FOOTNOTE_DEF_STATUS_VALUE);
    if (match) {
      const status = match[1];
      counts[status]++;
    }
  }
  const allMarkup = content.match(inlineMarkupAll()) || [];
  const markupWithRefs = content.match(markupWithRef()) || [];
  const level0Count = allMarkup.length - markupWithRefs.length;
  if (level0Count > 0) {
    counts.proposed += level0Count;
  }
  return counts;
}
function formatTrackedHeader(filePath, content, trackingStatus) {
  const status = trackingStatus ?? "tracked";
  const lineCount = content.split("\n").length;
  const changes = countChanges(content);
  const changeParts = [];
  if (changes.proposed > 0)
    changeParts.push(`${changes.proposed} proposed`);
  if (changes.accepted > 0)
    changeParts.push(`${changes.accepted} accepted`);
  if (changes.rejected > 0)
    changeParts.push(`${changes.rejected} rejected`);
  const changeSummary = changeParts.length > 0 ? ` (${changeParts.join(", ")})` : "";
  const headerLines = [
    `## file: ${filePath}`,
    `## tracking: ${status}${changeSummary}`,
    `## lines: 1-${lineCount} of ${lineCount}`,
    `## tip: Use LINE:HASH refs in propose_change for precise edits`
  ];
  return headerLines.join("\n");
}
var init_hashline_tracked = __esm({
  "../../packages/core/dist-esm/hashline-tracked.js"() {
    "use strict";
    init_hashline();
    init_critic_regex();
    init_footnote_patterns();
  }
});

// ../../packages/core/dist-esm/footnote-parser.js
var init_footnote_parser = __esm({
  "../../packages/core/dist-esm/footnote-parser.js"() {
    "use strict";
    init_footnote_patterns();
    init_footnote_utils();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/committed-text.js
function resolveStatus(changeId, footnotes) {
  if (!changeId)
    return "proposed";
  const info = footnotes.get(changeId);
  if (!info)
    return "proposed";
  return info.status;
}
function computeCommittedLine(line, footnotes) {
  let result = line;
  const changeIds = [];
  let hasProposed = false;
  let hasAccepted = false;
  function trackStatus(status, changeId) {
    if (changeId)
      changeIds.push(changeId);
    if (status === "proposed")
      hasProposed = true;
    else if (status === "accepted")
      hasAccepted = true;
  }
  result = result.replace(multiLineSubstitution(), (_match, old, newText, _refFull, refId) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    return status === "accepted" ? newText : old;
  });
  result = result.replace(multiLineInsertion(), (_match, content, _refFull, refId) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    return status === "accepted" ? content : "";
  });
  result = result.replace(multiLineDeletion(), (_match, content, _refFull, refId) => {
    const status = resolveStatus(refId, footnotes);
    trackStatus(status, refId);
    return status === "accepted" ? "" : content;
  });
  result = result.replace(multiLineHighlight(), (_match, content) => {
    return content;
  });
  result = result.replace(multiLineComment(), "");
  result = result.replace(footnoteRefGlobal(), "");
  let flag = "";
  if (hasProposed)
    flag = "P";
  else if (hasAccepted)
    flag = "A";
  return { text: result, flag, changeIds };
}
function findFootnoteLineIndices(lines) {
  const indices = /* @__PURE__ */ new Set();
  const blockStart = findFootnoteBlockStart(lines);
  for (let i = blockStart; i < lines.length; i++) {
    if (!FOOTNOTE_DEF_START_QUICK.test(lines[i]))
      continue;
    indices.add(i);
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      if (line.trim() === "") {
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === "")
          k++;
        if (k < lines.length && /^\s+\S/.test(lines[k])) {
          indices.add(j);
          j++;
          continue;
        }
        break;
      }
      if (/^\s+\S/.test(line)) {
        indices.add(j);
        j++;
        continue;
      }
      break;
    }
  }
  return indices;
}
function computeCommittedView(rawText, preParsed) {
  const rawLines = rawText.split("\n");
  const changes = preParsed ?? parseForFormat(rawText).getChanges();
  const statusMap = /* @__PURE__ */ new Map();
  for (const node of changes) {
    const rawStatus = nodeStatus(node);
    statusMap.set(node.id, {
      status: rawStatus === "accepted" || rawStatus === "rejected" ? rawStatus : "proposed"
    });
  }
  const footnoteLineIndices = findFootnoteLineIndices(rawLines);
  const preLines = [];
  let committedLineNum = 0;
  let cleanCount = 0;
  for (let rawIdx = 0; rawIdx < rawLines.length; rawIdx++) {
    if (footnoteLineIndices.has(rawIdx))
      continue;
    const rawLine = rawLines[rawIdx];
    const lineResult = computeCommittedLine(rawLine, statusMap);
    const rawIsBlank = rawLine.trim() === "";
    const committedIsBlank = lineResult.text.trim() === "";
    if (!rawIsBlank && committedIsBlank && hasCriticMarkup(rawLine)) {
      continue;
    }
    committedLineNum++;
    const rawLineNum = rawIdx + 1;
    if (lineResult.flag === "") {
      cleanCount++;
    }
    preLines.push({
      committedLineNum,
      rawLineNum,
      text: lineResult.text,
      flag: lineResult.flag,
      changeIds: lineResult.changeIds
    });
  }
  const allCommittedTexts = preLines.map((l) => l.text);
  const committedLines = [];
  const committedToRaw = /* @__PURE__ */ new Map();
  const rawToCommitted = /* @__PURE__ */ new Map();
  for (const pre of preLines) {
    const hash = computeLineHash(pre.committedLineNum - 1, pre.text, allCommittedTexts);
    committedLines.push({
      committedLineNum: pre.committedLineNum,
      rawLineNum: pre.rawLineNum,
      text: pre.text,
      hash,
      flag: pre.flag,
      changeIds: pre.changeIds
    });
    committedToRaw.set(pre.committedLineNum, pre.rawLineNum);
    rawToCommitted.set(pre.rawLineNum, pre.committedLineNum);
  }
  const summary = { proposed: 0, accepted: 0, rejected: 0, clean: cleanCount };
  for (const node of changes) {
    const s = nodeStatus(node);
    if (s === "proposed")
      summary.proposed++;
    else if (s === "accepted")
      summary.accepted++;
    else if (s === "rejected")
      summary.rejected++;
  }
  return { lines: committedLines, summary, committedToRaw, rawToCommitted, changes };
}
var init_committed_text = __esm({
  "../../packages/core/dist-esm/committed-text.js"() {
    "use strict";
    init_footnote_utils();
    init_format_aware_parse();
    init_types();
    init_hashline();
    init_critic_regex();
    init_footnote_patterns();
  }
});

// ../../packages/core/dist-esm/at-resolver.js
function parseAt(at) {
  if (!at || at.trim() === "") {
    throw new Error("at coordinate is empty.");
  }
  const dashIdx = at.indexOf("-");
  if (dashIdx === -1) {
    const m = at.match(LINE_HASH_RE);
    if (!m) {
      if (DUAL_HASH_RE.test(at)) {
        const rawPart = at.split(".")[0];
        throw new Error(`at must be LINE:HASH (e.g. ${rawPart}). Dual hashes (LINE:RAW.SETTLED) appear in read output \u2014 use only the first hash (before the dot).`);
      }
      throw new Error(`Invalid at coordinate: "${at}". Expected format: LINE:HASH (e.g., "12:a1").`);
    }
    const line = parseInt(m[1], 10);
    return { startLine: line, startHash: m[2], endLine: line, endHash: m[2] };
  }
  const startPart = at.slice(0, dashIdx);
  const endPart = at.slice(dashIdx + 1);
  const startMatch = startPart.match(LINE_HASH_RE);
  const endMatch = endPart.match(LINE_HASH_RE);
  if (!startMatch || !endMatch) {
    const hasDualHash = DUAL_HASH_RE.test(startPart) || DUAL_HASH_RE.test(endPart);
    if (hasDualHash) {
      throw new Error(`at range contains dual hash \u2014 use only the first hash (before the dot) in each LINE:HASH. Example: "${startPart.split(".")[0]}-${endPart.split(".")[0]}".`);
    }
    throw new Error(`Invalid at range: "${at}". Expected format: LINE:HASH-LINE:HASH (e.g., "12:a1-15:b3").`);
  }
  const startLine = parseInt(startMatch[1], 10);
  const endLine = parseInt(endMatch[1], 10);
  if (endLine < startLine) {
    throw new Error(`Invalid at range: end line ${endLine} < start line ${startLine}.`);
  }
  return {
    startLine,
    startHash: startMatch[2],
    endLine,
    endHash: endMatch[2]
  };
}
function resolveAt(at, fileLines) {
  const parsed = parseAt(at);
  if (parsed.startLine < 1 || parsed.startLine > fileLines.length) {
    throw new Error(`Line ${parsed.startLine} out of range (file has ${fileLines.length} lines).`);
  }
  if (parsed.endLine < 1 || parsed.endLine > fileLines.length) {
    throw new Error(`Line ${parsed.endLine} out of range (file has ${fileLines.length} lines).`);
  }
  const actualStartHash = computeLineHash(parsed.startLine - 1, fileLines[parsed.startLine - 1], fileLines);
  if (actualStartHash !== parsed.startHash) {
    throw new Error(`Hash mismatch at line ${parsed.startLine}: expected ${parsed.startHash}, current hash is ${actualStartHash}. Re-read the file with read_tracked_file to get updated coordinates. For batch edits, consider single edits with re-reads between them.`);
  }
  if (parsed.endLine !== parsed.startLine) {
    const actualEndHash = computeLineHash(parsed.endLine - 1, fileLines[parsed.endLine - 1], fileLines);
    if (actualEndHash !== parsed.endHash) {
      throw new Error(`Hash mismatch at line ${parsed.endLine}: expected ${parsed.endHash}, current hash is ${actualEndHash}. Re-read the file with read_tracked_file to get updated coordinates. For batch edits, consider single edits with re-reads between them.`);
    }
  }
  let startOffset = 0;
  for (let i = 0; i < parsed.startLine - 1; i++) {
    startOffset += fileLines[i].length + 1;
  }
  let endOffset = startOffset;
  for (let i = parsed.startLine - 1; i <= parsed.endLine - 1; i++) {
    endOffset += fileLines[i].length + (i < parsed.endLine - 1 ? 1 : 0);
  }
  const content = fileLines.slice(parsed.startLine - 1, parsed.endLine).join("\n");
  return {
    startLine: parsed.startLine,
    endLine: parsed.endLine,
    startOffset,
    endOffset,
    content
  };
}
var LINE_HASH_RE, DUAL_HASH_RE;
var init_at_resolver = __esm({
  "../../packages/core/dist-esm/at-resolver.js"() {
    "use strict";
    init_hashline();
    LINE_HASH_RE = /^(\d+):([0-9a-f]{2})$/;
    DUAL_HASH_RE = /^\d+:[0-9a-f]{2}\.[0-9a-f]{2}$/;
  }
});

// ../../packages/core/dist-esm/renderers/three-zone-types.js
var init_three_zone_types = __esm({
  "../../packages/core/dist-esm/renderers/three-zone-types.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/renderers/decoration-intents.js
var SUB_SEPARATOR_LEN;
var init_decoration_intents = __esm({
  "../../packages/core/dist-esm/renderers/decoration-intents.js"() {
    "use strict";
    init_types();
    init_tokens();
    SUB_SEPARATOR_LEN = TokenType.SubstitutionSeparator.length;
  }
});

// ../../packages/core/dist-esm/renderers/formatters/plain-text.js
function formatPlainText(doc) {
  const parts = [];
  parts.push(formatHeader(doc.header, doc.view));
  parts.push("");
  const padWidth = doc.lines.length > 0 ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2) : 2;
  for (const line of doc.lines) {
    parts.push(formatLine(line, padWidth, doc.view));
  }
  return parts.join("\n");
}
function formatHeader(header, view) {
  const lines = [];
  lines.push(`## ${header.filePath} | policy: ${header.protocolMode} | tracking: ${header.trackingStatus}`);
  const counts = `proposed: ${header.counts.proposed} | accepted: ${header.counts.accepted} | rejected: ${header.counts.rejected}`;
  const threads = header.threadCount > 0 ? ` | threads: ${header.threadCount}` : "";
  lines.push(`## ${counts}${threads}`);
  if (header.authors.length > 0) {
    lines.push(`## authors: ${header.authors.join(", ")}`);
  }
  if (header.lineRange) {
    lines.push(`## lines: ${header.lineRange.start}-${header.lineRange.end} of ${header.lineRange.total}`);
  }
  lines.push("---");
  return lines.join("\n");
}
function formatLine(line, padWidth, view) {
  const num = String(line.margin.lineNumber).padStart(padWidth, " ");
  const flag = line.margin.flags.length > 0 ? line.margin.flags[0] : " ";
  const margin = `${num}:${line.margin.hash} ${flag}|`;
  const content = line.content.map((s) => s.text).join("");
  const meta = formatMetadata(line.metadata, view);
  return meta ? `${margin} ${content} ${meta}` : `${margin} ${content}`;
}
function formatMetadata(metadata, view) {
  if (metadata.length === 0)
    return "";
  return metadata.map((m) => {
    if (view === "changes") {
      return `{>>${m.changeId}<<}`;
    }
    let block = `{>>${m.changeId}`;
    if (m.author)
      block += ` ${m.author}:`;
    if (m.reason)
      block += ` ${m.reason}`;
    if (m.replyCount && m.replyCount > 0) {
      block += ` | ${m.replyCount} ${m.replyCount === 1 ? "reply" : "replies"}`;
    }
    block += "<<}";
    return block;
  }).join(" ");
}
var init_plain_text = __esm({
  "../../packages/core/dist-esm/renderers/formatters/plain-text.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/renderers/formatters/ansi.js
var init_ansi = __esm({
  "../../packages/core/dist-esm/renderers/formatters/ansi.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/renderers/formatters/html.js
var init_html = __esm({
  "../../packages/core/dist-esm/renderers/formatters/html.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/renderers/formatters/index.js
var init_formatters = __esm({
  "../../packages/core/dist-esm/renderers/formatters/index.js"() {
    "use strict";
    init_plain_text();
    init_ansi();
    init_plain_text();
    init_ansi();
    init_html();
  }
});

// ../../packages/core/dist-esm/renderers/view-builder-utils.js
function buildDeliberationHeader(options) {
  const { changes } = options;
  let proposed = 0, accepted = 0, rejected = 0, threadCount = 0;
  const authorSet = /* @__PURE__ */ new Set();
  for (const node of changes) {
    const status = nodeStatus(node);
    if (status === "proposed")
      proposed++;
    else if (status === "accepted")
      accepted++;
    else if (status === "rejected")
      rejected++;
    if ((node.replyCount ?? 0) > 0)
      threadCount++;
    const author = node.metadata?.author ?? node.inlineMetadata?.author;
    if (author)
      authorSet.add(author);
  }
  return {
    filePath: options.filePath,
    trackingStatus: options.trackingStatus,
    protocolMode: options.protocolMode,
    defaultView: options.defaultView,
    viewPolicy: options.viewPolicy,
    counts: { proposed, accepted, rejected },
    authors: [...authorSet].sort(),
    threadCount,
    lineRange: options.lineRange
  };
}
function buildLineRefMap(lines) {
  const map = /* @__PURE__ */ new Map();
  for (let i = 0; i < lines.length; i++) {
    const refs = /* @__PURE__ */ new Set();
    for (const match of lines[i].matchAll(REF_EXTRACT_RE)) {
      refs.add(match[1]);
    }
    if (refs.size > 0)
      map.set(i, refs);
  }
  return map;
}
function findFootnoteSectionRange(changes) {
  if (changes.length === 0)
    return null;
  let min = Infinity;
  let max = -Infinity;
  for (const node of changes) {
    if (!node.footnoteLineRange)
      continue;
    if (node.footnoteLineRange.startLine < min)
      min = node.footnoteLineRange.startLine;
    if (node.footnoteLineRange.endLine > max)
      max = node.footnoteLineRange.endLine;
  }
  if (min === Infinity)
    return null;
  return [min, max];
}
function computeContinuationLines(content, preParsed) {
  const changes = preParsed ?? parseForFormat(content).getChanges();
  if (changes.length === 0)
    return /* @__PURE__ */ new Set();
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n")
      lineStarts.push(i + 1);
  }
  function byteToLine(offset) {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (lineStarts[mid] <= offset)
        lo = mid;
      else
        hi = mid - 1;
    }
    return lo;
  }
  const continuations = /* @__PURE__ */ new Set();
  for (const change of changes) {
    const startLine = byteToLine(change.range.start);
    const endLine = byteToLine(change.range.end - 1);
    if (endLine > startLine) {
      for (let line = startLine + 1; line <= endLine; line++) {
        continuations.add(line);
      }
    }
  }
  return continuations;
}
var REF_EXTRACT_RE;
var init_view_builder_utils = __esm({
  "../../packages/core/dist-esm/renderers/view-builder-utils.js"() {
    "use strict";
    init_format_aware_parse();
    init_types();
    REF_EXTRACT_RE = /\[\^(cn-\d+(?:\.\d+)?)\]/g;
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/review.js
function buildReviewDocument(content, options) {
  const committedResult = computeCommittedView(content);
  const changes = committedResult.changes;
  const footnoteMap = /* @__PURE__ */ new Map();
  for (const node of changes) {
    footnoteMap.set(node.id, node);
  }
  const rawLines = content.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  const rawToCommittedHash = /* @__PURE__ */ new Map();
  for (const cl of committedResult.lines) {
    rawToCommittedHash.set(cl.rawLineNum, cl.hash);
  }
  let fnRange = findFootnoteSectionRange(changes);
  if (!fnRange) {
    const blockStart = findFootnoteBlockStart(rawLines);
    if (blockStart < rawLines.length) {
      fnRange = [blockStart, rawLines.length - 1];
    }
  }
  const lineRefMap = buildLineRefMap(rawLines);
  const continuations = computeContinuationLines(content, changes);
  const outputLines = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (fnRange && i >= fnRange[0] && i <= fnRange[1]) {
      continue;
    }
    if (fnRange && i === fnRange[0] - 1 && rawLines[i].trim() === "") {
      continue;
    }
    const rawLine = rawLines[i];
    const lineNum = i + 1;
    const contentSpans = buildContentSpans(rawLine, footnoteMap);
    const refIds = lineRefMap.get(i);
    const metadata = buildLineMetadata(refIds, footnoteMap);
    const flags = computeFlags(refIds, footnoteMap);
    const rawHash = computeLineHash(i, rawLine, rawLines);
    const hash = rawToCommittedHash.get(lineNum) ?? rawHash;
    outputLines.push({
      margin: { lineNumber: lineNum, hash, flags },
      content: contentSpans,
      metadata,
      rawLineNumber: lineNum,
      continuesChange: continuations.has(i) || void 0,
      sessionHashes: {
        raw: rawHash,
        settled: computeSettledLineHash(lineNum, rawLine, allSettled),
        committed: rawToCommittedHash.get(lineNum)
      }
    });
  }
  const header = buildDeliberationHeader({
    filePath: options.filePath,
    trackingStatus: options.trackingStatus,
    protocolMode: options.protocolMode,
    defaultView: options.defaultView,
    viewPolicy: options.viewPolicy,
    changes
  });
  return {
    view: "review",
    header,
    lines: outputLines
  };
}
function buildContentSpans(line, footnoteMap) {
  const spans = [];
  let lastIndex = 0;
  const re = new RegExp(CRITIC_MARKUP_RE.source, "g");
  for (const match of line.matchAll(re)) {
    const matchStart = match.index;
    if (matchStart > lastIndex) {
      const between = line.slice(lastIndex, matchStart);
      emitPlainAndAnchors(between, footnoteMap, spans);
    }
    if (match[1] !== void 0) {
      spans.push({ type: "delimiter", text: "{++" });
      spans.push({ type: "insertion", text: match[1] });
      spans.push({ type: "delimiter", text: "++}" });
    } else if (match[2] !== void 0) {
      spans.push({ type: "delimiter", text: "{--" });
      spans.push({ type: "deletion", text: match[2] });
      spans.push({ type: "delimiter", text: "--}" });
    } else if (match[3] !== void 0 || match[4] !== void 0) {
      spans.push({ type: "delimiter", text: "{~~" });
      spans.push({ type: "sub_old", text: match[3] ?? "" });
      spans.push({ type: "sub_arrow", text: "~>" });
      spans.push({ type: "sub_new", text: match[4] ?? "" });
      spans.push({ type: "delimiter", text: "~~}" });
    } else if (match[5] !== void 0) {
      spans.push({ type: "delimiter", text: "{==" });
      spans.push({ type: "highlight", text: match[5] });
      spans.push({ type: "delimiter", text: "==}" });
    } else if (match[6] !== void 0) {
      spans.push({ type: "delimiter", text: "{>>" });
      spans.push({ type: "comment", text: match[6] });
      spans.push({ type: "delimiter", text: "<<}" });
    }
    lastIndex = matchStart + match[0].length;
  }
  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex);
    emitPlainAndAnchors(remaining, footnoteMap, spans);
  }
  if (spans.length === 0) {
    spans.push({ type: "plain", text: "" });
  }
  return spans;
}
function emitPlainAndAnchors(text, footnoteMap, spans) {
  let lastIdx = 0;
  const re = new RegExp(FOOTNOTE_REF_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const matchStart = match.index;
    const id = match[1];
    const node = footnoteMap.get(id);
    if (matchStart > lastIdx) {
      spans.push({ type: "plain", text: text.slice(lastIdx, matchStart) });
    }
    if (node) {
      spans.push({ type: "anchor", text: `[^${node.id}]` });
    } else {
      spans.push({ type: "plain", text: match[0] });
    }
    lastIdx = matchStart + match[0].length;
  }
  if (lastIdx < text.length) {
    spans.push({ type: "plain", text: text.slice(lastIdx) });
  }
}
function buildLineMetadata(refIds, footnoteMap) {
  if (!refIds)
    return [];
  const metadata = [];
  for (const id of refIds) {
    const node = footnoteMap.get(id);
    if (!node)
      continue;
    const status = nodeStatus(node);
    const reason = node.metadata?.comment || node.metadata?.discussion?.[0]?.text || void 0;
    metadata.push({
      changeId: node.id,
      author: node.metadata?.author ?? node.inlineMetadata?.author,
      reason,
      replyCount: (node.replyCount ?? 0) > 0 ? node.replyCount : void 0,
      status
    });
  }
  return metadata;
}
function computeFlags(refIds, footnoteMap) {
  if (!refIds)
    return [];
  let hasProposed = false;
  let hasAccepted = false;
  for (const id of refIds) {
    const node = footnoteMap.get(id);
    if (!node)
      continue;
    const status = nodeStatus(node);
    if (status === "proposed")
      hasProposed = true;
    if (status === "accepted")
      hasAccepted = true;
  }
  if (hasProposed)
    return ["P"];
  if (hasAccepted)
    return ["A"];
  return [];
}
var CRITIC_MARKUP_RE, FOOTNOTE_REF_RE;
var init_review = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/review.js"() {
    "use strict";
    init_committed_text();
    init_footnote_utils();
    init_types();
    init_hashline();
    init_hashline_tracked();
    init_view_builder_utils();
    CRITIC_MARKUP_RE = /\{\+\+((?:[^+]|\+(?!\+\}))*?)\+\+\}|\{--((?:[^-]|-(?!-\}))*?)--\}|\{~~((?:[^~]|~(?!>))*?)~>((?:[^~]|~(?!~\}))*?)~~\}|\{==((?:[^=]|=(?!=\}))*?)==\}|\{>>((?:[^<]|<(?!<\}))*?)<<\}/g;
    FOOTNOTE_REF_RE = /\[\^(cn-\d+(?:\.\d+)?)\]/g;
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/changes.js
function buildChangesDocument(rawContent, options) {
  const committedResult = computeCommittedView(rawContent);
  const changes = committedResult.changes;
  const rawLines = rawContent.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  while (committedResult.lines.length > 0 && committedResult.lines[committedResult.lines.length - 1].text.trim() === "") {
    committedResult.lines.pop();
  }
  const lines = committedResult.lines.map((cl) => {
    const flags = cl.flag === "P" ? ["P"] : cl.flag === "A" ? ["A"] : [];
    const metadata = cl.changeIds.map((id) => ({ changeId: id }));
    return {
      margin: {
        lineNumber: cl.committedLineNum,
        hash: cl.hash,
        flags
      },
      content: [{ type: "plain", text: cl.text }],
      metadata,
      rawLineNumber: cl.rawLineNum,
      sessionHashes: {
        raw: computeLineHash(cl.rawLineNum - 1, rawLines[cl.rawLineNum - 1] ?? "", rawLines),
        settled: computeSettledLineHash(cl.rawLineNum, rawLines[cl.rawLineNum - 1] ?? "", allSettled),
        committed: cl.hash,
        rawLineNum: cl.rawLineNum
      }
    };
  });
  const header = buildDeliberationHeader({
    ...options,
    changes,
    lineRange: { start: 1, end: lines.length, total: lines.length }
  });
  return { view: "changes", header, lines };
}
var init_changes = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/changes.js"() {
    "use strict";
    init_committed_text();
    init_hashline();
    init_hashline_tracked();
    init_view_builder_utils();
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/settled.js
function buildSettledDocument(rawContent, options) {
  const changes = parseForFormat(rawContent, { skipCodeBlocks: false }).getChanges();
  const settledResult = computeSettledView(rawContent, changes);
  const rawLines = rawContent.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  while (settledResult.lines.length > 0 && settledResult.lines[settledResult.lines.length - 1].text.trim() === "") {
    settledResult.lines.pop();
  }
  const lines = settledResult.lines.map((sl) => ({
    margin: {
      lineNumber: sl.settledLineNum,
      hash: sl.hash,
      flags: []
    },
    content: [{ type: "plain", text: sl.text }],
    metadata: [],
    rawLineNumber: sl.rawLineNum,
    sessionHashes: {
      raw: computeLineHash(sl.rawLineNum - 1, rawLines[sl.rawLineNum - 1] ?? "", rawLines),
      settled: computeSettledLineHash(sl.rawLineNum, rawLines[sl.rawLineNum - 1] ?? "", allSettled),
      settledView: sl.hash,
      rawLineNum: sl.rawLineNum
    }
  }));
  const header = buildDeliberationHeader({
    ...options,
    changes,
    lineRange: { start: 1, end: lines.length, total: lines.length }
  });
  return { view: "settled", header, lines };
}
var init_settled = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/settled.js"() {
    "use strict";
    init_settled_text();
    init_hashline();
    init_hashline_tracked();
    init_format_aware_parse();
    init_view_builder_utils();
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/raw.js
function buildRawDocument(rawContent, options) {
  const changes = parseForFormat(rawContent).getChanges();
  const rawLines = rawContent.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  const continuations = computeContinuationLines(rawContent, changes);
  const lines = rawLines.map((text, i) => {
    const rawHash = computeLineHash(i, text, rawLines);
    return {
      margin: {
        lineNumber: i + 1,
        hash: rawHash,
        flags: []
      },
      content: [{ type: "plain", text }],
      metadata: [],
      rawLineNumber: i + 1,
      continuesChange: continuations.has(i) || void 0,
      sessionHashes: {
        raw: rawHash,
        settled: computeSettledLineHash(i + 1, text, allSettled)
      }
    };
  });
  const header = buildDeliberationHeader({
    ...options,
    changes,
    lineRange: { start: 1, end: lines.length, total: lines.length }
  });
  const fnRange = findFootnoteSectionRange(changes);
  const footnoteSection = fnRange ? rawLines.slice(fnRange[0], fnRange[1] + 1).join("\n") : void 0;
  return { view: "raw", header, lines, footnoteSection };
}
var init_raw = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/raw.js"() {
    "use strict";
    init_hashline();
    init_hashline_tracked();
    init_format_aware_parse();
    init_view_builder_utils();
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/index.js
function buildViewDocument(rawContent, view, options) {
  switch (view) {
    case "review":
      return buildReviewDocument(rawContent, options);
    case "changes":
      return buildChangesDocument(rawContent, options);
    case "settled":
      return buildSettledDocument(rawContent, options);
    case "raw":
      return buildRawDocument(rawContent, options);
    default:
      return buildReviewDocument(rawContent, options);
  }
}
var init_view_builders = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/index.js"() {
    "use strict";
    init_review();
    init_changes();
    init_settled();
    init_raw();
  }
});

// ../../packages/core/dist-esm/edit-boundary/types.js
var init_types2 = __esm({
  "../../packages/core/dist-esm/edit-boundary/types.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/edit-boundary/pending-buffer.js
var init_pending_buffer = __esm({
  "../../packages/core/dist-esm/edit-boundary/pending-buffer.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/edit-boundary/signal-classifier.js
var init_signal_classifier = __esm({
  "../../packages/core/dist-esm/edit-boundary/signal-classifier.js"() {
    "use strict";
    init_pending_buffer();
  }
});

// ../../packages/core/dist-esm/edit-boundary/state-machine.js
var cmParser;
var init_state_machine = __esm({
  "../../packages/core/dist-esm/edit-boundary/state-machine.js"() {
    "use strict";
    init_signal_classifier();
    init_pending_buffer();
    init_tracking();
    init_footnote_generator();
    init_hashline();
    init_l2_to_l3();
    init_types();
    init_parser();
    cmParser = new CriticMarkupParser();
  }
});

// ../../packages/core/dist-esm/edit-boundary/index.js
var init_edit_boundary = __esm({
  "../../packages/core/dist-esm/edit-boundary/index.js"() {
    "use strict";
    init_types2();
    init_pending_buffer();
    init_signal_classifier();
    init_state_machine();
  }
});

// ../../packages/core/dist-esm/index.js
var init_dist_esm = __esm({
  "../../packages/core/dist-esm/index.js"() {
    "use strict";
    init_config();
    init_review_permissions();
    init_timestamp();
    init_types();
    init_document();
    init_tokens();
    init_parser();
    init_code_zones();
    init_accept_reject();
    init_resolution();
    init_reply();
    init_navigation();
    init_tracking();
    init_comment();
    init_footnote_generator();
    init_ensure_l2();
    init_apply_review();
    init_amend();
    init_supersede();
    init_level_promotion();
    init_level_descent();
    init_compact();
    init_l2_to_l3();
    init_l3_to_l2();
    init_scrub();
    init_workspace();
    init_comment_syntax();
    init_markdown_annotator();
    init_sidecar_annotator();
    init_sidecar_parser();
    init_footnote_native_parser();
    init_sidecar_accept_reject();
    init_tracking_header();
    init_text_normalizer();
    init_settled_text();
    init_hashline();
    init_hashline_tracked();
    init_hashline_cleanup();
    init_footnote_utils();
    init_footnote_parser();
    init_committed_text();
    init_constants();
    init_critic_regex();
    init_footnote_patterns();
    init_view_surface();
    init_file_ops();
    init_footnote_utils();
    init_at_resolver();
    init_op_parser();
    init_three_zone_types();
    init_decoration_intents();
    init_formatters();
    init_view_builders();
    init_view_builder_utils();
    init_edit_boundary();
    init_edit_boundary();
    init_edit_boundary();
    init_format_aware_parse();
  }
});

// ../../node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/picomatch/lib/constants.js"(exports, module) {
    "use strict";
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var SEP = "/";
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR,
      SEP
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\"
    };
    var POSIX_REGEX_SOURCE = {
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module.exports = {
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// ../../node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "../../node_modules/picomatch/lib/utils.js"(exports) {
    "use strict";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports.isRegexChar = (str) => str.length === 1 && exports.hasRegexChars(str);
    exports.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform) {
        return process.platform === "win32";
      }
      return false;
    };
    exports.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
    exports.basename = (path13, { windows } = {}) => {
      const segs = path13.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// ../../node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "../../node_modules/picomatch/lib/scan.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  code = advance();
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES) {
                  isGlob = token.isGlob = true;
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_LEFT_PARENTHESES) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (idx !== 0 || value !== "") {
            parts.push(value);
          }
          prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
          const value = input.slice(prevIndex + 1);
          parts.push(value);
          if (opts.tokens) {
            tokens[tokens.length - 1].value = value;
            depth(tokens[tokens.length - 1]);
            state.maxDepth += tokens[tokens.length - 1].depth;
          }
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module.exports = scan;
  }
});

// ../../node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "../../node_modules/picomatch/lib/parse.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var parse4 = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse4(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix = POSIX_REGEX_SOURCE[rest2];
                if (posix) {
                  prev.value = pre + posix;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open2 = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open2);
          push(open2);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t2 of toks) {
              state.output += t2.output || t2.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse4.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module.exports = parse4;
  }
});

// ../../node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "../../node_modules/picomatch/lib/picomatch.js"(exports, module) {
    "use strict";
    var scan = require_scan();
    var parse4 = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch3 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch3(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix = opts.windows;
      const regex = isState ? picomatch3.compileRe(glob, options) : picomatch3.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch3(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch3.test(input, regex, options, { glob, posix });
        const result = { glob, state, regex, posix, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch3.test = (input, regex, options, { glob, posix } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch3.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch3.matchBase = (input, glob, options) => {
      const regex = glob instanceof RegExp ? glob : picomatch3.makeRe(glob, options);
      return regex.test(utils.basename(input));
    };
    picomatch3.isMatch = (str, patterns, options) => picomatch3(patterns, options)(str);
    picomatch3.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch3.parse(p, options));
      return parse4(pattern, { ...options, fastpaths: false });
    };
    picomatch3.scan = (input, options) => scan(input, options);
    picomatch3.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch3.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch3.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse4.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse4(input, options);
      }
      return picomatch3.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch3.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch3.constants = constants;
    module.exports = picomatch3;
  }
});

// ../../node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "../../node_modules/picomatch/index.js"(exports, module) {
    "use strict";
    var pico = require_picomatch();
    var utils = require_utils();
    function picomatch3(glob, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0)) {
        options = { ...options, windows: utils.isWindows() };
      }
      return pico(glob, options, returnState);
    }
    Object.assign(picomatch3, pico);
    module.exports = picomatch3;
  }
});

// ../../packages/cli/dist/engine/file-ops.js
var file_ops_exports = {};
__export(file_ops_exports, {
  appendFootnote: () => appendFootnote,
  applyProposeChange: () => applyProposeChange,
  applySingleOperation: () => applySingleOperation,
  checkCriticMarkupOverlap: () => checkCriticMarkupOverlap,
  contentZoneText: () => contentZoneText,
  extractLineRange: () => extractLineRange,
  findUniqueMatch: () => findUniqueMatch,
  guardOverlap: () => guardOverlap,
  replaceUnique: () => replaceUnique,
  resolveOverlapWithAuthor: () => resolveOverlapWithAuthor,
  stripCriticMarkup: () => stripCriticMarkup,
  stripCriticMarkupWithMap: () => stripCriticMarkupWithMap,
  stripRefsFromContent: () => stripRefsFromContent
});
var init_file_ops2 = __esm({
  "../../packages/cli/dist/engine/file-ops.js"() {
    "use strict";
    init_dist_esm();
  }
});

// ../../packages/cli/dist/config/index.js
init_dist_esm();

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
  while (1) {
    while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep4, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep4) {
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
var import_picomatch = __toESM(require_picomatch2(), 1);
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
      affected_lines: typeof response?.["affected_lines"] === "boolean" ? response["affected_lines"] : true
    }
  };
}
async function findConfigFile(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, ".changedown", "config.toml");
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
async function resolveProjectDir(startDir) {
  const configPath = await findConfigFile(startDir);
  if (!configPath)
    return void 0;
  return path.dirname(path.dirname(configPath));
}
async function loadConfig(projectDir) {
  const configPath = await findConfigFile(projectDir);
  if (!configPath) {
    console.error(`changedown: no .changedown/config.toml found (searched from ${projectDir} to /), using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
  let raw;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    console.error(`changedown: found ${configPath} but could not read it, using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
  try {
    return parseConfigToml(raw);
  } catch (err) {
    console.error(`changedown: ${configPath} contains invalid TOML (${err instanceof Error ? err.message : String(err)}), using defaults`);
    return structuredClone(DEFAULT_CONFIG2);
  }
}
function resolveProtocolMode(configMode) {
  const envVal = process.env["CHANGEDOWN_PROTOCOL_MODE"];
  if (envVal === "classic" || envVal === "compact")
    return envVal;
  return configMode;
}
function isFileInScope(filePath, config, projectDir) {
  let relative8;
  if (path.isAbsolute(filePath)) {
    relative8 = path.relative(projectDir, filePath);
  } else {
    relative8 = filePath;
  }
  relative8 = relative8.split(path.sep).join("/");
  const matchesInclude = (0, import_picomatch.default)(config.tracking.include);
  const matchesExclude = (0, import_picomatch.default)(config.tracking.exclude);
  return matchesInclude(relative8) && !matchesExclude(relative8);
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

// ../../packages/cli/dist/engine/config-resolver.js
import * as path2 from "node:path";
import * as fs2 from "node:fs/promises";
import { existsSync, realpathSync, watch } from "node:fs";
var ConfigResolver = class _ConfigResolver {
  /** Map from project root path → cached config */
  cache = /* @__PURE__ */ new Map();
  /** Active file watchers per project root */
  watchers = /* @__PURE__ */ new Map();
  /** Debounce timers per project root */
  debounceTimers = /* @__PURE__ */ new Map();
  /** Most recently resolved project dir, used as fallback for relative paths */
  lastProjectDir;
  /** Optional fallback dir for resolving relative paths when no project found yet */
  fallbackDir;
  /**
   * Host-provided session roots (e.g. from MCP roots/list).
   * When set, relative paths resolve against the first root; resolveDir() and
   * lastConfig() use the first root when no file has been resolved yet.
   */
  sessionRoots = [];
  constructor(fallbackDir) {
    this.fallbackDir = fallbackDir ?? process.cwd();
  }
  /**
   * Set workspace roots provided by the host (e.g. MCP roots/list).
   * Pass decoded filesystem paths (not file:// URIs). Replaces any previous session roots.
   */
  setSessionRoots(roots) {
    this.sessionRoots = roots.filter(Boolean).map((r) => r.trim()).filter(Boolean);
  }
  /**
   * Resolve config for a given absolute file path.
   *
   * Walks up from the file's directory looking for `.changedown/config.toml`.
   * Returns cached config if the same project root was already discovered.
   * Falls back to defaults if no config is found.
   */
  async forFile(filePath) {
    const dir = path2.dirname(filePath);
    const projectRoot = await this.findProjectRoot(dir);
    if (projectRoot) {
      const cached = this.cache.get(projectRoot);
      if (cached) {
        this.lastProjectDir = cached.projectDir;
        return { config: cached.config, projectDir: cached.projectDir };
      }
      const config = await loadConfig(projectRoot);
      const entry = { projectDir: projectRoot, config };
      this.cache.set(projectRoot, entry);
      this.lastProjectDir = projectRoot;
      this.watchConfig(projectRoot);
      return { config, projectDir: projectRoot };
    }
    return { config: structuredClone(DEFAULT_CONFIG2), projectDir: this.resolveDir() };
  }
  /**
   * Resolve a file path argument from a tool call.
   *
   * Resolves relative paths against the inferred project root, then validates
   * that the final resolved path (after symlink resolution) stays within the
   * project boundary. Rejects paths that escape the project directory.
   */
  resolveFilePath(file) {
    const projectRoot = this.inferProjectRoot(file);
    let resolved;
    if (path2.isAbsolute(file)) {
      resolved = path2.resolve(file);
    } else {
      resolved = path2.resolve(projectRoot, file);
    }
    if (!this.lastProjectDir) {
      this.lastProjectDir = projectRoot;
    }
    const realResolved = this.resolveRealPath(resolved);
    const realProjectRoot = this.resolveRealPath(projectRoot);
    const normalizedRoot = realProjectRoot.endsWith(path2.sep) ? realProjectRoot : realProjectRoot + path2.sep;
    if (!realResolved.startsWith(normalizedRoot) && realResolved !== realProjectRoot) {
      throw new Error(`Path "${file}" resolves to "${realResolved}" which is outside the project root "${realProjectRoot}". File operations are restricted to the project directory for security.`);
    }
    return realResolved;
  }
  /**
   * Infer the project root directory using the standard fallback chain.
   * Used by resolveFilePath for both absolute and relative path validation.
   */
  inferProjectRoot(file) {
    const firstSessionRoot = this.sessionRoots[0];
    const inferredProject = firstSessionRoot || this.lastProjectDir || _ConfigResolver.findProjectRootSync(this.fallbackDir) || _ConfigResolver.findProjectRootSync(process.env["PWD"] ?? "");
    if (!inferredProject) {
      throw new Error(`Cannot resolve path "${file}" because project root is unknown. Use an absolute path or set CHANGEDOWN_PROJECT_DIR to the workspace root.`);
    }
    return inferredProject;
  }
  /**
   * Resolve a path to its real filesystem path (following symlinks).
   * If the path doesn't exist, resolves the nearest existing ancestor
   * and appends the remaining segments — this supports new file creation
   * within the project boundary.
   */
  resolveRealPath(filePath) {
    try {
      return realpathSync(filePath);
    } catch {
      const segments = [];
      let current = filePath;
      while (true) {
        const parent = path2.dirname(current);
        if (parent === current) {
          return path2.resolve(filePath);
        }
        segments.unshift(path2.basename(current));
        current = parent;
        try {
          const realParent = realpathSync(current);
          return path2.join(realParent, ...segments);
        } catch {
        }
      }
    }
  }
  /**
   * Returns the most recently discovered project dir, or fallback.
   * Useful for `get_tracking_status()` with no file arg.
   */
  resolveDir() {
    return this.lastProjectDir ?? this.sessionRoots[0] ?? this.fallbackDir;
  }
  /**
   * Returns the last resolved config if any project was discovered.
   * If no file has been resolved yet, attempts to discover config from
   * the fallback directory. Returns defaults only if no config is found.
   *
   * Used by tools that don't have a file path (e.g. `get_tracking_status()`
   * with no args, `begin_change_group`).
   */
  async lastConfig() {
    if (this.lastProjectDir) {
      const cached = this.cache.get(this.lastProjectDir);
      if (cached)
        return cached.config;
    }
    const startDir = this.sessionRoots[0] ?? this.fallbackDir;
    const projectRoot = await this.findProjectRoot(startDir);
    if (projectRoot) {
      const config = await loadConfig(projectRoot);
      this.cache.set(projectRoot, { projectDir: projectRoot, config });
      this.lastProjectDir = projectRoot;
      this.watchConfig(projectRoot);
      return config;
    }
    return structuredClone(DEFAULT_CONFIG2);
  }
  /**
   * Walk up from `startDir` looking for a directory containing `.changedown/`.
   * Returns the project root (parent of `.changedown/`) or undefined.
   */
  async findProjectRoot(startDir) {
    let dir = path2.resolve(startDir);
    const root = path2.parse(dir).root;
    while (true) {
      try {
        await fs2.access(path2.join(dir, ".changedown", "config.toml"));
        return dir;
      } catch {
      }
      const parent = path2.dirname(dir);
      if (parent === dir || dir === root) {
        return void 0;
      }
      dir = parent;
    }
  }
  /**
   * Synchronous project root lookup used by resolveFilePath.
   * Walks up from startDir until it finds `.changedown/config.toml`.
   */
  static findProjectRootSync(startDir) {
    if (!startDir)
      return void 0;
    let dir = path2.resolve(startDir);
    const root = path2.parse(dir).root;
    while (true) {
      if (existsSync(path2.join(dir, ".changedown", "config.toml"))) {
        return dir;
      }
      const parent = path2.dirname(dir);
      if (parent === dir || dir === root) {
        return void 0;
      }
      dir = parent;
    }
  }
  /**
   * Start watching `.changedown/config.toml` for a project root.
   * On change, invalidates the cached config so the next forFile() re-reads.
   * Debounced at 100ms (fs.watch fires multiple events per save).
   * Idempotent — won't create duplicate watchers for the same project.
   */
  watchConfig(projectDir) {
    if (this.watchers.has(projectDir))
      return;
    const configPath = path2.join(projectDir, ".changedown", "config.toml");
    try {
      const watcher = watch(configPath, () => {
        const existing = this.debounceTimers.get(projectDir);
        if (existing)
          clearTimeout(existing);
        this.debounceTimers.set(projectDir, setTimeout(() => {
          this.debounceTimers.delete(projectDir);
          this.cache.delete(projectDir);
          console.error(`changedown: config changed, cache invalidated for ${projectDir}`);
        }, 100));
      });
      watcher.unref?.();
      watcher.on("error", () => {
        this.stopWatching(projectDir);
      });
      this.watchers.set(projectDir, watcher);
    } catch {
    }
  }
  /**
   * Stop watching a specific project's config.
   */
  stopWatching(projectDir) {
    const watcher = this.watchers.get(projectDir);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectDir);
    }
    const timer = this.debounceTimers.get(projectDir);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectDir);
    }
  }
  /**
   * Stop all watchers and clear the cache. Call on server shutdown.
   */
  dispose() {
    for (const projectDir of this.watchers.keys()) {
      this.stopWatching(projectDir);
    }
    this.cache.clear();
  }
};

// ../../packages/cli/dist/engine/state.js
init_dist_esm();
import * as path3 from "node:path";
import { realpathSync as realpathSync2 } from "node:fs";
var SessionState = class {
  counters = /* @__PURE__ */ new Map();
  globalMaxId = 0;
  activeGroup = null;
  fileHashesByView = /* @__PURE__ */ new Map();
  fileRecords = /* @__PURE__ */ new Map();
  guideShownForMode = null;
  guideSuppressed = true;
  /**
   * Starts a new change group. Allocates a group parent ID starting from 1
   * (or from knownMaxId if provided). While active, all `getNextId` calls
   * return dotted child IDs under this parent.
   *
   * @param knownMaxId - Optional max ID from files that will be edited in this group
   * @throws {Error} if a group is already active
   */
  beginGroup(description, reasoning, knownMaxId) {
    if (this.activeGroup) {
      throw new Error("A change group is already active. End the current group before starting a new one.");
    }
    const numericId = (knownMaxId || 0) + 1;
    const groupId = `cn-${numericId}`;
    this.activeGroup = {
      id: groupId,
      numericId,
      description,
      reasoning,
      childCount: 0,
      childIds: [],
      files: /* @__PURE__ */ new Set()
    };
    return groupId;
  }
  /**
   * Returns the next available change identifier for the given file.
   *
   * When a group is active, returns a dotted child ID (`cn-N.M`) and
   * tracks the file as part of the group. Otherwise returns a flat
   * `cn-N` identifier.
   *
   * On first call for a file (outside a group), uses `scanMaxCnId(currentText)`
   * to find the max existing ID, then returns `cn-(max+1)`. On subsequent
   * calls, increments from the cached counter.
   */
  getNextId(filePath, currentText) {
    filePath = this.normalizePath(filePath);
    if (this.activeGroup) {
      this.activeGroup.childCount++;
      const childId = `cn-${this.activeGroup.numericId}.${this.activeGroup.childCount}`;
      this.activeGroup.childIds.push(childId);
      this.activeGroup.files.add(filePath);
      const currentCounter = this.counters.get(filePath);
      if (currentCounter === void 0) {
        const scannedMax = scanMaxCnId(currentText);
        this.counters.set(filePath, Math.max(scannedMax, this.activeGroup.numericId));
      } else {
        this.counters.set(filePath, Math.max(currentCounter, this.activeGroup.numericId));
      }
      return childId;
    }
    let counter = this.counters.get(filePath);
    if (counter === void 0) {
      counter = scanMaxCnId(currentText);
    }
    counter++;
    this.counters.set(filePath, counter);
    return `cn-${counter}`;
  }
  /**
   * Returns whether a change group is currently active.
   */
  hasActiveGroup() {
    return this.activeGroup !== null;
  }
  /**
   * Returns the active group info, or null if no group is active.
   */
  getActiveGroup() {
    return this.activeGroup;
  }
  /**
   * Ends the current change group and returns a summary of all child
   * changes and affected files.
   *
   * @throws {Error} if no group is active
   */
  endGroup() {
    if (!this.activeGroup) {
      throw new Error("No active change group to end.");
    }
    const result = {
      id: this.activeGroup.id,
      description: this.activeGroup.description,
      reasoning: this.activeGroup.reasoning,
      childIds: [...this.activeGroup.childIds],
      files: [...this.activeGroup.files]
    };
    this.activeGroup = null;
    return result;
  }
  /**
   * Clears the cached ID counter for a file. The next `getNextId` call
   * will re-scan the document text to determine the max existing ID.
   */
  resetFile(filePath) {
    filePath = this.normalizePath(filePath);
    this.counters.delete(filePath);
  }
  /**
   * Records per-line hashes for a file, used for staleness detection.
   * Called by `read_tracked_file` after computing hashline output.
   * Overwrites the recorded hashes for the last-read view of the file.
   */
  recordFileHashes(filePath, hashes) {
    filePath = this.normalizePath(filePath);
    const view = this.getLastReadView(filePath) ?? "raw";
    if (!this.fileHashesByView.has(filePath)) {
      this.fileHashesByView.set(filePath, /* @__PURE__ */ new Map());
    }
    this.fileHashesByView.get(filePath).set(view, hashes);
  }
  /**
   * Returns the recorded per-line hashes for a file, or undefined if
   * the file has not been read via `read_tracked_file` in this session.
   *
   * When `view` is omitted, returns hashes for the last-read view of the file
   * (i.e. whatever view was most recently passed to `recordAfterRead`). Falls
   * back to `'raw'` if no view has been recorded for the file yet.
   */
  getRecordedHashes(filePath, view) {
    filePath = this.normalizePath(filePath);
    const viewTables = this.fileHashesByView.get(filePath);
    if (!viewTables)
      return void 0;
    const targetView = view ?? this.getLastReadView(filePath) ?? "raw";
    return viewTables.get(targetView);
  }
  /**
   * Records state after a read_tracked_file call: stores the view name,
   * per-line hashes, and a content fingerprint for staleness detection.
   */
  recordAfterRead(filePath, view, hashes, rawContent) {
    filePath = this.normalizePath(filePath);
    const newFingerprint = this.fingerprint(rawContent);
    const existingRecord = this.fileRecords.get(filePath);
    if (existingRecord && existingRecord.contentFingerprint !== newFingerprint) {
      this.fileHashesByView.delete(filePath);
    }
    if (!this.fileHashesByView.has(filePath)) {
      this.fileHashesByView.set(filePath, /* @__PURE__ */ new Map());
    }
    this.fileHashesByView.get(filePath).set(view, hashes);
    this.fileRecords.set(filePath, {
      lastReadView: view,
      contentFingerprint: newFingerprint,
      recordedAt: Date.now()
    });
  }
  /**
   * Refreshes state after a write operation. Clears the ID counter cache
   * (so the next getNextId re-scans), updates hashes, and updates the
   * content fingerprint. Preserves the lastReadView from the prior read.
   */
  rerecordAfterWrite(filePath, newContent, hashes) {
    filePath = this.normalizePath(filePath);
    const existingRecord = this.fileRecords.get(filePath);
    this.resetFile(filePath);
    this.fileHashesByView.delete(filePath);
    const view = existingRecord?.lastReadView ?? "review";
    const viewTables = /* @__PURE__ */ new Map();
    viewTables.set(view, hashes);
    this.fileHashesByView.set(filePath, viewTables);
    this.fileRecords.set(filePath, {
      lastReadView: view,
      contentFingerprint: this.fingerprint(newContent),
      recordedAt: Date.now()
    });
  }
  /**
   * Returns the view name from the last read_tracked_file call for this file,
   * or undefined if the file has not been read in this session.
   */
  getLastReadView(filePath) {
    filePath = this.normalizePath(filePath);
    return this.fileRecords.get(filePath)?.lastReadView;
  }
  /**
   * Returns true if the file's content has changed since the last read.
   * Compares the stored fingerprint against a fingerprint of the given content.
   */
  isStale(filePath, currentContent) {
    filePath = this.normalizePath(filePath);
    const record = this.fileRecords.get(filePath);
    if (!record)
      return true;
    return record.contentFingerprint !== this.fingerprint(currentContent);
  }
  /**
   * Resolves the correct hash for a given line based on the lastReadView.
   * - review/changes: returns committed hash (the coordinate space agents write against)
   * - settled: returns settledView hash
   * - raw: returns raw hash
   *
   * When `suppliedHash` is provided, returns a discriminated union:
   *   - `{ match: true, rawLineNum, view }` if the supplied hash matches the expected hash
   *   - `{ match: false, expectedHash, view }` if the supplied hash does not match
   *
   * When `suppliedHash` is omitted, behaves backward-compatibly and always returns
   * `{ match: true, rawLineNum, view }` (no validation performed).
   *
   * Returns undefined if the file has not been read or the line is not found.
   */
  resolveHash(filePath, line, suppliedHash) {
    filePath = this.normalizePath(filePath);
    const viewTables = this.fileHashesByView.get(filePath);
    const lastView = this.getLastReadView(filePath);
    if (!viewTables || viewTables.size === 0 || !lastView)
      return void 0;
    const expectedHashForView = (view, entry) => {
      switch (view) {
        case "review":
        case "changes":
          return entry.committed ?? entry.raw;
        case "settled":
          return entry.settledView ?? entry.settled;
        case "raw":
          return entry.raw;
      }
    };
    if (suppliedHash === void 0) {
      const hashes = viewTables.get(lastView);
      if (!hashes)
        return void 0;
      const entry = hashes.find((h) => h.line === line);
      if (!entry)
        return void 0;
      return { match: true, rawLineNum: entry.rawLineNum ?? entry.line, view: lastView };
    }
    let foundLineInAnyView = false;
    for (const [view, hashes] of viewTables) {
      const entry = hashes.find((h) => h.line === line);
      if (!entry)
        continue;
      foundLineInAnyView = true;
      const expected = expectedHashForView(view, entry);
      if (suppliedHash === expected) {
        return { match: true, rawLineNum: entry.rawLineNum ?? entry.line, view };
      }
    }
    if (foundLineInAnyView) {
      for (const [view, hashes] of viewTables) {
        let uniqueMatch;
        let ambiguous = false;
        for (const entry of hashes) {
          if (suppliedHash === expectedHashForView(view, entry)) {
            if (uniqueMatch) {
              ambiguous = true;
              break;
            }
            uniqueMatch = entry;
          }
        }
        if (uniqueMatch && !ambiguous) {
          return { match: true, rawLineNum: uniqueMatch.rawLineNum ?? uniqueMatch.line, view };
        }
      }
    }
    const lastHashes = viewTables.get(lastView);
    if (lastHashes) {
      const entry = lastHashes.find((h) => h.line === line);
      if (entry) {
        return { match: false, expectedHash: expectedHashForView(lastView, entry), view: lastView };
      }
    }
    return void 0;
  }
  /**
   * Returns the protocol mode for which the first-contact guide was shown
   * in this session, or null if it has not been shown yet.
   */
  getGuideShownForMode() {
    return this.guideShownForMode;
  }
  isGuideSuppressed() {
    return this.guideSuppressed;
  }
  /**
   * Records that the first-contact guide has been shown for the given
   * protocol mode in this session.
   */
  setGuideShown(mode) {
    this.guideShownForMode = mode;
  }
  /**
   * Suppresses the first-contact guide for any protocol mode.
   * Guide is suppressed by default; call enableGuide() to allow it.
   */
  suppressGuide() {
    this.guideSuppressed = true;
  }
  /**
   * Enables the first-contact guide. Called by the production MCP server
   * and by tests that specifically exercise guide delivery.
   */
  enableGuide() {
    this.guideSuppressed = false;
  }
  /**
   * Computes a simple string fingerprint for content comparison.
   * Uses a fast non-cryptographic hash (djb2 variant).
   */
  fingerprint(content) {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) + hash + content.charCodeAt(i) | 0;
    }
    return hash.toString(36);
  }
  /**
   * Normalizes a file path to a canonical form for consistent Map key usage.
   * Resolves relative paths and follows symlinks. If the file doesn't exist
   * yet, walks up to the nearest existing ancestor, resolves its realpath,
   * and appends remaining segments.
   */
  normalizePath(filePath) {
    const resolved = path3.resolve(filePath);
    try {
      return realpathSync2(resolved);
    } catch {
      const segments = [];
      let current = resolved;
      while (true) {
        const parent = path3.dirname(current);
        if (parent === current) {
          return resolved;
        }
        segments.unshift(path3.basename(current));
        current = parent;
        try {
          const realParent = realpathSync2(current);
          return path3.join(realParent, ...segments);
        } catch {
        }
      }
    }
  }
};

// ../../packages/cli/dist/engine/state-utils.js
init_dist_esm();
async function rerecordState(state, filePath, content, config) {
  if (!state)
    return void 0;
  if (!config.hashline.enabled) {
    state.resetFile(filePath);
    return void 0;
  }
  await initHashline();
  const lines = content.split("\n");
  const allSettled = lines.map((l) => settledLine(l));
  const lastView = state.getLastReadView(filePath);
  let hashes;
  let sv;
  let cv;
  if (lastView === "settled") {
    sv = computeSettledView(content);
    hashes = sv.lines.map((sl) => ({
      line: sl.settledLineNum,
      raw: computeLineHash(sl.rawLineNum - 1, lines[sl.rawLineNum - 1], lines),
      settled: computeSettledLineHash(sl.rawLineNum - 1, lines[sl.rawLineNum - 1], allSettled),
      settledView: sl.hash,
      rawLineNum: sl.rawLineNum
    }));
  } else if (lastView === "changes") {
    cv = computeCommittedView(content);
    hashes = cv.lines.map((cl) => ({
      line: cl.committedLineNum,
      raw: computeLineHash(cl.rawLineNum - 1, lines[cl.rawLineNum - 1], lines),
      settled: computeSettledLineHash(cl.rawLineNum - 1, lines[cl.rawLineNum - 1], allSettled),
      committed: cl.hash,
      rawLineNum: cl.rawLineNum
    }));
  } else if (lastView === "review") {
    cv = computeCommittedView(content);
    const rawToCommittedHash = /* @__PURE__ */ new Map();
    for (const cl of cv.lines) {
      rawToCommittedHash.set(cl.rawLineNum, cl.hash);
    }
    hashes = lines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, lines),
      settled: computeSettledLineHash(i, line, allSettled),
      committed: rawToCommittedHash.get(i + 1)
    }));
  } else {
    hashes = lines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, lines),
      settled: computeSettledLineHash(i, line, allSettled)
    }));
  }
  state.rerecordAfterWrite(filePath, content, hashes);
  if (sv)
    return { settledView: sv };
  if (cv)
    return { committedView: cv };
  return void 0;
}

// ../../packages/cli/dist/engine/author.js
var AUTHOR_ENV_KEY = "CHANGEDOWN_AUTHOR";
var AUTHOR_FORMAT = /^[a-z][a-z0-9]*:[a-zA-Z0-9_.-]+$/;
var SYSTEM_FALLBACK = "unknown";
function validateAuthorFormat(author) {
  if (author === SYSTEM_FALLBACK) {
    return null;
  }
  if (!AUTHOR_FORMAT.test(author)) {
    return {
      author: "",
      error: {
        isError: true,
        message: `Invalid author format: '${author}'. Expected namespace:identifier (e.g., ai:claude-opus-4.6, human:alice).`
      }
    };
  }
  return null;
}
function resolveAuthor(explicitAuthor, config, toolName) {
  if (explicitAuthor) {
    const formatError2 = validateAuthorFormat(explicitAuthor);
    if (formatError2)
      return formatError2;
    return { author: explicitAuthor };
  }
  const fromEnv = process.env[AUTHOR_ENV_KEY]?.trim();
  if (config.author.enforcement === "required") {
    if (fromEnv) {
      const formatError2 = validateAuthorFormat(fromEnv);
      if (formatError2)
        return formatError2;
      return { author: fromEnv };
    }
    return {
      author: "",
      error: {
        isError: true,
        message: `${toolName} requires an author parameter. This project has [author] enforcement = "required". Pass author in the tool call (e.g. author: "ai:claude-opus-4.6") or set ${AUTHOR_ENV_KEY} in the MCP server env (e.g. in Cursor mcp.json).`
      }
    };
  }
  const fallback = fromEnv || config.author.default || "unknown";
  const formatError = validateAuthorFormat(fallback);
  if (formatError)
    return formatError;
  return { author: fallback };
}

// ../../packages/cli/dist/engine/scope.js
init_dist_esm();
import * as fs3 from "node:fs/promises";
async function resolveTrackingStatus(filePath, config, projectDir) {
  const projectDefault = config.tracking.default;
  const autoHeader = config.tracking.auto_header;
  let fileContent = null;
  try {
    fileContent = await fs3.readFile(filePath, "utf-8");
  } catch {
  }
  if (fileContent !== null) {
    const header = parseTrackingHeader(fileContent);
    if (header !== null) {
      return {
        status: header.status,
        source: "file_header",
        header_present: true,
        project_default: projectDefault,
        auto_header: autoHeader
      };
    }
  }
  if (isFileInScope(filePath, config, projectDir)) {
    return {
      status: projectDefault,
      source: "project_config",
      header_present: false,
      project_default: projectDefault,
      auto_header: autoHeader
    };
  }
  return {
    status: "untracked",
    source: "global_default",
    header_present: false,
    project_default: projectDefault,
    auto_header: autoHeader
  };
}

// ../../packages/cli/dist/engine/path-utils.js
import * as path4 from "node:path";
function toRelativePath(projectDir, filePath) {
  return path4.relative(projectDir, filePath);
}

// ../../packages/cli/dist/engine/guide-composer.js
function composeGuide(config) {
  const sections = [];
  const protocolMode = resolveProtocolMode(config.protocol.mode);
  sections.push(composeProtocolSection(protocolMode, config));
  sections.push(composeAuthorSection(config));
  if (config.reasoning?.propose?.agent === true) {
    sections.push("**Annotations**: Required on every change. Append `{>>reason` to your `op` string, or include reasoning in your propose call.");
  }
  sections.push("**Chaining edits**: Each `propose_change` response shows your changes applied. The `applied` array includes `preview` (the line with your edit) and coordinates for follow-up edits. `affected_lines` shows neighboring lines with fresh coordinates. No re-read needed between edits. Re-read only after review (accept/reject).");
  sections.push("**Revising proposals**: Re-proposing over your own earlier changes auto-supersedes them. No need to reject first. The response includes a `superseded` array with the IDs of replaced changes.");
  sections.push(composeViewSection(config));
  return `---
## How to edit this file

${sections.join("\n\n")}
---`;
}
function composeProtocolSection(mode, config) {
  if (mode === "classic") {
    return "**Editing**: Use `propose_change` with `old_text` (exact text to replace) and `new_text`.\nFor insertions, use `insert_after` to place new text after an anchor string.\nGroup related changes: `propose_change(file, changes=[{old_text:..., new_text:...}, ...])`";
  }
  const lines = [
    "**Editing**: Use `propose_change` with `at` (LINE:HASH from the margin) and `op`:",
    "  Substitute: `{~~old~>new~~}`  Insert: `{++text++}`  Delete: `{--text--}`",
    "  Highlight: `{==text==}`  Comment: `{>>reason`"
  ];
  if (config.reasoning?.propose?.agent !== true) {
    lines.push("  Annotate: `{~~old~>new~~}{>>reason`  (append {>> to any op)");
  } else {
    lines.push("  Annotate (required): `{~~old~>new~~}{>>reason`  (append {>> to any op)");
  }
  lines.push('Group: `propose_change(file, changes=[{at:"3:a1", op:"{~~old~>new~~}{>>reason"}, ...])`', "Include enough context in your `op` to disambiguate repeated text on the same line.");
  lines.push('Range replace: `at:"5:a1-20:b3"` + `op:"{~~~>new content~~}"` replaces the entire range.');
  lines.push("Multi-line ops: use real newlines in your op string \u2014 the MCP transport handles encoding.");
  return lines.join("\n");
}
function composeAuthorSection(config) {
  if (config.author.enforcement === "required") {
    return '**Author**: Required. Pass `author="ai:YOUR-ACTUAL-MODEL"` on every propose/review call.\nDo not copy example identities from documentation.';
  }
  return '**Author**: Recommended. Pass `author="ai:YOUR-MODEL"` for clear attribution.';
}
function composeViewSection(config) {
  const defaultView = config.policy.default_view ?? "review";
  switch (defaultView) {
    case "review":
      return "**You're seeing**: review view \u2014 full deliberation context. CriticMarkup shows proposals inline, [cn-N] anchors link to end-of-line metadata.\nOther views: `changes` (clean prose + P/A flags), `settled` (accept-all preview).";
    case "changes":
      return "**You're seeing**: changes view \u2014 committed text with P/A flags in the margin. Proposals are summarized, not shown inline.\nOther views: `review` (full deliberation context), `settled` (accept-all preview).";
    case "settled":
      return "**You're seeing**: settled view \u2014 the document as if all proposals were accepted. Proposed deletions are not visible.\nOther views: `review` (full deliberation context), `changes` (committed text + P/A flags).";
    default:
      return `**Current view**: ${defaultView}.`;
  }
}

// ../../packages/cli/dist/engine/index.js
init_file_ops2();

// ../../packages/cli/dist/engine/args.js
function strArg(args, snake, camel, defaultValue = "") {
  const v = args[snake] ?? args[camel];
  return v ?? defaultValue;
}
function optionalStrArg(args, snake, camel) {
  const v = args[snake] ?? args[camel];
  if (v === void 0 || v === null)
    return void 0;
  return String(v);
}

// ../../packages/cli/dist/engine/tool-schemas.js
var compactProposeChangeSchema = {
  name: "propose_change",
  description: "Propose tracked changes to a markdown file. Each change uses at (LINE:HASH coordinate) and op (edit operation). For multiple changes, pass a changes array \u2014 all applied atomically against the pre-change state.",
  inputSchema: {
    type: "object",
    properties: {
      file: { type: "string", description: "Path to the file (absolute or relative to project root)" },
      author: { type: "string", description: "Author identity (e.g., ai:claude-opus-4.6, human:alice). Required when project has author enforcement." },
      at: { type: "string", description: 'Target coordinate from read_tracked_file. Single line: "LINE:HASH". Range: "LINE:HASH-LINE:HASH".' },
      op: { type: "string", description: "Edit operation. Substitute: {~~old~>new~~}. Insert: {++text++}. Delete: {--text--}. Highlight: {==text==}. Comment: {>>reason. Append {>> to annotate any op." },
      changes: {
        type: "array",
        description: "Multiple changes applied atomically with grouped IDs. All coordinates reference the pre-change state.",
        items: {
          type: "object",
          properties: {
            at: { type: "string", description: "LINE:HASH or LINE:HASH-LINE:HASH coordinate." },
            op: { type: "string", description: "{~~old~>new~~} | {++text++} | {--text--} | {==text==}. Append {>> to annotate." }
          },
          required: ["at", "op"]
        }
      },
      raw: { type: "boolean", description: "When true, bypasses CriticMarkup wrapping (policy-gated). Denied in strict mode." }
    },
    required: ["file"]
  }
};
var classicProposeChangeSchema = {
  name: "propose_change",
  description: "Propose tracked changes to a markdown file. Each change uses old_text/new_text for text matching. For multiple changes, pass a changes array \u2014 all applied atomically against the pre-change state.",
  inputSchema: {
    type: "object",
    properties: {
      file: { type: "string", description: "Path to the file (absolute or relative to project root)" },
      author: { type: "string", description: "Author identity (e.g., ai:claude-opus-4.6, human:alice). Required when project has author enforcement." },
      old_text: { type: "string", description: "Text to replace. Empty string for pure insertion. Must match file content exactly." },
      new_text: { type: "string", description: "Replacement text. Empty string for pure deletion." },
      reason: { type: "string", description: "Annotation for the change (adds a discussion comment to the change thread)." },
      insert_after: { type: "string", description: "For insertions: insert new text after this anchor text." },
      changes: {
        type: "array",
        description: "Multiple changes applied atomically with grouped IDs.",
        items: {
          type: "object",
          properties: {
            old_text: { type: "string", description: "Text to replace." },
            new_text: { type: "string", description: "Replacement text." },
            reason: { type: "string", description: "Annotation for this change." },
            insert_after: { type: "string", description: "Insertion anchor text." }
          },
          required: ["old_text", "new_text"]
        }
      },
      raw: { type: "boolean", description: "When true, bypasses CriticMarkup wrapping (policy-gated). Denied in strict mode." }
    },
    required: ["file"]
  }
};

// ../../packages/cli/dist/engine/handlers/review-changes.js
import * as fs4 from "node:fs/promises";
import * as path5 from "node:path";

// ../../packages/cli/dist/engine/shared/error-result.js
function errorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// ../../packages/cli/dist/engine/handlers/review-changes.js
init_dist_esm();

// ../../packages/cli/dist/engine/shared/blocking-annotation.js
init_dist_esm();
function applyBlockingAnnotation(content, changeId, author, label, shouldBlock) {
  const lines = content.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return content;
  const insertIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  if (label && insertIdx >= block.headerLine) {
    const rcLine = lines[insertIdx];
    if (rcLine.trimStart().startsWith("request-changes:")) {
      lines[insertIdx] = rcLine + ` [${label}]`;
    }
  }
  if (shouldBlock) {
    lines.splice(insertIdx + 1, 0, `    blocked: @${author}`);
  }
  return lines.join("\n");
}

// ../../packages/cli/dist/engine/handlers/settle.js
init_dist_esm();
function settleAcceptedChanges(fileContent) {
  return settleAcceptedChangesOnly(fileContent);
}
function settleRejectedChanges(fileContent) {
  return settleRejectedChangesOnly(fileContent);
}

// ../../packages/cli/dist/engine/handlers/propose-utils.js
init_dist_esm();
function computeAffectedLines(modifiedText, affectedStartLine, affectedEndLine, options) {
  const lines = modifiedText.split("\n");
  const result = [];
  const ctx = options.contextLines ?? 2;
  const start = Math.max(1, affectedStartLine - ctx);
  const end = Math.min(lines.length, affectedEndLine + ctx);
  for (let lineNum = start; lineNum <= end; lineNum++) {
    const lineContent = lines[lineNum - 1];
    if (options.viewProjection) {
      const viewEntry = options.viewProjection.rawToView.get(lineNum);
      if (!viewEntry) {
        continue;
      }
      const entry = {
        line: viewEntry.viewLine,
        content: viewEntry.viewContent
      };
      if (options.hashlineEnabled) {
        entry.hash = viewEntry.viewHash;
      }
      if (lineContent.match(/\{\+\+|\{--|\{~~|\{==/)) {
        entry.flag = "P";
      }
      result.push(entry);
    } else {
      const entry = {
        line: lineNum,
        content: lineContent
      };
      if (options.hashlineEnabled) {
        entry.hash = computeLineHash(lineNum - 1, lineContent, lines);
      }
      if (lineContent.match(/\{\+\+|\{--|\{~~|\{==/)) {
        entry.flag = "P";
      }
      result.push(entry);
    }
  }
  return result;
}

// ../../packages/cli/dist/engine/handlers/review-changes.js
var reviewChangesTool = {
  name: "review_changes",
  description: "Review existing changes: accept/reject decisions and thread responses. Pass reviews for accept/reject or responses for thread replies. Accepted changes are compacted by the server per project config (no separate settle step). When status_updated is false, a reason field explains why (already_accepted, already_rejected, request_changes_no_status_change).",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            change_id: {
              type: "string",
              description: "e.g., 'cn-7' or 'cn-7.2'"
            },
            decision: {
              type: "string",
              enum: ["approve", "reject", "request_changes", "withdraw"],
              description: "The review decision"
            },
            reason: {
              type: "string",
              description: "Why this decision. Required."
            },
            blocking: {
              type: "boolean",
              description: "When true with request_changes, adds a blocked: line preventing acceptance until withdrawn."
            },
            label: {
              type: "string",
              description: 'Optional label for the review (e.g. "security", "performance").'
            }
          },
          required: ["change_id", "decision", "reason"]
        },
        description: "Array of review decisions to apply"
      },
      author: {
        type: "string",
        description: "Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement."
      },
      responses: {
        type: "array",
        description: "Thread responses. Each: {change_id, response, label?}.",
        items: {
          type: "object",
          properties: {
            change_id: { type: "string" },
            response: { type: "string" },
            label: { type: "string", enum: ["suggestion", "issue", "question", "praise", "todo", "thought", "nitpick"] }
          },
          required: ["change_id", "response"]
        }
      }
    },
    required: ["file"]
  }
};
async function handleReviewChanges(args, resolver, state) {
  try {
    const file = optionalStrArg(args, "file", "file");
    let reviewsRaw = args.reviews;
    let responsesRaw = args.responses;
    const settleFlag = args.settle === true || args.settle === "true";
    const authorArg = optionalStrArg(args, "author", "author");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (typeof reviewsRaw === "string") {
      try {
        const parsed = JSON.parse(reviewsRaw);
        if (Array.isArray(parsed)) {
          reviewsRaw = parsed;
        } else {
          return errorResult(`The "reviews" parameter was received as a JSON string but parsed to ${typeof parsed}, not an array. Send reviews as a JSON array of objects, e.g.: reviews: [{ "change_id": "cn-1", "decision": "approve", "reason": "looks good" }]`);
        }
      } catch {
        return errorResult('The "reviews" parameter was received as a string but could not be parsed as JSON. Send reviews as a JSON array of objects, e.g.: reviews: [{ "change_id": "cn-1", "decision": "approve", "reason": "looks good" }]');
      }
    }
    if (typeof responsesRaw === "string") {
      try {
        const parsed = JSON.parse(responsesRaw);
        if (Array.isArray(parsed)) {
          responsesRaw = parsed;
        } else {
          return errorResult(`The "responses" parameter was received as a JSON string but parsed to ${typeof parsed}, not an array. Send responses as a JSON array of objects, e.g.: responses: [{ "change_id": "cn-1", "response": "addressed in latest revision" }]`);
        }
      } catch {
        return errorResult('The "responses" parameter was received as a string but could not be parsed as JSON. Send responses as a JSON array of objects, e.g.: responses: [{ "change_id": "cn-1", "response": "addressed in latest revision" }]');
      }
    }
    const hasReviews = Array.isArray(reviewsRaw) && reviewsRaw.length > 0;
    const hasResponses = Array.isArray(responsesRaw) && responsesRaw.length > 0;
    if (!hasReviews && !hasResponses && !settleFlag) {
      return errorResult('At least one of "reviews", "responses", or "settle" must be provided.\n\nExample:\n  review_changes(file: "doc.md", reviews: [{ change_id: "cn-1", decision: "approve", reason: "looks good" }])\n\nRequired fields per review: change_id, decision (approve|reject|request_changes|withdraw), reason.');
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    let originalContent;
    try {
      fileContent = await fs4.readFile(filePath, "utf-8");
      originalContent = fileContent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(authorArg, config, "review_changes");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const successes = [];
    const errors = [];
    let results = [];
    if (hasReviews) {
      const lines = fileContent.split("\n");
      const inputOrderChangeIds = [];
      const withPosition = [];
      const validationErrors = [];
      for (let idx = 0; idx < reviewsRaw.length; idx++) {
        const r = reviewsRaw[idx];
        if (r === null || r === void 0 || typeof r !== "object" || Array.isArray(r)) {
          validationErrors.push(`Review item #${idx} must be an object, got ${r === null ? "null" : Array.isArray(r) ? "array" : typeof r}`);
          continue;
        }
        const rObj = r;
        const changeId = rObj.change_id;
        const decision = rObj.decision;
        const reason = rObj.reason;
        const missingFields = [];
        if (!changeId)
          missingFields.push("'change_id'");
        if (!decision)
          missingFields.push("'decision'");
        if (!reason) {
          if (rObj.reasoning) {
            missingFields.push("'reason' (did you mean 'reason'? You passed 'reasoning' which is not the correct field name)");
          } else {
            missingFields.push("'reason'");
          }
        }
        if (missingFields.length > 0) {
          validationErrors.push(`Review item #${idx} missing required field(s): ${missingFields.join(", ")}`);
          continue;
        }
        inputOrderChangeIds.push(changeId);
        const block = findFootnoteBlock(lines, changeId);
        withPosition.push({
          review: {
            change_id: changeId,
            decision,
            reason,
            blocking: rObj.blocking === true ? true : void 0,
            label: typeof rObj.label === "string" ? rObj.label : void 0
          },
          headerLine: block ? block.headerLine : -1
        });
      }
      withPosition.sort((a, b) => b.headerLine - a.headerLine);
      const resultByChangeId = /* @__PURE__ */ new Map();
      for (const { review } of withPosition) {
        if (!VALID_DECISIONS.includes(review.decision)) {
          resultByChangeId.set(review.change_id, {
            change_id: review.change_id,
            error: `Invalid decision: "${review.decision}". Must be one of: approve, reject, request_changes, withdraw`
          });
          continue;
        }
        const applied = applyReview(fileContent, review.change_id, review.decision, review.reason, author, config);
        if ("error" in applied) {
          resultByChangeId.set(review.change_id, { change_id: review.change_id, error: applied.error });
          continue;
        }
        if (review.decision === "request_changes" && (review.blocking || review.label)) {
          const autoBlock = review.label ? config.review.blocking_labels[review.label] === true : false;
          const shouldBlock = review.blocking || autoBlock;
          applied.updatedContent = applyBlockingAnnotation(applied.updatedContent, review.change_id, author, review.label, shouldBlock);
        }
        resultByChangeId.set(review.change_id, applied.result);
        fileContent = applied.updatedContent;
      }
      results = inputOrderChangeIds.map((id) => resultByChangeId.get(id));
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      }
    }
    if (hasResponses) {
      const VALID_LABELS = ["suggestion", "issue", "question", "praise", "todo", "thought", "nitpick"];
      for (let rIdx = 0; rIdx < responsesRaw.length; rIdx++) {
        const resp = responsesRaw[rIdx];
        if (resp === null || resp === void 0 || typeof resp !== "object" || Array.isArray(resp)) {
          errors.push(`Response item #${rIdx} must be an object, got ${resp === null ? "null" : Array.isArray(resp) ? "array" : typeof resp}`);
          continue;
        }
        const respObj = resp;
        const respChangeId = respObj.change_id;
        const respText = respObj.response;
        const respLabel = respObj.label;
        if (!respChangeId || !respText) {
          const missing = [];
          if (!respChangeId)
            missing.push("'change_id'");
          if (!respText)
            missing.push("'response'");
          errors.push(`Response item #${rIdx} missing required field(s): ${missing.join(", ")}`);
          continue;
        }
        if (respLabel && !VALID_LABELS.includes(respLabel)) {
          errors.push(`Response to ${respChangeId}: Invalid label "${respLabel}". Must be one of: ${VALID_LABELS.join(", ")}`);
          continue;
        }
        const lines = fileContent.split("\n");
        const block = findFootnoteBlock(lines, respChangeId);
        if (!block) {
          errors.push(`Response to ${respChangeId}: Change "${respChangeId}" not found in file.`);
          continue;
        }
        const insertionIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd) + 1;
        const ts = nowTimestamp();
        const labelPart = respLabel ? ` [${respLabel}]` : "";
        const responseLines = respText.split("\n");
        const indent = "    ";
        const continuationIndent = "      ";
        const firstLine = `${indent}@${author} ${ts.raw}${labelPart}: ${responseLines[0]}`;
        const formatted = [firstLine];
        for (let li = 1; li < responseLines.length; li++) {
          formatted.push(`${continuationIndent}${responseLines[li]}`);
        }
        lines.splice(insertionIdx, 0, ...formatted);
        fileContent = lines.join("\n");
        successes.push(`Responded to ${respChangeId}`);
      }
    }
    let settlementInfo;
    if (config.settlement.auto_on_approve && hasReviews) {
      const hasApprovals = results.some((r) => "decision" in r && r.decision === "approve");
      if (hasApprovals) {
        const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
        if (settledIds.length > 0) {
          fileContent = settledContent;
          settlementInfo = { settledIds };
        }
      }
    }
    if (config.settlement.auto_on_reject && hasReviews) {
      const hasRejections = results.some((r) => "decision" in r && r.decision === "reject");
      if (hasRejections) {
        const { settledContent, settledIds } = settleRejectedChanges(fileContent);
        if (settledIds.length > 0) {
          fileContent = settledContent;
          if (settlementInfo) {
            const existingSet = new Set(settlementInfo.settledIds);
            for (const id of settledIds) {
              if (!existingSet.has(id)) {
                settlementInfo.settledIds.push(id);
              }
            }
          } else {
            settlementInfo = { settledIds };
          }
        }
      }
    }
    if (settleFlag) {
      const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
      if (settledIds.length > 0) {
        fileContent = settledContent;
        if (settlementInfo) {
          const existingSet = new Set(settlementInfo.settledIds);
          for (const id of settledIds) {
            if (!existingSet.has(id)) {
              settlementInfo.settledIds.push(id);
            }
          }
        } else {
          settlementInfo = { settledIds };
        }
      }
      successes.push("Settled all accepted changes (Layer 1 compaction)");
    }
    let affectedLines;
    if (settlementInfo && settlementInfo.settledIds.length > 0) {
      const postLines = fileContent.split("\n");
      const settledIdSet = new Set(settlementInfo.settledIds);
      const footnoteStart = postLines.findIndex((l) => /^\[\^cn-/.test(l));
      const contentEnd = footnoteStart > 0 ? footnoteStart : postLines.length;
      let minLine = Infinity;
      let maxLine = -Infinity;
      for (let i = 0; i < contentEnd; i++) {
        const lineNum = i + 1;
        for (const id of settledIdSet) {
          if (postLines[i].includes(`[^${id}]`)) {
            if (lineNum < minLine)
              minLine = lineNum;
            if (lineNum > maxLine)
              maxLine = lineNum;
          }
        }
      }
      if (minLine !== Infinity && maxLine !== -Infinity) {
        if (config.hashline.enabled) {
          await initHashline();
        }
        try {
          affectedLines = computeAffectedLines(fileContent, minLine, maxLine, {
            hashlineEnabled: config.hashline.enabled
          });
        } catch {
          affectedLines = [];
        }
      }
    }
    if (fileContent !== originalContent) {
      await fs4.writeFile(filePath, fileContent, "utf-8");
      await rerecordState(state, filePath, fileContent, config);
    }
    const response = { file: path5.relative(projectDir, filePath) };
    if (results.length > 0) {
      response.results = results;
    }
    if (successes.length > 0) {
      response.successes = successes;
    }
    if (errors.length > 0) {
      response.errors = errors;
    }
    if (settlementInfo) {
      response.settled = settlementInfo.settledIds;
      response.settlement_note = `${settlementInfo.settledIds.length} change(s) settled to clean text. The file now contains clean prose where those changes were. Proposed changes remain as markup.`;
    }
    if (affectedLines && config.response?.affected_lines) {
      response.affected_lines = affectedLines;
    }
    const remaining = countFootnoteHeadersWithStatus(fileContent, "proposed");
    response.document_state = {
      remaining_proposed: remaining,
      all_resolved: remaining === 0
    };
    if (remaining === 0) {
      response.note = "All changes in this file are now resolved (accepted or rejected). No proposed changes remain.";
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response)
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/read-tracked-file.js
init_dist_esm();
import * as fs5 from "node:fs/promises";
import * as path6 from "node:path";
var DEFAULT_LIMIT = 500;
var MAX_LIMIT = 2e3;
var readTrackedFileTool = {
  name: "read_tracked_file",
  description: "Read a tracked file with deliberation-aware projection. Default view (review) shows inline metadata annotations at point of contact with a deliberation summary header. Use view=changes for committed text with P/A flags, view=settled for clean text, view=raw for literal file bytes.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-indexed, default: 1)"
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to return (default: 500, max: 2000). Use with offset for pagination."
      },
      view: {
        type: "string",
        enum: ["meta", "review", "all", "content", "raw", "full", "settled", "final", "committed", "changes", "simple"],
        description: "Primary views: review (default, agent-optimized with inline annotations), changes (committed text with P/A flags), settled (clean text with all changes applied), raw (literal file bytes). Aliases: meta=review, committed=changes, content=raw, all=review, simple=changes, final=settled."
      },
      include_meta: {
        type: "boolean",
        description: "If true, include change levels line and full tip. Default: false (compact)."
      },
      include_guide: {
        type: "boolean",
        description: "If true, include the editing guide regardless of whether it was already shown this session. Use when spawning subagents that need protocol context."
      }
    },
    required: ["file"]
  }
};
function formatLineNumberedContent(lines, startLine) {
  return lines.map((line, i) => {
    const n = startLine + i;
    const pad = n < 10 ? "  " : n < 100 ? " " : "";
    return `${pad}${n}| ${line}`;
  }).join("\n");
}
function formatChangeLevelsLine(content) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(content);
  const changes = doc.getChanges();
  if (changes.length === 0)
    return null;
  const parts = changes.map((c) => `${c.id}=${c.level}`);
  return `## change levels: ${parts.join(", ")}`;
}
function normalizeView(view) {
  switch (view) {
    case "review":
    case "all":
      return "meta";
    case "changes":
    case "simple":
      return "committed";
    case "final":
      return "settled";
    case "raw":
    case "full":
      return "content";
    default:
      return view;
  }
}
function toCanonicalView(internalView) {
  switch (internalView) {
    case "meta":
      return "review";
    case "committed":
      return "changes";
    case "settled":
      return "settled";
    case "content":
    case "full":
      return "raw";
    default:
      return "review";
  }
}
function maybeComposeGuide(state, config, explicit = false) {
  if (!explicit && state.isGuideSuppressed())
    return "";
  const mode = resolveProtocolMode(config.protocol.mode);
  if (!explicit && state.getGuideShownForMode() === mode)
    return "";
  state.setGuideShown(mode);
  return "\n\n" + composeGuide(config);
}
function computeEffectiveRange(offset, requestedLimit, totalLines) {
  const effectiveStart = Math.max(1, offset);
  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const effectiveEnd = Math.min(effectiveStart + limit - 1, totalLines);
  return { effectiveStart, effectiveEnd };
}
function buildTruncationMessage(effectiveStart, effectiveEnd, totalLines) {
  if (effectiveEnd >= totalLines)
    return null;
  return `

--- showing lines ${effectiveStart}-${effectiveEnd} of ${totalLines} | use offset/limit to paginate ---`;
}
function findSafePaginationEnd(lines, effectiveEnd) {
  let end = effectiveEnd;
  while (end < lines.length && lines[end]?.continuesChange) {
    end++;
  }
  return end;
}
function findSafePaginationEndFromText(contentLines, effectiveEnd, totalLines) {
  const continuations = computeContinuationLines(contentLines.join("\n"));
  let end = effectiveEnd;
  while (end < totalLines && continuations.has(end)) {
    end++;
  }
  return end;
}
async function handleReadTrackedFile(args, resolver, state) {
  try {
    await initHashline();
    const file = optionalStrArg(args, "file", "file");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    const offset = args.offset ?? 1;
    const requestedLimit = args.limit;
    const requestedView = optionalStrArg(args, "view", "view");
    const VALID_VIEWS = /* @__PURE__ */ new Set([
      "meta",
      "content",
      "full",
      "raw",
      "settled",
      "committed",
      "review",
      "changes",
      "all",
      "simple",
      "final"
    ]);
    if (requestedView !== void 0 && !VALID_VIEWS.has(requestedView)) {
      return errorResult(`Invalid view: '${requestedView}'. Valid views: review, changes, settled, raw (aliases: meta=review, committed=changes, content=raw, all=review, simple=changes, final=settled).`);
    }
    const includeMeta = args.include_meta === true;
    const includeGuide = args.include_guide === true;
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    const defaultView = normalizeView(config.policy.default_view ?? "review");
    const viewPolicy = config.policy.view_policy ?? "suggest";
    let effectiveView;
    if (requestedView === void 0) {
      effectiveView = defaultView;
    } else {
      effectiveView = normalizeView(requestedView);
      if (viewPolicy === "require" && effectiveView !== defaultView) {
        return errorResult(`This project requires view "${config.policy.default_view}" (view_policy = "require"). Requested view "${requestedView}" is not allowed. Change view_policy to "suggest" in .changedown/config.toml to allow view selection.`);
      }
    }
    let fileContent;
    try {
      fileContent = await fs5.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);
    const displayPath = path6.relative(projectDir, filePath);
    if (!config.hashline.enabled) {
      if (effectiveView === "committed") {
        return errorResult("Committed view requires hashline mode. Enable hashline in .changedown/config.toml: [hashline] enabled = true");
      }
      if (effectiveView === "meta") {
        const canonicalView2 = toCanonicalView(effectiveView);
        const protocolMode2 = resolveProtocolMode(config.protocol.mode);
        const doc2 = buildViewDocument(fileContent, canonicalView2, {
          filePath: displayPath,
          trackingStatus: trackingStatus.status,
          protocolMode: protocolMode2,
          defaultView: "review",
          viewPolicy: config.policy.view_policy ?? "suggest"
        });
        const sessionHashes2 = doc2.lines.map((l) => ({
          line: l.margin.lineNumber,
          raw: l.sessionHashes?.raw ?? l.margin.hash,
          settled: l.sessionHashes?.settled ?? l.margin.hash,
          committed: l.sessionHashes?.committed,
          settledView: l.sessionHashes?.settledView,
          rawLineNum: l.sessionHashes?.rawLineNum ?? l.rawLineNumber
        }));
        state.recordAfterRead(filePath, toCanonicalView(effectiveView), sessionHashes2, fileContent);
        const totalLines2 = doc2.lines.length;
        const { effectiveStart: effectiveStart2, effectiveEnd: effectiveEnd2 } = computeEffectiveRange(offset, requestedLimit, totalLines2);
        const adjustedEnd3 = findSafePaginationEnd(doc2.lines, effectiveEnd2);
        const paginatedDoc2 = {
          ...doc2,
          lines: doc2.lines.slice(effectiveStart2 - 1, adjustedEnd3),
          header: {
            ...doc2.header,
            lineRange: { start: effectiveStart2, end: adjustedEnd3, total: totalLines2 }
          }
        };
        const metaOutput = formatPlainText(paginatedDoc2);
        const guide3 = maybeComposeGuide(state, config, includeGuide);
        const content3 = [{ type: "text", text: metaOutput }];
        const truncation3 = buildTruncationMessage(effectiveStart2, adjustedEnd3, totalLines2);
        if (truncation3) {
          content3[content3.length - 1].text += truncation3;
        }
        if (guide3)
          content3.unshift({ type: "text", text: guide3 });
        return { content: content3 };
      }
      let header = formatTrackedHeader(displayPath, fileContent, trackingStatus.status);
      if (includeMeta) {
        const levelsLine = formatChangeLevelsLine(fileContent);
        if (levelsLine)
          header = header + "\n" + levelsLine;
      }
      header = header.replace(/## tracking: (tracked|untracked)/, `## policy: ${config.policy.mode} | tracking: $1`);
      let headerWithoutHashlineTip = header.replace(/## tip:.*/, "## tip: Hashline addressing is disabled. Edits use text matching; re-read for current content if propose_change fails.");
      const nonHashProtocolMode = resolveProtocolMode(config.protocol.mode);
      if (nonHashProtocolMode === "compact") {
        headerWithoutHashlineTip = headerWithoutHashlineTip.replace(/## tip:.*/, "## tip: Hashline addressing is disabled but compact mode requires it. Enable in .changedown/config.toml: [hashline] enabled = true");
      }
      const contentToShow = effectiveView === "settled" ? computeSettledText(fileContent) : fileContent;
      const allContentLines = contentToShow.split("\n");
      const totalContentLines = allContentLines.length;
      const { effectiveStart: effStart, effectiveEnd: effEnd } = computeEffectiveRange(offset, requestedLimit, totalContentLines);
      const adjustedEnd2 = findSafePaginationEndFromText(allContentLines, effEnd, totalContentLines);
      const slicedLines = allContentLines.slice(effStart - 1, adjustedEnd2);
      const lineNumbered = formatLineNumberedContent(slicedLines, effStart);
      const output2 = `${headerWithoutHashlineTip}

${lineNumbered}`;
      state.recordAfterRead(filePath, toCanonicalView(effectiveView), [], fileContent);
      const guide2 = maybeComposeGuide(state, config, includeGuide);
      const content2 = [{ type: "text", text: output2 }];
      const truncation2 = buildTruncationMessage(effStart, adjustedEnd2, totalContentLines);
      if (truncation2) {
        content2[content2.length - 1].text += truncation2;
      }
      if (guide2)
        content2.unshift({ type: "text", text: guide2 });
      return { content: content2 };
    }
    const canonicalView = toCanonicalView(effectiveView);
    const protocolMode = resolveProtocolMode(config.protocol.mode);
    const doc = buildViewDocument(fileContent, canonicalView, {
      filePath: displayPath,
      trackingStatus: trackingStatus.status,
      protocolMode,
      defaultView: "review",
      viewPolicy: config.policy.view_policy ?? "suggest"
    });
    const sessionHashes = doc.lines.map((l) => ({
      line: l.margin.lineNumber,
      raw: l.sessionHashes?.raw ?? l.margin.hash,
      settled: l.sessionHashes?.settled ?? l.margin.hash,
      committed: l.sessionHashes?.committed,
      settledView: l.sessionHashes?.settledView,
      rawLineNum: l.sessionHashes?.rawLineNum ?? l.rawLineNumber
    }));
    state.recordAfterRead(filePath, canonicalView, sessionHashes, fileContent);
    const totalLines = doc.lines.length;
    const { effectiveStart, effectiveEnd } = computeEffectiveRange(offset, requestedLimit, totalLines);
    const adjustedEnd = findSafePaginationEnd(doc.lines, effectiveEnd);
    const paginatedDoc = {
      ...doc,
      lines: doc.lines.slice(effectiveStart - 1, adjustedEnd),
      header: {
        ...doc.header,
        lineRange: { start: effectiveStart, end: adjustedEnd, total: totalLines }
      }
    };
    let output = formatPlainText(paginatedDoc);
    if (includeMeta) {
      const levelsLine = formatChangeLevelsLine(fileContent);
      if (levelsLine) {
        output = output.replace(/^---$/m, `${levelsLine}
---`);
      }
    }
    const guide = maybeComposeGuide(state, config, includeGuide);
    const content = [{ type: "text", text: output }];
    const truncation = buildTruncationMessage(effectiveStart, adjustedEnd, totalLines);
    if (truncation) {
      content[content.length - 1].text += truncation;
    }
    if (guide)
      content.unshift({ type: "text", text: guide });
    return { content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/amend-change.js
init_dist_esm();
import * as fs6 from "node:fs/promises";
var amendChangeTool = {
  name: "amend_change",
  description: "Revise your own proposed change. Same-author enforcement. Preserves change ID and adds revision history. new_text accepts the same escape normalization as propose_change.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      change_id: {
        type: "string",
        description: "The change ID to amend (e.g., 'cn-7' or 'cn-7.2')"
      },
      new_text: {
        type: "string",
        description: "The new proposed text. For substitutions: replaces the 'new' side (after ~>). For insertions: replaces the inserted text. For deletions: not applicable (amend reason only via reason param)."
      },
      old_text: {
        type: "string",
        description: "Optional. Expands the scope of a substitution by replacing the OLD side. Must contain the original old text as a substring."
      },
      reason: {
        type: "string",
        description: "Why this amendment is being made. Recorded as a 'revised:' entry in the footnote."
      },
      author: {
        type: "string",
        description: "Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer); must match the original change author. Required when this project has author enforcement."
      }
    },
    required: ["file", "change_id"]
  }
};
async function handleAmendChange(args, resolver, state) {
  try {
    const file = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const newText = strArg(args, "new_text", "newText");
    const oldText = optionalStrArg(args, "old_text", "oldText");
    const reasoning = optionalStrArg(args, "reason", "reason");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs6.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "amend_change");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const doc = parseForFormat(fileContent);
    const originalChange = doc.getChanges().find((c) => c.id === changeId);
    if (originalChange) {
      const originalAuthor = originalChange.metadata?.author?.replace(/^@/, "") ?? "";
      const normalizedAuthor = (author ?? "").replace(/^@/, "");
      if (originalAuthor && normalizedAuthor && originalAuthor !== normalizedAuthor) {
        return errorResult(`Cannot amend change "${changeId}": you (${normalizedAuthor}) are not the original author (${originalAuthor}). Use supersede_change to propose a replacement by a different author.`);
      }
    }
    const result = await computeSupersedeResult(fileContent, changeId, {
      newText,
      oldText,
      reason: reasoning,
      author
    });
    if (result.isError) {
      return errorResult(result.error);
    }
    await fs6.writeFile(filePath, result.text, "utf-8");
    await rerecordState(state, filePath, result.text, config);
    const responseData = {
      change_id: changeId,
      new_change_id: result.newChangeId,
      file: toRelativePath(projectDir, filePath),
      amended: true,
      new_text: newText
    };
    return {
      content: [{ type: "text", text: JSON.stringify(responseData) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/list-changes.js
init_dist_esm();
import * as fs7 from "node:fs/promises";
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/change-utils.js
init_dist_esm();
var TYPE_MAP = {
  [ChangeType.Insertion]: "ins",
  [ChangeType.Deletion]: "del",
  [ChangeType.Substitution]: "sub",
  [ChangeType.Highlight]: "highlight",
  [ChangeType.Comment]: "comment"
};
function offsetToLineNumber2(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n")
      line++;
  }
  return line;
}

// ../../packages/cli/dist/engine/handlers/list-changes.js
var listChangesTool = {
  name: "list_changes",
  description: "List tracked changes in a file with configurable detail levels. Returns change_id, type, status, author, line, preview. Filters by status. detail=context adds surrounding lines; detail=full adds threads and group info. Fetch specific changes via change_id/change_ids (replaces get_change).",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      status: {
        type: "string",
        enum: ["proposed", "accepted", "rejected"],
        description: "Filter changes by status. If omitted, all changes are returned."
      },
      detail: {
        type: "string",
        enum: ["summary", "context", "full"],
        description: "Detail level: 'summary' (default \u2014 lightweight metadata only), 'context' (adds surrounding lines and markup), 'full' (adds discussion threads, group info, revision history)."
      },
      context_lines: {
        type: "number",
        description: "Number of surrounding lines for context/full detail. Default: 3."
      },
      change_id: {
        type: "string",
        description: "Single change ID to fetch details for (e.g., 'cn-7'). Implies detail=full if not set."
      },
      change_ids: {
        type: "array",
        items: { type: "string" },
        description: "Batch of change IDs to fetch details for (e.g., ['cn-5', 'cn-7']). Implies detail=full if not set."
      }
    },
    required: ["file"]
  }
};
var MAX_PREVIEW_LENGTH = 80;
function buildPreview(change) {
  let preview = "";
  switch (change.type) {
    case ChangeType.Substitution:
      preview = `${change.originalText ?? ""}~>${change.modifiedText ?? ""}`;
      break;
    case ChangeType.Insertion:
      preview = change.modifiedText ?? "";
      break;
    case ChangeType.Deletion:
      preview = change.originalText ?? "";
      break;
    case ChangeType.Highlight:
      preview = change.originalText ?? change.modifiedText ?? "";
      break;
    case ChangeType.Comment:
      preview = change.originalText ?? change.modifiedText ?? "";
      break;
  }
  if (preview.length > MAX_PREVIEW_LENGTH) {
    preview = preview.slice(0, MAX_PREVIEW_LENGTH - 3) + "...";
  }
  return preview;
}
function buildContextEntry(change, fileContent, lines, summary, contextN) {
  const startLine = offsetToLineNumber2(fileContent, change.range.start);
  const endLine = offsetToLineNumber2(fileContent, change.range.end);
  const markup = fileContent.slice(change.range.start, change.range.end);
  const contextBefore = lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1);
  const contextAfter = lines.slice(endLine, Math.min(lines.length, endLine + contextN));
  return {
    ...summary,
    markup,
    original_text: change.type === ChangeType.Insertion ? null : change.originalText ?? null,
    modified_text: change.type === ChangeType.Deletion ? null : change.modifiedText ?? null,
    context_before: contextBefore,
    context_after: contextAfter
  };
}
function buildFullDetailEntry(change, fileContent, lines, doc, summary, contextN) {
  const ctx = buildContextEntry(change, fileContent, lines, summary, contextN);
  let footnoteAuthor = "";
  let footnoteDate = "";
  let reasoning = null;
  let discussionCount = 0;
  const approvals = [];
  const rejections = [];
  const requestChanges = [];
  const block = findFootnoteBlock(lines, change.id);
  if (block) {
    const header = parseFootnoteHeader(lines[block.headerLine]);
    if (header) {
      footnoteAuthor = header.author;
      footnoteDate = header.date;
    }
    const meta = change.metadata;
    if (meta?.discussion?.length) {
      discussionCount = meta.discussion.length;
      reasoning = meta.discussion[0].text ?? null;
    }
    meta?.approvals?.forEach((a) => approvals.push(a.author));
    meta?.rejections?.forEach((a) => rejections.push(a.author));
    meta?.requestChanges?.forEach((a) => requestChanges.push(a.author));
  }
  const participantsSet = /* @__PURE__ */ new Set();
  if (change.metadata?.author)
    participantsSet.add(change.metadata.author);
  change.metadata?.discussion?.forEach((d) => participantsSet.add(d.author));
  change.metadata?.approvals?.forEach((a) => participantsSet.add(a.author));
  change.metadata?.rejections?.forEach((a) => participantsSet.add(a.author));
  change.metadata?.requestChanges?.forEach((a) => participantsSet.add(a.author));
  const changeId = change.id;
  const dotIndex = changeId.lastIndexOf(".");
  let group = null;
  if (dotIndex > 0) {
    const parentId = changeId.slice(0, dotIndex);
    const parentBlock = findFootnoteBlock(lines, parentId);
    let description = null;
    if (parentBlock) {
      for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("reason:") || trimmed.startsWith("context:"))
          continue;
        if (trimmed && !trimmed.startsWith("approved:") && !trimmed.startsWith("rejected:") && !trimmed.startsWith("request-changes:")) {
          description = trimmed;
          break;
        }
      }
    }
    const siblings = doc.getChanges().filter((c) => (c.groupId === parentId || c.id.startsWith(parentId + ".")) && c.id !== parentId).map((c) => c.id);
    group = { parent_id: parentId, description, siblings };
  }
  return {
    ...ctx,
    footnote: {
      author: footnoteAuthor,
      date: footnoteDate,
      reasoning,
      discussion_count: discussionCount,
      approvals,
      rejections,
      request_changes: requestChanges
    },
    participants: [...participantsSet],
    group
  };
}
async function handleListChanges(args, resolver, _state) {
  try {
    const fileArg = args.file;
    const statusFilter = args.status;
    const changeIdArg = args.change_id;
    const changeIdsArg = args.change_ids;
    const hasIds = !!(changeIdArg || changeIdsArg);
    const detail = args.detail ?? (hasIds ? "full" : "summary");
    const contextLines = args.context_lines ?? 3;
    if (fileArg === void 0 || fileArg === "") {
      return errorResult('Missing required argument: "file".');
    }
    const filePath = resolver.resolveFilePath(fileArg);
    const { config, projectDir } = await resolver.forFile(filePath);
    try {
      const stat4 = await fs7.stat(filePath);
      if (!stat4.isFile()) {
        return errorResult(`Not a file: "${filePath}"`);
      }
    } catch {
      return errorResult(`File not found or unreadable: "${filePath}"`);
    }
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs7.readFile(filePath, "utf-8");
    } catch {
      return errorResult(`Could not read file: "${filePath}"`);
    }
    const doc = parseForFormat(fileContent);
    const allChanges = doc.getChanges();
    const lines = fileContent.split("\n");
    const contextN = Math.max(0, contextLines);
    if (hasIds) {
      const targetIds = /* @__PURE__ */ new Set();
      if (changeIdArg)
        targetIds.add(changeIdArg);
      if (changeIdsArg)
        changeIdsArg.forEach((id) => targetIds.add(id));
      const changeMap = /* @__PURE__ */ new Map();
      for (const c of allChanges) {
        if (targetIds.has(c.id))
          changeMap.set(c.id, c);
      }
      const results = [];
      for (const id of targetIds) {
        const change = changeMap.get(id);
        if (!change) {
          const settledBlock = findFootnoteBlock(lines, id);
          if (settledBlock) {
            const header = parseFootnoteHeader(settledBlock.headerContent);
            results.push({
              change_id: id,
              error: `Change settled (status: ${header?.status ?? "unknown"})`
            });
          } else {
            results.push({ change_id: id, error: "Change not found" });
          }
          continue;
        }
        const summary = buildSummaryEntry(change, fileContent, lines);
        results.push(buildDetailForLevel(detail, change, fileContent, lines, doc, summary, contextN));
      }
      const response2 = {
        file: toRelativePath(projectDir, filePath),
        total_count: allChanges.length,
        filtered_count: results.length,
        changes: results
      };
      return {
        content: [{ type: "text", text: JSON.stringify(response2) }]
      };
    }
    const entries = [];
    for (const change of allChanges) {
      const summary = buildSummaryEntry(change, fileContent, lines);
      entries.push(buildDetailForLevel(detail, change, fileContent, lines, doc, summary, contextN));
    }
    const totalCount = entries.length;
    const filtered = statusFilter ? entries.filter((s) => s.status === statusFilter) : entries;
    const response = {
      file: toRelativePath(projectDir, filePath),
      total_count: totalCount,
      filtered_count: filtered.length,
      changes: filtered
    };
    return {
      content: [{ type: "text", text: JSON.stringify(response) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}
function buildSummaryEntry(change, fileContent, lines) {
  const typeStr = TYPE_MAP[change.type];
  const lineNumber = offsetToLineNumber2(fileContent, change.range.start);
  let author = "";
  let status = change.status.toLowerCase();
  if (change.id) {
    const block = findFootnoteBlock(lines, change.id);
    if (block) {
      const header = parseFootnoteHeader(block.headerContent);
      if (header) {
        author = header.author;
        status = header.status;
      }
    }
  }
  return {
    change_id: change.id,
    type: typeStr,
    status,
    author,
    line: lineNumber,
    preview: buildPreview(change),
    level: change.level,
    anchored: change.anchored,
    ...change.consumedBy ? { consumed_by: change.consumedBy } : {}
  };
}
function buildDetailForLevel(detail, change, fileContent, lines, doc, summary, contextN) {
  switch (detail) {
    case "context":
      return buildContextEntry(change, fileContent, lines, summary, contextN);
    case "full":
      return buildFullDetailEntry(change, fileContent, lines, doc, summary, contextN);
    default:
      return summary;
  }
}

// ../../packages/cli/dist/engine/handlers/supersede-change.js
import * as fs8 from "node:fs/promises";
init_dist_esm();
var supersedeChangeTool = {
  name: "supersede_change",
  description: "Atomically reject an existing proposed change and propose a replacement. The old change is rejected and the new change's footnote includes a `supersedes: cn-N` link. Use this instead of separate reject + propose calls when replacing a change with a better version.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      change_id: {
        type: "string",
        description: "The change ID to supersede (e.g., 'cn-1'). Must be in proposed status."
      },
      old_text: {
        type: "string",
        description: "Text to replace in the (possibly settled) file. If the rejected change was settled (compacted), this targets the resulting clean text. If not settled, targets text in the current file."
      },
      new_text: {
        type: "string",
        description: "Replacement text for the new proposed change."
      },
      reason: {
        type: "string",
        description: "Why this change supersedes the old one."
      },
      insert_after: {
        type: "string",
        description: "For insertions (empty old_text): insert new text after this anchor text."
      },
      author: {
        type: "string",
        description: "Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement."
      }
    },
    required: ["file", "change_id", "old_text", "new_text"]
  }
};
async function handleSupersedeChange(args, resolver, state) {
  try {
    const file = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const oldText = strArg(args, "old_text", "oldText");
    const newText = strArg(args, "new_text", "newText");
    const reasoning = optionalStrArg(args, "reason", "reason");
    const insertAfter = optionalStrArg(args, "insert_after", "insertAfter");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (oldText === "" && newText === "") {
      return errorResult("Both old_text and new_text are empty \u2014 nothing to change.");
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs8.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "supersede_change");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const result = await computeSupersedeResult(fileContent, changeId, {
      newText,
      oldText,
      reason: reasoning,
      author,
      insertAfter: insertAfter ?? void 0
    });
    if (result.isError) {
      return errorResult(result.error);
    }
    fileContent = result.text;
    if (config.settlement.auto_on_reject) {
      const { settledContent } = settleRejectedChanges(fileContent);
      fileContent = settledContent;
    }
    await fs8.writeFile(filePath, fileContent, "utf-8");
    await rerecordState(state, filePath, fileContent, config);
    const relativePath = toRelativePath(projectDir, filePath);
    const footnoteCount = (fileContent.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = countFootnoteHeadersWithStatus(fileContent, "proposed");
    const acceptedCount = countFootnoteHeadersWithStatus(fileContent, "accepted");
    const rejectedCount = countFootnoteHeadersWithStatus(fileContent, "rejected");
    const changeType = oldText === "" ? "ins" : newText === "" ? "del" : "sub";
    const responseData = {
      old_change_id: changeId,
      new_change_id: result.newChangeId,
      file: relativePath,
      type: changeType,
      supersedes: changeId,
      document_state: {
        total_changes: footnoteCount,
        proposed: proposedCount,
        accepted: acceptedCount,
        rejected: rejectedCount
      }
    };
    return {
      content: [{ type: "text", text: JSON.stringify(responseData) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/resolve-thread.js
import * as fs9 from "node:fs/promises";
init_dist_esm();
var resolveThreadTool = {
  name: "resolve_thread",
  description: "Resolve or unresolve a change thread. Resolving marks the discussion as complete.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (absolute or relative to project root)"
      },
      change_id: {
        type: "string",
        description: "e.g., cn-7"
      },
      action: {
        type: "string",
        enum: ["resolve", "unresolve"],
        description: "Whether to resolve or unresolve the thread. Defaults to resolve."
      },
      author: {
        type: "string",
        description: "Who is resolving/unresolving. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement."
      }
    },
    required: ["file", "change_id"]
  }
};
function applyTextEdit(text, edit) {
  return text.slice(0, edit.offset) + edit.newText + text.slice(edit.offset + edit.length);
}
async function handleResolveThread(args, resolver, state) {
  try {
    const file = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const action = optionalStrArg(args, "action", "action") ?? "resolve";
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    const VALID_ACTIONS = ["resolve", "unresolve"];
    if (!VALID_ACTIONS.includes(action)) {
      return errorResult(`Invalid action: "${action}". Must be one of: resolve, unresolve`);
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs9.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "resolve_thread");
    if (authorError) {
      return errorResult(authorError.message);
    }
    let edit;
    if (action === "resolve") {
      edit = computeResolutionEdit(fileContent, changeId, { author });
    } else {
      edit = computeUnresolveEdit(fileContent, changeId);
    }
    if (!edit) {
      if (action === "resolve") {
        return errorResult(`Change "${changeId}" not found in file.`);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              change_id: changeId,
              action,
              success: false,
              reason: `No resolved line found for "${changeId}".`
            })
          }
        ]
      };
    }
    const updatedContent = applyTextEdit(fileContent, edit);
    await fs9.writeFile(filePath, updatedContent, "utf-8");
    await rerecordState(state, filePath, updatedContent, config);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            change_id: changeId,
            action,
            success: true
          })
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/listed-tools.js
function getListedTools(mode = "classic") {
  const proposeChange = mode === "compact" ? compactProposeChangeSchema : classicProposeChangeSchema;
  return [
    { name: readTrackedFileTool.name, description: readTrackedFileTool.description, inputSchema: readTrackedFileTool.inputSchema },
    { name: proposeChange.name, description: proposeChange.description, inputSchema: proposeChange.inputSchema },
    { name: reviewChangesTool.name, description: reviewChangesTool.description, inputSchema: reviewChangesTool.inputSchema },
    { name: amendChangeTool.name, description: amendChangeTool.description, inputSchema: amendChangeTool.inputSchema },
    { name: listChangesTool.name, description: listChangesTool.description, inputSchema: listChangesTool.inputSchema },
    { name: supersedeChangeTool.name, description: supersedeChangeTool.description, inputSchema: supersedeChangeTool.inputSchema },
    { name: resolveThreadTool.name, description: resolveThreadTool.description, inputSchema: resolveThreadTool.inputSchema }
  ];
}
var AUTHOR_REQUIRED_SUFFIX = " In this project author is required.";
function getListedToolsWithConfig(config, mode = "classic") {
  const tools = getListedTools(mode);
  const suffix = config.author?.enforcement === "required" ? AUTHOR_REQUIRED_SUFFIX : "";
  if (!suffix)
    return tools;
  return tools.map((t2) => {
    const schema = t2.inputSchema;
    if (!schema?.properties?.author?.description)
      return t2;
    const cloned = JSON.parse(JSON.stringify(t2.inputSchema));
    if (cloned.properties?.author?.description) {
      cloned.properties.author.description += suffix;
    }
    return { name: t2.name, description: t2.description, inputSchema: cloned };
  });
}

// ../../packages/cli/dist/engine/handlers/propose-change.js
init_dist_esm();
import * as fs11 from "node:fs/promises";
import * as path7 from "node:path";

// ../../packages/cli/dist/engine/handlers/hashline-relocate.js
init_dist_esm();
init_dist_esm();
function tryRelocate(ref, fileLines) {
  const result = relocateHashRef(ref, fileLines, computeLineHash);
  if (result && result.relocated) {
    return { newLine: result.newLine };
  }
  return null;
}
function validateOrRelocate(ref, fileLines, paramName, relocations) {
  try {
    validateLineRef(ref, fileLines);
    return ref.line;
  } catch (err) {
    const relocated = tryRelocate(ref, fileLines);
    if (relocated) {
      relocations.push({
        param: paramName,
        from: ref.line,
        to: relocated.newLine
      });
      return relocated.newLine;
    }
    if (err instanceof HashlineMismatchError) {
      throw err;
    }
    throw err;
  }
}
function validateOrAutoRemap(ref, fileLines, paramName, relocations, autoRemap) {
  try {
    validateLineRef(ref, fileLines);
    return { line: ref.line };
  } catch (err) {
    const relocated = tryRelocate(ref, fileLines);
    if (relocated) {
      relocations.push({ param: paramName, from: ref.line, to: relocated.newLine });
      if (autoRemap) {
        const actualHash = computeLineHash(relocated.newLine - 1, fileLines[relocated.newLine - 1], fileLines);
        return {
          line: relocated.newLine,
          remap: {
            line: relocated.newLine,
            originalRef: `${ref.line}:${ref.hash}`,
            correctedRef: `${relocated.newLine}:${actualHash}`,
            reason: "auto_corrected"
          }
        };
      }
      return { line: relocated.newLine };
    }
    if (err instanceof HashlineMismatchError) {
      const actualHash = ref.line >= 1 && ref.line <= fileLines.length ? computeLineHash(ref.line - 1, fileLines[ref.line - 1], fileLines) : "unknown";
      err.message = [
        `Hash mismatch on line ${ref.line}: expected ${actualHash}, got ${ref.hash}.`,
        "",
        "Coordinate resolution failed: line content not found in any view.",
        "",
        "The file has changed in a way that can't be automatically resolved.",
        "Call read_tracked_file to get current coordinates, then retry.",
        "For multiple edits, use propose_change with a changes array or propose_batch",
        "to apply all changes atomically against the same file state.",
        "",
        `  read_tracked_file(file: "<path>", view: "review")`,
        "",
        `Quick-fix: ${ref.line}:${ref.hash} \u2192 ${ref.line}:${actualHash}`
      ].join("\n");
      throw err;
    }
    throw err;
  }
}

// ../../packages/cli/dist/engine/handlers/propose-change.js
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/propose-batch.js
init_dist_esm();
import * as fs10 from "node:fs/promises";

// ../../packages/cli/dist/engine/handlers/resolve-and-apply.js
init_dist_esm();
init_file_ops2();
function resolveCoordinates(op, fileContent, fileLines, state, filePath, config) {
  const relocations = [];
  const remaps = [];
  const autoRemap = config.hashline.auto_remap ?? true;
  const parsed = parseAt(op.at);
  let startLine = parsed.startLine;
  let startHash = parsed.startHash;
  let endLine = parsed.endLine;
  let endHash = parsed.endHash;
  let viewResolved;
  const startResolution = state.resolveHash(filePath, startLine, startHash);
  if (startResolution?.match) {
    viewResolved = startResolution.view;
    const rawStart = startResolution.rawLineNum;
    if (rawStart < 1 || rawStart > fileLines.length) {
      throw new Error(`Line ${startLine} out of range after view translation (raw line ${rawStart}).`);
    }
    startLine = rawStart;
    startHash = computeLineHash(rawStart - 1, fileLines[rawStart - 1], fileLines);
  }
  if (parsed.startLine !== parsed.endLine) {
    const endResolution = state.resolveHash(filePath, endLine, endHash);
    if (endResolution?.match) {
      viewResolved = viewResolved ?? endResolution.view;
      const rawEnd = endResolution.rawLineNum;
      if (rawEnd < 1 || rawEnd > fileLines.length) {
        throw new Error(`End line ${endLine} out of range after view translation (raw line ${rawEnd}).`);
      }
      endLine = rawEnd;
      endHash = computeLineHash(rawEnd - 1, fileLines[rawEnd - 1], fileLines);
    }
  } else {
    endLine = startLine;
    endHash = startHash;
  }
  let stage3StartFailed = false;
  try {
    const startResult = validateOrAutoRemap({ line: startLine, hash: startHash }, fileLines, "start_line", relocations, autoRemap);
    startLine = startResult.line;
    if (startResult.remap)
      remaps.push(startResult.remap);
  } catch (stage3Err) {
    if (!(stage3Err instanceof HashlineMismatchError))
      throw stage3Err;
    stage3StartFailed = true;
  }
  let stage3EndFailed = false;
  if (parsed.startLine !== parsed.endLine) {
    try {
      const endResult = validateOrAutoRemap({ line: endLine, hash: endHash }, fileLines, "end_line", relocations, autoRemap);
      endLine = endResult.line;
      if (endResult.remap)
        remaps.push(endResult.remap);
    } catch (stage3Err) {
      if (!(stage3Err instanceof HashlineMismatchError))
        throw stage3Err;
      stage3EndFailed = true;
    }
  } else {
    endLine = startLine;
    stage3EndFailed = stage3StartFailed;
  }
  if (!stage3StartFailed && !stage3EndFailed && op.oldText !== "") {
    const rangeText = fileLines.slice(startLine - 1, endLine).join("\n");
    try {
      findUniqueMatch(rangeText, op.oldText, defaultNormalizer);
    } catch (confirmErr) {
      if (confirmErr instanceof Error && confirmErr.message.startsWith("Text not found")) {
        stage3StartFailed = true;
        stage3EndFailed = true;
      }
    }
  }
  if ((stage3StartFailed || stage3EndFailed) && op.oldText !== "") {
    try {
      const contentZone = contentZoneText(fileContent);
      const match = findUniqueMatch(contentZone, op.oldText, defaultNormalizer);
      const matchStartLine = offsetToLineNumber2(contentZone, match.index);
      const matchEndLine = offsetToLineNumber2(contentZone, match.index + match.length - 1);
      if (stage3StartFailed)
        startLine = matchStartLine;
      if (stage3EndFailed)
        endLine = matchEndLine;
      stage3StartFailed = false;
      stage3EndFailed = false;
    } catch {
    }
  }
  if (stage3StartFailed || stage3EndFailed) {
    const lastView = state.getLastReadView(filePath) ?? "raw";
    const useSettled = lastView === "settled";
    const viewResult = useSettled ? computeSettledView(fileContent) : computeCommittedView(fileContent);
    const viewLines = viewResult.lines;
    const viewToRaw = useSettled ? viewResult.settledToRaw : viewResult.committedToRaw;
    const getViewLineNum = (entry) => useSettled ? entry.settledLineNum : entry.committedLineNum;
    const findInView = (targetLine, targetHash) => {
      const exact = viewLines.find((l) => getViewLineNum(l) === targetLine && l.hash === targetHash);
      if (exact) {
        return viewToRaw.get(targetLine);
      }
      let uniqueMatch;
      let ambiguous = false;
      for (const entry of viewLines) {
        if (entry.hash === targetHash) {
          if (uniqueMatch) {
            ambiguous = true;
            break;
          }
          uniqueMatch = entry;
        }
      }
      if (uniqueMatch && !ambiguous) {
        const matchedViewLine = getViewLineNum(uniqueMatch);
        return viewToRaw.get(matchedViewLine);
      }
      return void 0;
    };
    if (stage3StartFailed) {
      const rawLine = findInView(parsed.startLine, parsed.startHash);
      if (rawLine !== void 0 && rawLine >= 1 && rawLine <= fileLines.length) {
        startLine = rawLine;
        startHash = computeLineHash(rawLine - 1, fileLines[rawLine - 1], fileLines);
        stage3StartFailed = false;
      }
    }
    if (stage3EndFailed && parsed.startLine !== parsed.endLine) {
      const rawLine = findInView(parsed.endLine, parsed.endHash);
      if (rawLine !== void 0 && rawLine >= 1 && rawLine <= fileLines.length) {
        endLine = rawLine;
        endHash = computeLineHash(rawLine - 1, fileLines[rawLine - 1], fileLines);
        stage3EndFailed = false;
      }
    } else if (stage3EndFailed) {
      endLine = startLine;
      endHash = startHash;
      stage3EndFailed = stage3StartFailed;
    }
    if (stage3StartFailed || stage3EndFailed) {
      const failedEndpoint = stage3StartFailed ? parsed.startLine : parsed.endLine;
      const failedHash = stage3StartFailed ? parsed.startHash : parsed.endHash;
      throw new HashlineMismatchError([{
        line: failedEndpoint,
        expected: failedHash,
        actual: failedEndpoint <= fileLines.length ? computeLineHash(failedEndpoint - 1, fileLines[failedEndpoint - 1], fileLines) : "out-of-range"
      }], fileLines);
    }
  }
  let startOffset = 0;
  for (let i = 0; i < startLine - 1; i++) {
    startOffset += fileLines[i].length + 1;
  }
  let endOffset = startOffset;
  for (let i = startLine - 1; i <= endLine - 1; i++) {
    endOffset += fileLines[i].length + (i < endLine - 1 ? 1 : 0);
  }
  const content = fileLines.slice(startLine - 1, endLine).join("\n");
  return {
    rawStartLine: startLine,
    rawEndLine: endLine,
    startOffset,
    endOffset,
    content,
    relocations,
    remaps,
    viewResolved,
    op
  };
}
function settleOnDemandForCompact(fileContent, rawStartLine, rawEndLine) {
  if (!/\{\+\+|\{--|\{~~/.test(fileContent)) {
    return { content: fileContent, settled: false };
  }
  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent, { skipCodeBlocks: false });
  const changes = doc.getChanges();
  const settleableChanges = changes.filter((c) => c.status === ChangeStatus.Accepted || c.status === ChangeStatus.Rejected);
  if (settleableChanges.length === 0) {
    return { content: fileContent, settled: false };
  }
  const lines = fileContent.split("\n");
  let targetStart = 0;
  for (let i = 0; i < rawStartLine - 1 && i < lines.length; i++) {
    targetStart += lines[i].length + 1;
  }
  let targetEnd = targetStart;
  for (let i = rawStartLine - 1; i < rawEndLine && i < lines.length; i++) {
    targetEnd += lines[i].length + 1;
  }
  const overlapsSettleable = settleableChanges.some((c) => c.range.start < targetEnd && c.range.end > targetStart);
  if (!overlapsSettleable) {
    return { content: fileContent, settled: false };
  }
  const { settledContent: afterAccepted } = settleAcceptedChangesOnly(fileContent);
  const { settledContent: afterRejected } = settleRejectedChangesOnly(afterAccepted);
  return { content: afterRejected, settled: true };
}
function applyCompactOp(resolved, op, fileContent, fileLines, changeId, author, config) {
  const { relocations, remaps, viewResolved } = resolved;
  const supersededIds = [];
  let rawStartLine = resolved.rawStartLine;
  let rawEndLine = resolved.rawEndLine;
  let resolvedAt;
  if (rawStartLine === rawEndLine) {
    resolvedAt = `${rawStartLine}:${computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines)}`;
  } else {
    const startH = computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines);
    const endH = computeLineHash(rawEndLine - 1, fileLines[rawEndLine - 1], fileLines);
    resolvedAt = `${rawStartLine}:${startH}-${rawEndLine}:${endH}`;
  }
  let settled = false;
  {
    const settleResult = settleOnDemandForCompact(fileContent, rawStartLine, rawEndLine);
    if (settleResult.settled) {
      fileContent = settleResult.content;
      fileLines = fileContent.split("\n");
      settled = true;
      const newStartHash = computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines);
      if (rawStartLine === rawEndLine) {
        resolvedAt = `${rawStartLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawEndLine - 1, fileLines[rawEndLine - 1], fileLines);
        resolvedAt = `${rawStartLine}:${newStartHash}-${rawEndLine}:${newEndHash}`;
      }
    }
  }
  let target = resolveAt(resolvedAt, fileLines);
  if (op.type !== "ins" && op.type !== "comment") {
    let overlapStart = target.startOffset;
    let overlapLength = target.endOffset - target.startOffset;
    if (op.oldText !== "") {
      const preMatch = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      overlapStart = target.startOffset + preMatch.index;
      overlapLength = preMatch.length;
    }
    const supersedeResult = resolveOverlapWithAuthor(fileContent, overlapStart, overlapLength, author);
    if (supersedeResult) {
      fileContent = supersedeResult.settledContent;
      fileLines = fileContent.split("\n");
      supersededIds.push(...supersedeResult.supersededIds);
      const rawCoords = parseAt(resolvedAt);
      rawStartLine = rawCoords.startLine;
      rawEndLine = rawCoords.endLine;
      const newStartHash = computeLineHash(rawCoords.startLine - 1, fileLines[rawCoords.startLine - 1], fileLines);
      if (rawCoords.startLine === rawCoords.endLine) {
        resolvedAt = `${rawCoords.startLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawCoords.endLine - 1, fileLines[rawCoords.endLine - 1], fileLines);
        resolvedAt = `${rawCoords.startLine}:${newStartHash}-${rawCoords.endLine}:${newEndHash}`;
      }
      target = resolveAt(resolvedAt, fileLines);
    }
  }
  const level = config.protocol.level;
  const ts = nowTimestamp();
  const authorAt = author.startsWith("@") ? author : `@${author}`;
  const l1Comment = (ct) => level === 1 ? `{>>${authorAt}|${ts.raw}|${ct}|proposed<<}` : "";
  let modifiedText;
  const changeType = op.type;
  if (op.type === "ins") {
    const inlineMarkup = level === 2 ? `{++${op.newText}++}[^${changeId}]` : `{++${op.newText}++}${l1Comment("ins")}`;
    const insertPos = fileLines.slice(0, target.endLine).join("\n").length;
    modifiedText = fileContent.slice(0, insertPos) + "\n" + inlineMarkup + fileContent.slice(insertPos);
  } else if (op.type === "del") {
    if (op.oldText === "") {
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{--${cleanedContent}--}[^${changeId}]${refTail}` : `{--${cleanedContent}--}${l1Comment("del")}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{--${cleanedOld}--}[^${changeId}]${refTail}` : `{--${cleanedOld}--}${l1Comment("del")}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (op.type === "sub") {
    if (op.oldText === "") {
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{~~${cleanedContent}~>${op.newText}~~}[^${changeId}]${refTail}` : `{~~${cleanedContent}~>${op.newText}~~}${l1Comment("sub")}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{~~${cleanedOld}~>${op.newText}~~}[^${changeId}]${refTail}` : `{~~${cleanedOld}~>${op.newText}~~}${l1Comment("sub")}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (op.type === "comment") {
    const commentText = op.reasoning ?? "";
    const inlineMarkup = level === 2 ? `{>>${commentText}<<}[^${changeId}]` : `{>>${commentText}<<}${l1Comment("comment")}`;
    modifiedText = fileContent.slice(0, target.endOffset) + inlineMarkup + fileContent.slice(target.endOffset);
  } else {
    if (op.oldText === "") {
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{==${cleanedContent}==}[^${changeId}]${refTail}` : `{==${cleanedContent}==}${l1Comment("highlight")}${refTail}`;
      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      const match = findUniqueMatch(contentZoneText(target.content), op.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join("");
      const inlineMarkup = level === 2 ? `{==${cleanedOld}==}[^${changeId}]${refTail}` : `{==${cleanedOld}==}${l1Comment("highlight")}${refTail}`;
      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  }
  if (level === 2) {
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    const reasonLine = op.reasoning && changeType !== "comment" ? `
    ${authorAt} ${ts.raw}: ${op.reasoning}` : "";
    const footnoteBlock = footnoteHeader + reasonLine;
    modifiedText = appendFootnote(modifiedText, footnoteBlock);
  }
  return {
    modifiedText,
    changeType,
    supersededIds,
    affectedStartLine: rawStartLine,
    affectedEndLine: rawEndLine,
    relocations,
    remaps,
    viewResolved,
    settled
  };
}
function resolveAndApply(op, fileContent, fileLines, state, filePath, config, changeId, author) {
  const resolved = resolveCoordinates(op, fileContent, fileLines, state, filePath, config);
  return applyCompactOp(resolved, op, fileContent, fileLines, changeId, author, config);
}

// ../../packages/cli/dist/engine/handlers/propose-batch.js
init_file_ops2();
init_dist_esm();
function errorResult2(message, details) {
  const content = [{ type: "text", text: message }];
  if (details) {
    content.push({ type: "text", text: JSON.stringify({ error: { message, ...details } }) });
  }
  return { content, isError: true };
}
function hasHashlineParams(op) {
  return op.start_line !== void 0 || op.start_hash !== void 0 || op.after_line !== void 0 || op.after_hash !== void 0;
}
function bodyLineCount(text) {
  const lines = text.split("\n");
  let bodyEnd = findFootnoteBlockStart(lines);
  while (bodyEnd > 0 && lines[bodyEnd - 1].trim() === "")
    bodyEnd--;
  return bodyEnd;
}
async function handleProposeBatch(args, resolver, state) {
  try {
    const file = args.file;
    const reasoning = args.reason;
    let changesRaw = args.changes;
    if (!file) {
      return errorResult2('Missing required argument: "file"');
    }
    if (typeof changesRaw === "string") {
      try {
        const parsed = JSON.parse(changesRaw);
        if (Array.isArray(parsed)) {
          changesRaw = parsed;
        } else {
          return errorResult2(`The "changes" parameter was received as a JSON string but parsed to ${typeof parsed}, not an array. Send changes as a JSON array of objects.`);
        }
      } catch {
        return errorResult2('The "changes" parameter was received as a string but could not be parsed as JSON. Send changes as a JSON array of objects.');
      }
    }
    if (!Array.isArray(changesRaw) || changesRaw.length === 0) {
      return errorResult2("changes must be a non-empty array.");
    }
    const MAX_BATCH_SIZE = 100;
    if (changesRaw.length > MAX_BATCH_SIZE) {
      return errorResult2(`Batch too large: ${changesRaw.length} changes exceeds maximum of ${MAX_BATCH_SIZE}. Split into smaller batches.`);
    }
    for (let i = 0; i < changesRaw.length; i++) {
      const elem = changesRaw[i];
      if (elem === null || elem === void 0 || typeof elem !== "object" || Array.isArray(elem)) {
        return errorResult2(`changes[${i}] must be an object, got ${elem === null ? "null" : Array.isArray(elem) ? "array" : typeof elem}.`);
      }
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    const relativePath = toRelativePath(projectDir, filePath);
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);
    if (trackingStatus.status !== "tracked") {
      return errorResult2(`File is not tracked for propose_batch: "${filePath}".`, { file: relativePath, tracking_status: trackingStatus });
    }
    if (state.hasActiveGroup()) {
      return errorResult2("End your current change group before calling propose_batch.");
    }
    let fileContent;
    try {
      fileContent = await fs10.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult2(`File not found or unreadable: ${msg}`, { file: relativePath });
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "propose_batch");
    if (authorError) {
      return errorResult2(authorError.message);
    }
    let headerLineDelta = 0;
    if (config.tracking.auto_header) {
      if (!parseTrackingHeader(fileContent)) {
        const linesBefore = fileContent.split("\n").length;
        const { newText: headerText, headerInserted } = insertTrackingHeader(fileContent);
        if (headerInserted) {
          fileContent = headerText;
          headerLineDelta = fileContent.split("\n").length - linesBefore;
        }
      }
    }
    const protocolMode = resolveProtocolMode(config.protocol?.mode ?? "classic");
    const hasCompactOpsInBatch = changesRaw.some((op) => typeof op.at === "string" || typeof op.op === "string");
    if (protocolMode === "classic" && hasCompactOpsInBatch) {
      return errorResult2('Protocol mode is "classic" but batch contains compact params (at/op). Use old_text/new_text instead, or set protocol.mode = "compact" in config.');
    }
    if (protocolMode === "compact" && !hasCompactOpsInBatch) {
      const hasClassicOpsInBatch = changesRaw.some((op) => typeof op.old_text === "string" && op.old_text !== "" || typeof op.new_text === "string" && op.new_text !== "");
      if (hasClassicOpsInBatch) {
        return errorResult2('Protocol mode is "compact" but batch contains classic params (old_text/new_text). Use at/op instead, or set protocol.mode = "classic" in config.');
      }
    }
    const partial = args.atomic !== true;
    const validationFailures = [];
    const fileLines = fileContent.split("\n");
    const relocations = [];
    const remaps = [];
    const autoRemap = config.hashline.auto_remap ?? true;
    const hasHashlineInBatch = changesRaw.some((op) => hasHashlineParams(op));
    if (hasHashlineInBatch && !config.hashline.enabled) {
      return errorResult2("Hashline addressing in batch requires [hashline] enabled = true in .changedown/config.toml", { file: relativePath });
    }
    if (hasHashlineInBatch) {
      await initHashline();
    }
    if (hasCompactOpsInBatch) {
      await initHashline();
    }
    const resolvedOps = [];
    const compactResolvedMap = /* @__PURE__ */ new Map();
    const batchPositions = [];
    class OpValidationError extends Error {
      constructor(message) {
        super(message);
      }
    }
    const skippedIndices = /* @__PURE__ */ new Set();
    for (let i = 0; i < changesRaw.length; i++) {
      try {
        const op = changesRaw[i];
        if (protocolMode === "compact" && (typeof op.at === "string" || typeof op.op === "string")) {
          if (!op.at || !op.op) {
            throw new OpValidationError(`Operation ${i}: compact mode requires both "at" and "op".`);
          }
          let parsedOp;
          try {
            parsedOp = parseOp(op.op);
          } catch (err) {
            throw new OpValidationError(`Operation ${i}: ${err instanceof Error ? err.message : String(err)}`);
          }
          const opReasoning2 = parsedOp.reasoning ?? op.reason;
          let adjustedAt = op.at;
          if (headerLineDelta > 0) {
            const atParsed = parseAt(adjustedAt);
            if (atParsed.startLine === atParsed.endLine) {
              adjustedAt = `${atParsed.startLine + headerLineDelta}:${atParsed.startHash}`;
            } else {
              adjustedAt = `${atParsed.startLine + headerLineDelta}:${atParsed.startHash}-${atParsed.endLine + headerLineDelta}:${atParsed.endHash}`;
            }
          }
          const compactOp = {
            at: adjustedAt,
            type: parsedOp.type,
            oldText: parsedOp.oldText,
            newText: parsedOp.newText,
            reasoning: opReasoning2
          };
          let resolved2;
          try {
            resolved2 = resolveCoordinates(compactOp, fileContent, fileLines, state, filePath, config);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OpValidationError(`Operation ${i}: ${message}`);
          }
          relocations.push(...resolved2.relocations);
          remaps.push(...resolved2.remaps);
          compactResolvedMap.set(i, { resolved: resolved2, compactOp });
          resolvedOps.push({
            oldText: parsedOp.oldText,
            newText: parsedOp.newText,
            reason: opReasoning2,
            startLine: resolved2.rawStartLine,
            endLine: resolved2.rawEndLine
          });
          if (parsedOp.type !== "ins") {
            batchPositions.push({
              index: i,
              startOffset: resolved2.startOffset,
              endOffset: resolved2.endOffset
            });
          }
          continue;
        }
        const oldText = strArg(op, "old_text", "oldText");
        const newText = strArg(op, "new_text", "newText");
        const opReasoning = op.reason;
        const insertAfter = optionalStrArg(op, "insert_after", "insertAfter");
        if (oldText === "" && newText === "") {
          throw new OpValidationError(`Operation ${i}: both old_text and new_text are empty.`);
        }
        const resolved = { oldText, newText, reason: opReasoning, insertAfter };
        if (hasHashlineParams(op)) {
          let afterLine = op.after_line;
          const afterHash = op.after_hash;
          let startLine = op.start_line;
          const startHash = op.start_hash;
          let endLine = op.end_line;
          const endHash = op.end_hash;
          if (headerLineDelta > 0) {
            if (afterLine !== void 0)
              afterLine += headerLineDelta;
            if (startLine !== void 0)
              startLine += headerLineDelta;
            if (endLine !== void 0)
              endLine += headerLineDelta;
          }
          if (afterLine !== void 0 && afterHash !== void 0) {
            try {
              const afterResult = validateOrAutoRemap({ line: afterLine, hash: afterHash }, fileLines, "after_line", relocations, autoRemap);
              resolved.afterLine = afterResult.line;
              if (afterResult.remap)
                remaps.push(afterResult.remap);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              throw new OpValidationError(message);
            }
          }
          if (startLine !== void 0 && startHash !== void 0) {
            try {
              const startResult = validateOrAutoRemap({ line: startLine, hash: startHash }, fileLines, "start_line", relocations, autoRemap);
              resolved.startLine = startResult.line;
              if (startResult.remap)
                remaps.push(startResult.remap);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              throw new OpValidationError(message);
            }
            resolved.endLine = endLine ?? resolved.startLine;
            if (resolved.endLine !== resolved.startLine && endHash !== void 0) {
              try {
                const endResult = validateOrAutoRemap({ line: resolved.endLine, hash: endHash }, fileLines, "end_line", relocations, autoRemap);
                resolved.endLine = endResult.line;
                if (endResult.remap)
                  remaps.push(endResult.remap);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new OpValidationError(message);
              }
            }
            if (oldText !== "") {
              try {
                const rangeResult = extractLineRange(fileLines, resolved.startLine, resolved.endLine);
                const match = findUniqueMatch(rangeResult.content, oldText, defaultNormalizer);
                batchPositions.push({
                  index: i,
                  startOffset: rangeResult.startOffset + match.index,
                  endOffset: rangeResult.startOffset + match.index + match.length
                });
              } catch (err) {
                console.error(`[changedown] overlap detection: match failed, deferring to apply phase: ${err}`);
              }
            } else {
              const rangeResult = extractLineRange(fileLines, resolved.startLine, resolved.endLine);
              batchPositions.push({
                index: i,
                startOffset: rangeResult.startOffset,
                endOffset: rangeResult.endOffset
              });
            }
          }
        } else if (oldText !== "") {
          try {
            const match = findUniqueMatch(fileContent, oldText, defaultNormalizer);
            batchPositions.push({
              index: i,
              startOffset: match.index,
              endOffset: match.index + match.length
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OpValidationError(message);
          }
        }
        resolvedOps.push(resolved);
      } catch (validationErr) {
        if (partial && validationErr instanceof OpValidationError) {
          const msg = validationErr.message;
          validationFailures.push({ index: i, reason: msg });
          skippedIndices.add(i);
          resolvedOps.push({ oldText: "", newText: "", reason: void 0 });
          continue;
        }
        if (validationErr instanceof OpValidationError) {
          return errorResult2(validationErr.message, {
            operation_index: i,
            total_operations: changesRaw.length
          });
        }
        throw validationErr;
      }
    }
    const activeBatchPositions = partial ? batchPositions.filter((p) => !skippedIndices.has(p.index)) : batchPositions;
    if (activeBatchPositions.length >= 2) {
      const sorted = [...activeBatchPositions].sort((a, b) => a.startOffset !== b.startOffset ? a.startOffset - b.startOffset : a.endOffset - b.endOffset);
      for (let j = 0; j < sorted.length - 1; j++) {
        const curr = sorted[j];
        const next = sorted[j + 1];
        if (curr.endOffset > next.startOffset) {
          return errorResult2(`Batch changes overlap: operation ${curr.index} (offsets ${curr.startOffset}-${curr.endOffset}) and operation ${next.index} (offsets ${next.startOffset}-${next.endOffset}) target overlapping text. Split into separate propose_change calls or adjust old_text to non-overlapping regions.`, {
            overlapping_operations: [curr.index, next.index],
            total_operations: changesRaw.length
          });
        }
      }
    }
    if (partial && skippedIndices.size === changesRaw.length) {
      return errorResult2("All operations failed in partial batch.", {
        failed: validationFailures,
        total_operations: changesRaw.length
      });
    }
    const knownMaxId = scanMaxCnId(fileContent);
    const groupId = state.beginGroup(reasoning ?? "propose_batch", reasoning, knownMaxId);
    let currentText = fileContent;
    let cumulativeDelta = 0;
    const results = [];
    const applicationFailures = [];
    const sortedOps = resolvedOps.map((op, originalIndex) => ({ op, originalIndex })).sort((a, b) => {
      const lineA = a.op.startLine ?? a.op.afterLine ?? 0;
      const lineB = b.op.startLine ?? b.op.afterLine ?? 0;
      return lineA - lineB;
    });
    for (let i = 0; i < sortedOps.length; i++) {
      const { op, originalIndex } = sortedOps[i];
      if (skippedIndices.has(originalIndex)) {
        continue;
      }
      try {
        const changeId = state.getNextId(filePath, currentText);
        const delta = cumulativeDelta;
        const compactEntry = compactResolvedMap.get(originalIndex);
        if (compactEntry) {
          const adjustedResolved = {
            ...compactEntry.resolved,
            rawStartLine: compactEntry.resolved.rawStartLine + delta,
            rawEndLine: compactEntry.resolved.rawEndLine + delta
          };
          const currentLines = currentText.split("\n");
          const applied = applyCompactOp(adjustedResolved, compactEntry.compactOp, currentText, currentLines, changeId, author, config);
          const linesAfter = bodyLineCount(applied.modifiedText);
          const linesBeforeBody = bodyLineCount(currentText);
          cumulativeDelta += linesAfter - linesBeforeBody;
          currentText = applied.modifiedText;
          results.push({
            change_id: changeId,
            type: applied.changeType,
            index: originalIndex,
            startLine: applied.affectedStartLine,
            endLine: applied.affectedEndLine
          });
        } else {
          const adjAfter = op.afterLine !== void 0 ? op.afterLine + delta : void 0;
          const adjStart = op.startLine !== void 0 ? op.startLine + delta : void 0;
          const adjEnd = op.endLine !== void 0 ? op.endLine + delta : void 0;
          if ((op.afterLine !== void 0 || op.startLine !== void 0) && adjStart === void 0 && adjAfter === void 0) {
            throw new Error(`Operation ${originalIndex}: hashline params require after_line or start_line.`);
          }
          const applied = await applySingleOperation({
            fileContent: currentText,
            oldText: op.oldText,
            newText: op.newText,
            changeId,
            author,
            reasoning: op.reason,
            insertAfter: op.insertAfter,
            afterLine: adjAfter,
            startLine: adjStart,
            endLine: adjEnd
          });
          const linesAfter = bodyLineCount(applied.modifiedText);
          const linesBeforeBody = bodyLineCount(currentText);
          cumulativeDelta += linesAfter - linesBeforeBody;
          currentText = applied.modifiedText;
          results.push({
            change_id: changeId,
            type: applied.changeType,
            index: originalIndex,
            startLine: applied.affectedStartLine,
            endLine: applied.affectedEndLine
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!partial) {
          state.endGroup();
          return errorResult2(`Operation ${originalIndex}: ${msg}`, { phase: "application", operation_index: originalIndex, total_operations: changesRaw.length });
        }
        applicationFailures.push({ index: originalIndex, reason: msg });
      }
    }
    const allFailures = [...validationFailures, ...applicationFailures];
    if (partial && results.length === 0) {
      state.endGroup();
      return errorResult2("All operations failed in partial batch.", {
        failed: allFailures,
        total_operations: changesRaw.length
      });
    }
    const groupInfo = state.endGroup();
    results.sort((a, b) => a.index - b.index);
    const footnoteHeader = generateFootnoteDefinition(groupInfo.id, "group", author);
    const ts = nowTimestamp();
    const reasonLine = groupInfo.reasoning ?? groupInfo.description ? `
    @${author} ${ts.raw}: ${groupInfo.reasoning ?? groupInfo.description}` : "";
    const groupFootnoteBlock = footnoteHeader + reasonLine;
    currentText = appendFootnote(currentText, groupFootnoteBlock);
    await fs10.writeFile(filePath, currentText, "utf-8");
    await rerecordState(state, filePath, currentText, config);
    await initHashline();
    const affectedLineSet = /* @__PURE__ */ new Set();
    for (const r of results) {
      if (r.startLine && r.endLine) {
        for (let l = r.startLine; l <= r.endLine; l++)
          affectedLineSet.add(l);
      }
    }
    let affectedLinesResult;
    if (affectedLineSet.size > 0) {
      const sortedLines = [...affectedLineSet].sort((a, b) => a - b);
      affectedLinesResult = computeAffectedLines(currentText, sortedLines[0], sortedLines[sortedLines.length - 1], {
        hashlineEnabled: config.hashline.enabled,
        contextLines: 1
      });
    } else {
      const modLines = currentText.split("\n");
      let matchLine = 1;
      for (let i = 0; i < modLines.length; i++) {
        if (/\{\+\+|\{--|\{~~|\{==/.test(modLines[i])) {
          matchLine = i + 1;
          break;
        }
      }
      const fallbackStart = Math.max(1, matchLine - 2);
      const fallbackEnd = Math.min(modLines.length, matchLine + 5);
      affectedLinesResult = computeAffectedLines(currentText, fallbackStart, fallbackEnd, {
        hashlineEnabled: config.hashline.enabled
      });
    }
    const modifiedLines = currentText.split("\n");
    for (const r of results) {
      if (r.startLine) {
        r.preview = modifiedLines[r.startLine - 1] ?? "";
      }
    }
    const footnoteCount = (currentText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (currentText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (currentText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = currentText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
    const uniqueAuthors = new Set(authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean));
    const responseData = {
      group_id: groupId,
      file: relativePath,
      reasoning: reasoning ?? void 0,
      applied: results,
      failed: allFailures,
      ...config.response?.affected_lines ? { affected_lines: affectedLinesResult } : {},
      document_state: {
        total_changes: footnoteCount,
        proposed: proposedCount,
        accepted: acceptedCount,
        authors: uniqueAuthors.size
      }
    };
    if (relocations.length > 0) {
      responseData.relocated = relocations;
    }
    if (remaps.length > 0) {
      responseData.remaps = remaps;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(responseData) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult2(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/propose-change.js
init_file_ops2();
init_dist_esm();
function checkReasoningRequired(author, reasoning, config, compact2) {
  const participantType = reviewerType(author);
  if (!config.reasoning?.propose?.[participantType])
    return null;
  if (reasoning)
    return null;
  const hint = compact2 ? "Append {>>reason to your op string, or include a reason parameter in your propose_change call." : "Include a reason parameter in your propose_change call.";
  return errorResult3(`This project requires reasoning on proposals. ${hint}`, "REASONING_REQUIRED");
}
function hasHashlineParams2(args) {
  return args.start_line !== void 0 || args.start_hash !== void 0 || args.after_line !== void 0 || args.after_hash !== void 0;
}
function hasCommittedHashes(filePath, state) {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0)
    return false;
  return recorded.some((entry) => entry.committed !== void 0);
}
function hasSettledHashes(filePath, state) {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0)
    return false;
  return recorded.some((entry) => entry.settledView !== void 0);
}
function checkStaleness(fileContent, filePath, state) {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0)
    return void 0;
  const lines = fileContent.split("\n");
  if (hasCommittedHashes(filePath, state)) {
    for (const entry of recorded) {
      const rawLine = entry.rawLineNum ?? entry.line;
      if (rawLine < 1 || rawLine > lines.length) {
        return "File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file view=committed for current hashes.";
      }
      const currentHash = computeLineHash(rawLine - 1, lines[rawLine - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: raw line ${rawLine} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file view=committed for current hashes.`;
      }
    }
  } else if (hasSettledHashes(filePath, state)) {
    for (const entry of recorded) {
      const rawLine = entry.rawLineNum ?? entry.line;
      if (rawLine < 1 || rawLine > lines.length) {
        return "File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file view=settled for current hashes.";
      }
      const currentHash = computeLineHash(rawLine - 1, lines[rawLine - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: raw line ${rawLine} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file view=settled for current hashes.`;
      }
    }
  } else {
    for (const entry of recorded) {
      if (entry.line < 1 || entry.line > lines.length) {
        return "File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file for current hashes.";
      }
      const currentHash = computeLineHash(entry.line - 1, lines[entry.line - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: line ${entry.line} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file for current hashes.`;
      }
    }
  }
  return void 0;
}
function classifyHashlineValidationError(message) {
  if (message.includes("Line ") && message.includes(" is out of range")) {
    return "HASHLINE_LINE_OUT_OF_RANGE";
  }
  return "HASHLINE_REFERENCE_UNRESOLVED";
}
function buildQuickFix(file, staleLine, currentHash) {
  const quickFix = {
    action: "re_read",
    file
  };
  if (staleLine !== void 0) {
    quickFix.stale_line = staleLine;
  }
  if (currentHash !== void 0) {
    quickFix.current_hash = currentHash;
  }
  return quickFix;
}
function extractQuickFixFromError(err, fallbackLine) {
  if (err instanceof HashlineMismatchError && err.mismatches.length > 0) {
    return {
      staleLine: err.mismatches[0].line,
      currentHash: err.mismatches[0].actual
    };
  }
  if (err instanceof Error) {
    const msg = err.message;
    const hashMatch = msg.match(/at line (\d+):.*current hash is (\w+)/);
    if (hashMatch) {
      return {
        staleLine: Number(hashMatch[1]),
        currentHash: hashMatch[2]
      };
    }
    const rangeMatch = msg.match(/Line (\d+).*out of range/);
    if (rangeMatch) {
      return { staleLine: Number(rangeMatch[1]) };
    }
  }
  return { staleLine: fallbackLine };
}
function settleOnDemandIfNeeded(fileContent, oldText) {
  if (!oldText || !/\{\+\+|\{--|\{~~|\{==|\{>>/.test(fileContent)) {
    return { content: fileContent, settled: false };
  }
  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent, { skipCodeBlocks: false });
  const changes = doc.getChanges();
  const settleableChanges = changes.filter((c) => c.status === ChangeStatus.Accepted || c.status === ChangeStatus.Rejected);
  if (settleableChanges.length === 0) {
    return { content: fileContent, settled: false };
  }
  let match;
  try {
    match = findUniqueMatch(contentZoneText(fileContent), oldText, defaultNormalizer);
  } catch {
    return { content: fileContent, settled: false };
  }
  const matchStart = match.index;
  const matchEnd = match.index + match.length;
  const overlapsSettleable = settleableChanges.some((c) => c.range.start < matchEnd && c.range.end > matchStart);
  if (!overlapsSettleable) {
    return { content: fileContent, settled: false };
  }
  const { settledContent: afterAccepted } = settleAcceptedChangesOnly(fileContent);
  const { settledContent: afterRejected } = settleRejectedChangesOnly(afterAccepted);
  return { content: afterRejected, settled: true };
}
async function handleProposeChange(args, resolver, state) {
  try {
    let changesArray;
    if (Array.isArray(args.changes)) {
      changesArray = args.changes;
    } else if (typeof args.changes === "string") {
      try {
        const parsed = JSON.parse(args.changes);
        if (Array.isArray(parsed)) {
          changesArray = parsed;
        } else {
          return errorResult3(`The "changes" parameter was received as a JSON string but parsed to ${typeof parsed}, not an array. Send changes as a JSON array of objects, e.g.: changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]`, "VALIDATION_ERROR");
        }
      } catch {
        return errorResult3('The "changes" parameter was received as a string but could not be parsed as JSON. Send changes as a JSON array of objects, e.g.: changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]', "VALIDATION_ERROR");
      }
    } else if (args.changes !== void 0) {
      return errorResult3(`The "changes" parameter must be an array of objects, got ${typeof args.changes}. Send changes as a JSON array, e.g.: changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]`, "VALIDATION_ERROR");
    }
    const rawMode = args.raw === true;
    if (rawMode) {
      const file2 = args.file;
      if (!file2) {
        return errorResult3('Missing required argument: "file"', "MISSING_ARGUMENT");
      }
      const filePath2 = resolver.resolveFilePath(file2);
      const { config: config2 } = await resolver.forFile(filePath2);
      const policyMode = config2.policy?.mode ?? "safety-net";
      if (policyMode === "strict") {
        return errorResult3("Raw edit denied: project policy is strict. Raw edits bypass CriticMarkup tracking and are not allowed in strict mode.", "VALIDATION_ERROR");
      }
    }
    if (changesArray) {
      if (changesArray.length === 0) {
        return errorResult3("No changes provided: changes array is empty.", "VALIDATION_ERROR");
      }
      for (let i = 0; i < changesArray.length; i++) {
        const elem = changesArray[i];
        if (elem === null || elem === void 0 || typeof elem !== "object" || Array.isArray(elem)) {
          return errorResult3(`changes[${i}] must be an object, got ${elem === null ? "null" : Array.isArray(elem) ? "array" : typeof elem}.`, "VALIDATION_ERROR");
        }
      }
      const file2 = args.file;
      if (!file2) {
        return errorResult3('Missing required argument: "file"', "MISSING_ARGUMENT");
      }
      if (rawMode) {
        return handleRawChanges(changesArray, file2, resolver, state);
      }
      if (changesArray.length === 1) {
        const change = changesArray[0];
        const singleArgs = {
          file: args.file,
          author: args.author,
          // Per-change reason takes precedence over batch-level reason
          reason: change.reason ?? args.reason,
          level: args.level
        };
        if (change.old_text !== void 0)
          singleArgs.old_text = change.old_text;
        if (change.new_text !== void 0)
          singleArgs.new_text = change.new_text;
        if (change.insert_after !== void 0)
          singleArgs.insert_after = change.insert_after;
        if (change.after_text !== void 0)
          singleArgs.insert_after = change.after_text;
        if (change.at !== void 0)
          singleArgs.at = change.at;
        if (change.op !== void 0)
          singleArgs.op = change.op;
        if (change.start_line !== void 0)
          singleArgs.start_line = change.start_line;
        if (change.start_hash !== void 0)
          singleArgs.start_hash = change.start_hash;
        if (change.end_line !== void 0)
          singleArgs.end_line = change.end_line;
        if (change.end_hash !== void 0)
          singleArgs.end_hash = change.end_hash;
        if (change.after_line !== void 0)
          singleArgs.after_line = change.after_line;
        if (change.after_hash !== void 0)
          singleArgs.after_hash = change.after_hash;
        return handleProposeChange(singleArgs, resolver, state);
      }
      const batchArgs = {
        file: args.file,
        reason: args.reason,
        author: args.author,
        changes: changesArray
      };
      const batchResult = await handleProposeBatch(batchArgs, resolver, state);
      return batchResult;
    }
    if (rawMode) {
      const file2 = args.file;
      if (!file2) {
        return errorResult3('Missing required argument: "file"', "MISSING_ARGUMENT");
      }
      const oldText2 = strArg(args, "old_text", "oldText");
      const newText2 = strArg(args, "new_text", "newText");
      if (oldText2 === "" && newText2 === "") {
        return errorResult3("Both old_text and new_text are empty \u2014 nothing to change.", "VALIDATION_ERROR");
      }
      return handleRawChanges([{ old_text: oldText2, new_text: newText2 }], file2, resolver, state);
    }
    const file = args.file;
    const oldText = strArg(args, "old_text", "oldText");
    const newText = strArg(args, "new_text", "newText");
    const reasoning = args.reason;
    const insertAfter = optionalStrArg(args, "insert_after", "insertAfter");
    const level = args.level ?? 2;
    let startLine = args.start_line;
    const startHash = args.start_hash;
    const hasCompactParams = typeof args.at === "string" || typeof args.op === "string";
    if (oldText === "" && newText === "" && !hasCompactParams) {
      const isLineRangeDeletion = startLine !== void 0 && startHash !== void 0;
      if (!isLineRangeDeletion) {
        const receivedKeys = Object.keys(args ?? {}).join(", ") || "(none)";
        const oldLen = typeof args.old_text === "string" ? args.old_text.length : typeof args.oldText === "string" ? args.oldText.length : "missing";
        const newLen = typeof args.new_text === "string" ? args.new_text.length : typeof args.newText === "string" ? args.newText.length : "missing";
        return errorResult3(`Both old_text and new_text are empty \u2014 nothing to change. Received argument keys: [${receivedKeys}]. old_text/oldText length: ${String(oldLen)}, new_text/newText length: ${String(newLen)}. Use old_text and new_text (snake_case) or oldText and newText (camelCase).`, "VALIDATION_ERROR", { received_keys: Object.keys(args ?? {}), old_text_length: oldLen, new_text_length: newLen });
      }
    }
    if (oldText && newText) {
      const strippedOld = oldText.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, "").trim();
      const strippedNew = newText.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, "").trim();
      if (strippedOld === strippedNew) {
        return errorResult3("No prose changes detected (only footnote references differ). Footnote references are structural links to change history \u2014 use review_changes to manage them, not propose_change.", "VALIDATION_ERROR");
      }
    }
    let endLine = args.end_line;
    const endHash = args.end_hash;
    let afterLine = args.after_line;
    const afterHash = args.after_hash;
    if (!file) {
      return errorResult3('Missing required argument: "file"', "MISSING_ARGUMENT");
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    const relativePath = toRelativePath(projectDir, filePath);
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);
    if (hasHashlineParams2(args) && !config.hashline.enabled) {
      return errorResult3("Hashline addressing requires [hashline] enabled = true in .changedown/config.toml", "HASHLINE_DISABLED", {
        file: relativePath,
        hashline_enabled: config.hashline.enabled
      });
    }
    if (trackingStatus.status !== "tracked") {
      return errorResult3(`File is not tracked for propose_change: "${filePath}".`, "TRACKING_UNTRACKED_FILE", {
        file: relativePath,
        tracking_status: trackingStatus
      });
    }
    let fileContent;
    let isNewFile = false;
    try {
      fileContent = await fs11.readFile(filePath, "utf-8");
    } catch (err) {
      if (oldText === "" && !insertAfter && !hasHashlineParams2(args)) {
        fileContent = "";
        isNewFile = true;
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResult3(`File not found or unreadable: ${msg}`, "FILE_UNREADABLE", {
          file: relativePath
        });
      }
    }
    const protocolMode = resolveProtocolMode(config.protocol?.mode ?? "classic");
    const hasClassicParams = typeof args.old_text === "string" && args.old_text !== "" || typeof args.new_text === "string" && args.new_text !== "" || typeof args.insert_after === "string";
    if (protocolMode === "classic" && hasCompactParams) {
      return errorResult3("This project uses classic mode. Use old_text/new_text parameters instead of at/op.", "PROTOCOL_MODE_MISMATCH");
    }
    if (protocolMode === "compact" && hasClassicParams && !hasCompactParams) {
      return errorResult3("This project uses compact mode. Use at/op parameters instead of old_text/new_text.", "PROTOCOL_MODE_MISMATCH");
    }
    if (protocolMode === "compact" && hasCompactParams) {
      return await handleCompactProposeChange(args, filePath, relativePath, config, state, fileContent);
    }
    let headerLineDelta = 0;
    if (config.tracking.auto_header) {
      if (!parseTrackingHeader(fileContent)) {
        const linesBefore = fileContent.split("\n").length;
        const { newText: headerText, headerInserted } = insertTrackingHeader(fileContent);
        if (headerInserted) {
          fileContent = headerText;
          headerLineDelta = fileContent.split("\n").length - linesBefore;
        }
      }
    }
    let viewResolved;
    if (hasHashlineParams2(args)) {
      if (startLine !== void 0 && startHash !== void 0) {
        const resolved = state.resolveHash(filePath, startLine, startHash);
        if (resolved?.match === true) {
          startLine = resolved.rawLineNum;
          viewResolved = resolved.view;
        }
      }
      if (endLine !== void 0 && endHash !== void 0) {
        const resolved = state.resolveHash(filePath, endLine, endHash);
        if (resolved?.match === true) {
          endLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        }
      }
      if (afterLine !== void 0 && afterHash !== void 0) {
        const resolved = state.resolveHash(filePath, afterLine, afterHash);
        if (resolved?.match === true) {
          afterLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        }
      }
    }
    if (headerLineDelta > 0) {
      if (startLine !== void 0)
        startLine += headerLineDelta;
      if (afterLine !== void 0)
        afterLine += headerLineDelta;
      if (endLine !== void 0)
        endLine += headerLineDelta;
    }
    const changeId = state.getNextId(filePath, fileContent);
    const { author, error: authorError } = resolveAuthor(args.author, config, "propose_change");
    if (authorError) {
      return errorResult3(authorError.message, "AUTHOR_RESOLUTION_FAILED");
    }
    const reasoningError = checkReasoningRequired(author, reasoning, config, false);
    if (reasoningError)
      return reasoningError;
    const useLineRange = startLine !== void 0 && startHash !== void 0;
    const useAfterLine = afterLine !== void 0 && afterHash !== void 0;
    const isHashlineMode = useLineRange || useAfterLine;
    let modifiedText;
    let changeType;
    let affectedLines;
    let stalenessWarning;
    const supersededIds = [];
    const relocations = [];
    const remaps = [];
    const autoRemap = config.hashline.auto_remap ?? true;
    if (isHashlineMode) {
      await initHashline();
      const fileLines = fileContent.split("\n");
      stalenessWarning = checkStaleness(fileContent, filePath, state);
      if (useAfterLine && oldText === "") {
        if (viewResolved === void 0) {
          try {
            const afterResult = validateOrAutoRemap({ line: afterLine, hash: afterHash }, fileLines, "after_line", relocations, autoRemap);
            afterLine = afterResult.line;
            if (afterResult.remap)
              remaps.push(afterResult.remap);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, afterLine);
            return errorResult3(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash)
            });
          }
        }
        let cleanedNewText = newText;
        const newTextLines = cleanedNewText.split("\n");
        const strippedLines = stripHashlinePrefixes(newTextLines);
        cleanedNewText = strippedLines.join("\n");
        changeType = "ins";
        const ts = nowTimestamp();
        const authorAt = author.startsWith("@") ? author : `@${author}`;
        const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|ins|proposed<<}` : "";
        const inlineMarkup = level === 2 ? `{++${cleanedNewText}++}[^${changeId}]` : `{++${cleanedNewText}++}${l1Comment}`;
        const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
        const reasonLine = reasoning ? `
    @${author} ${ts.raw}: ${reasoning}` : "";
        const footnoteBlock = footnoteHeader + reasonLine;
        const insertPos = fileLines.slice(0, afterLine).join("\n").length;
        modifiedText = fileContent.slice(0, insertPos) + "\n" + inlineMarkup + fileContent.slice(insertPos);
        if (level === 2) {
          const { appendFootnote: appendFootnote2 } = await Promise.resolve().then(() => (init_file_ops2(), file_ops_exports));
          modifiedText = appendFootnote2(modifiedText, footnoteBlock);
        }
        const modifiedLines = modifiedText.split("\n");
        const affectedStart = afterLine;
        const affectedEnd = Math.min(modifiedLines.length, afterLine + 3);
        try {
          affectedLines = computeAffectedLines(modifiedText, affectedStart, affectedEnd, {
            hashlineEnabled: config.hashline.enabled
          });
        } catch {
          affectedLines = [];
        }
      } else if (useLineRange) {
        const ts = nowTimestamp();
        let effectiveEndLine = endLine ?? startLine;
        const effectiveEndHash = endHash ?? (effectiveEndLine === startLine ? startHash : void 0);
        if (viewResolved === void 0) {
          try {
            const startResult = validateOrAutoRemap({ line: startLine, hash: startHash }, fileLines, "start_line", relocations, autoRemap);
            startLine = startResult.line;
            if (startResult.remap)
              remaps.push(startResult.remap);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, startLine);
            return errorResult3(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash)
            });
          }
        }
        if (viewResolved === void 0 && (effectiveEndLine !== startLine || endHash !== void 0 && endHash !== startHash)) {
          if (!effectiveEndHash) {
            return errorResult3("end_line requires end_hash for verification.", "VALIDATION_ERROR", { file: relativePath });
          }
          try {
            const endResult = validateOrAutoRemap({ line: effectiveEndLine, hash: effectiveEndHash }, fileLines, "end_line", relocations, autoRemap);
            effectiveEndLine = endResult.line;
            if (endResult.remap)
              remaps.push(endResult.remap);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, effectiveEndLine);
            return errorResult3(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash)
            });
          }
        }
        const extracted = extractLineRange(fileLines, startLine, effectiveEndLine);
        if (oldText !== "") {
          let rangeText = extracted.content;
          let rangeStartOffset = extracted.startOffset;
          let match = findUniqueMatch(contentZoneText(rangeText), oldText, defaultNormalizer);
          const absMatchPos0 = rangeStartOffset + match.index;
          const supersedeResult = resolveOverlapWithAuthor(fileContent, absMatchPos0, match.length, author);
          if (supersedeResult) {
            fileContent = supersedeResult.settledContent;
            supersededIds.push(...supersedeResult.supersededIds);
            const updatedFileLines = fileContent.split("\n");
            const reExtracted = extractLineRange(updatedFileLines, startLine, effectiveEndLine);
            rangeText = reExtracted.content;
            rangeStartOffset = reExtracted.startOffset;
            match = findUniqueMatch(contentZoneText(rangeText), oldText, defaultNormalizer);
          }
          const actualOldText = match.originalText;
          const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
          let cleanedNewText = newText;
          const newTextLines = cleanedNewText.split("\n");
          const strippedLines = stripHashlinePrefixes(newTextLines);
          cleanedNewText = strippedLines.join("\n");
          if (cleanedNewText === "") {
            changeType = "del";
          } else {
            changeType = "sub";
          }
          const authorAt = author.startsWith("@") ? author : `@${author}`;
          const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|${changeType}|proposed<<}` : "";
          const refTail = preservedRefs.join("");
          const inlineMarkup = level === 2 ? changeType === "del" ? `{--${cleanedOld}--}[^${changeId}]${refTail}` : `{~~${cleanedOld}~>${cleanedNewText}~~}[^${changeId}]${refTail}` : changeType === "del" ? `{--${cleanedOld}--}${l1Comment}${refTail}` : `{~~${cleanedOld}~>${cleanedNewText}~~}${l1Comment}${refTail}`;
          const absPos = rangeStartOffset + match.index;
          const absEnd = absPos + match.length;
          modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
        } else {
          if (/\{\+\+|\{--|\{~~|\{==|\{>>/.test(extracted.content)) {
            return errorResult3("Line range contains existing CriticMarkup. Use hybrid mode (provide old_text to target specific text within the range) or accept/reject the existing change first.", "VALIDATION_ERROR", { file: relativePath });
          }
          let cleanedNewText = newText;
          let newTextLines = cleanedNewText.split("\n");
          newTextLines = stripHashlinePrefixes(newTextLines);
          newTextLines = stripBoundaryEcho(fileLines, startLine, effectiveEndLine, newTextLines);
          cleanedNewText = newTextLines.join("\n");
          const authorAt = author.startsWith("@") ? author : `@${author}`;
          if (cleanedNewText === "") {
            changeType = "del";
            const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
            const refTail = preservedRefs.join("");
            const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|del|proposed<<}` : "";
            const inlineMarkup = level === 2 ? `{--${cleanedExtracted}--}[^${changeId}]${refTail}` : `{--${cleanedExtracted}--}${l1Comment}${refTail}`;
            modifiedText = fileContent.slice(0, extracted.startOffset) + inlineMarkup + fileContent.slice(extracted.endOffset);
          } else {
            changeType = "sub";
            const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
            const refTail = preservedRefs.join("");
            const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|sub|proposed<<}` : "";
            const inlineMarkup = level === 2 ? `{~~${cleanedExtracted}~>${cleanedNewText}~~}[^${changeId}]${refTail}` : `{~~${cleanedExtracted}~>${cleanedNewText}~~}${l1Comment}${refTail}`;
            modifiedText = fileContent.slice(0, extracted.startOffset) + inlineMarkup + fileContent.slice(extracted.endOffset);
          }
        }
        if (level === 2) {
          const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
          const reasonLine = reasoning ? `
    @${author} ${ts.raw}: ${reasoning}` : "";
          const footnoteBlock = footnoteHeader + reasonLine;
          const { appendFootnote: appendFootnote2 } = await Promise.resolve().then(() => (init_file_ops2(), file_ops_exports));
          modifiedText = appendFootnote2(modifiedText, footnoteBlock);
        }
        const modifiedLines = modifiedText.split("\n");
        const affectedEnd = Math.min(modifiedLines.length, (endLine ?? startLine) + 5);
        try {
          affectedLines = computeAffectedLines(modifiedText, startLine, affectedEnd, {
            hashlineEnabled: config.hashline.enabled
          });
        } catch {
          affectedLines = [];
        }
      } else {
        return errorResult3("Internal error: hashline mode detected but no valid params.", "INTERNAL_ERROR");
      }
    } else if (isNewFile && oldText === "" && !insertAfter) {
      changeType = "ins";
      const ts = nowTimestamp();
      const authorAt = author.startsWith("@") ? author : `@${author}`;
      const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|ins|proposed<<}` : "";
      const inlineMarkup = level === 2 ? `{++${newText}++}[^${changeId}]` : `{++${newText}++}${l1Comment}`;
      const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
      const reasonLine = reasoning ? `
    @${author} ${ts.raw}: ${reasoning}` : "";
      const footnoteBlock = footnoteHeader + reasonLine;
      await fs11.mkdir(path7.dirname(filePath), { recursive: true });
      modifiedText = level === 2 ? fileContent + inlineMarkup + footnoteBlock : fileContent + inlineMarkup;
    } else {
      if (oldText && !insertAfter) {
        const settleResult = settleOnDemandIfNeeded(fileContent, oldText);
        if (settleResult.settled) {
          fileContent = settleResult.content;
        }
      }
      const result = await applyProposeChange({
        text: fileContent,
        oldText,
        newText,
        changeId,
        author,
        reasoning,
        insertAfter,
        level
      });
      modifiedText = result.modifiedText;
      changeType = result.changeType;
    }
    if (!affectedLines && modifiedText) {
      const modLines = modifiedText.split("\n");
      let matchLine = 1;
      for (let i = 0; i < modLines.length; i++) {
        if (/\{\+\+|\{--|\{~~|\{==/.test(modLines[i])) {
          matchLine = i + 1;
          break;
        }
      }
      const affStart = Math.max(1, matchLine - 2);
      const affEnd = Math.min(modLines.length, matchLine + 5);
      try {
        affectedLines = computeAffectedLines(modifiedText, affStart, affEnd, {
          hashlineEnabled: config.hashline.enabled
        });
      } catch {
        affectedLines = [];
      }
    }
    await fs11.writeFile(filePath, modifiedText, "utf-8");
    await rerecordState(state, filePath, modifiedText, config);
    const responseData = {
      change_id: changeId,
      file: relativePath,
      type: changeType,
      ...relocations.length > 0 ? { relocated: relocations } : {},
      ...remaps.length > 0 ? { remaps } : {},
      ...supersededIds.length > 0 ? { superseded: supersededIds } : {}
    };
    if (affectedLines && config.response?.affected_lines) {
      responseData.affected_lines = affectedLines;
    }
    if (stalenessWarning) {
      responseData.warning = stalenessWarning;
    }
    const footnoteCount = (modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
    const uniqueAuthors = new Set(authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean));
    responseData.document_state = {
      total_changes: footnoteCount,
      proposed: proposedCount,
      accepted: acceptedCount,
      authors: uniqueAuthors.size
    };
    responseData.state_summary = `\u{1F4CB} ${footnoteCount} tracked change(s) | ${proposedCount} proposed, ${acceptedCount} accepted | ${uniqueAuthors.size} author(s)`;
    return {
      content: [{ type: "text", text: JSON.stringify(responseData) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult3(msg, "INTERNAL_ERROR");
  }
}
async function handleRawChanges(changes, file, resolver, state) {
  const filePath = resolver.resolveFilePath(file);
  const { projectDir } = await resolver.forFile(filePath);
  const relativePath = toRelativePath(projectDir, filePath);
  let fileContent;
  try {
    fileContent = await fs11.readFile(filePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult3(`File not found or unreadable: ${msg}`, "FILE_UNREADABLE", {
      file: relativePath
    });
  }
  let modifiedText = fileContent;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const oldText = change.old_text ?? "";
    const newText = change.new_text ?? "";
    if (oldText === "" && newText === "") {
      return errorResult3(`Raw change ${i}: both old_text and new_text are empty.`, "VALIDATION_ERROR");
    }
    if (oldText === "") {
      const afterText = change.after_text ?? change.insert_after ?? "";
      if (afterText === "") {
        return errorResult3(`Raw change ${i}: Raw insertion requires after_text to specify insertion point (or use non-empty old_text for replacement).`, "VALIDATION_ERROR", { file: relativePath });
      }
      const anchorIdx = modifiedText.indexOf(afterText);
      if (anchorIdx === -1) {
        return errorResult3(`Raw change ${i}: after_text anchor not found in file.`, "VALIDATION_ERROR", { file: relativePath });
      }
      const insertPos = anchorIdx + afterText.length;
      modifiedText = modifiedText.slice(0, insertPos) + newText + modifiedText.slice(insertPos);
    } else {
      const idx = modifiedText.indexOf(oldText);
      if (idx === -1) {
        return errorResult3(`Raw change ${i}: old_text not found in file.`, "VALIDATION_ERROR", { file: relativePath });
      }
      modifiedText = modifiedText.slice(0, idx) + newText + modifiedText.slice(idx + oldText.length);
    }
  }
  await fs11.writeFile(filePath, modifiedText, "utf-8");
  if (state) {
    state.resetFile(filePath);
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ file: relativePath, raw: true, changes_applied: changes.length }) }]
  };
}
async function handleCompactProposeChange(args, filePath, relativePath, config, state, fileContent) {
  if (args.start_line || args.end_line || args.after_line) {
    return errorResult3("Use at parameter for line addressing. start_line/end_line/after_line are not supported in compact mode.", "DEPRECATED_PARAMS");
  }
  const at = args.at;
  const op = args.op;
  if (!at || !op) {
    return errorResult3('Compact mode requires both "at" and "op" parameters.', "MISSING_ARGUMENT");
  }
  let parsed;
  try {
    parsed = parseOp(op);
  } catch (err) {
    return errorResult3(err instanceof Error ? err.message : String(err), "VALIDATION_ERROR");
  }
  let fileLines = fileContent.split("\n");
  await initHashline();
  const changeId = state.getNextId(filePath, fileContent);
  const { author, error: authorError } = resolveAuthor(args.author, config, "propose_change");
  if (authorError) {
    return errorResult3(authorError.message, "AUTHOR_RESOLUTION_FAILED");
  }
  const reasoning = parsed.reasoning ?? args.reason;
  const reasoningError = checkReasoningRequired(author, reasoning, config, true);
  if (reasoningError)
    return reasoningError;
  let modifiedText;
  let changeType;
  const supersededIds = [];
  let applyResult;
  try {
    const op2 = {
      at,
      type: parsed.type,
      oldText: parsed.oldText,
      newText: parsed.newText,
      reasoning
    };
    applyResult = resolveAndApply(op2, fileContent, fileLines, state, filePath, config, changeId, author);
  } catch (err) {
    const { staleLine, currentHash } = extractQuickFixFromError(err);
    return errorResult3(err instanceof Error ? err.message : String(err), "HASHLINE_REFERENCE_UNRESOLVED", {
      file: relativePath,
      quick_fix: buildQuickFix(filePath, staleLine, currentHash)
    });
  }
  modifiedText = applyResult.modifiedText;
  changeType = applyResult.changeType;
  supersededIds.push(...applyResult.supersededIds);
  fileContent = applyResult.modifiedText;
  fileLines = fileContent.split("\n");
  await fs11.writeFile(filePath, modifiedText, "utf-8");
  const viewResult = await rerecordState(state, filePath, modifiedText, config);
  let viewProjection;
  if (viewResult?.settledView) {
    const rawToViewMap = /* @__PURE__ */ new Map();
    for (const sl of viewResult.settledView.lines) {
      rawToViewMap.set(sl.rawLineNum, { viewLine: sl.settledLineNum, viewHash: sl.hash, viewContent: sl.text });
    }
    viewProjection = { view: "settled", rawToView: rawToViewMap };
  } else if (viewResult?.committedView) {
    const rawToViewMap = /* @__PURE__ */ new Map();
    for (const cl of viewResult.committedView.lines) {
      rawToViewMap.set(cl.rawLineNum, { viewLine: cl.committedLineNum, viewHash: cl.hash, viewContent: cl.text });
    }
    viewProjection = { view: "changes", rawToView: rawToViewMap };
  }
  const footnoteCount = (modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
  const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
  const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
  const authorMatches = modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
  const uniqueAuthors = new Set(authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean));
  const responseData = {
    change_id: changeId,
    file: relativePath,
    type: changeType,
    ...supersededIds.length > 0 ? { superseded: supersededIds } : {},
    document_state: {
      total_changes: footnoteCount,
      proposed: proposedCount,
      accepted: acceptedCount,
      authors: uniqueAuthors.size
    },
    state_summary: `\u{1F4CB} ${footnoteCount} tracked change(s) | ${proposedCount} proposed, ${acceptedCount} accepted | ${uniqueAuthors.size} author(s)`
  };
  let affectedLines = [];
  try {
    affectedLines = computeAffectedLines(modifiedText, applyResult.affectedStartLine, applyResult.affectedEndLine, {
      hashlineEnabled: config.hashline.enabled,
      viewProjection
    });
  } catch {
  }
  if (affectedLines && config.response?.affected_lines) {
    responseData.affected_lines = affectedLines;
  }
  return {
    content: [{ type: "text", text: JSON.stringify(responseData) }]
  };
}
function errorResult3(message, code, details) {
  const quickFix = details?.quick_fix;
  const errorDetails = details ? { ...details } : void 0;
  if (errorDetails) {
    delete errorDetails.quick_fix;
  }
  const payload = {
    error: {
      code,
      message,
      ...errorDetails ?? {}
    }
  };
  if (quickFix) {
    payload.quick_fix = quickFix;
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true
  };
}

// ../../packages/cli/dist/engine/handlers/begin-change-group.js
init_dist_esm();
import * as fs12 from "node:fs/promises";
import * as path8 from "node:path";
async function scanProjectForMaxId(projectDir, config) {
  let max = 0;
  try {
    const entries = await fs12.readdir(projectDir, { recursive: true });
    for (const rawEntry of entries) {
      const entry = typeof rawEntry === "string" ? rawEntry : String(rawEntry);
      const fullPath = path8.join(projectDir, entry);
      if (!isFileInScope(fullPath, config, projectDir))
        continue;
      try {
        const content = await fs12.readFile(fullPath, "utf-8");
        const fileMax = scanMaxCnId(content);
        if (fileMax > max)
          max = fileMax;
      } catch {
      }
    }
  } catch {
  }
  return max;
}
async function handleBeginChangeGroup(args, resolver, state) {
  try {
    const description = optionalStrArg(args, "description", "description");
    const reasoning = optionalStrArg(args, "reason", "reason");
    if (!description) {
      return errorResult('Missing required argument: "description"');
    }
    const projectDir = resolver.resolveDir();
    const config = await resolver.lastConfig();
    const maxId = await scanProjectForMaxId(projectDir, config);
    const groupId = state.beginGroup(description, reasoning, maxId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ group_id: groupId })
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/end-change-group.js
init_dist_esm();
import * as fs13 from "node:fs/promises";
import * as path9 from "node:path";
init_file_ops2();
async function handleEndChangeGroup(args, resolver, state) {
  try {
    const summary = optionalStrArg(args, "summary", "summary");
    const config = await resolver.lastConfig();
    const projectDir = resolver.resolveDir();
    const { author, error: authorError } = resolveAuthor(args.author, config, "end_change_group");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const groupInfo = state.endGroup();
    if (groupInfo.files.length > 0) {
      const targetFile = groupInfo.files[0];
      const footnoteHeader = generateFootnoteDefinition(groupInfo.id, "group", author);
      const ts = nowTimestamp();
      const reasonLine = groupInfo.description ? `
    @${author} ${ts.raw}: ${groupInfo.description}` : "";
      const summaryLine = summary ? `
    summary: ${summary}` : "";
      const footnoteBlock = footnoteHeader + reasonLine + summaryLine;
      const fileContent = await fs13.readFile(targetFile, "utf-8");
      const modifiedText = appendFootnote(fileContent, footnoteBlock);
      await fs13.writeFile(targetFile, modifiedText, "utf-8");
    }
    const filesList = groupInfo.files.length > 0 ? `Modified files:
${groupInfo.files.map((f) => path9.relative(projectDir, f)).join("\n")}

Share this list with the user so they know which file(s) to open or read.` : "";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            group_id: groupInfo.id,
            children: groupInfo.childIds,
            files: groupInfo.files
          })
        },
        ...filesList ? [{ type: "text", text: filesList }] : []
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/review-change.js
import * as fs14 from "node:fs/promises";
init_dist_esm();
init_dist_esm();
async function handleReviewChange(args, resolver, state) {
  try {
    const file = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const decision = optionalStrArg(args, "decision", "decision");
    const reasoning = optionalStrArg(args, "reason", "reason");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (!decision) {
      return errorResult('Missing required argument: "decision"');
    }
    if (!reasoning) {
      return errorResult('Missing required argument: "reason"');
    }
    if (!VALID_DECISIONS.includes(decision)) {
      return errorResult(`Invalid decision: "${decision}". Must be one of: approve, reject, request_changes, withdraw`);
    }
    const typedDecision = decision;
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs14.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "review_change");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const applied = applyReview(fileContent, changeId, typedDecision, reasoning, author, config);
    if ("error" in applied) {
      return errorResult(applied.error);
    }
    if (typedDecision === "request_changes") {
      const blockingArg = args.blocking === true;
      const labelArg = optionalStrArg(args, "label", "label");
      const autoBlock = labelArg ? config.review.blocking_labels[labelArg] === true : false;
      const shouldBlock = blockingArg || autoBlock;
      if (labelArg || shouldBlock) {
        applied.updatedContent = applyBlockingAnnotation(applied.updatedContent, changeId, author, labelArg, shouldBlock);
      }
    }
    if (applied.updatedContent !== fileContent) {
      fileContent = applied.updatedContent;
      await fs14.writeFile(filePath, fileContent, "utf-8");
    }
    let settlementInfo;
    if (config.settlement.auto_on_approve && typedDecision === "approve") {
      const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
      if (settledIds.length > 0) {
        await fs14.writeFile(filePath, settledContent, "utf-8");
        fileContent = settledContent;
        settlementInfo = { settledIds };
      }
    }
    if (config.settlement.auto_on_reject && typedDecision === "reject") {
      const { settledContent, settledIds } = settleRejectedChanges(fileContent);
      if (settledIds.length > 0) {
        await fs14.writeFile(filePath, settledContent, "utf-8");
        fileContent = settledContent;
        settlementInfo = { settledIds };
      }
    }
    await rerecordState(state, filePath, fileContent, config);
    const response = { ...applied.result };
    if (settlementInfo) {
      response.settled = settlementInfo.settledIds;
      const settlementVerb = typedDecision === "reject" ? "rejected" : "accepted";
      response.settlement_note = `${settlementInfo.settledIds.length} ${settlementVerb} change(s) settled to clean text. The file now contains clean prose where those changes were. Proposed changes remain as markup.`;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response)
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/index.js
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/respond-to-thread.js
import * as fs15 from "node:fs/promises";
init_dist_esm();
async function handleRespondToThread(args, resolver, _state) {
  try {
    const file = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const response = optionalStrArg(args, "response", "response");
    const label = optionalStrArg(args, "label", "label");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (!response) {
      return errorResult('Missing required argument: "response"');
    }
    const VALID_LABELS = ["suggestion", "issue", "question", "praise", "todo", "thought", "nitpick"];
    if (label && !VALID_LABELS.includes(label)) {
      return errorResult(`Invalid label: "${label}". Must be one of: ${VALID_LABELS.join(", ")}`);
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs15.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const { author, error: authorError } = resolveAuthor(args.author, config, "respond_to_thread");
    if (authorError) {
      return errorResult(authorError.message);
    }
    const result = computeReplyEdit(fileContent, changeId, {
      text: response,
      author,
      label
    });
    if (result.isError) {
      return errorResult(result.error);
    }
    await fs15.writeFile(filePath, result.text, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            change_id: changeId,
            comment_added: true
          })
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/list-open-threads.js
init_dist_esm();
import * as fs16 from "node:fs/promises";
import * as path10 from "node:path";
var TRACKING_HEADER_TRACKED = "<!-- changedown.com/v1: tracked -->";
var VALID_STATUSES = ["proposed", "accepted", "rejected"];
async function hasTrackingHeader(filePath) {
  try {
    const fd = await fs16.open(filePath, "r");
    const buf = Buffer.alloc(400);
    const { bytesRead } = await fd.read(buf, 0, 400, 0);
    await fd.close();
    const head = buf.slice(0, bytesRead).toString("utf-8");
    return head.includes(TRACKING_HEADER_TRACKED);
  } catch {
    return false;
  }
}
async function collectTrackedMdFiles(dirPath, config, projectDir) {
  const out = [];
  try {
    const entries = await fs16.readdir(dirPath, { recursive: true });
    for (const raw of entries) {
      const entry = typeof raw === "string" ? raw : String(raw);
      const full = path10.join(dirPath, entry);
      if (!entry.endsWith(".md"))
        continue;
      try {
        const stat4 = await fs16.stat(full);
        if (!stat4.isFile())
          continue;
      } catch {
        continue;
      }
      if (!isFileInScope(full, config, projectDir))
        continue;
      if (!await hasTrackingHeader(full))
        continue;
      out.push(full);
    }
  } catch {
  }
  return out;
}
async function handleListOpenThreads(args, resolver, _state) {
  try {
    const pathArg = optionalStrArg(args, "path", "path");
    const authorFilter = optionalStrArg(args, "author", "author");
    const statusParam = args.status;
    if (pathArg === void 0 || pathArg === "") {
      return errorResult('Missing required argument: "path". Pass a file or directory to list open threads for.');
    }
    const resolvedPath = resolver.resolveFilePath(pathArg);
    const { config, projectDir } = await resolver.forFile(resolvedPath);
    let filesToScan = [];
    try {
      const stat4 = await fs16.stat(resolvedPath);
      if (stat4.isFile()) {
        if (!isFileInScope(resolvedPath, config, projectDir)) {
          return errorResult(`File is not in scope for tracking: "${resolvedPath}". Check .changedown/config.toml include/exclude patterns.`);
        }
        filesToScan = [resolvedPath];
      } else if (stat4.isDirectory()) {
        filesToScan = await collectTrackedMdFiles(resolvedPath, config, projectDir);
      } else {
        return errorResult(`Path is not a file or directory: "${resolvedPath}"`);
      }
    } catch {
      return errorResult(`File not found or unreadable: "${resolvedPath}"`);
    }
    const statusFilter = Array.isArray(statusParam) && statusParam.length > 0 ? statusParam.filter((s) => typeof s === "string" && VALID_STATUSES.includes(s)) : ["proposed"];
    if (statusFilter.length === 0) {
      statusFilter.push("proposed");
    }
    const allChanges = [];
    const parser = new CriticMarkupParser();
    for (const fp of filesToScan) {
      let content;
      try {
        content = await fs16.readFile(fp, "utf-8");
      } catch {
        continue;
      }
      const doc = parser.parse(content);
      const changes = doc.getChanges();
      for (const node of changes) {
        if (!node.metadata?.author)
          continue;
        const meta = node.metadata;
        const statusStr = node.status.toLowerCase();
        if (!statusFilter.includes(statusStr))
          continue;
        const participantSet = /* @__PURE__ */ new Set();
        if (meta.author)
          participantSet.add(meta.author);
        if (meta.discussion) {
          for (const disc of meta.discussion) {
            participantSet.add(disc.author);
          }
        }
        if (meta.approvals) {
          for (const a of meta.approvals)
            participantSet.add(a.author);
        }
        if (meta.rejections) {
          for (const a of meta.rejections)
            participantSet.add(a.author);
        }
        if (meta.requestChanges) {
          for (const a of meta.requestChanges)
            participantSet.add(a.author);
        }
        if (authorFilter && !participantSet.has(authorFilter)) {
          continue;
        }
        const typeMap = {
          "Insertion": "ins",
          "Deletion": "del",
          "Substitution": "sub",
          "Highlight": "highlight",
          "Comment": "comment"
        };
        const typeStr = typeMap[node.type] || node.type.toLowerCase();
        const comment = meta.discussion?.[0]?.text ?? meta.comment;
        allChanges.push({
          change_id: node.id,
          file: toRelativePath(projectDir, fp),
          type: typeStr,
          status: statusStr,
          author: meta.author ?? "",
          date: meta.date || "",
          comment,
          participants: [...participantSet],
          has_request_changes: (meta.requestChanges?.length ?? 0) > 0
        });
      }
    }
    const limit = Math.max(1, Math.min(100, Number(args.limit ?? 25) || 25));
    const sorted = [...allChanges].sort((a, b) => a.file.localeCompare(b.file) || a.change_id.localeCompare(b.change_id));
    const visible = sorted.slice(0, limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(visible)
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/raw-edit.js
import * as fs17 from "node:fs/promises";
import * as path11 from "node:path";
init_file_ops2();
var MARKUP_OPENERS = [/\{\+\+/g, /\{\-\-/g, /\{\~\~/g];
var FOOTNOTE_REF = /\[\^cn-\d+(?:\.\d+)?\]/g;
function countMarkupInText(text) {
  let annotations = 0;
  for (const re of MARKUP_OPENERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null)
      annotations++;
  }
  FOOTNOTE_REF.lastIndex = 0;
  const footnoteMatches = text.match(FOOTNOTE_REF);
  const footnotes = footnoteMatches ? footnoteMatches.length : 0;
  return { annotations, footnotes };
}
async function handleRawEdit(args, resolver) {
  try {
    const file = args.file;
    const oldText = optionalStrArg(args, "old_text", "oldText");
    const newText = optionalStrArg(args, "new_text", "newText");
    const reason = optionalStrArg(args, "reason", "reason");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (oldText === void 0) {
      return errorResult('Missing required argument: "old_text"');
    }
    if (newText === void 0) {
      return errorResult('Missing required argument: "new_text"');
    }
    if (!reason || String(reason).trim() === "") {
      return errorResult('Missing or empty required argument: "reason". Justify why this edit must bypass tracking.');
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult("File is outside the configured tracking scope.");
    }
    const policyMode = config.policy?.mode ?? "safety-net";
    if (policyMode === "strict") {
      return errorResult("Raw edit denied: project policy is strict. Raw edits bypass CriticMarkup tracking and are not allowed in strict mode. Use propose_change instead.");
    }
    let fileContent;
    try {
      fileContent = await fs17.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const modifiedText = replaceUnique(fileContent, oldText, newText);
    await fs17.writeFile(filePath, modifiedText, "utf-8");
    console.error(`[changedown] raw_edit bypassed tracking: ${reason}`);
    const { annotations, footnotes } = countMarkupInText(oldText);
    const baseWarning = "This edit is untracked.";
    const removalWarning = annotations > 0 || footnotes > 0 ? ` WARNING: This edit removes ${annotations} CriticMarkup annotation(s) and ${footnotes} footnote(s). These represent the file's deliberation history.` : "";
    const displayPath = path11.relative(projectDir, filePath);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            file: displayPath,
            raw_edit: true,
            reason,
            warning: baseWarning + removalWarning
          })
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/dist/engine/handlers/get-tracking-status.js
import * as fs18 from "node:fs/promises";
import * as path12 from "node:path";
init_dist_esm();
var import_picomatch2 = __toESM(require_picomatch2(), 1);
async function handleGetTrackingStatus(args, resolver, state) {
  try {
    const file = optionalStrArg(args, "file", "file");
    const settleAccepted = args.settle_accepted === true;
    if (file) {
      const filePath = resolver.resolveFilePath(file);
      const { config: config2, projectDir } = await resolver.forFile(filePath);
      const status = await resolveTrackingStatus(filePath, config2, projectDir);
      let relative8 = path12.relative(projectDir, filePath);
      relative8 = relative8.split(path12.sep).join("/");
      const matchesHooksExclude = (0, import_picomatch2.default)(config2.hooks.exclude);
      const hookExcluded = matchesHooksExclude(relative8);
      const out = {
        ...status,
        hook_excluded: hookExcluded,
        hooks_exclude: config2.hooks.exclude
      };
      const isTracked = status.status === "tracked";
      if (isTracked) {
        let content;
        try {
          content = await fs18.readFile(filePath, "utf-8");
        } catch {
          content = "";
        }
        const beforeSettle = countFootnoteHeadersWithStatus(content, "accepted");
        out.accepted_unsettled_count = beforeSettle;
        if (settleAccepted && beforeSettle > 0) {
          const { settledContent, settledIds } = settleAcceptedChanges(content);
          if (settledIds.length > 0) {
            await fs18.writeFile(filePath, settledContent, "utf-8");
            out.settled = true;
            out.settled_ids = settledIds;
            await rerecordState(state, filePath, settledContent, config2);
          }
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(out) }]
      };
    }
    const config = await resolver.lastConfig();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            policy_mode: config.policy.mode,
            tracking_default: config.tracking.default,
            auto_header: config.tracking.auto_header,
            include: config.tracking.include,
            exclude: config.tracking.exclude,
            hooks_enforcement: config.hooks.enforcement,
            hooks_exclude: config.hooks.exclude,
            matching_mode: config.matching.mode,
            hashline_enabled: config.hashline.enabled,
            author_default: config.author.default,
            author_enforcement: config.author.enforcement
          })
        }
      ]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: msg }],
      isError: true
    };
  }
}

// ../../packages/cli/dist/engine/handlers/get-change.js
init_dist_esm();
import * as fs19 from "node:fs/promises";
init_dist_esm();
function buildGroupInfo(doc, lines, parentId) {
  const parentBlock = findFootnoteBlock(lines, parentId);
  let description = null;
  if (parentBlock) {
    for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("reason:") || trimmed.startsWith("context:"))
        continue;
      if (trimmed && !trimmed.startsWith("approved:") && !trimmed.startsWith("rejected:") && !trimmed.startsWith("request-changes:")) {
        description = trimmed;
        break;
      }
    }
  }
  const siblings = doc.getChanges().filter((c) => (c.groupId === parentId || c.id.startsWith(parentId + ".")) && c.id !== parentId).map((c) => c.id);
  return {
    parent_id: parentId,
    description,
    siblings
  };
}
async function handleGetChange(args, resolver) {
  try {
    const fileArg = args.file;
    const changeId = optionalStrArg(args, "change_id", "changeId");
    const contextLines = args.context_lines ?? args.contextLines ?? 3;
    const includeRawFootnote = args.include_raw_footnote === true;
    if (fileArg === void 0 || fileArg === "") {
      return errorResult4('Missing required argument: "file".');
    }
    if (changeId === void 0 || changeId === "") {
      return errorResult4('Missing required argument: "change_id".');
    }
    const filePath = resolver.resolveFilePath(fileArg);
    const { config, projectDir } = await resolver.forFile(filePath);
    try {
      const stat4 = await fs19.stat(filePath);
      if (!stat4.isFile()) {
        return errorResult4(`Not a file: "${filePath}"`);
      }
    } catch {
      return errorResult4(`File not found or unreadable: "${filePath}"`);
    }
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult4(`File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs19.readFile(filePath, "utf-8");
    } catch {
      return errorResult4(`Could not read file: "${filePath}"`);
    }
    const parser = new CriticMarkupParser();
    const doc = parser.parse(fileContent);
    const change = doc.getChanges().find((c) => c.id === changeId);
    if (!change) {
      const lines2 = fileContent.split("\n");
      const settledBlock = findFootnoteBlock(lines2, changeId);
      if (settledBlock) {
        const header = parseFootnoteHeader(settledBlock.headerContent);
        const status = header?.status ?? "unknown";
        return errorResult4(`Change ${changeId} has been settled (status: ${status}). Inline markup was compacted. See git history for the original change.`, "CHANGE_SETTLED", { status });
      }
      return errorResult4(`Change ${changeId} not found in file`);
    }
    const lines = fileContent.split("\n");
    const startLine = offsetToLineNumber2(fileContent, change.range.start);
    const endLine = offsetToLineNumber2(fileContent, change.range.end);
    const contextN = Math.max(0, contextLines);
    const markup = fileContent.slice(change.range.start, change.range.end);
    const contextBefore = lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1);
    const contextAfter = lines.slice(endLine, Math.min(lines.length, endLine + contextN));
    const typeStr = TYPE_MAP[change.type];
    const statusStr = change.status.toLowerCase();
    let footnoteAuthor = "";
    let footnoteDate = "";
    let rawFootnoteText = "";
    let reasoning = null;
    let discussionCount = 0;
    const approvals = [];
    const rejections = [];
    const requestChanges = [];
    const block = findFootnoteBlock(lines, changeId);
    if (block) {
      rawFootnoteText = lines.slice(block.headerLine, block.blockEnd + 1).join("\n");
      const header = parseFootnoteHeader(lines[block.headerLine]);
      if (header) {
        footnoteAuthor = header.author;
        footnoteDate = header.date;
      }
      const meta = change.metadata;
      if (meta?.discussion?.length) {
        discussionCount = meta.discussion.length;
        reasoning = meta.discussion[0].text ?? null;
      }
      meta?.approvals?.forEach((a) => approvals.push(a.author));
      meta?.rejections?.forEach((a) => rejections.push(a.author));
      meta?.requestChanges?.forEach((a) => requestChanges.push(a.author));
    }
    const participantsSet = /* @__PURE__ */ new Set();
    if (change.metadata?.author)
      participantsSet.add(change.metadata.author);
    change.metadata?.discussion?.forEach((d) => participantsSet.add(d.author));
    change.metadata?.approvals?.forEach((a) => participantsSet.add(a.author));
    change.metadata?.rejections?.forEach((a) => participantsSet.add(a.author));
    change.metadata?.requestChanges?.forEach((a) => participantsSet.add(a.author));
    const participants = [...participantsSet];
    const dotIndex = changeId.lastIndexOf(".");
    const group = dotIndex > 0 ? buildGroupInfo(doc, lines, changeId.slice(0, dotIndex)) : null;
    const footnote = {
      author: footnoteAuthor,
      date: footnoteDate,
      reasoning,
      discussion_count: discussionCount,
      approvals,
      rejections,
      request_changes: requestChanges
    };
    if (includeRawFootnote) {
      footnote.raw_text = rawFootnoteText;
    }
    const response = {
      change_id: changeId,
      file: toRelativePath(projectDir, filePath),
      type: typeStr,
      status: statusStr,
      inline: {
        line_number: startLine,
        end_line_number: endLine,
        markup,
        original_text: change.type === ChangeType.Insertion ? null : change.originalText ?? null,
        modified_text: change.type === ChangeType.Deletion ? null : change.modifiedText ?? null,
        context_before: contextBefore,
        context_after: contextAfter
      },
      footnote,
      participants,
      group
    };
    return {
      content: [{ type: "text", text: JSON.stringify(response) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult4(msg);
  }
}
function errorResult4(message, code, details) {
  if (code) {
    const payload = {
      error: {
        code,
        message,
        ...details ?? {}
      }
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: true
    };
  }
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// ../../packages/cli/dist/engine/handlers/compact-changes.js
init_dist_esm();

// src/internals.ts
init_dist_esm();

// src/at-resolver.ts
init_dist_esm();

// src/op-parser.ts
init_dist_esm();

// src/footnote-utils.ts
init_dist_esm();

// src/view-surface.ts
init_dist_esm();
export {
  ConfigResolver,
  DEFAULT_CONFIG2 as DEFAULT_CONFIG,
  HashlineMismatchError,
  SessionState,
  applyCompactOp,
  applyProposeChange,
  applyReview,
  buildViewSurfaceMap,
  checkCriticMarkupOverlap,
  classicProposeChangeSchema,
  compactProposeChangeSchema,
  composeGuide,
  computeLineHash,
  countFootnoteHeadersWithStatus,
  findUniqueMatch,
  getListedTools,
  getListedToolsWithConfig,
  guardOverlap,
  handleAmendChange,
  handleBeginChangeGroup,
  handleEndChangeGroup,
  handleGetChange,
  handleGetTrackingStatus,
  handleListChanges,
  handleListOpenThreads,
  handleProposeBatch,
  handleProposeChange,
  handleRawEdit,
  handleReadTrackedFile,
  handleResolveThread,
  handleRespondToThread,
  handleReviewChange,
  handleReviewChanges,
  handleSupersedeChange,
  initHashline,
  isFileInScope,
  loadConfig,
  parseAt,
  parseOp,
  replaceUnique,
  rerecordState,
  resolveAndApply,
  resolveAt,
  resolveAuthor,
  resolveCoordinates,
  resolveProjectDir,
  resolveProtocolMode,
  resolveThreadTool,
  resolveTrackingStatus,
  settleAcceptedChanges,
  settleRejectedChanges,
  tryRelocate,
  validateOrAutoRemap,
  validateOrRelocate,
  viewAwareFind
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
//# sourceMappingURL=internals.js.map
