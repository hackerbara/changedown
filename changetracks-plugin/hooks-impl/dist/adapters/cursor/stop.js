#!/usr/bin/env node

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
  const meta = parsed["meta"];
  const response = parsed["response"];
  const review = parsed["review"];
  const reasonRequired = review?.["reason_required"];
  return {
    tracking: {
      include: asStringArray(tracking?.["include"]) ?? DEFAULT_CONFIG.tracking.include,
      exclude: asStringArray(tracking?.["exclude"]) ?? DEFAULT_CONFIG.tracking.exclude,
      default: tracking?.["default"] === "tracked" || tracking?.["default"] === "untracked" ? tracking["default"] : DEFAULT_CONFIG.tracking.default,
      auto_header: typeof tracking?.["auto_header"] === "boolean" ? tracking["auto_header"] : DEFAULT_CONFIG.tracking.auto_header
    },
    author: {
      default: typeof author?.["default"] === "string" ? author["default"] : DEFAULT_CONFIG.author.default,
      enforcement: author?.["enforcement"] === "optional" || author?.["enforcement"] === "required" ? author["enforcement"] : DEFAULT_CONFIG.author.enforcement
    },
    hooks: {
      enforcement: hooks?.["enforcement"] === "warn" || hooks?.["enforcement"] === "block" ? hooks["enforcement"] : DEFAULT_CONFIG.hooks.enforcement,
      exclude: asStringArray(hooks?.["exclude"]) ?? DEFAULT_CONFIG.hooks.exclude,
      patch_wrap_experimental: typeof hooks?.["patch_wrap_experimental"] === "boolean" ? hooks["patch_wrap_experimental"] : DEFAULT_CONFIG.hooks.patch_wrap_experimental
    },
    matching: {
      mode: matching?.["mode"] === "strict" || matching?.["mode"] === "normalized" ? matching["mode"] : DEFAULT_CONFIG.matching.mode
    },
    hashline: {
      enabled: typeof hashline?.["enabled"] === "boolean" ? hashline["enabled"] : DEFAULT_CONFIG.hashline.enabled,
      auto_remap: typeof hashline?.["auto_remap"] === "boolean" ? hashline["auto_remap"] : DEFAULT_CONFIG.hashline.auto_remap
    },
    settlement: {
      auto_on_approve: typeof settlement?.["auto_on_approve"] === "boolean" ? settlement["auto_on_approve"] : DEFAULT_CONFIG.settlement.auto_on_approve,
      auto_on_reject: typeof settlement?.["auto_on_reject"] === "boolean" ? settlement["auto_on_reject"] : DEFAULT_CONFIG.settlement.auto_on_reject
    },
    review: {
      reasonRequired: {
        human: typeof reasonRequired?.["human"] === "boolean" ? reasonRequired["human"] : DEFAULT_CONFIG.review.reasonRequired.human,
        agent: typeof reasonRequired?.["agent"] === "boolean" ? reasonRequired["agent"] : DEFAULT_CONFIG.review.reasonRequired.agent
      }
    },
    policy: {
      mode: policy?.["mode"] === "strict" || policy?.["mode"] === "safety-net" || policy?.["mode"] === "permissive" ? policy["mode"] : derivePolicyMode(hooks?.["enforcement"]),
      creation_tracking: policy?.["creation_tracking"] === "none" || policy?.["creation_tracking"] === "footnote" || policy?.["creation_tracking"] === "inline" ? policy["creation_tracking"] : DEFAULT_CONFIG.policy.creation_tracking,
      default_view: policy?.["default_view"] === "review" || policy?.["default_view"] === "changes" || policy?.["default_view"] === "settled" ? policy["default_view"] : DEFAULT_CONFIG.policy.default_view,
      view_policy: policy?.["view_policy"] === "suggest" || policy?.["view_policy"] === "require" ? policy["view_policy"] : DEFAULT_CONFIG.policy.view_policy
    },
    protocol: {
      mode: protocol?.["mode"] === "classic" || protocol?.["mode"] === "compact" ? protocol["mode"] : DEFAULT_CONFIG.protocol.mode,
      level: protocol?.["level"] === 1 || protocol?.["level"] === 2 ? protocol["level"] : DEFAULT_CONFIG.protocol.level,
      reasoning: protocol?.["reasoning"] === "optional" || protocol?.["reasoning"] === "required" ? protocol["reasoning"] : DEFAULT_CONFIG.protocol.reasoning,
      batch_reasoning: protocol?.["batch_reasoning"] === "optional" || protocol?.["batch_reasoning"] === "required" ? protocol["batch_reasoning"] : DEFAULT_CONFIG.protocol.batch_reasoning
    },
    meta: {
      compact_threshold: typeof meta?.["compact_threshold"] === "number" && meta["compact_threshold"] > 0 ? meta["compact_threshold"] : DEFAULT_CONFIG.meta?.compact_threshold ?? 80
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
    return structuredClone(DEFAULT_CONFIG);
  }
  let raw;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    console.error(`changetracks: found ${configPath} but could not read it, using defaults`);
    return structuredClone(DEFAULT_CONFIG);
  }
  try {
    return parseConfigToml(raw);
  } catch (err) {
    console.error(`changetracks: ${configPath} contains invalid TOML (${err instanceof Error ? err.message : String(err)}), using defaults`);
    return structuredClone(DEFAULT_CONFIG);
  }
}

// ../../packages/cli/dist/config/index.js
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
  hooks: {
    enforcement: "warn",
    exclude: [],
    patch_wrap_experimental: false
  },
  matching: {
    mode: "normalized"
  },
  hashline: {
    enabled: false,
    auto_remap: true
  },
  settlement: {
    auto_on_approve: true,
    auto_on_reject: true
  },
  review: {
    reasonRequired: { human: false, agent: true }
  },
  policy: {
    mode: "safety-net",
    creation_tracking: "footnote",
    default_view: "review",
    view_policy: "suggest"
  },
  protocol: {
    mode: "classic",
    level: 2,
    reasoning: "optional",
    batch_reasoning: "optional"
  },
  meta: {
    compact_threshold: 80
  }
};

// src/core/batch-wrapper.ts
import * as fs3 from "node:fs/promises";

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

// ../../packages/core/dist-esm/model/document.js
var VirtualDocument = class _VirtualDocument {
  constructor(changes = []) {
    this.changes = changes;
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
  changeAtOffset(offset) {
    for (const change of this.changes) {
      if (offset >= change.range.start && offset <= change.range.end) {
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

// ../../packages/core/dist-esm/parser/code-zones.js
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

// ../../packages/core/dist-esm/operations/footnote-generator.js
function generateFootnoteDefinition(id, type, author, date) {
  const d = date ?? nowTimestamp().date;
  const authorPart = author ? `@${author} | ` : "";
  return `

[^${id}]: ${authorPart}${d} | ${type} | proposed`;
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
    let currentId = null;
    let currentDef = null;
    let lastDiscussionComment = null;
    let inRevisions = false;
    for (const line of lines) {
      const defMatch = line.match(_CriticMarkupParser.FOOTNOTE_DEF);
      if (defMatch) {
        currentId = defMatch[1];
        currentDef = {
          author: defMatch[2],
          date: defMatch[3],
          type: defMatch[4],
          status: defMatch[5]
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
        continue;
      }
      if (lastDiscussionComment) {
        lastDiscussionComment.text += "\n" + trimmed;
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

// ../../node_modules/xxhash-wasm/esm/xxhash-wasm.js
var t = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 48, 8, 96, 3, 127, 127, 127, 1, 127, 96, 3, 127, 127, 127, 0, 96, 2, 127, 127, 0, 96, 1, 127, 1, 127, 96, 3, 127, 127, 126, 1, 126, 96, 3, 126, 127, 127, 1, 126, 96, 2, 127, 126, 0, 96, 1, 127, 1, 126, 3, 11, 10, 0, 0, 2, 1, 3, 4, 5, 6, 1, 7, 5, 3, 1, 0, 1, 7, 85, 9, 3, 109, 101, 109, 2, 0, 5, 120, 120, 104, 51, 50, 0, 0, 6, 105, 110, 105, 116, 51, 50, 0, 2, 8, 117, 112, 100, 97, 116, 101, 51, 50, 0, 3, 8, 100, 105, 103, 101, 115, 116, 51, 50, 0, 4, 5, 120, 120, 104, 54, 52, 0, 5, 6, 105, 110, 105, 116, 54, 52, 0, 7, 8, 117, 112, 100, 97, 116, 101, 54, 52, 0, 8, 8, 100, 105, 103, 101, 115, 116, 54, 52, 0, 9, 10, 251, 22, 10, 242, 1, 1, 4, 127, 32, 0, 32, 1, 106, 33, 3, 32, 1, 65, 16, 79, 4, 127, 32, 3, 65, 16, 107, 33, 6, 32, 2, 65, 168, 136, 141, 161, 2, 106, 33, 3, 32, 2, 65, 137, 235, 208, 208, 7, 107, 33, 4, 32, 2, 65, 207, 140, 162, 142, 6, 106, 33, 5, 3, 64, 32, 3, 32, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 4, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 4, 32, 2, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 5, 32, 0, 65, 4, 106, 34, 0, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 6, 32, 0, 65, 4, 106, 34, 0, 79, 13, 0, 11, 32, 2, 65, 12, 119, 32, 5, 65, 18, 119, 106, 32, 4, 65, 7, 119, 106, 32, 3, 65, 1, 119, 106, 5, 32, 2, 65, 177, 207, 217, 178, 1, 106, 11, 32, 1, 106, 32, 0, 32, 1, 65, 15, 113, 16, 1, 11, 146, 1, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 1, 65, 4, 106, 32, 2, 75, 69, 4, 64, 32, 0, 32, 1, 40, 2, 0, 65, 189, 220, 202, 149, 124, 108, 106, 65, 17, 119, 65, 175, 214, 211, 190, 2, 108, 33, 0, 32, 1, 65, 4, 106, 33, 1, 12, 1, 11, 11, 3, 64, 32, 1, 32, 2, 79, 69, 4, 64, 32, 0, 32, 1, 45, 0, 0, 65, 177, 207, 217, 178, 1, 108, 106, 65, 11, 119, 65, 177, 243, 221, 241, 121, 108, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 65, 15, 118, 115, 65, 247, 148, 175, 175, 120, 108, 34, 0, 65, 13, 118, 32, 0, 115, 65, 189, 220, 202, 149, 124, 108, 34, 0, 65, 16, 118, 32, 0, 115, 11, 63, 0, 32, 0, 65, 8, 106, 32, 1, 65, 168, 136, 141, 161, 2, 106, 54, 2, 0, 32, 0, 65, 12, 106, 32, 1, 65, 137, 235, 208, 208, 7, 107, 54, 2, 0, 32, 0, 65, 16, 106, 32, 1, 54, 2, 0, 32, 0, 65, 20, 106, 32, 1, 65, 207, 140, 162, 142, 6, 106, 54, 2, 0, 11, 195, 4, 1, 6, 127, 32, 1, 32, 2, 106, 33, 6, 32, 0, 65, 24, 106, 33, 4, 32, 0, 65, 40, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 40, 2, 0, 32, 2, 106, 54, 2, 0, 32, 0, 65, 4, 106, 34, 5, 32, 5, 40, 2, 0, 32, 2, 65, 16, 79, 32, 0, 40, 2, 0, 65, 16, 79, 114, 114, 54, 2, 0, 32, 2, 32, 3, 106, 65, 16, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 16, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 12, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 4, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 8, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 20, 106, 34, 3, 32, 3, 40, 2, 0, 32, 4, 65, 12, 106, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 54, 2, 0, 32, 0, 65, 40, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 32, 6, 65, 16, 107, 77, 4, 64, 32, 6, 65, 16, 107, 33, 8, 32, 0, 65, 8, 106, 40, 2, 0, 33, 2, 32, 0, 65, 12, 106, 40, 2, 0, 33, 3, 32, 0, 65, 16, 106, 40, 2, 0, 33, 5, 32, 0, 65, 20, 106, 40, 2, 0, 33, 7, 3, 64, 32, 2, 32, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 2, 32, 3, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 3, 32, 5, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 5, 32, 7, 32, 1, 65, 4, 106, 34, 1, 40, 2, 0, 65, 247, 148, 175, 175, 120, 108, 106, 65, 13, 119, 65, 177, 243, 221, 241, 121, 108, 33, 7, 32, 8, 32, 1, 65, 4, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 2, 54, 2, 0, 32, 0, 65, 12, 106, 32, 3, 54, 2, 0, 32, 0, 65, 16, 106, 32, 5, 54, 2, 0, 32, 0, 65, 20, 106, 32, 7, 54, 2, 0, 11, 32, 1, 32, 6, 73, 4, 64, 32, 4, 32, 1, 32, 6, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 40, 106, 32, 1, 54, 2, 0, 11, 11, 97, 1, 1, 127, 32, 0, 65, 16, 106, 40, 2, 0, 33, 1, 32, 0, 65, 4, 106, 40, 2, 0, 4, 127, 32, 1, 65, 12, 119, 32, 0, 65, 20, 106, 40, 2, 0, 65, 18, 119, 106, 32, 0, 65, 12, 106, 40, 2, 0, 65, 7, 119, 106, 32, 0, 65, 8, 106, 40, 2, 0, 65, 1, 119, 106, 5, 32, 1, 65, 177, 207, 217, 178, 1, 106, 11, 32, 0, 40, 2, 0, 106, 32, 0, 65, 24, 106, 32, 0, 65, 40, 106, 40, 2, 0, 16, 1, 11, 255, 3, 2, 3, 126, 1, 127, 32, 0, 32, 1, 106, 33, 6, 32, 1, 65, 32, 79, 4, 126, 32, 6, 65, 32, 107, 33, 6, 32, 2, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 33, 3, 32, 2, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 33, 4, 32, 2, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 33, 5, 3, 64, 32, 3, 32, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 3, 32, 4, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 4, 32, 2, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 2, 32, 5, 32, 0, 65, 8, 106, 34, 0, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 5, 32, 6, 32, 0, 65, 8, 106, 34, 0, 79, 13, 0, 11, 32, 2, 66, 12, 137, 32, 5, 66, 18, 137, 124, 32, 4, 66, 7, 137, 124, 32, 3, 66, 1, 137, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 2, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 2, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 1, 173, 124, 32, 0, 32, 1, 65, 31, 113, 16, 6, 11, 134, 2, 0, 32, 1, 32, 2, 106, 33, 2, 3, 64, 32, 2, 32, 1, 65, 8, 106, 79, 4, 64, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 32, 0, 133, 66, 27, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 33, 0, 32, 1, 65, 8, 106, 33, 1, 12, 1, 11, 11, 32, 1, 65, 4, 106, 32, 2, 77, 4, 64, 32, 0, 32, 1, 53, 2, 0, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 23, 137, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 124, 33, 0, 32, 1, 65, 4, 106, 33, 1, 11, 3, 64, 32, 1, 32, 2, 73, 4, 64, 32, 0, 32, 1, 49, 0, 0, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 126, 133, 66, 11, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 0, 32, 1, 65, 1, 106, 33, 1, 12, 1, 11, 11, 32, 0, 32, 0, 66, 33, 136, 133, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 34, 0, 32, 0, 66, 29, 136, 133, 66, 249, 243, 221, 241, 153, 246, 153, 171, 22, 126, 34, 0, 32, 0, 66, 32, 136, 133, 11, 77, 0, 32, 0, 65, 8, 106, 32, 1, 66, 214, 235, 130, 238, 234, 253, 137, 245, 224, 0, 124, 55, 3, 0, 32, 0, 65, 16, 106, 32, 1, 66, 177, 169, 172, 193, 173, 184, 212, 166, 61, 125, 55, 3, 0, 32, 0, 65, 24, 106, 32, 1, 55, 3, 0, 32, 0, 65, 32, 106, 32, 1, 66, 249, 234, 208, 208, 231, 201, 161, 228, 225, 0, 124, 55, 3, 0, 11, 244, 4, 2, 3, 127, 4, 126, 32, 1, 32, 2, 106, 33, 5, 32, 0, 65, 40, 106, 33, 4, 32, 0, 65, 200, 0, 106, 40, 2, 0, 33, 3, 32, 0, 32, 0, 41, 3, 0, 32, 2, 173, 124, 55, 3, 0, 32, 2, 32, 3, 106, 65, 32, 73, 4, 64, 32, 3, 32, 4, 106, 32, 1, 32, 2, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 2, 32, 3, 106, 54, 2, 0, 15, 11, 32, 3, 4, 64, 32, 3, 32, 4, 106, 32, 1, 65, 32, 32, 3, 107, 34, 2, 252, 10, 0, 0, 32, 0, 65, 8, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 16, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 8, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 24, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 16, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 32, 106, 34, 3, 32, 3, 41, 3, 0, 32, 4, 65, 24, 106, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 55, 3, 0, 32, 0, 65, 200, 0, 106, 65, 0, 54, 2, 0, 32, 1, 32, 2, 106, 33, 1, 11, 32, 1, 65, 32, 106, 32, 5, 77, 4, 64, 32, 5, 65, 32, 107, 33, 2, 32, 0, 65, 8, 106, 41, 3, 0, 33, 6, 32, 0, 65, 16, 106, 41, 3, 0, 33, 7, 32, 0, 65, 24, 106, 41, 3, 0, 33, 8, 32, 0, 65, 32, 106, 41, 3, 0, 33, 9, 3, 64, 32, 6, 32, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 6, 32, 7, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 7, 32, 8, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 8, 32, 9, 32, 1, 65, 8, 106, 34, 1, 41, 3, 0, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 124, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 33, 9, 32, 2, 32, 1, 65, 8, 106, 34, 1, 79, 13, 0, 11, 32, 0, 65, 8, 106, 32, 6, 55, 3, 0, 32, 0, 65, 16, 106, 32, 7, 55, 3, 0, 32, 0, 65, 24, 106, 32, 8, 55, 3, 0, 32, 0, 65, 32, 106, 32, 9, 55, 3, 0, 11, 32, 1, 32, 5, 73, 4, 64, 32, 4, 32, 1, 32, 5, 32, 1, 107, 34, 1, 252, 10, 0, 0, 32, 0, 65, 200, 0, 106, 32, 1, 54, 2, 0, 11, 11, 188, 2, 1, 5, 126, 32, 0, 65, 24, 106, 41, 3, 0, 33, 1, 32, 0, 41, 3, 0, 34, 2, 66, 32, 90, 4, 126, 32, 0, 65, 8, 106, 41, 3, 0, 34, 3, 66, 1, 137, 32, 0, 65, 16, 106, 41, 3, 0, 34, 4, 66, 7, 137, 124, 32, 1, 66, 12, 137, 32, 0, 65, 32, 106, 41, 3, 0, 34, 5, 66, 18, 137, 124, 124, 32, 3, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 4, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 1, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 32, 5, 66, 207, 214, 211, 190, 210, 199, 171, 217, 66, 126, 66, 31, 137, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 133, 66, 135, 149, 175, 175, 152, 182, 222, 155, 158, 127, 126, 66, 157, 163, 181, 234, 131, 177, 141, 138, 250, 0, 125, 5, 32, 1, 66, 197, 207, 217, 178, 241, 229, 186, 234, 39, 124, 11, 32, 2, 124, 32, 0, 65, 40, 106, 32, 2, 66, 31, 131, 167, 16, 6, 11]);

// ../../packages/core/dist-esm/hashline.js
var HASH_LEN = 2;
var RADIX = 16;
var HASH_MOD = RADIX ** HASH_LEN;
var DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));
var encoder = new TextEncoder();

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
