#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
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
    FOOTNOTE_ID_PATTERN = "ct-\\d+(?:\\.\\d+)?";
    FOOTNOTE_ID_NUMERIC_PATTERN = "ct-(\\d+)(?:\\.\\d+)?";
    FOOTNOTE_REF_ANCHORED = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`);
    FOOTNOTE_DEF_START = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:`);
    FOOTNOTE_DEF_START_QUICK = /^\[\^ct-\d+/;
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
        if (lines[j].startsWith("[^ct-"))
          break;
        if (lines[j].startsWith("    ")) {
          end = j;
          j++;
          continue;
        }
        if (lines[j].trim() === "") {
          let k = j + 1;
          let hasMore = false;
          while (k < lines.length && !lines[k].startsWith("[^ct-")) {
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
    FOOTNOTE_ID_AND_STATUS_RE = /^\[\^(ct-\d+(?:\.\d+)?)\]:.*\|\s*(\S+)\s*$/;
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
    HASHLINE_KEY = "__changetracks_xxhash__";
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
function bodyReplacement(change) {
  switch (change.type) {
    case ChangeType.Insertion:
      if (change.status === ChangeStatus.Rejected)
        return "";
      return change.modifiedText ?? "";
    case ChangeType.Deletion:
      if (change.status === ChangeStatus.Rejected)
        return change.originalText ?? "";
      return "";
    case ChangeType.Substitution:
      if (change.status === ChangeStatus.Rejected)
        return change.originalText ?? "";
      return change.modifiedText ?? "";
    case ChangeType.Highlight:
      return change.originalText ?? "";
    case ChangeType.Comment:
      return "";
  }
}
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
async function convertL2ToL3(text) {
  await initHashline();
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changes.length === 0)
    return text;
  const sortedAsc = [...changes].sort((a, b) => a.range.start - b.range.start);
  const sortedDesc = sortedAsc.slice().reverse();
  let body = text;
  for (const change of sortedDesc) {
    const replacement = bodyReplacement(change);
    body = body.slice(0, change.range.start) + replacement + body.slice(change.range.end);
  }
  const split = splitBodyAndFootnotes(body.split("\n"));
  let cleanBodyLines = split.bodyLines;
  const footnoteLines = split.footnoteLines;
  const refRe = footnoteRefGlobal();
  cleanBodyLines = cleanBodyLines.map((line) => line.replace(refRe, ""));
  const anchorMap = /* @__PURE__ */ new Map();
  const bodyStr = cleanBodyLines.join("\n");
  const lineStarts = buildLineStarts(bodyStr);
  const cumulativeDeltas = [];
  let cumDelta = 0;
  for (let i2 = 0; i2 < sortedAsc.length; i2++) {
    cumulativeDeltas.push(sortedAsc[i2].range.start + cumDelta);
    const origLen = sortedAsc[i2].range.end - sortedAsc[i2].range.start;
    cumDelta += bodyReplacement(sortedAsc[i2]).length - origLen;
  }
  for (let changeIdx = 0; changeIdx < sortedAsc.length; changeIdx++) {
    const change = sortedAsc[changeIdx];
    const shiftedLineNum = offsetToLineNumber(lineStarts, cumulativeDeltas[changeIdx]);
    let lineNum = shiftedLineNum;
    lineNum = Math.max(1, Math.min(lineNum, cleanBodyLines.length || 1));
    const lineIdx = lineNum - 1;
    const lineContent = cleanBodyLines[lineIdx] ?? "";
    const lineStart = lineStarts[lineIdx] ?? 0;
    const changeCol = Math.max(0, Math.min(cumulativeDeltas[changeIdx] - lineStart, lineContent.length));
    let anchorLen;
    switch (change.type) {
      case ChangeType.Insertion:
        anchorLen = change.status === ChangeStatus.Rejected ? 0 : (change.modifiedText ?? "").length;
        break;
      case ChangeType.Deletion:
        anchorLen = 0;
        break;
      case ChangeType.Substitution:
        anchorLen = change.status === ChangeStatus.Rejected ? (change.originalText ?? "").length : (change.modifiedText ?? "").length;
        break;
      case ChangeType.Highlight:
        anchorLen = (change.originalText ?? "").length;
        break;
      default:
        anchorLen = 0;
        break;
    }
    const hash = computeLineHash(lineIdx, cleanBodyLines[lineIdx] ?? "", cleanBodyLines);
    const editOpLine = buildContextualL3EditOp({
      changeType: change.type,
      originalText: change.originalText ?? "",
      currentText: change.modifiedText ?? "",
      lineContent,
      lineNumber: lineNum,
      hash,
      column: changeCol,
      anchorLen
    });
    anchorMap.set(change.id, editOpLine);
  }
  if (footnoteLines.length === 0 && changes.length > 0) {
    return cleanBodyLines.join("\n") + "\n";
  }
  const rebuiltFootnotes = [];
  let i = 0;
  while (i < footnoteLines.length) {
    const line = footnoteLines[i];
    if (FOOTNOTE_DEF_START.test(line)) {
      const idMatch = line.match(/^\[\^(ct-[\w.]+)\]:/);
      const changeId = idMatch ? idMatch[1] : null;
      rebuiltFootnotes.push(line);
      i++;
      if (changeId) {
        const anchor = anchorMap.get(changeId);
        if (anchor) {
          rebuiltFootnotes.push(anchor);
        }
      }
      while (i < footnoteLines.length) {
        const bodyLine = footnoteLines[i];
        if (FOOTNOTE_DEF_START.test(bodyLine))
          break;
        if (FOOTNOTE_CONTINUATION.test(bodyLine) || bodyLine.trim() === "") {
          rebuiltFootnotes.push(bodyLine);
          i++;
        } else {
          break;
        }
      }
    } else {
      rebuiltFootnotes.push(line);
      i++;
    }
  }
  const cleanBody = cleanBodyLines.join("\n");
  const footnoteSection = rebuiltFootnotes.join("\n");
  return cleanBody + "\n\n" + footnoteSection + "\n";
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
function resolve(l3Text) {
  const lines = l3Text.split("\n");
  const { bodyLines, footnoteLines } = splitBodyAndFootnotes(lines);
  const body = bodyLines.join("\n");
  const doc = parseForFormat(l3Text);
  const parsedChanges = doc.getChanges();
  if (parsedChanges.length === 0) {
    return {
      resolvedText: l3Text,
      changes: [],
      coherenceRate: 100,
      unresolvedDiagnostics: []
    };
  }
  const allChanges = parsedChanges.map((node) => {
    if (node.status === ChangeStatus.Rejected) {
      return {
        id: node.id,
        resolved: true,
        resolutionPath: "rejected"
      };
    }
    const isConsumed = !!node.consumedBy;
    const isResolved = node.anchored || isConsumed;
    const result = {
      id: node.id,
      resolved: isResolved,
      resolutionPath: node.resolutionPath ?? (isResolved ? "replay" : "rejected"),
      freshAnchor: node.freshAnchor,
      // Only provide resolvedRange for non-consumed, anchored nodes.
      // Consumed ops' text is absent from the current body, so a body range is invalid.
      resolvedRange: node.anchored && !isConsumed ? { start: node.range.start, end: node.range.end } : void 0
    };
    if (node.consumedBy) {
      result.consumedBy = node.consumedBy;
      result.consumptionType = node.consumptionType ?? "full";
    }
    return result;
  });
  const totalResolvable = allChanges.length;
  const resolvedCount = allChanges.filter((c) => c.resolved).length;
  const coherenceRate = totalResolvable > 0 ? Math.round(resolvedCount / totalResolvable * 100) : 100;
  const unresolvedDiagnostics = [];
  for (const change of allChanges) {
    if (!change.resolved) {
      unresolvedDiagnostics.push(`${change.id}: unresolved via ${change.resolutionPath}`);
    }
  }
  const anchorMap = /* @__PURE__ */ new Map();
  for (const change of allChanges) {
    if (change.freshAnchor) {
      anchorMap.set(change.id, change.freshAnchor);
    }
  }
  const rebuiltFootnotes = [];
  let fi = 0;
  while (fi < footnoteLines.length) {
    const fline = footnoteLines[fi];
    const idMatch = fline.match(/^\[\^(ct-[\w.]+)\]:/);
    if (idMatch) {
      const changeId = idMatch[1];
      const freshAnchor = anchorMap.get(changeId);
      rebuiltFootnotes.push(fline);
      fi++;
      let editOpReplaced = false;
      while (fi < footnoteLines.length) {
        const contLine = footnoteLines[fi];
        if (FOOTNOTE_DEF_START.test(contLine))
          break;
        if (!editOpReplaced && FOOTNOTE_L3_EDIT_OP.test(contLine) && freshAnchor) {
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
  const resolvedText = body + "\n\n" + rebuiltFootnotes.join("\n") + "\n";
  return {
    resolvedText,
    changes: allChanges,
    coherenceRate,
    unresolvedDiagnostics
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
  const cleaned = text.replace(/\[\^ct-\d+(?:\.\d+)?\]/g, (match) => {
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
  if (!isL3 && text.includes("[^ct-") && isL3Format(text)) {
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
  const maxId = scanMaxCtId(text);
  const nextId = `ct-${maxId + 1}`;
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
    const maxId2 = scanMaxCtId(fileContent);
    const newChangeId2 = `ct-${maxId2 + 1}`;
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
  const maxId = scanMaxCtId(fileContent);
  const newChangeId = `ct-${maxId + 1}`;
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
function buildInlineMarkup(change, bodyText) {
  const { type, status, range, originalText, modifiedText, metadata } = change;
  const ref = `[^${change.id}]`;
  switch (type) {
    case ChangeType.Insertion: {
      if (status === ChangeStatus.Rejected) {
        return { replacement: `{++${modifiedText ?? ""}++}${ref}` };
      }
      const bodySlice = bodyText.slice(range.start, range.end);
      return { replacement: `{++${bodySlice}++}${ref}` };
    }
    case ChangeType.Deletion: {
      return { replacement: `{--${originalText ?? ""}--}${ref}` };
    }
    case ChangeType.Substitution: {
      if (status === ChangeStatus.Rejected) {
        const bodySlice2 = bodyText.slice(range.start, range.end);
        return { replacement: `{~~${bodySlice2}~>${modifiedText ?? ""}~~}${ref}` };
      }
      const bodySlice = bodyText.slice(range.start, range.end);
      return { replacement: `{~~${originalText ?? ""}~>${bodySlice}~~}${ref}` };
    }
    case ChangeType.Highlight: {
      const bodySlice = bodyText.slice(range.start, range.end);
      const comment = metadata?.comment;
      const commentPart = comment ? `{>>${comment}<<}` : "";
      return { replacement: `{==${bodySlice}==}${commentPart}${ref}` };
    }
    case ChangeType.Comment: {
      const comment = metadata?.comment ?? "";
      return { replacement: `{>>${comment}<<}${ref}` };
    }
  }
}
async function convertL3ToL2(text) {
  await initHashline();
  const parser = new FootnoteNativeParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changes.length === 0)
    return text;
  const hasProposed = changes.some((c) => c.status === ChangeStatus.Proposed);
  if (!hasProposed)
    return text;
  const unresolvedIds = new Set(changes.filter((c) => c.anchored === false).map((c) => c.id));
  const { bodyLines, footnoteLines } = splitBodyAndFootnotes(text.split("\n"));
  const sortedDesc = [...changes].sort((a, b) => b.range.start - a.range.start);
  let body = bodyLines.join("\n");
  const statusMap = /* @__PURE__ */ new Map();
  for (const change of changes) {
    statusMap.set(change.id, change.status);
  }
  for (const change of sortedDesc) {
    if (change.status !== ChangeStatus.Proposed)
      continue;
    if (unresolvedIds.has(change.id))
      continue;
    const { replacement } = buildInlineMarkup(change, body);
    if (change.type === ChangeType.Deletion || change.type === ChangeType.Comment) {
      body = body.slice(0, change.range.start) + replacement + body.slice(change.range.start);
    } else {
      body = body.slice(0, change.range.start) + replacement + body.slice(change.range.end);
    }
  }
  const rebuiltFootnotes = [];
  let i = 0;
  while (i < footnoteLines.length) {
    const line = footnoteLines[i];
    if (FOOTNOTE_DEF_START.test(line)) {
      const idMatch = line.match(/^\[\^(ct-[\w.]+)\]:/);
      const changeId = idMatch ? idMatch[1] : "";
      const changeStatus = statusMap.get(changeId);
      rebuiltFootnotes.push(line);
      i++;
      while (i < footnoteLines.length) {
        const bodyLine = footnoteLines[i];
        if (FOOTNOTE_DEF_START.test(bodyLine))
          break;
        if (FOOTNOTE_L3_EDIT_OP.test(bodyLine)) {
          if (changeStatus === ChangeStatus.Proposed && !unresolvedIds.has(changeId)) {
            i++;
            continue;
          }
          rebuiltFootnotes.push(bodyLine);
          i++;
          continue;
        }
        if (FOOTNOTE_CONTINUATION.test(bodyLine) || bodyLine.trim() === "") {
          rebuiltFootnotes.push(bodyLine);
          i++;
        } else {
          break;
        }
      }
    } else {
      rebuiltFootnotes.push(line);
      i++;
    }
  }
  const footnoteSection = rebuiltFootnotes.join("\n");
  if (rebuiltFootnotes.length === 0) {
    return body + "\n";
  }
  return body + "\n\n" + footnoteSection + "\n";
}
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
async function analyzeCompactionCandidates(l3Text) {
  const vdoc = l3Parser2.parse(l3Text);
  const changes = vdoc.getChanges();
  const decided = [];
  const proposed = [];
  const unresolved = [];
  const supersedeChains = [];
  const withActiveThreads = [];
  const lines = l3Text.split("\n");
  const chainOf = /* @__PURE__ */ new Map();
  for (const change of changes) {
    const ref = {
      id: change.id,
      status: change.status.toLowerCase(),
      author: change.metadata?.author,
      date: change.metadata?.date,
      type: changeTypeToAbbrev(change.type)
    };
    if (change.status === ChangeStatus.Accepted || change.status === ChangeStatus.Rejected) {
      decided.push(ref);
    } else if (change.status === ChangeStatus.Proposed) {
      proposed.push(ref);
    }
    const range = change.footnoteLineRange;
    if (range) {
      for (let lineIdx = range.startLine + 1; lineIdx <= range.endLine; lineIdx++) {
        const line = lines[lineIdx];
        const supersedesMatch = line.match(RE_SUPERSEDES);
        if (supersedesMatch) {
          const existing = chainOf.get(change.id) ?? [];
          existing.push(supersedesMatch[1]);
          chainOf.set(change.id, existing);
        }
      }
    }
    if ((change.replyCount ?? 0) > 0) {
      withActiveThreads.push(ref);
    }
  }
  for (const [activeId, consumedIds] of chainOf) {
    supersedeChains.push({ active: activeId, consumed: consumedIds });
  }
  return {
    decided,
    proposed,
    unresolved,
    supersedeChains,
    withActiveThreads,
    totalFootnotes: changes.length
  };
}
async function compact(l3Text, request) {
  await initHashline();
  const surface = await analyzeCompactionCandidates(l3Text);
  const proposedIds = new Set(surface.proposed.map((r) => r.id));
  let targetIds;
  if (request.targets === "all-decided") {
    targetIds = surface.decided.map((r) => r.id);
  } else {
    targetIds = [...request.targets];
  }
  const targetSet = new Set(targetIds);
  for (const chain of surface.supersedeChains) {
    if (targetSet.has(chain.active)) {
      for (const consumed of chain.consumed) {
        if (!targetSet.has(consumed)) {
          targetSet.add(consumed);
          targetIds.push(consumed);
        }
      }
    }
  }
  if (targetIds.length === 0) {
    return {
      text: l3Text,
      compactedIds: [],
      verification: {
        valid: true,
        danglingRefs: [],
        anchorCoherence: 100,
        unresolvedAnchors: [],
        danglingSupersedes: [],
        resolvedChanges: [],
        unresolvedDiagnostics: []
      }
    };
  }
  let workingText = l3Text;
  const proposedTargetIds = targetIds.filter((id) => proposedIds.has(id));
  if (request.undecidedPolicy === "reject" && proposedTargetIds.length > 0) {
    const preRejectDoc = l3Parser2.parse(workingText);
    const preRejectChanges = preRejectDoc.getChanges();
    const preRejectMap = new Map(preRejectChanges.map((c) => [c.id, c]));
    const rejectEdits = [];
    for (const id of proposedTargetIds) {
      const change = preRejectMap.get(id);
      if (!change || !change.anchored)
        continue;
      const edit = computeReject(change);
      if (edit.length > 0 || edit.newText.length > 0) {
        rejectEdits.push(edit);
      }
    }
    rejectEdits.sort((a, b) => b.offset - a.offset);
    for (const edit of rejectEdits) {
      workingText = workingText.slice(0, edit.offset) + edit.newText + workingText.slice(edit.offset + edit.length);
    }
  }
  const workingDoc = l3Parser2.parse(workingText);
  const workingChanges = workingDoc.getChanges();
  const changeMap = new Map(workingChanges.map((c) => [c.id, c]));
  const lines = workingText.split("\n");
  const blocks = targetIds.map((id) => ({ id, range: changeMap.get(id)?.footnoteLineRange })).filter((entry) => entry.range !== void 0).sort((a, b) => b.range.startLine - a.range.startLine);
  for (const { range } of blocks) {
    lines.splice(range.startLine, range.endLine - range.startLine + 1);
  }
  const maxId = scanMaxCtId(l3Text);
  const boundaryId = `ct-${maxId + 1}`;
  const boundaryLines = [`[^${boundaryId}]: compaction-boundary`];
  if (request.boundaryMeta) {
    for (const [key, value] of Object.entries(request.boundaryMeta)) {
      boundaryLines.push(`    ${key}: ${value}`);
    }
  }
  const { bodyLines: cleanBodyLines, footnoteLines: cleanFootnoteLines } = splitBodyAndFootnotes(lines);
  const resultParts = [];
  resultParts.push(cleanBodyLines.join("\n"));
  const hasFootnotes = cleanFootnoteLines.length > 0 || boundaryLines.length > 0;
  if (hasFootnotes && cleanBodyLines.length > 0) {
    resultParts.push("");
  }
  if (cleanFootnoteLines.length > 0) {
    resultParts.push(cleanFootnoteLines.join("\n"));
  }
  resultParts.push(boundaryLines.join("\n"));
  const resultText = resultParts.join("\n");
  const danglingRefCheck = verifyCompaction(resultText, targetIds);
  const resolution = resolve(resultText);
  const danglingSupersedes = checkSupersedesIntegrity(resultText, targetIds);
  const unresolvedAnchors = resolution.changes.filter((c) => !c.resolved).map((c) => c.id);
  const verification = {
    valid: danglingRefCheck.danglingRefs.length === 0 && unresolvedAnchors.length === 0 && danglingSupersedes.length === 0,
    danglingRefs: danglingRefCheck.danglingRefs,
    anchorCoherence: resolution.coherenceRate,
    unresolvedAnchors,
    danglingSupersedes,
    resolvedChanges: resolution.changes,
    unresolvedDiagnostics: resolution.unresolvedDiagnostics
  };
  return {
    text: resolution.resolvedText,
    compactedIds: targetIds,
    verification
  };
}
async function compactL2(l2Text, request) {
  const l3 = await convertL2ToL3(l2Text);
  const result = await compact(l3, request);
  const l2Result = await convertL3ToL2(result.text);
  return { ...result, text: l2Result };
}
function verifyCompaction(resultText, removedIds) {
  const removedSet = new Set(removedIds);
  const lines = resultText.split("\n");
  const { bodyLines } = splitBodyAndFootnotes(lines);
  const bodyText = bodyLines.join("\n");
  const refPattern = new RegExp(`\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`, "g");
  const danglingRefs = [];
  let match;
  while ((match = refPattern.exec(bodyText)) !== null) {
    if (removedSet.has(match[1])) {
      danglingRefs.push(match[1]);
    }
  }
  return { danglingRefs };
}
function checkSupersedesIntegrity(resultText, removedIds) {
  const removedSet = new Set(removedIds);
  const lines = resultText.split("\n");
  const { footnoteLines } = splitBodyAndFootnotes(lines);
  const survivingIds = /* @__PURE__ */ new Set();
  for (const line of footnoteLines) {
    const idMatch = line.match(new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:`));
    if (idMatch)
      survivingIds.add(idMatch[1]);
  }
  const dangling = [];
  for (const line of footnoteLines) {
    const match = RE_SUPERSEDES.exec(line);
    if (!match)
      continue;
    const refId = match[1];
    if (!survivingIds.has(refId) && !removedSet.has(refId)) {
      dangling.push(refId);
    }
  }
  return dangling;
}
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
var TRACKING_HEADER_RE, MAX_SCAN_LINES;
var init_tracking_header = __esm({
  "../../packages/core/dist-esm/tracking-header.js"() {
    "use strict";
    TRACKING_HEADER_RE = /<!--\s*ctrcks\.com\/v(\d+):\s*(tracked|untracked)\s*-->/;
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
  return /\{~~([\s\S]*?)~>([\s\S]*?)~~\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}
function multiLineInsertion() {
  return /\{\+\+([\s\S]*?)\+\+\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}
function multiLineDeletion() {
  return /\{--([\s\S]*?)--\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}
function multiLineHighlight() {
  return /\{==([\s\S]*?)==\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
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
  return /(?:\+\+\}|-{2}\}|~~\}|==\}|<<\})\[\^ct-\d+(?:\.\d+)?\]/g;
}
var HAS_CRITIC_MARKUP;
var init_critic_regex = __esm({
  "../../packages/core/dist-esm/critic-regex.js"() {
    "use strict";
    HAS_CRITIC_MARKUP = /\{\+\+|\{--|\{~~|\{==|\{>>|\[\^ct-\d/;
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
    REF_EXTRACT_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;
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
    FOOTNOTE_REF_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;
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
var init_state_machine = __esm({
  "../../packages/core/dist-esm/edit-boundary/state-machine.js"() {
    "use strict";
    init_signal_classifier();
    init_pending_buffer();
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
    exports.basename = (path14, { windows } = {}) => {
      const segs = path14.split(windows ? /[\\/]/ : "/");
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
    var picomatch4 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch4(input, options, returnState));
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
      const regex = isState ? picomatch4.compileRe(glob, options) : picomatch4.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch4(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch4.test(input, regex, options, { glob, posix });
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
    picomatch4.test = (input, regex, options, { glob, posix } = {}) => {
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
          match = picomatch4.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch4.matchBase = (input, glob, options) => {
      const regex = glob instanceof RegExp ? glob : picomatch4.makeRe(glob, options);
      return regex.test(utils.basename(input));
    };
    picomatch4.isMatch = (str, patterns, options) => picomatch4(patterns, options)(str);
    picomatch4.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch4.parse(p, options));
      return parse4(pattern, { ...options, fastpaths: false });
    };
    picomatch4.scan = (input, options) => scan(input, options);
    picomatch4.compileRe = (state, options, returnOutput = false, returnState = false) => {
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
      const regex = picomatch4.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch4.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
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
      return picomatch4.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch4.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch4.constants = constants;
    module.exports = picomatch4;
  }
});

// ../../node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "../../node_modules/picomatch/index.js"(exports, module) {
    "use strict";
    var pico = require_picomatch();
    var utils = require_utils();
    function picomatch4(glob, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0)) {
        options = { ...options, windows: utils.isWindows() };
      }
      return pico(glob, options, returnState);
    }
    Object.assign(picomatch4, pico);
    module.exports = picomatch4;
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

// ../../packages/cli/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "../../packages/cli/node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// ../../packages/cli/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "../../packages/cli/node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// ../../packages/cli/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "../../packages/cli/node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        if (argumentList.length > 0) {
          output = output.concat([
            helper.styleTitle("Arguments:"),
            ...argumentList,
            ""
          ]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return callFormatItem(
            helper.styleOptionTerm(helper.optionTerm(option)),
            helper.styleOptionDescription(helper.optionDescription(option))
          );
        });
        if (optionList.length > 0) {
          output = output.concat([
            helper.styleTitle("Options:"),
            ...optionList,
            ""
          ]);
        }
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              helper.styleTitle("Global Options:"),
              ...globalOptionList,
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return callFormatItem(
            helper.styleSubcommandTerm(helper.subcommandTerm(cmd2)),
            helper.styleSubcommandDescription(helper.subcommandDescription(cmd2))
          );
        });
        if (commandList.length > 0) {
          output = output.concat([
            helper.styleTitle("Commands:"),
            ...commandList,
            ""
          ]);
        }
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports.Help = Help2;
    exports.stripColor = stripColor;
  }
});

// ../../packages/cli/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "../../packages/cli/node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// ../../packages/cli/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "../../packages/cli/node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// ../../packages/cli/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "../../packages/cli/node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path14 = __require("node:path");
    var fs19 = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs19.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path14.resolve(baseDir, baseName);
          if (fs19.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path14.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs19.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs19.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path14.resolve(
            path14.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path14.basename(
              this._scriptPath,
              path14.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path14.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path14.basename(filename, path14.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path15) {
        if (path15 === void 0) return this._executableDir;
        this._executableDir = path15;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text = helper.formatHelp(this, helper);
        if (context.hasColors) return text;
        return this._outputConfiguration.stripColor(text);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process2.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
        return false;
      if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports.Command = Command2;
    exports.useColor = useColor;
  }
});

// ../../packages/cli/node_modules/commander/index.js
var require_commander = __commonJS({
  "../../packages/cli/node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// ../../packages/cli/dist/cli-parse.js
var OUTPUT_FLAGS = {
  "--json": "json",
  "--pretty": "pretty",
  "--quiet": "quiet"
};
function parseGlobalArgs(argv) {
  let outputFormat = "json";
  let projectDir;
  const consumed = /* @__PURE__ */ new Set();
  let commandIndex = -1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg in OUTPUT_FLAGS) {
      outputFormat = OUTPUT_FLAGS[arg];
      consumed.add(i);
      continue;
    }
    if (arg === "--project-dir" && i + 1 < argv.length) {
      projectDir = argv[i + 1];
      consumed.add(i);
      consumed.add(i + 1);
      i++;
      continue;
    }
    if ((arg === "--help" || arg === "-h") && commandIndex === -1) {
      consumed.add(i);
      commandIndex = -2;
      continue;
    }
    if (commandIndex === -1 && !arg.startsWith("-")) {
      commandIndex = i;
      consumed.add(i);
    }
  }
  if (commandIndex === -2) {
    return { command: "help", subArgs: [], outputFormat, projectDir };
  }
  const command = commandIndex >= 0 ? argv[commandIndex] : "help";
  const subArgs = [];
  for (let i = 0; i < argv.length; i++) {
    if (!consumed.has(i)) {
      subArgs.push(argv[i]);
    }
  }
  return { command, subArgs, outputFormat, projectDir };
}

// ../../packages/cli/dist/cli-runner.js
init_dist_esm();

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
  while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep5, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep5) {
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
function resolveProtocolMode(configMode) {
  const envVal = process.env["CHANGETRACKS_PROTOCOL_MODE"];
  if (envVal === "classic" || envVal === "compact")
    return envVal;
  return configMode;
}
function isFileInScope(filePath, config, projectDir) {
  let relative9;
  if (path.isAbsolute(filePath)) {
    relative9 = path.relative(projectDir, filePath);
  } else {
    relative9 = filePath;
  }
  relative9 = relative9.split(path.sep).join("/");
  const matchesInclude = (0, import_picomatch.default)(config.tracking.include);
  const matchesExclude = (0, import_picomatch.default)(config.tracking.exclude);
  return matchesInclude(relative9) && !matchesExclude(relative9);
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
   * Walks up from the file's directory looking for `.changetracks/config.toml`.
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
      throw new Error(`Cannot resolve path "${file}" because project root is unknown. Use an absolute path or set CHANGETRACKS_PROJECT_DIR to the workspace root.`);
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
   * Walk up from `startDir` looking for a directory containing `.changetracks/`.
   * Returns the project root (parent of `.changetracks/`) or undefined.
   */
  async findProjectRoot(startDir) {
    let dir = path2.resolve(startDir);
    const root = path2.parse(dir).root;
    while (true) {
      try {
        await fs2.access(path2.join(dir, ".changetracks", "config.toml"));
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
   * Walks up from startDir until it finds `.changetracks/config.toml`.
   */
  static findProjectRootSync(startDir) {
    if (!startDir)
      return void 0;
    let dir = path2.resolve(startDir);
    const root = path2.parse(dir).root;
    while (true) {
      if (existsSync(path2.join(dir, ".changetracks", "config.toml"))) {
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
   * Start watching `.changetracks/config.toml` for a project root.
   * On change, invalidates the cached config so the next forFile() re-reads.
   * Debounced at 100ms (fs.watch fires multiple events per save).
   * Idempotent — won't create duplicate watchers for the same project.
   */
  watchConfig(projectDir) {
    if (this.watchers.has(projectDir))
      return;
    const configPath = path2.join(projectDir, ".changetracks", "config.toml");
    try {
      const watcher = watch(configPath, () => {
        const existing = this.debounceTimers.get(projectDir);
        if (existing)
          clearTimeout(existing);
        this.debounceTimers.set(projectDir, setTimeout(() => {
          this.debounceTimers.delete(projectDir);
          this.cache.delete(projectDir);
          console.error(`changetracks: config changed, cache invalidated for ${projectDir}`);
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
    const groupId = `ct-${numericId}`;
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
   * When a group is active, returns a dotted child ID (`ct-N.M`) and
   * tracks the file as part of the group. Otherwise returns a flat
   * `ct-N` identifier.
   *
   * On first call for a file (outside a group), uses `scanMaxCtId(currentText)`
   * to find the max existing ID, then returns `ct-(max+1)`. On subsequent
   * calls, increments from the cached counter.
   */
  getNextId(filePath, currentText) {
    filePath = this.normalizePath(filePath);
    if (this.activeGroup) {
      this.activeGroup.childCount++;
      const childId = `ct-${this.activeGroup.numericId}.${this.activeGroup.childCount}`;
      this.activeGroup.childIds.push(childId);
      this.activeGroup.files.add(filePath);
      const currentCounter = this.counters.get(filePath);
      if (currentCounter === void 0) {
        const scannedMax = scanMaxCtId(currentText);
        this.counters.set(filePath, Math.max(scannedMax, this.activeGroup.numericId));
      } else {
        this.counters.set(filePath, Math.max(currentCounter, this.activeGroup.numericId));
      }
      return childId;
    }
    let counter = this.counters.get(filePath);
    if (counter === void 0) {
      counter = scanMaxCtId(currentText);
    }
    counter++;
    this.counters.set(filePath, counter);
    return `ct-${counter}`;
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
var AUTHOR_ENV_KEY = "CHANGETRACKS_AUTHOR";
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
      return "**You're seeing**: review view \u2014 full deliberation context. CriticMarkup shows proposals inline, [ct-N] anchors link to end-of-line metadata.\nOther views: `changes` (clean prose + P/A flags), `settled` (accept-all preview).";
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
async function handleReviewChanges(args, resolver, state) {
  try {
    const file = optionalStrArg(args, "file", "file");
    const reviewsRaw = args.reviews;
    const responsesRaw = args.responses;
    const settleFlag = args.settle === true;
    const authorArg = optionalStrArg(args, "author", "author");
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    const hasReviews = Array.isArray(reviewsRaw) && reviewsRaw.length > 0;
    const hasResponses = Array.isArray(responsesRaw) && responsesRaw.length > 0;
    if (!hasReviews && !hasResponses && !settleFlag) {
      return errorResult('At least one of "reviews", "responses", or "settle" must be provided.');
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`);
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
      const footnoteStart = postLines.findIndex((l) => /^\[\^ct-/.test(l));
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
        return errorResult(`This project requires view "${config.policy.default_view}" (view_policy = "require"). Requested view "${requestedView}" is not allowed. Change view_policy to "suggest" in .changetracks/config.toml to allow view selection.`);
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
        return errorResult("Committed view requires hashline mode. Enable hashline in .changetracks/config.toml: [hashline] enabled = true");
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
        headerWithoutHashlineTip = headerWithoutHashlineTip.replace(/## tip:.*/, "## tip: Hashline addressing is disabled but compact mode requires it. Enable in .changetracks/config.toml: [hashline] enabled = true");
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
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`);
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

// ../../packages/cli/dist/engine/handlers/supersede-change.js
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/resolve-thread.js
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/propose-change.js
init_dist_esm();
import * as fs8 from "node:fs/promises";
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
        "This means the file content has changed since your last read \u2014 likely because",
        "a proposal was accepted and settled, or another agent edited this region.",
        "The hash is a verification token that confirms you are targeting the content",
        "you intend to modify.",
        "",
        "Call read_tracked_file to get current hashes, then retry your full batch",
        "with corrected coordinates. Do not break your batch into smaller pieces \u2014",
        "the mismatch affects specific coordinates, not your batch structure.",
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
import * as fs7 from "node:fs/promises";

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
  const startResult = validateOrAutoRemap({ line: startLine, hash: startHash }, fileLines, "start_line", relocations, autoRemap);
  startLine = startResult.line;
  if (startResult.remap)
    remaps.push(startResult.remap);
  if (parsed.startLine !== parsed.endLine) {
    const endResult = validateOrAutoRemap({ line: endLine, hash: endHash }, fileLines, "end_line", relocations, autoRemap);
    endLine = endResult.line;
    if (endResult.remap)
      remaps.push(endResult.remap);
  } else {
    endLine = startLine;
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
  void fileContent;
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
      fileContent = await fs7.readFile(filePath, "utf-8");
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
      return errorResult2("Hashline addressing in batch requires [hashline] enabled = true in .changetracks/config.toml", { file: relativePath });
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
                console.error(`[changetracks] overlap detection: match failed, deferring to apply phase: ${err}`);
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
    const knownMaxId = scanMaxCtId(fileContent);
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
    await fs7.writeFile(filePath, currentText, "utf-8");
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
    const footnoteCount = (currentText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (currentText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (currentText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = currentText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
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
      const strippedOld = oldText.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, "").trim();
      const strippedNew = newText.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, "").trim();
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
      return errorResult3("Hashline addressing requires [hashline] enabled = true in .changetracks/config.toml", "HASHLINE_DISABLED", {
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
      fileContent = await fs8.readFile(filePath, "utf-8");
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
      await fs8.mkdir(path7.dirname(filePath), { recursive: true });
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
    await fs8.writeFile(filePath, modifiedText, "utf-8");
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
    const footnoteCount = (modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
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
    fileContent = await fs8.readFile(filePath, "utf-8");
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
  await fs8.writeFile(filePath, modifiedText, "utf-8");
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
  await fs8.writeFile(filePath, modifiedText, "utf-8");
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
  const footnoteCount = (modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
  const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
  const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
  const authorMatches = modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
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
import * as fs9 from "node:fs/promises";
import * as path8 from "node:path";
async function scanProjectForMaxId(projectDir, config) {
  let max = 0;
  try {
    const entries = await fs9.readdir(projectDir, { recursive: true });
    for (const rawEntry of entries) {
      const entry = typeof rawEntry === "string" ? rawEntry : String(rawEntry);
      const fullPath = path8.join(projectDir, entry);
      if (!isFileInScope(fullPath, config, projectDir))
        continue;
      try {
        const content = await fs9.readFile(fullPath, "utf-8");
        const fileMax = scanMaxCtId(content);
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
import * as fs10 from "node:fs/promises";
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
      const fileContent = await fs10.readFile(targetFile, "utf-8");
      const modifiedText = appendFootnote(fileContent, footnoteBlock);
      await fs10.writeFile(targetFile, modifiedText, "utf-8");
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
init_dist_esm();
init_dist_esm();

// ../../packages/cli/dist/engine/index.js
init_dist_esm();

// ../../packages/cli/dist/engine/handlers/respond-to-thread.js
import * as fs11 from "node:fs/promises";
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
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs11.readFile(filePath, "utf-8");
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
    await fs11.writeFile(filePath, result.text, "utf-8");
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
import * as fs12 from "node:fs/promises";
import * as path10 from "node:path";
var TRACKING_HEADER_TRACKED = "<!-- ctrcks.com/v1: tracked -->";
var VALID_STATUSES = ["proposed", "accepted", "rejected"];
async function hasTrackingHeader(filePath) {
  try {
    const fd = await fs12.open(filePath, "r");
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
    const entries = await fs12.readdir(dirPath, { recursive: true });
    for (const raw of entries) {
      const entry = typeof raw === "string" ? raw : String(raw);
      const full = path10.join(dirPath, entry);
      if (!entry.endsWith(".md"))
        continue;
      try {
        const stat3 = await fs12.stat(full);
        if (!stat3.isFile())
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
      const stat3 = await fs12.stat(resolvedPath);
      if (stat3.isFile()) {
        if (!isFileInScope(resolvedPath, config, projectDir)) {
          return errorResult(`File is not in scope for tracking: "${resolvedPath}". Check .changetracks/config.toml include/exclude patterns.`);
        }
        filesToScan = [resolvedPath];
      } else if (stat3.isDirectory()) {
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
        content = await fs12.readFile(fp, "utf-8");
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
import * as fs13 from "node:fs/promises";
import * as path11 from "node:path";
init_file_ops2();
var MARKUP_OPENERS = [/\{\+\+/g, /\{\-\-/g, /\{\~\~/g];
var FOOTNOTE_REF = /\[\^ct-\d+(?:\.\d+)?\]/g;
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
      fileContent = await fs13.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const modifiedText = replaceUnique(fileContent, oldText, newText);
    await fs13.writeFile(filePath, modifiedText, "utf-8");
    console.error(`[changetracks] raw_edit bypassed tracking: ${reason}`);
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
import * as fs14 from "node:fs/promises";
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
      let relative9 = path12.relative(projectDir, filePath);
      relative9 = relative9.split(path12.sep).join("/");
      const matchesHooksExclude = (0, import_picomatch2.default)(config2.hooks.exclude);
      const hookExcluded = matchesHooksExclude(relative9);
      const out = {
        ...status,
        hook_excluded: hookExcluded,
        hooks_exclude: config2.hooks.exclude
      };
      const isTracked = status.status === "tracked";
      if (isTracked) {
        let content;
        try {
          content = await fs14.readFile(filePath, "utf-8");
        } catch {
          content = "";
        }
        const beforeSettle = countFootnoteHeadersWithStatus(content, "accepted");
        out.accepted_unsettled_count = beforeSettle;
        if (settleAccepted && beforeSettle > 0) {
          const { settledContent, settledIds } = settleAcceptedChanges(content);
          if (settledIds.length > 0) {
            await fs14.writeFile(filePath, settledContent, "utf-8");
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
import * as fs15 from "node:fs/promises";
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
      const stat3 = await fs15.stat(filePath);
      if (!stat3.isFile()) {
        return errorResult4(`Not a file: "${filePath}"`);
      }
    } catch {
      return errorResult4(`File not found or unreadable: "${filePath}"`);
    }
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult4(`File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs15.readFile(filePath, "utf-8");
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

// ../../packages/cli/dist/engine/handlers/find-tracked-files.js
var import_picomatch3 = __toESM(require_picomatch2(), 1);
import * as fs16 from "node:fs/promises";
import * as path13 from "node:path";
async function handleFindTrackedFiles(args, resolver, _state) {
  const dirArg = args.path;
  const searchDir = dirArg ? path13.resolve(dirArg) : resolver.resolveDir();
  const syntheticFile = path13.join(searchDir, "__probe__.md");
  const { config, projectDir } = await resolver.forFile(syntheticFile);
  const matchesInclude = (0, import_picomatch3.default)(config.tracking.include);
  const matchesExclude = (0, import_picomatch3.default)(config.tracking.exclude);
  const tracked = [];
  await walkDir(searchDir, projectDir, matchesInclude, matchesExclude, tracked);
  tracked.sort();
  return {
    content: [{ type: "text", text: tracked.join("\n") }]
  };
}
async function walkDir(dir, projectDir, matchesInclude, matchesExclude, results) {
  let entries;
  try {
    entries = await fs16.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path13.join(dir, entry.name);
    let relative9 = path13.relative(projectDir, fullPath);
    relative9 = relative9.split(path13.sep).join("/");
    if (entry.isDirectory()) {
      if (matchesExclude(relative9) || matchesExclude(relative9 + "/")) {
        continue;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      await walkDir(fullPath, projectDir, matchesInclude, matchesExclude, results);
    } else if (entry.isFile()) {
      if (matchesInclude(relative9) && !matchesExclude(relative9)) {
        results.push(relative9);
      }
    }
  }
}

// ../../packages/cli/dist/engine/handlers/compact-changes.js
import * as fs17 from "node:fs/promises";
init_dist_esm();
async function handleCompactChanges(args, resolver, state) {
  try {
    const file = args.file;
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    const targets = args.targets;
    if (!targets) {
      return errorResult('Missing required argument: "targets"');
    }
    if (targets !== "all-decided" && !Array.isArray(targets)) {
      return errorResult('Invalid "targets": must be an array of change IDs or "all-decided"');
    }
    const undecidedPolicy = args.undecided_policy ?? args.undecidedPolicy ?? "accept";
    if (undecidedPolicy !== "accept" && undecidedPolicy !== "reject") {
      return errorResult(`Invalid undecided_policy: "${undecidedPolicy}". Must be "accept" or "reject".`);
    }
    const boundaryMeta = args.boundary_meta ?? args.boundaryMeta;
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(`File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`);
    }
    let fileContent;
    try {
      fileContent = await fs17.readFile(filePath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }
    const l3 = isL3Format(fileContent);
    const compactFn = l3 ? compact : compactL2;
    const request = {
      targets,
      undecidedPolicy,
      boundaryMeta
    };
    const result = await compactFn(fileContent, request);
    if (result.text !== fileContent) {
      await fs17.writeFile(filePath, result.text, "utf-8");
    }
    await rerecordState(state, filePath, result.text, config);
    const response = {
      compacted_ids: result.compactedIds,
      format: l3 ? "L3" : "L2",
      verification: result.verification
    };
    if (result.compactedIds.length === 0) {
      response.message = "No changes were compacted.";
    } else {
      response.message = `Compacted ${result.compactedIds.length} change(s): ${result.compactedIds.join(", ")}.`;
    }
    if (!result.verification.valid) {
      response.warning = `${result.verification.danglingRefs.length} dangling ref(s) detected: ` + result.verification.danglingRefs.join(", ");
    }
    return {
      content: [{ type: "text", text: JSON.stringify(response) }]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

// ../../packages/cli/node_modules/commander/esm.mjs
var import_index2 = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index2.default;

// ../../packages/cli/dist/cli-helpers.js
function stringFlag(value) {
  return typeof value === "string" ? value : void 0;
}
function parseIntFlag(value) {
  const s = stringFlag(value);
  if (s === void 0)
    return void 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? void 0 : n;
}
function helpResult(usage) {
  return { success: true, data: {}, message: "", rawText: usage };
}
function usageError(message) {
  return { success: false, data: {}, message, error: "USAGE_ERROR" };
}

// ../../packages/cli/dist/cli-output.js
function summarizeItems(items) {
  if (items.length === 0)
    return "No results";
  if (typeof items[0] === "string") {
    return items.join("\n");
  }
  const rows = [];
  rows.push("ID         File                               Type  Status    Author");
  rows.push("\u2500".repeat(72));
  for (const item of items) {
    const id = String(item.change_id ?? item.id ?? "").padEnd(10);
    const rawFile = String(item.file ?? "");
    const file = (rawFile.length > 33 ? "\u2026" + rawFile.slice(-32) : rawFile).padEnd(33);
    const type = String(item.type ?? "").slice(0, 3).padEnd(5);
    const status = String(item.status ?? "").slice(0, 8).padEnd(9);
    const author = String(item.author ?? "");
    rows.push(`${id} ${file} ${type} ${status} ${author}`);
  }
  rows.push(`
${items.length} change(s)`);
  return rows.join("\n");
}
function summarize(data) {
  if (Array.isArray(data.items)) {
    return summarizeItems(data.items);
  }
  const parts = [];
  const changeId = data.change_id ?? data.group_id;
  if (typeof changeId === "string") {
    parts.push(changeId);
  }
  if (typeof data.type === "string") {
    parts.push(`(${data.type})`);
  }
  if (typeof data.file === "string") {
    parts.push(`in ${data.file}`);
  }
  if (parts.length === 0)
    return "OK";
  const prefix = data.change_id && !data.amended && !data.decision ? "Proposed " : "";
  return prefix + parts.join(" ");
}
function handlerToCliResult(handlerResult, opts) {
  const text = handlerResult.content.map((c) => c.text).join("");
  const isError = handlerResult.isError === true;
  if (opts?.raw) {
    if (isError) {
      return { success: false, data: {}, message: text };
    }
    return { success: true, data: {}, message: "", rawText: text };
  }
  let parsed;
  try {
    const raw = JSON.parse(text);
    parsed = Array.isArray(raw) ? { items: raw } : raw;
  } catch {
    if (isError) {
      return { success: false, data: {}, message: text };
    }
    return { success: true, data: {}, message: "", rawText: text };
  }
  if (isError) {
    const code = typeof parsed.code === "string" ? parsed.code : "ERROR";
    const msg = typeof parsed.message === "string" ? parsed.message : text;
    return { success: false, data: {}, message: msg, error: code };
  }
  return {
    success: true,
    data: parsed,
    message: summarize(parsed)
  };
}
function formatResult(result, format) {
  switch (format) {
    case "json":
      return formatJson(result);
    case "pretty":
      return formatPretty(result);
    case "quiet":
      return formatQuiet(result);
  }
}
function formatJson(result) {
  if (!result.success) {
    return JSON.stringify({ error: result.error, message: result.message }, null, 2) + "\n";
  }
  if (result.rawText !== void 0) {
    return JSON.stringify({ content: result.rawText }, null, 2) + "\n";
  }
  return JSON.stringify(result.data, null, 2) + "\n";
}
function formatPretty(result) {
  if (!result.success) {
    return `Error: ${result.message}
`;
  }
  if (result.rawText !== void 0) {
    return result.rawText + "\n";
  }
  return result.message + "\n";
}
function formatQuiet(result) {
  if (!result.success) {
    return (result.error ?? "ERROR") + "\n";
  }
  if (result.rawText !== void 0) {
    return result.rawText + "\n";
  }
  const id = result.data.change_id ?? result.data.group_id;
  if (typeof id === "string") {
    return id + "\n";
  }
  return "OK\n";
}

// ../../packages/cli/dist/schema-executor.js
var ParseError = class extends Error {
  code;
  constructor(message, code = "PARSE_ERROR") {
    super(message);
    this.code = code;
  }
};
async function executeCommand(def, subArgs, resolver, state) {
  if (def.subcommands) {
    if (subArgs.includes("--help") || subArgs.includes("-h"))
      return helpResult(def.usage);
    const sub = subArgs[0];
    if (sub && def.subcommands[sub]) {
      return executeCommand(def.subcommands[sub], subArgs.slice(1), resolver, state);
    }
    return usageError(def.usage);
  }
  return new Promise((resolve6) => {
    const cmd = new Command();
    cmd.allowUnknownOption(false);
    cmd.exitOverride();
    cmd.configureOutput({ writeOut: () => {
    }, writeErr: () => {
    } });
    const requiredIndices = def.requiredPositionals ?? def.positionals.map((_, i) => i);
    for (let i = 0; i < def.positionals.length; i++) {
      const name = def.positionals[i];
      if (requiredIndices.includes(i)) {
        cmd.argument(`<${name}>`);
      } else {
        cmd.argument(`[${name}]`);
      }
    }
    const registeredLongFlags = /* @__PURE__ */ new Set();
    function addValueOption(cliFlag) {
      if (!registeredLongFlags.has(cliFlag)) {
        registeredLongFlags.add(cliFlag);
        cmd.option(`--${cliFlag} <value>`);
      }
    }
    if (def.flagMapping) {
      for (const cliFlag of Object.keys(def.flagMapping)) {
        addValueOption(cliFlag);
      }
    }
    if (def.directFlags) {
      for (const schemaProp of def.directFlags) {
        if (def.positionals.includes(schemaProp))
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        addValueOption(cliFlag);
      }
    }
    if (def.customParsers) {
      for (const schemaProp of Object.keys(def.customParsers)) {
        if (def.positionals.includes(schemaProp))
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        addValueOption(cliFlag);
      }
    }
    if (def.intFlags) {
      for (const schemaProp of def.intFlags) {
        if (def.positionals.includes(schemaProp))
          continue;
        const isTargetOfFlagMapping = def.flagMapping ? Object.values(def.flagMapping).includes(schemaProp) : false;
        if (isTargetOfFlagMapping)
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        addValueOption(cliFlag);
      }
    }
    if (def.booleanFlags) {
      for (const cliFlag of def.booleanFlags) {
        if (!registeredLongFlags.has(cliFlag)) {
          registeredLongFlags.add(cliFlag);
          cmd.option(`--${cliFlag}`);
        }
      }
    }
    if (def.booleanFlagMapping) {
      for (const cliFlag of Object.keys(def.booleanFlagMapping)) {
        if (!registeredLongFlags.has(cliFlag)) {
          registeredLongFlags.add(cliFlag);
          cmd.option(`--${cliFlag}`);
        }
      }
    }
    let actionCalled = false;
    let positionalValues = [];
    let optionValues = {};
    cmd.action((...actionArgs) => {
      actionCalled = true;
      positionalValues = def.positionals.map((_, i) => actionArgs[i]);
      optionValues = actionArgs[def.positionals.length] ?? {};
    });
    try {
      cmd.parse(subArgs, { from: "user" });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        const code = err.code;
        if (code === "commander.helpDisplayed") {
          resolve6(helpResult(def.usage));
          return;
        }
      }
      resolve6(usageError(def.usage));
      return;
    }
    if (!actionCalled) {
      resolve6(usageError(def.usage));
      return;
    }
    const args = {};
    for (let i = 0; i < def.positionals.length; i++) {
      if (positionalValues[i] !== void 0) {
        args[def.positionals[i]] = positionalValues[i];
      }
    }
    for (const idx of requiredIndices) {
      const name = def.positionals[idx];
      if (name && args[name] === void 0) {
        resolve6(usageError(def.usage));
        return;
      }
    }
    const reverseMap = {};
    function kebabToCamel(kebab) {
      return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
    if (def.flagMapping) {
      for (const [cliFlag, schemaProp] of Object.entries(def.flagMapping)) {
        const camelKey = kebabToCamel(cliFlag);
        reverseMap[camelKey] = schemaProp;
      }
    }
    if (def.directFlags) {
      for (const schemaProp of def.directFlags) {
        if (def.positionals.includes(schemaProp))
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }
    if (def.customParsers) {
      for (const schemaProp of Object.keys(def.customParsers)) {
        if (def.positionals.includes(schemaProp))
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }
    if (def.intFlags) {
      for (const schemaProp of def.intFlags) {
        if (def.positionals.includes(schemaProp))
          continue;
        const cliFlag = schemaProp.replace(/_/g, "-");
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }
    if (def.booleanFlags) {
      for (const cliFlag of def.booleanFlags) {
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = cliFlag;
        }
      }
    }
    if (def.booleanFlagMapping) {
      for (const [cliFlag, schemaProp] of Object.entries(def.booleanFlagMapping)) {
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }
    const intFlagSet = new Set(def.intFlags ?? []);
    const customParsers = def.customParsers ?? {};
    for (const [optKey, value] of Object.entries(optionValues)) {
      if (value === void 0)
        continue;
      const schemaProp = reverseMap[optKey] ?? optKey;
      if (def.positionals.includes(schemaProp))
        continue;
      if (value === true) {
        args[schemaProp] = true;
        continue;
      }
      if (customParsers[schemaProp]) {
        try {
          const parsedValue = customParsers[schemaProp](value);
          if (parsedValue !== void 0)
            args[schemaProp] = parsedValue;
        } catch (err) {
          if (err instanceof ParseError) {
            resolve6({ success: false, data: {}, message: err.message, error: err.code });
            return;
          }
          resolve6({
            success: false,
            data: {},
            message: err instanceof Error ? err.message : String(err),
            error: "PARSE_ERROR"
          });
          return;
        }
        continue;
      }
      if (intFlagSet.has(schemaProp)) {
        const n = parseIntFlag(value);
        if (n !== void 0)
          args[schemaProp] = n;
        continue;
      }
      if (typeof value === "string") {
        args[schemaProp] = value;
      }
    }
    if (def.defaults) {
      for (const [key, defaultVal] of Object.entries(def.defaults)) {
        if (args[key] === void 0) {
          args[key] = defaultVal;
        }
      }
    }
    if (def.preProcess) {
      try {
        def.preProcess(args);
      } catch (err) {
        if (err instanceof ParseError) {
          resolve6({ success: false, data: {}, message: err.message, error: err.code });
          return;
        }
        resolve6({
          success: false,
          data: {},
          message: err instanceof Error ? err.message : String(err),
          error: "INTERNAL_ERROR"
        });
        return;
      }
    }
    def.handler(args, resolver, state).then((result) => resolve6(handlerToCliResult(result, { raw: def.rawOutput })), (err) => resolve6({
      success: false,
      data: {},
      message: err instanceof Error ? err.message : String(err),
      error: "INTERNAL_ERROR"
    }));
  });
}

// ../../packages/cli/dist/cli-batch-handler.js
import * as fs18 from "node:fs/promises";
async function handleCliBatch(args, resolver, state) {
  if (args.changes !== void 0) {
    return handleProposeBatch(args, resolver, state);
  }
  const fromPath = args.from;
  if (fromPath) {
    let fileContent;
    try {
      fileContent = await fs18.readFile(fromPath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to read --from file "${fromPath}": ${msg}` }],
        isError: true
      };
    }
    let changes;
    try {
      changes = JSON.parse(fileContent);
      if (!Array.isArray(changes)) {
        throw new Error("Expected a JSON array");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Invalid JSON in --from file "${fromPath}": ${msg}` }],
        isError: true
      };
    }
    return handleProposeBatch({ ...args, changes }, resolver, state);
  }
  return {
    content: [{
      type: "text",
      text: "No changes provided. Use --changes JSON or --from file.json."
    }],
    isError: true
  };
}

// ../../packages/cli/dist/agent-command-registry.js
var READ_USAGE = `Usage: sc read <file> [flags]

Read a tracked file with hashline coordinates.

Flags:
  --offset N       Line number to start from (1-indexed, default: 1)
  --limit N        Maximum lines to return (default: 500, max: 2000)
  --view MODE      Display mode: meta (default), content, full, or settled
  --include-meta   Include change levels line and full tip
`;
var STATUS_USAGE = `Usage: sc status [<file>]

Check tracking status of a file or project.

When called with a file, shows that file's tracking status and
which layer determined it (header, config, or default).
When called with no arguments, shows project-wide config summary.
`;
var GET_USAGE = `Usage: sc get <file> <change-id> [flags]

Get full details of a tracked change.

Shows inline markup with surrounding context, footnote metadata,
discussion thread, and group info.

Flags:
  --context N      Lines of surrounding context (default: 3)
`;
var LIST_USAGE = `Usage: sc list <path> [flags]

List changes with proposed status or open discussion threads.

Path can be a file or directory. If directory, scans **/*.md.

Flags:
  --author @NAME       Filter by author (e.g. "@ai:claude-opus-4.6")
  --status LIST        Comma-separated statuses: proposed,accepted,rejected
`;
var PROPOSE_USAGE = `Usage: sc propose <file> [flags]

Propose a tracked change to a markdown file.

Modes:
  String match:    --old "text" --new "text"
  Insert after:    --new "text" --insert-after "anchor"
  Line range:      --start N --start-hash XX --new "text"
  Compact:         --at "5:a3" --op "{~~old~>new~~}{>>reason"

Flags:
  --old TEXT           Text to replace (empty = insertion)
  --new TEXT           Replacement text (empty = deletion)
  --insert-after TEXT  Insert after this anchor text
  --reason TEXT     Why this change is being made
  --author TEXT        Who is making this change
  --at COORD           Hashline coordinate (compact mode)
  --op EXPR            Operation expression (compact mode)
  --start N            Start line (1-indexed)
  --start-hash XX      Hash for start line verification
  --end N              End line (1-indexed, inclusive)
  --end-hash XX        Hash for end line verification
  --after-line N       Insert after this line number
  --after-hash XX      Hash for after-line verification
  --level N            Participation level: 1 (compact) or 2 (footnote, default)
`;
var BATCH_USAGE = `Usage: sc batch <file> [flags]

Propose a batch of tracked changes as one atomic edit.

All changes are applied all-or-nothing with automatic coordinate
adjustment and an auto-created change group.

Input sources (first match wins):
  --changes JSON       JSON array of operations (inline)
  --from FILE          Read changes JSON from a file

Flags:
  --reason TEXT      Why this batch of changes is being made
  --author TEXT         Who is making this change

Each operation in --changes/--from supports:
  Classic: {"old_text": "...", "new_text": "...", "reason": "..."}
  Compact: {"at": "5:a3", "op": "{~~old~>new~~}{>>reason"}
`;
var AMEND_USAGE = `Usage: sc amend <file> <change-id> [flags]

Amend a previously proposed change.

Updates inline markup in place, preserves the change ID and
discussion thread, adds revision history to the footnote.

Flags:
  --new TEXT           The new proposed text (alias for --new-text)
  --new-text TEXT      The new proposed text
  --reason TEXT     Why this amendment is being made
  --author TEXT        Who is making this change (must match original)
`;
var REVIEW_USAGE = `Usage: sc review <file> [<change-id>] [flags]

Review one or more changes (accept, reject, or request changes).

Single change (convenience):
  sc review <file> <change-id> --decision approve --reason "..."

Batch mode:
  sc review <file> --reviews '[{"change_id":"ct-1","decision":"approve","reasoning":"..."}]'

Flags:
  --decision DECISION  approve, reject, or request_changes (single mode)
  --reason TEXT      Why this decision (single mode)
  --reviews JSON        JSON array of review objects (batch mode)
  --settle              Settle (compact) accepted/rejected changes after review
  --author TEXT         Who is making this review

Decisions: approve, reject, request_changes
`;
var RESPOND_USAGE = `Usage: sc respond <file> <change-id> [response] [flags]

Add a response to an existing change's discussion thread.

The response text can be provided as a positional argument or via --response flag.

Flags:
  --response TEXT       Response text (alternative to positional)
  --label TYPE          Comment label: suggestion, issue, question,
                        praise, todo, thought, nitpick
  --author TEXT         Who is making this response
`;
var GROUP_USAGE = `Usage: sc group <subcommand> [flags]

Manage change groups for related edits.

Subcommands:
  begin    Start a new change group
  end      Close the active change group

Begin flags:
  --description TEXT   Group description (required)
  --reason TEXT     Why this group of changes

End flags:
  --author TEXT        Who is closing the group
  --summary TEXT       Summary of the group's changes
`;
var FILES_USAGE = `Usage: sc files [<directory>]

List tracked files in a directory.

Uses the project config's tracking include/exclude patterns to find
files that are in scope for tracking. Defaults to the project root
if no directory is specified.

Aliases: sc ls
`;
var RAW_EDIT_USAGE = `Usage: sc raw-edit <file> [flags]

Edit a tracked file without CriticMarkup wrapping.

Use ONLY for maintenance: fixing corrupted markup, cleaning
resolved footnotes, editing config. Not tracked.

Flags:
  --old TEXT           Text to replace (required)
  --new TEXT           Replacement text (required)
  --reason TEXT        Why this edit must bypass tracking (required)
`;
var COMPACT_USAGE = `Usage: sc compact <file> [flags]

Compact decided (accepted/rejected) footnotes from a tracked file.

Removes targeted footnote blocks, applies body mutations for rejected
proposed changes, and inserts a compaction-boundary footnote.

Flags:
  --targets JSON       JSON array of change IDs or "all-decided" (required)
  --undecided-policy   Policy for undecided changes: accept or reject (default: accept)
  --boundary-meta JSON Optional metadata for the compaction-boundary footnote
`;
function parseJsonArray(flagName) {
  return (v) => {
    try {
      const arr = JSON.parse(stringFlag(v) ?? "");
      if (!Array.isArray(arr))
        throw new Error();
      return arr;
    } catch {
      throw new ParseError(`Invalid JSON in --${flagName} flag. Provide a valid JSON array.`, "INVALID_JSON");
    }
  };
}
var COMMANDS = {
  read: {
    handler: handleReadTrackedFile,
    positionals: ["file"],
    rawOutput: true,
    flagMapping: { offset: "offset", limit: "limit" },
    booleanFlagMapping: { "include-meta": "include_meta" },
    intFlags: ["offset", "limit"],
    directFlags: ["view"],
    usage: READ_USAGE
  },
  status: {
    handler: handleGetTrackingStatus,
    positionals: ["file"],
    requiredPositionals: [],
    // file is optional
    usage: STATUS_USAGE
  },
  get: {
    handler: handleGetChange,
    positionals: ["file", "change_id"],
    flagMapping: { context: "context_lines" },
    intFlags: ["context_lines"],
    usage: GET_USAGE
  },
  list: {
    handler: handleListOpenThreads,
    positionals: ["path"],
    directFlags: ["author", "limit"],
    customParsers: {
      status: (v) => {
        const s = stringFlag(v);
        return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : void 0;
      }
    },
    usage: LIST_USAGE
  },
  propose: {
    handler: handleProposeChange,
    positionals: ["file"],
    flagMapping: {
      old: "old_text",
      new: "new_text",
      "insert-after": "insert_after",
      start: "start_line",
      "start-hash": "start_hash",
      end: "end_line",
      "end-hash": "end_hash",
      "after-line": "after_line",
      "after-hash": "after_hash"
    },
    intFlags: ["start_line", "end_line", "after_line"],
    directFlags: ["reason", "author", "at", "op", "level"],
    defaults: { old_text: "", new_text: "" },
    usage: PROPOSE_USAGE
  },
  batch: {
    handler: handleCliBatch,
    positionals: ["file"],
    directFlags: ["reason", "author", "from"],
    customParsers: {
      changes: parseJsonArray("changes")
    },
    usage: BATCH_USAGE
  },
  amend: {
    handler: handleAmendChange,
    positionals: ["file", "change_id"],
    flagMapping: { "new-text": "new_text", new: "new_text" },
    directFlags: ["reason", "author"],
    usage: AMEND_USAGE
  },
  review: {
    handler: handleReviewChanges,
    positionals: ["file", "change_id"],
    requiredPositionals: [0],
    // file required, change_id optional
    directFlags: ["author", "decision", "reason"],
    booleanFlags: ["settle"],
    customParsers: {
      reviews: parseJsonArray("reviews")
    },
    preProcess: (args) => {
      if (args.change_id && args.reviews) {
        throw new ParseError("Provide either <change-id> --decision (single mode) or --reviews JSON (batch mode), not both.", "USAGE_ERROR");
      }
      if (args.change_id && args.decision && !args.reviews) {
        args.reviews = [{
          change_id: args.change_id,
          decision: args.decision,
          reason: args.reason ?? ""
        }];
        delete args.change_id;
        delete args.decision;
        delete args.reason;
      }
    },
    usage: REVIEW_USAGE
  },
  respond: {
    handler: handleRespondToThread,
    positionals: ["file", "change_id", "response"],
    requiredPositionals: [0, 1],
    // file and change_id required, response optional
    directFlags: ["label", "author"],
    // --response flag maps to response_flag; preProcess promotes it to response if not set by positional
    flagMapping: { response: "response_flag" },
    preProcess: (args) => {
      if (args.response === void 0 && args.response_flag !== void 0) {
        args.response = args.response_flag;
      }
      delete args.response_flag;
    },
    usage: RESPOND_USAGE
  },
  group: {
    handler: handleBeginChangeGroup,
    // placeholder — subcommands handle dispatch
    positionals: [],
    subcommands: {
      begin: {
        handler: handleBeginChangeGroup,
        positionals: [],
        directFlags: ["description", "reason"],
        usage: GROUP_USAGE
      },
      end: {
        handler: handleEndChangeGroup,
        positionals: [],
        directFlags: ["author", "summary"],
        usage: GROUP_USAGE
      }
    },
    usage: GROUP_USAGE
  },
  "raw-edit": {
    handler: handleRawEdit,
    positionals: ["file"],
    flagMapping: { old: "old_text", new: "new_text" },
    directFlags: ["reason"],
    usage: RAW_EDIT_USAGE
  },
  files: {
    handler: handleFindTrackedFiles,
    positionals: ["path"],
    requiredPositionals: [],
    // path is optional (defaults to project root)
    usage: FILES_USAGE
  },
  ls: {
    handler: handleFindTrackedFiles,
    positionals: ["path"],
    requiredPositionals: [],
    // path is optional (defaults to project root)
    usage: FILES_USAGE
  },
  compact: {
    handler: handleCompactChanges,
    positionals: ["file"],
    flagMapping: { "undecided-policy": "undecided_policy" },
    customParsers: {
      targets: (v) => {
        const raw = stringFlag(v);
        if (!raw)
          return void 0;
        if (raw === "all-decided")
          return "all-decided";
        try {
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr))
            throw new Error();
          return arr;
        } catch {
          throw new ParseError('Invalid --targets: provide a JSON array of change IDs or "all-decided".', "INVALID_JSON");
        }
      },
      boundary_meta: (v) => {
        const raw = stringFlag(v);
        if (!raw)
          return void 0;
        try {
          return JSON.parse(raw);
        } catch {
          throw new ParseError("Invalid --boundary-meta: provide a valid JSON object.", "INVALID_JSON");
        }
      }
    },
    usage: COMPACT_USAGE
  }
};

// ../../packages/cli/dist/cli-runner.js
var hashlineReady = false;
async function runCommand(command, subArgs, context) {
  if (!hashlineReady) {
    await initHashline();
    hashlineReady = true;
  }
  const projectDir = context.projectDir ?? process.cwd();
  const resolver = new ConfigResolver(projectDir);
  const state = new SessionState();
  state.enableGuide();
  const def = COMMANDS[command];
  if (!def) {
    return {
      success: false,
      data: {},
      message: `Unknown command: ${command}`,
      error: "UNKNOWN_COMMAND"
    };
  }
  try {
    return await executeCommand(def, subArgs, resolver, state);
  } catch (err) {
    return {
      success: false,
      data: {},
      message: err instanceof Error ? err.message : String(err),
      error: "INTERNAL_ERROR"
    };
  } finally {
    resolver.dispose();
  }
}

// src/cli.ts
var HELP_TEXT = `Usage: sc [global-flags] <command> [args...]

Note: This is the legacy entry point. The canonical CLI is at packages/cli.

Global flags:
  --json            JSON output (default)
  --pretty          Human-readable output
  --quiet           Suppress output, exit code only
  --project-dir DIR Set project root directory
  --help, -h        Show this help message

Commands:
  read       Read a tracked file with hashline coordinates
  status     Check tracking status of a file or project
  get        Get full details of a tracked change
  list       List open threads and proposed changes
  files      List tracked files in a directory (alias: ls)
  propose    Propose a tracked change to a file
  batch      Propose a batch of changes atomically
  amend      Amend a previously proposed change
  review     Accept, reject, or request changes on a change
  respond    Add a response to a change discussion thread
  group      Begin or end a change group
  raw-edit   Edit a tracked file without CriticMarkup wrapping

Run 'sc <command> --help' for command-specific usage.
`;
async function main() {
  const args = parseGlobalArgs(process.argv.slice(2));
  if (args.command === "help") {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  const result = await runCommand(args.command, args.subArgs, {
    outputFormat: args.outputFormat,
    projectDir: args.projectDir
  });
  process.stdout.write(formatResult(result, args.outputFormat));
  process.exit(result.success ? 0 : result.error === "USAGE_ERROR" ? 2 : 1);
}
main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(2);
});
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
//# sourceMappingURL=cli.js.map
