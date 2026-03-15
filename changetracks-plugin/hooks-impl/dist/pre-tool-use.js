#!/usr/bin/env node
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
    exports.basename = (path6, { windows } = {}) => {
      const segs = path6.split(windows ? /[\\/]/ : "/");
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
    var parse3 = (input, options) => {
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
            const expression = parse3(rest, { ...options, fastpaths: false }).output;
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
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc2, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc2) {
              return esc2 + first + (rest ? QMARK.repeat(rest.length) : "");
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
            if (esc2) {
              return esc2 + first + (rest ? star : "");
            }
            return star;
          }
          return esc2 ? m : `\\${m}`;
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
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
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
    parse3.fastpaths = (input, options) => {
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
    module.exports = parse3;
  }
});

// ../../node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "../../node_modules/picomatch/lib/picomatch.js"(exports, module) {
    "use strict";
    var scan = require_scan();
    var parse3 = require_parse();
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
      return parse3(pattern, { ...options, fastpaths: false });
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
        parsed.output = parse3.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse3(input, options);
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

// ../../packages/core/dist-esm/config/index.js
function parseProjectConfig(raw) {
  const review = raw?.review;
  const reasonRaw = review?.reason_required;
  if (!reasonRaw || typeof reasonRaw !== "object") {
    return { reasonRequired: { ...DEFAULT_REASON_REQUIREMENT } };
  }
  return {
    reasonRequired: {
      human: typeof reasonRaw.human === "boolean" ? reasonRaw.human : DEFAULT_REASON_REQUIREMENT.human,
      agent: typeof reasonRaw.agent === "boolean" ? reasonRaw.agent : DEFAULT_REASON_REQUIREMENT.agent
    }
  };
}
var DEFAULT_REASON_REQUIREMENT;
var init_config = __esm({
  "../../packages/core/dist-esm/config/index.js"() {
    "use strict";
    DEFAULT_REASON_REQUIREMENT = {
      human: false,
      agent: true
    };
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
function compareTimestamps(a, b) {
  if (a.sortable < b.sortable)
    return -1;
  if (a.sortable > b.sortable)
    return 1;
  return 0;
}
function formatTimestamp(ts, style) {
  switch (style) {
    case "date":
      return ts.date;
    case "full":
      return ts.sortable;
    case "raw":
      return ts.raw;
  }
}
var TIMESTAMP_RE;
var init_timestamp = __esm({
  "../../packages/core/dist-esm/timestamp.js"() {
    "use strict";
    TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s?([AaPp][Mm])?(Z)?)?$/;
  }
});

// ../../packages/core/dist-esm/model/types.js
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

// ../../packages/core/dist-esm/footnote-patterns.js
function footnoteRefGlobal() {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_PATTERN}\\]`, "g");
}
function footnoteRefNumericGlobal() {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_NUMERIC_PATTERN}\\]`, "g");
}
var FOOTNOTE_ID_PATTERN, FOOTNOTE_ID_NUMERIC_PATTERN, FOOTNOTE_REF_ANCHORED, FOOTNOTE_DEF_START, FOOTNOTE_DEF_START_QUICK, FOOTNOTE_DEF_LENIENT, FOOTNOTE_DEF_STRICT, FOOTNOTE_DEF_STATUS, FOOTNOTE_DEF_STATUS_VALUE, FOOTNOTE_CONTINUATION;
var init_footnote_patterns = __esm({
  "../../packages/core/dist-esm/footnote-patterns.js"() {
    "use strict";
    FOOTNOTE_ID_PATTERN = "ct-\\d+(?:\\.\\d+)?";
    FOOTNOTE_ID_NUMERIC_PATTERN = "ct-(\\d+)(?:\\.\\d+)?";
    FOOTNOTE_REF_ANCHORED = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`);
    FOOTNOTE_DEF_START = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:`);
    FOOTNOTE_DEF_START_QUICK = /^\[\^ct-\d+/;
    FOOTNOTE_DEF_LENIENT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s*@(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)`);
    FOOTNOTE_DEF_STRICT = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:(@\\S+)\\s+\\|\\s+)?(\\S+)\\s+\\|\\s+(\\S+)\\s+\\|\\s+(\\S+)`);
    FOOTNOTE_DEF_STATUS = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:@\\S+\\s+\\|\\s+)?\\S+\\s+\\|\\s+\\S+\\s+\\|\\s+(\\S+)`);
    FOOTNOTE_DEF_STATUS_VALUE = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:\\s.*\\|\\s*(proposed|accepted|rejected)`);
    FOOTNOTE_CONTINUATION = /^\s+\S/;
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
var init_footnote_generator = __esm({
  "../../packages/core/dist-esm/operations/footnote-generator.js"() {
    "use strict";
    init_footnote_patterns();
    init_timestamp();
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
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    const m = line.match(FOOTNOTE_HEADER_STATUS_RE);
    if (m && m[1] === status)
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
function resolveChangeById(fileContent, changeId) {
  const lines = fileContent.split("\n");
  const footnoteBlock = findFootnoteBlock(lines, changeId);
  const refPattern = `[^${changeId}]`;
  const refIndex = fileContent.indexOf(refPattern);
  const inlineRefOffset = refIndex !== -1 && fileContent[refIndex + refPattern.length] !== ":" ? refIndex : null;
  if (!footnoteBlock && inlineRefOffset === null) {
    return null;
  }
  return { footnoteBlock, inlineRefOffset };
}
function isApprovalOrResolutionLine(trimmed) {
  return trimmed.startsWith("approved:") || trimmed.startsWith("rejected:") || trimmed.startsWith("request-changes:") || trimmed.startsWith("resolved") || trimmed.startsWith("open --") || trimmed.startsWith("open ") || trimmed === "open";
}
function isResolutionLine(trimmed) {
  return trimmed.startsWith("resolved") || trimmed.startsWith("open --") || trimmed.startsWith("open ") || trimmed === "open";
}
var FOOTNOTE_HEADER_STATUS_RE;
var init_footnote_utils = __esm({
  "../../packages/core/dist-esm/footnote-utils.js"() {
    "use strict";
    FOOTNOTE_HEADER_STATUS_RE = /^\[\^ct-\d+(?:\.\d+)?\]:.*\|\s*(\S+)\s*$/;
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
function computeAccept(change) {
  const parts = computeAcceptParts(change);
  const ref = parts.refId ? `[^${parts.refId}]` : "";
  return { offset: parts.offset, length: parts.length, newText: parts.text + ref };
}
function computeReject(change) {
  const parts = computeRejectParts(change);
  const ref = parts.refId ? `[^${parts.refId}]` : "";
  return { offset: parts.offset, length: parts.length, newText: parts.text + ref };
}
function computeFootnoteStatusEdits(text, changeIds, newStatus) {
  if (changeIds.length === 0)
    return [];
  if (newStatus === "request-changes")
    return [];
  const idSet = new Set(changeIds.filter((id) => id !== ""));
  if (idSet.size === 0)
    return [];
  const edits = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const match = line.match(FOOTNOTE_STATUS_RE);
    if (match && idSet.has(match[1])) {
      const currentStatus = match[2];
      if (currentStatus !== newStatus && KNOWN_STATUSES.has(currentStatus)) {
        const matchEnd = match.index + match[0].length;
        const statusOffset = offset + matchEnd - currentStatus.length;
        edits.push({
          offset: statusOffset,
          length: currentStatus.length,
          newText: newStatus
        });
      }
    }
    offset += line.length + 1;
  }
  return edits;
}
function computeApprovalLineEdit(text, changeId, newStatus, opts) {
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return null;
  const keyword = newStatus === "accepted" ? "approved:" : newStatus === "rejected" ? "rejected:" : "request-changes:";
  const date = opts.date ?? nowTimestamp().raw;
  const reasonPart = opts.reason !== void 0 && opts.reason !== "" ? ` "${opts.reason}"` : "";
  const line = `    ${keyword} @${opts.author} ${date}${reasonPart}`;
  const insertAfterIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  const offset = lines.slice(0, insertAfterIdx + 1).join("\n").length;
  return { offset, length: 0, newText: "\n" + line };
}
function computeFootnoteArchiveLineEdit(text, changeId, referenceText) {
  if (!referenceText.trim())
    return null;
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return null;
  const line = `    archive: ${JSON.stringify(referenceText)}`;
  const insertAfterIdx = block.headerLine;
  const offset = lines.slice(0, insertAfterIdx + 1).join("\n").length;
  return { offset, length: 0, newText: "\n" + line };
}
var FOOTNOTE_STATUS_RE, KNOWN_STATUSES;
var init_accept_reject = __esm({
  "../../packages/core/dist-esm/operations/accept-reject.js"() {
    "use strict";
    init_types();
    init_footnote_patterns();
    init_timestamp();
    init_footnote_utils();
    FOOTNOTE_STATUS_RE = FOOTNOTE_DEF_STATUS;
    KNOWN_STATUSES = /* @__PURE__ */ new Set(["proposed", "accepted", "rejected", "pending"]);
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
function nextChange(doc, cursorOffset) {
  const changes = doc.getChanges();
  if (changes.length === 0) {
    return null;
  }
  for (const change of changes) {
    if (change.range.start > cursorOffset) {
      return change;
    }
  }
  return changes[0];
}
function previousChange(doc, cursorOffset) {
  const changes = doc.getChanges();
  if (changes.length === 0) {
    return null;
  }
  for (let i = changes.length - 1; i >= 0; i--) {
    if (cursorOffset >= changes[i].range.start && cursorOffset < changes[i].range.end) {
      continue;
    }
    if (changes[i].range.start < cursorOffset) {
      return changes[i];
    }
  }
  return changes[changes.length - 1];
}
var init_navigation = __esm({
  "../../packages/core/dist-esm/operations/navigation.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/operations/tracking.js
function appendRef(markup, scId) {
  return scId ? `${markup}[^${scId}]` : markup;
}
function wrapInsertion(insertedText, offset, scId) {
  return {
    offset,
    length: insertedText.length,
    newText: appendRef(`{++${insertedText}++}`, scId)
  };
}
function wrapDeletion(deletedText, offset, scId) {
  return {
    offset,
    length: 0,
    newText: appendRef(`{--${deletedText}--}`, scId)
  };
}
function wrapSubstitution(oldText, newText, offset, scId) {
  return {
    offset,
    length: newText.length,
    newText: appendRef(`{~~${oldText}~>${newText}~~}`, scId)
  };
}
var init_tracking = __esm({
  "../../packages/core/dist-esm/operations/tracking.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/operations/comment.js
function insertComment(commentText, offset, selectionRange, selectedText) {
  const formattedComment = commentText ? `{>> ${commentText} <<}` : "{>>  <<}";
  if (selectionRange && selectedText !== void 0) {
    return {
      offset: selectionRange.start,
      length: selectionRange.end - selectionRange.start,
      newText: `{==${selectedText}==}${formattedComment}`
    };
  }
  return {
    offset,
    length: 0,
    newText: formattedComment
  };
}
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
  }
}
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
function applyReview(fileContent, changeId, decision, reasoning, author) {
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
    VALID_DECISIONS = ["approve", "reject", "request_changes"];
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
async function initHashline() {
  if (!xxhash) {
    xxhash = await e();
  }
}
function stripForHash(line) {
  return line.replace(/\r$/, "").replace(/\[\^ct-[\w.]+\]/g, "").replace(/\s+/g, "");
}
function computeLineHash(idx, line, allLines) {
  if (!xxhash) {
    throw new Error('xxhash-wasm not initialized. Call `await initHashline()` or `await ensureHashlineReady()` before using hashline functions. If this occurs in tests, add `deps: { inline: ["@changetracks/core"] }` to vitest.config.ts to prevent duplicate module instances.');
  }
  const stripped = stripForHash(line);
  if (stripped.length > 0 || !allLines) {
    return DICT[xxhash.h32Raw(encoder.encode(stripped)) % HASH_MOD];
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
  return DICT[xxhash.h32Raw(encoder.encode(contextKey)) % HASH_MOD];
}
function formatHashLines(content, startLine = 1) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const lineNum = startLine + i;
    const hash = computeLineHash(i, line, lines);
    return `${lineNum}:${hash}|${line}`;
  }).join("\n");
}
function parseLineRef(ref) {
  let cleaned = ref;
  const pipeIdx = cleaned.indexOf("|");
  if (pipeIdx !== -1) {
    cleaned = cleaned.substring(0, pipeIdx);
  }
  const dblSpaceIdx = cleaned.indexOf("  ");
  if (dblSpaceIdx !== -1) {
    cleaned = cleaned.substring(0, dblSpaceIdx);
  }
  cleaned = cleaned.replace(/\s*:\s*/, ":");
  cleaned = cleaned.trim();
  const strictMatch = cleaned.match(/^(\d+):([0-9a-fA-F]{2,16})$/);
  if (strictMatch) {
    const line = parseInt(strictMatch[1], 10);
    if (line < 1) {
      throw new Error("Invalid line ref: line must be >= 1");
    }
    return { line, hash: strictMatch[2] };
  }
  const prefixMatch = cleaned.match(/^(\d+):([0-9a-fA-F]{2})/);
  if (prefixMatch) {
    const line = parseInt(prefixMatch[1], 10);
    if (line < 1) {
      throw new Error("Invalid line ref: line must be >= 1");
    }
    return { line, hash: prefixMatch[2] };
  }
  throw new Error(`Invalid line ref: "${ref}". Expected format "LINE:HASH" (e.g. "5:a3")`);
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
var HASH_LEN, RADIX, HASH_MOD, DICT, encoder, xxhash, ensureHashlineReady, HashlineMismatchError;
var init_hashline = __esm({
  "../../packages/core/dist-esm/hashline.js"() {
    "use strict";
    init_xxhash_wasm();
    HASH_LEN = 2;
    RADIX = 16;
    HASH_MOD = RADIX ** HASH_LEN;
    DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));
    encoder = new TextEncoder();
    xxhash = null;
    ensureHashlineReady = initHashline;
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
function computeSettledText(text, options) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text, { skipCodeBlocks: options?.skipCodeBlocks ?? false });
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
function computeOriginalText(text, options) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text, { skipCodeBlocks: options?.skipCodeBlocks ?? false });
  const changes = doc.getChanges();
  if (changes.length === 0) {
    const zones2 = findCodeZones(text);
    return stripInlineFootnoteRefs(stripFootnoteDefinitions(text, zones2), zones2);
  }
  const edits = [...changes].sort((a, b) => b.range.start - a.range.start).map(computeReject);
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
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text, { skipCodeBlocks: false });
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
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text, { skipCodeBlocks: false });
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
function computeSettledView(rawText) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(rawText, { skipCodeBlocks: false });
  const changes = doc.getChanges();
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
  return { lines: settledLines, settledToRaw, rawToSettled };
}
var init_settled_text = __esm({
  "../../packages/core/dist-esm/operations/settled-text.js"() {
    "use strict";
    init_types();
    init_parser();
    init_accept_reject();
    init_hashline();
    init_footnote_patterns();
    init_code_zones();
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
function detectNoOp(oldContent, newContent) {
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  return normalize(oldContent) === normalize(newContent);
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

// ../../packages/core/dist-esm/footnote-parser.js
function parseFootnotes(content) {
  const lines = content.split("\n");
  const footnotes = /* @__PURE__ */ new Map();
  const blockStart = findFootnoteBlockStart(lines);
  for (let i = blockStart; i < lines.length; i++) {
    const match = lines[i].match(FOOTNOTE_DEF_LENIENT);
    if (!match)
      continue;
    const info = {
      id: match[1],
      author: `@${match[2]}`,
      date: match[3],
      timestamp: parseTimestamp(match[3]),
      type: match[4],
      status: match[5],
      reason: "",
      replyCount: 0,
      startLine: i,
      endLine: i
    };
    let j = i + 1;
    while (j < lines.length && (lines[j].match(/^\s+\S/) || lines[j].match(/^\s*$/))) {
      if (lines[j].match(/^\s*$/)) {
        let k = j + 1;
        while (k < lines.length && lines[k].match(/^\s*$/))
          k++;
        if (k < lines.length && lines[k].match(/^\s+\S/)) {
          j++;
          continue;
        }
        break;
      }
      if (RE_THREAD_REPLY.test(lines[j])) {
        info.replyCount++;
      } else {
        const metaMatch = lines[j].match(RE_FOOTNOTE_META);
        if (metaMatch && metaMatch[1] === "reason") {
          info.reason = metaMatch[2];
        } else if (metaMatch && metaMatch[1] === "image-dimensions") {
          const dimMatch = metaMatch[2].match(/^([\d.]+)in\s*x\s*([\d.]+)in$/);
          if (dimMatch) {
            info.imageDimensions = {
              widthIn: parseFloat(dimMatch[1]),
              heightIn: parseFloat(dimMatch[2])
            };
          }
        }
      }
      info.endLine = j;
      j++;
    }
    footnotes.set(info.id, info);
  }
  return footnotes;
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
var RE_THREAD_REPLY, RE_FOOTNOTE_META;
var init_footnote_parser = __esm({
  "../../packages/core/dist-esm/footnote-parser.js"() {
    "use strict";
    init_footnote_patterns();
    init_timestamp();
    RE_THREAD_REPLY = /^\s+@\S+\s+\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?Z?)?:/;
    RE_FOOTNOTE_META = /^\s+([\w-]+):\s*(.*)/;
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
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  const footnotes = parseFootnotes(text);
  for (const node of changes) {
    const fnInfo = footnotes.get(node.id);
    if (fnInfo) {
      const s = fnInfo.status.toLowerCase();
      if (s === "accepted")
        node.status = ChangeStatus.Accepted;
      else if (s === "rejected")
        node.status = ChangeStatus.Rejected;
    }
  }
  return { changes, footnotes };
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
  const { changes, footnotes } = resolveProposedChanges(text);
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
      const fnInfo = changeId ? footnotes.get(changeId) : void 0;
      const author = fnInfo?.author;
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
  const allSameAuthor = overlaps.every((o) => o.author === author);
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
  const footnotes = parseFootnotes(text);
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
          const status = changeId ? footnotes.get(changeId)?.status : void 0;
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
          const status = changeId ? footnotes.get(changeId)?.status : void 0;
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
            const status = changeId ? footnotes.get(changeId)?.status : void 0;
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
    const diffLines2 = diagnosticResult.differences.map((d) => `  Position ${d.position}: you sent ${d.agentName} (U+${d.agentCodepoint.toString(16).toUpperCase().padStart(4, "0")}), file has ${d.fileName} (U+${d.fileCodepoint.toString(16).toUpperCase().padStart(4, "0")})`).join("\n");
    const diagPreview = diagnosticResult.matchedText.length > 80 ? diagnosticResult.matchedText.slice(0, 80) + "..." : diagnosticResult.matchedText;
    throw new Error(`Text not found in document.
${hint}
${searchedInLine}

Unicode mismatch detected -- your text would match with character substitution:
${diffLines2}

Copy the exact text from file for retry:
  "${diagPreview}"`);
  }
  throw new Error(`Text not found in document.
${hint}
Input (first 80 chars): "${preview}"
${searchedInLine}
Hint: Re-read the file for current content, or use LINE:HASH addressing.`);
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
function applyProposeChange(params) {
  const { text, oldText, newText, changeId, author, reasoning, insertAfter, level = 2 } = params;
  if (oldText === "" && newText === "") {
    throw new Error("Both oldText and newText are empty \u2014 nothing to change.");
  }
  let changeType;
  let inlineMarkup;
  let modifiedBody;
  const refSuffix = level === 2 ? `[^${changeId}]` : "";
  if (oldText === "") {
    changeType = "ins";
    if (!insertAfter) {
      throw new Error("Insertion requires an insertAfter anchor to locate where to insert.");
    }
    const insPad = /^[+\-~]/.test(newText) ? " " : "";
    inlineMarkup = `{++${insPad}${newText}++}${refSuffix}${level === 1 ? level1Comment(author, "ins") : ""}`;
    let anchorIndex = text.indexOf(insertAfter);
    let anchorLength = insertAfter.length;
    if (anchorIndex === -1) {
      anchorIndex = normalizedIndexOf(text, insertAfter, defaultNormalizer);
    }
    if (anchorIndex === -1) {
      const wsMatch = whitespaceCollapsedFind(text, insertAfter);
      if (wsMatch !== null) {
        anchorIndex = wsMatch.index;
        anchorLength = wsMatch.length;
      }
    }
    if (anchorIndex === -1) {
      throw new Error(`insertAfter anchor not found in text: "${insertAfter}"`);
    }
    guardOverlap(text, anchorIndex, anchorLength);
    const insertPos = anchorIndex + anchorLength;
    const charBefore = insertPos > 0 ? text[insertPos - 1] : "\n";
    const needsNewlineBefore = charBefore !== "\n";
    const isBlockContent = /^[-#>*\d]/.test(newText) || newText.includes("\n");
    const prefix = needsNewlineBefore && isBlockContent ? "\n" : "";
    modifiedBody = text.slice(0, insertPos) + prefix + inlineMarkup + text.slice(insertPos);
  } else if (newText === "") {
    changeType = "del";
    const searchText = contentZoneText(text);
    const match = findUniqueMatch(searchText, oldText, defaultNormalizer);
    if (!match.wasSettledMatch && !match.wasCommittedMatch) {
      guardOverlap(text, match.index, match.length);
    }
    const actualOldText = match.originalText;
    const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
    const delPad = /^[+\-~]/.test(cleanedOld) ? " " : "";
    inlineMarkup = `{--${delPad}${cleanedOld}--}${refSuffix}${preservedRefs.join("")}${level === 1 ? level1Comment(author, "del") : ""}`;
    modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
  } else {
    changeType = "sub";
    const searchText = contentZoneText(text);
    const match = findUniqueMatch(searchText, oldText, defaultNormalizer);
    if (!match.wasSettledMatch && !match.wasCommittedMatch) {
      guardOverlap(text, match.index, match.length);
    }
    const actualOldText = match.originalText;
    const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);
    const subPad = /^[+\-~]/.test(cleanedOld) ? " " : "";
    inlineMarkup = `{~~${subPad}${cleanedOld}~>${newText}~~}${refSuffix}${preservedRefs.join("")}${level === 1 ? level1Comment(author, "sub") : ""}`;
    modifiedBody = text.slice(0, match.index) + inlineMarkup + text.slice(match.index + match.length);
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
function applySingleOperation(params) {
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
  const applied = applyProposeChange({
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
    init_parser();
    init_types();
    init_footnote_parser();
    init_footnote_patterns();
    init_view_surface();
  }
});

// ../../packages/core/dist-esm/operations/ensure-l2.js
function changeTypeToAbbrev2(type) {
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
  const typeAbbrev = changeTypeToAbbrev2(change.type) ?? opts.type;
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
function computeAmendEdits(text, changeId, opts) {
  const { newText, oldText, reason, author } = opts;
  const resolved = resolveChangeById(text, changeId);
  if (!resolved || !resolved.footnoteBlock) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }
  const parsedHeader = parseFootnoteHeader(resolved.footnoteBlock.headerContent);
  if (!parsedHeader) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }
  const statusStr = parsedHeader.status;
  let status;
  if (statusStr === "accepted") {
    status = ChangeStatus.Accepted;
  } else if (statusStr === "rejected") {
    status = ChangeStatus.Rejected;
  } else {
    status = ChangeStatus.Proposed;
  }
  if (status !== ChangeStatus.Proposed) {
    return {
      isError: true,
      error: `Cannot amend a ${statusStr} change. Only proposed changes can be amended.`
    };
  }
  const changeAuthor = parsedHeader.author.replace(/^@/, "");
  const resolvedAuthorNorm = author.replace(/^@/, "");
  if (changeAuthor && resolvedAuthorNorm !== changeAuthor) {
    return {
      isError: true,
      error: `Cannot amend change ${changeId}: you (${author}) are not the original author (${changeAuthor}). Use supersede_change to propose an alternative.`
    };
  }
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const change = doc.getChanges().find((c) => c.id === changeId);
  if (!change) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }
  const changeType = change.type;
  const currentProposed = changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment ? change.modifiedText ?? "" : "";
  if ((changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment) && newText === "") {
    return { isError: true, error: "new_text is required for amend (substitution, insertion, or comment)." };
  }
  if (changeType === ChangeType.Deletion || changeType === ChangeType.Highlight) {
    if (newText.length > 0) {
      return {
        isError: true,
        error: "Deletion changes cannot be amended inline (the deleted text is fixed). To amend reasoning, pass reasoning without new_text. To target different text, reject this change and propose a new one."
      };
    }
  } else {
    if (CRITIC_DELIMITER_RE.test(newText)) {
      return { isError: true, error: "new_text cannot contain CriticMarkup delimiters" };
    }
    if (changeType === ChangeType.Insertion && newText === "") {
      return { isError: true, error: "Cannot amend an insertion to empty text. Use reject to remove the change." };
    }
    if (newText === currentProposed && !reason) {
      return { isError: true, error: "new_text is identical to current proposed text and no reasoning provided; nothing to amend" };
    }
  }
  const reasoningOnly = newText === currentProposed;
  if (oldText && changeType !== ChangeType.Substitution) {
    return {
      isError: true,
      error: "old_text scope expansion is only supported for substitution changes."
    };
  }
  const originalMarkup = text.slice(change.range.start, change.range.end);
  const refs = originalMarkup.match(/\[\^ct-[\d.]+\]/g) ?? [];
  const refString = refs.join("");
  let newMarkup;
  let previousText = "";
  let inlineUpdated = false;
  let expandedStart;
  let expandedEnd;
  if (reasoningOnly) {
    newMarkup = originalMarkup;
    inlineUpdated = false;
  } else {
    switch (changeType) {
      case ChangeType.Substitution: {
        if (oldText) {
          const currentOriginal = change.originalText ?? "";
          if (!oldText.includes(currentOriginal)) {
            return {
              isError: true,
              error: `old_text must contain the original substitution text "${currentOriginal}" as a substring.`
            };
          }
          const prefixIdx = oldText.indexOf(currentOriginal);
          const prefix = oldText.slice(0, prefixIdx);
          const suffix = oldText.slice(prefixIdx + currentOriginal.length);
          const rawBefore = text.slice(change.range.start - prefix.length, change.range.start);
          if (rawBefore !== prefix) {
            return {
              isError: true,
              error: `old_text context does not match: expected "${prefix}" before the markup but found "${rawBefore}"`
            };
          }
          const rawAfter = text.slice(change.range.end, change.range.end + suffix.length);
          if (rawAfter !== suffix) {
            return {
              isError: true,
              error: `old_text context does not match: expected "${suffix}" after the markup but found "${rawAfter}"`
            };
          }
          expandedStart = change.range.start - prefix.length;
          expandedEnd = change.range.end + suffix.length;
          newMarkup = `{~~${oldText}~>${newText}~~}${refString}`;
        } else {
          newMarkup = `{~~${change.originalText ?? ""}~>${newText}~~}${refString}`;
        }
        previousText = change.modifiedText ?? "";
        inlineUpdated = true;
        break;
      }
      case ChangeType.Insertion:
        newMarkup = `{++${newText}++}${refString}`;
        previousText = change.modifiedText ?? "";
        inlineUpdated = true;
        break;
      case ChangeType.Comment:
        newMarkup = `{>>${newText}<<}${refString}`;
        previousText = change.modifiedText ?? "";
        inlineUpdated = true;
        break;
      case ChangeType.Deletion:
      case ChangeType.Highlight:
        newMarkup = originalMarkup;
        inlineUpdated = false;
        break;
      default:
        return { isError: true, error: `Unsupported change type for amend: ${changeType}` };
    }
  }
  const replaceStart = expandedStart ?? change.range.start;
  const replaceEnd = expandedEnd ?? change.range.end;
  let modifiedContent = text.slice(0, replaceStart) + newMarkup + text.slice(replaceEnd);
  const lines = modifiedContent.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block) {
    return { isError: true, error: `Change metadata for ${changeId} not found in file` };
  }
  const ts = opts.date ?? nowTimestamp().raw;
  const authorWithAt = author.startsWith("@") ? author : `@${author}`;
  const reasonLine = `    revised ${authorWithAt} ${ts}: ${reason ?? "amended proposed text"}`;
  const insertIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd);
  const toInsert = [reasonLine];
  if (previousText.length > 0) {
    const truncated = previousText.length > 100 ? previousText.slice(0, 100) + "..." : previousText;
    toInsert.push(`    previous: "${truncated.replace(/"/g, '\\"')}"`);
  }
  lines.splice(insertIdx + 1, 0, ...toInsert);
  modifiedContent = lines.join("\n");
  return {
    isError: false,
    text: modifiedContent,
    changeId,
    previousText,
    inlineUpdated
  };
}
var CRITIC_DELIMITER_RE;
var init_amend = __esm({
  "../../packages/core/dist-esm/operations/amend.js"() {
    "use strict";
    init_parser();
    init_types();
    init_footnote_utils();
    init_timestamp();
    CRITIC_DELIMITER_RE = /\{\+\+|\{--|\{~~|\{==|\{>>/;
  }
});

// ../../packages/core/dist-esm/operations/supersede.js
function computeSupersedeResult(text, changeId, opts) {
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
  const normalizedAuthor = author.startsWith("@") ? author.slice(1) : author;
  if (header.author === normalizedAuthor) {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": authored by the same author (${author}). Use amend_change to modify your own changes.`
    };
  }
  const rejectResult = applyReview(text, changeId, "reject", reason ?? "Superseded by new change", author);
  if ("error" in rejectResult) {
    return { isError: true, error: `Failed to reject old change: ${rejectResult.error}` };
  }
  let fileContent = rejectResult.updatedContent;
  const maxId = scanMaxCtId(fileContent);
  const newChangeId = `ct-${maxId + 1}`;
  const proposeOldText = oldText;
  const proposeResult = applyProposeChange({
    text: fileContent,
    oldText: proposeOldText,
    newText,
    changeId: newChangeId,
    author,
    reasoning: reason,
    insertAfter
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
  }
});

// ../../packages/core/dist-esm/operations/level-promotion.js
function promoteToLevel1(text, changeIndex, metadataString) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length) {
    return text;
  }
  const change = changes[changeIndex];
  const insertPos = change.range.end;
  const comment = `{>>${metadataString}<<}`;
  return text.slice(0, insertPos) + comment + text.slice(insertPos);
}
function parseL1ToHeaderParts(raw) {
  const fields = raw.split("|").map((f) => f.trim());
  let author = "";
  let date = nowTimestamp().date;
  let type = "sub";
  let status = "proposed";
  for (const field of fields) {
    if (!field)
      continue;
    if (field.startsWith("@")) {
      author = field;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(field)) {
      date = field;
    } else if (["ins", "del", "sub", "highlight", "comment"].includes(field)) {
      type = field;
    } else if (["proposed", "accepted", "rejected", "approved"].includes(field)) {
      status = field;
    }
  }
  return { author, date, type, status };
}
function promoteToLevel2(text, changeIndex, changeId) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length) {
    return text;
  }
  const change = changes[changeIndex];
  if (change.level !== 1 || !change.inlineMetadata) {
    return text;
  }
  const markupEnd = text.indexOf(TokenType.CommentOpen, change.range.start);
  if (markupEnd === -1) {
    return text;
  }
  const afterComment = change.range.end;
  const { author, date, type, status } = parseL1ToHeaderParts(change.inlineMetadata.raw);
  const authorPart = author ? `${author} | ` : "";
  const footnoteLine = `

[^${changeId}]: ${authorPart}${date} | ${type} | ${status}`;
  const before = text.slice(0, markupEnd);
  const after = text.slice(afterComment);
  return before + `[^${changeId}]` + after + footnoteLine;
}
var init_level_promotion = __esm({
  "../../packages/core/dist-esm/operations/level-promotion.js"() {
    "use strict";
    init_parser();
    init_tokens();
    init_timestamp();
  }
});

// ../../packages/core/dist-esm/operations/level-descent.js
function findFootnoteBlockWithOffsets(text, changeId) {
  const lines = text.split("\n");
  const block = findFootnoteBlock(lines, changeId);
  if (!block)
    return null;
  const header = parseFootnoteHeader(block.headerContent);
  let start = 0;
  for (let i = 0; i < block.headerLine; i++) {
    start += lines[i].length + 1;
  }
  let end = start + lines[block.headerLine].length;
  for (let j = block.headerLine + 1; j <= block.blockEnd; j++) {
    end += 1 + lines[j].length;
  }
  return {
    author: header?.author ? `@${header.author}` : "",
    date: header?.date ?? "",
    type: header?.type ?? "",
    status: header?.status ?? "",
    start,
    end
  };
}
function compactToLevel1(text, changeId) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  const change = changes.find((c) => c.id === changeId);
  if (!change)
    return text;
  const refStr = `[^${changeId}]`;
  const refIndex = text.indexOf(refStr, change.range.start);
  if (refIndex === -1)
    return text;
  const block = findFootnoteBlockWithOffsets(text, changeId);
  if (!block)
    return text;
  const authorPart = block.author ? `${block.author}|` : "";
  const comment = `{>>${authorPart}${block.date}|${block.type}|${block.status}<<}`;
  const refEnd = refIndex + refStr.length;
  const textBetween = text.slice(refEnd, block.start);
  if (textBetween.trim().length > 0) {
    let result = text.slice(0, block.start) + text.slice(block.end);
    result = result.slice(0, refIndex) + comment + result.slice(refIndex + refStr.length);
    return result;
  }
  const beforeRef = text.slice(0, refIndex);
  const afterBlock = text.slice(block.end);
  return beforeRef + comment + afterBlock;
}
function compactToLevel0(text, changeIndex) {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length)
    return text;
  const change = changes[changeIndex];
  if (change.level !== 1)
    return text;
  const closeTag = "<<}";
  const openTag = "{>>";
  const commentCloseEnd = change.range.end;
  const commentCloseStart = commentCloseEnd - closeTag.length;
  if (text.substring(commentCloseStart, commentCloseEnd) !== closeTag)
    return text;
  const commentOpenStart = text.lastIndexOf(openTag, commentCloseStart - 1);
  if (commentOpenStart === -1 || commentOpenStart < change.range.start)
    return text;
  return text.slice(0, commentOpenStart) + text.slice(commentCloseEnd);
}
var init_level_descent = __esm({
  "../../packages/core/dist-esm/operations/level-descent.js"() {
    "use strict";
    init_parser();
    init_footnote_utils();
  }
});

// ../../packages/core/dist-esm/comment-syntax.js
function getCommentSyntax(languageId) {
  return SYNTAX_MAP[languageId];
}
function wrapLineComment(code, tag, syntax, isDeletion) {
  if (isDeletion) {
    const indent = code.match(/^(\s*)/)?.[1] ?? "";
    const trimmedCode = code.slice(indent.length);
    return `${indent}${syntax.line} - ${trimmedCode}  ${syntax.line} ${tag}`;
  }
  return `${code}  ${syntax.line} ${tag}`;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function lineOffset(lines, lineIndex) {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}
function stripLineComment(line, syntax) {
  const tagMatch = line.match(SC_TAG_PATTERN);
  if (!tagMatch) {
    return null;
  }
  const tag = tagMatch[0];
  const cm = syntax.line;
  const delPrefix = `${cm} - `;
  const delSuffix = `  ${cm} ${tag}`;
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? "";
  const afterIndent = line.slice(indent.length);
  if (afterIndent.startsWith(delPrefix) && line.endsWith(delSuffix)) {
    const codeStart = indent.length + delPrefix.length;
    const codeEnd = line.length - delSuffix.length;
    const code = line.slice(codeStart, codeEnd);
    return { code, tag, isDeletion: true, indent };
  }
  const insSuffix = `  ${cm} ${tag}`;
  if (line.endsWith(insSuffix)) {
    const code = line.slice(0, line.length - insSuffix.length);
    const codeIndentMatch = code.match(/^(\s*)/);
    const codeIndent = codeIndentMatch?.[1] ?? "";
    const trimmedCode = code.slice(codeIndent.length);
    return { code: trimmedCode, tag, isDeletion: false, indent: codeIndent };
  }
  return null;
}
var SYNTAX_MAP, SC_TAG_PATTERN;
var init_comment_syntax = __esm({
  "../../packages/core/dist-esm/comment-syntax.js"() {
    "use strict";
    SYNTAX_MAP = {
      // Hash-comment languages
      python: { line: "#" },
      ruby: { line: "#" },
      shellscript: { line: "#" },
      perl: { line: "#" },
      r: { line: "#" },
      yaml: { line: "#" },
      toml: { line: "#" },
      // C-style comment languages
      javascript: { line: "//" },
      typescript: { line: "//" },
      javascriptreact: { line: "//" },
      typescriptreact: { line: "//" },
      java: { line: "//" },
      c: { line: "//" },
      cpp: { line: "//" },
      csharp: { line: "//" },
      go: { line: "//" },
      rust: { line: "//" },
      swift: { line: "//" },
      kotlin: { line: "//" },
      php: { line: "//" },
      // Double-dash comment languages
      lua: { line: "--" },
      sql: { line: "--" }
    };
    SC_TAG_PATTERN = /ct-\d+(?:\.\d+)?/;
  }
});

// ../../packages/core/dist-esm/constants.js
function findSidecarBlockStart(lines, commentLinePrefix) {
  const prefix = `${commentLinePrefix} ${SIDECAR_BLOCK_MARKER}`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix)) {
      return i;
    }
  }
  return -1;
}
var SIDECAR_BLOCK_MARKER;
var init_constants = __esm({
  "../../packages/core/dist-esm/constants.js"() {
    "use strict";
    SIDECAR_BLOCK_MARKER = "-- ChangeTracks";
  }
});

// ../../packages/core/dist-esm/parser/sidecar-parser.js
var SidecarParser;
var init_sidecar_parser = __esm({
  "../../packages/core/dist-esm/parser/sidecar-parser.js"() {
    "use strict";
    init_types();
    init_document();
    init_comment_syntax();
    init_constants();
    SidecarParser = class {
      parse(text, languageId) {
        const syntax = getCommentSyntax(languageId);
        if (!syntax) {
          return new VirtualDocument([]);
        }
        if (text === "") {
          return new VirtualDocument([]);
        }
        const lines = text.split("\n");
        const sidecarStart = findSidecarBlockStart(lines, syntax.line);
        const entryMap = sidecarStart >= 0 ? this.parseSidecarBlock(lines, sidecarStart, syntax) : /* @__PURE__ */ new Map();
        const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
        const taggedLines = this.scanTaggedLines(lines, codeLineEnd, syntax);
        if (taggedLines.length === 0) {
          return new VirtualDocument([]);
        }
        const tagGroups = this.groupByTag(taggedLines);
        const changes = this.buildChangeNodes(tagGroups, entryMap, lines);
        return new VirtualDocument(changes);
      }
      /**
       * Parses the sidecar block starting at the given line index.
       * Returns a map from tag (e.g. "ct-1") to its metadata.
       */
      parseSidecarBlock(lines, startIndex, syntax) {
        const map = /* @__PURE__ */ new Map();
        const cm = escapeRegex(syntax.line);
        const entryPattern = new RegExp(`^${cm}\\s+\\[\\^(ct-\\d+(?:\\.\\d+)?)\\]:\\s+(\\w+)\\s+\\|\\s+(\\w+)`);
        const fieldPattern = new RegExp(`^${cm}\\s{4,}(\\w+):\\s+(.+)$`);
        const closePattern = new RegExp(`^${cm}\\s+-{3,}`);
        let currentTag = null;
        for (let i = startIndex + 1; i < lines.length; i++) {
          const line = lines[i];
          if (closePattern.test(line)) {
            break;
          }
          const entryMatch = line.match(entryPattern);
          if (entryMatch) {
            currentTag = entryMatch[1];
            map.set(currentTag, {
              type: entryMatch[2],
              status: entryMatch[3]
            });
            continue;
          }
          if (currentTag) {
            const fieldMatch = line.match(fieldPattern);
            if (fieldMatch) {
              const key = fieldMatch[1];
              let value = fieldMatch[2];
              const entry = map.get(currentTag);
              if (value.startsWith('"')) {
                const closingQuote = value.indexOf('"', 1);
                if (closingQuote > 0) {
                  value = value.slice(1, closingQuote);
                }
              }
              switch (key) {
                case "author":
                  entry.author = value;
                  break;
                case "date":
                  entry.date = value;
                  break;
                case "reason":
                  entry.reason = value;
                  break;
                case "original":
                  entry.original = value;
                  break;
              }
            }
          }
        }
        return map;
      }
      /**
       * Scans lines up to the sidecar block for ct-N tags.
       * Returns an array of tagged lines with their line index and parsed info.
       */
      scanTaggedLines(lines, endIndex, syntax) {
        const result = [];
        for (let i = 0; i < endIndex; i++) {
          const stripped = stripLineComment(lines[i], syntax);
          if (stripped) {
            result.push({
              tag: stripped.tag,
              lineIndex: i,
              code: stripped.code,
              isDeletion: stripped.isDeletion,
              indent: stripped.indent
            });
          }
        }
        return result;
      }
      /**
       * Groups tagged lines by their ct-N tag.
       * Preserves insertion order (first tag seen comes first).
       */
      groupByTag(taggedLines) {
        const groupMap = /* @__PURE__ */ new Map();
        const orderedTags = [];
        for (const tl of taggedLines) {
          let group = groupMap.get(tl.tag);
          if (!group) {
            group = { tag: tl.tag, deletions: [], insertions: [] };
            groupMap.set(tl.tag, group);
            orderedTags.push(tl.tag);
          }
          if (tl.isDeletion) {
            group.deletions.push(tl);
          } else {
            group.insertions.push(tl);
          }
        }
        return orderedTags.map((t2) => groupMap.get(t2));
      }
      /**
       * Builds ChangeNode[] from grouped tagged lines and sidecar metadata.
       */
      buildChangeNodes(tagGroups, entryMap, lines) {
        const changes = [];
        for (const group of tagGroups) {
          const meta = entryMap.get(group.tag);
          const hasDeletions = group.deletions.length > 0;
          const hasInsertions = group.insertions.length > 0;
          let changeType;
          if (meta?.type === "sub" || hasDeletions && hasInsertions) {
            changeType = ChangeType.Substitution;
          } else if (meta?.type === "del" || hasDeletions && !hasInsertions) {
            changeType = ChangeType.Deletion;
          } else {
            changeType = ChangeType.Insertion;
          }
          let status;
          switch (meta?.status) {
            case "accepted":
              status = ChangeStatus.Accepted;
              break;
            case "rejected":
              status = ChangeStatus.Rejected;
              break;
            default:
              status = ChangeStatus.Proposed;
          }
          const allTaggedLines = [...group.deletions, ...group.insertions];
          allTaggedLines.sort((a, b) => a.lineIndex - b.lineIndex);
          const firstLine = allTaggedLines[0].lineIndex;
          const lastLine = allTaggedLines[allTaggedLines.length - 1].lineIndex;
          const rangeStart = lineOffset(lines, firstLine);
          const rangeEnd = lineOffset(lines, lastLine) + lines[lastLine].length + 1;
          const range = { start: rangeStart, end: rangeEnd };
          let originalText;
          if (hasDeletions) {
            originalText = group.deletions.map((d) => d.code).join("\n");
          } else if (meta?.original) {
            originalText = meta.original;
          }
          let modifiedText;
          if (hasInsertions) {
            modifiedText = group.insertions.map((ins) => ins.code).join("\n");
          }
          let metadata;
          if (meta?.author || meta?.date || meta?.reason) {
            metadata = {};
            if (meta.author) {
              metadata.author = meta.author;
            }
            if (meta.date) {
              metadata.date = meta.date;
            }
            if (meta.reason) {
              metadata.comment = meta.reason;
            }
          }
          const node = {
            id: group.tag,
            type: changeType,
            status,
            range,
            contentRange: { ...range },
            level: 0,
            anchored: false
          };
          if (originalText !== void 0) {
            node.originalText = originalText;
          }
          if (modifiedText !== void 0) {
            node.modifiedText = modifiedText;
          }
          if (metadata) {
            node.metadata = metadata;
          }
          changes.push(node);
        }
        return changes;
      }
    };
  }
});

// ../../packages/core/dist-esm/operations/sidecar-accept-reject.js
function stripTag(line, syntax) {
  const escaped = escapeRegex(syntax.line);
  const pattern = new RegExp(`  ${escaped} ct-\\d+(?:\\.\\d+)?$`);
  return line.replace(pattern, "");
}
function tagMatches(lineTag, requestedTag) {
  if (lineTag === requestedTag) {
    return true;
  }
  if (!requestedTag.includes(".") && lineTag.startsWith(requestedTag + ".")) {
    return true;
  }
  return false;
}
function findSidecarBlockStart2(lines, syntax) {
  return findSidecarBlockStart(lines, syntax.line);
}
function findSidecarBlockEnd(lines, startIndex, syntax) {
  const escaped = escapeRegex(syntax.line);
  const closePattern = new RegExp(`^${escaped}\\s+-{3,}`);
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (closePattern.test(lines[i])) {
      return i;
    }
  }
  return -1;
}
function computeSidecarBlockEdits(lines, tag, syntax) {
  const edits = [];
  const sidecarStart = findSidecarBlockStart2(lines, syntax);
  if (sidecarStart < 0) {
    return edits;
  }
  const sidecarEnd = findSidecarBlockEnd(lines, sidecarStart, syntax);
  if (sidecarEnd < 0) {
    return edits;
  }
  const escaped = escapeRegex(syntax.line);
  const entryPattern = new RegExp(`^${escaped}\\s+\\[\\^(ct-\\d+(?:\\.\\d+)?)\\]:`);
  const fieldPattern = new RegExp(`^${escaped}\\s{4,}\\w+:\\s+`);
  const linesToRemove = [];
  let totalEntryCount = 0;
  let removedEntryCount = 0;
  let currentEntryMatches = false;
  for (let i = sidecarStart + 1; i < sidecarEnd; i++) {
    const entryMatch = lines[i].match(entryPattern);
    if (entryMatch) {
      totalEntryCount++;
      const entryTag = entryMatch[1];
      currentEntryMatches = tagMatches(entryTag, tag);
      if (currentEntryMatches) {
        removedEntryCount++;
        linesToRemove.push(i);
      }
    } else if (fieldPattern.test(lines[i]) && currentEntryMatches) {
      linesToRemove.push(i);
    }
  }
  if (removedEntryCount === totalEntryCount) {
    let blockStart = sidecarStart;
    if (sidecarStart > 0 && lines[sidecarStart - 1] === "") {
      blockStart = sidecarStart - 1;
    }
    const startOffset = lineOffset(lines, blockStart);
    let endOffset;
    if (sidecarEnd + 1 < lines.length && lines[sidecarEnd + 1] === "") {
      endOffset = lineOffset(lines, sidecarEnd + 1) + lines[sidecarEnd + 1].length + 1;
    } else {
      endOffset = lineOffset(lines, sidecarEnd) + lines[sidecarEnd].length + 1;
    }
    edits.push({
      offset: startOffset,
      length: endOffset - startOffset,
      newText: ""
    });
  } else {
    for (let i = linesToRemove.length - 1; i >= 0; i--) {
      const idx = linesToRemove[i];
      const start = lineOffset(lines, idx);
      const length = lines[idx].length + 1;
      edits.push({
        offset: start,
        length,
        newText: ""
      });
    }
  }
  return edits;
}
function computeSidecarAccept(text, tag, languageId) {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }
  const lines = text.split("\n");
  const sidecarStart = findSidecarBlockStart2(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits = [];
  let foundAny = false;
  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped || !tagMatches(stripped.tag, tag)) {
      continue;
    }
    foundAny = true;
    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;
    if (stripped.isDeletion) {
      edits.push({
        offset: start,
        length: lineLen + 1,
        // +1 for the \n
        newText: ""
      });
    } else {
      const cleanLine = stripTag(lines[i], syntax);
      edits.push({
        offset: start,
        length: lineLen,
        newText: cleanLine
      });
    }
  }
  if (!foundAny) {
    return [];
  }
  const blockEdits = computeSidecarBlockEdits(lines, tag, syntax);
  edits.push(...blockEdits);
  return edits;
}
function computeSidecarReject(text, tag, languageId) {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }
  const lines = text.split("\n");
  const sidecarStart = findSidecarBlockStart2(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits = [];
  let foundAny = false;
  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped || !tagMatches(stripped.tag, tag)) {
      continue;
    }
    foundAny = true;
    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;
    if (stripped.isDeletion) {
      const restoredLine = stripped.indent + stripped.code;
      edits.push({
        offset: start,
        length: lineLen,
        newText: restoredLine
      });
    } else {
      edits.push({
        offset: start,
        length: lineLen + 1,
        // +1 for the \n
        newText: ""
      });
    }
  }
  if (!foundAny) {
    return [];
  }
  const blockEdits = computeSidecarBlockEdits(lines, tag, syntax);
  edits.push(...blockEdits);
  return edits;
}
function computeEntireSidecarBlockRemoval(lines, syntax) {
  const sidecarStart = findSidecarBlockStart2(lines, syntax);
  if (sidecarStart < 0) {
    return [];
  }
  const sidecarEnd = findSidecarBlockEnd(lines, sidecarStart, syntax);
  if (sidecarEnd < 0) {
    return [];
  }
  let blockStart = sidecarStart;
  if (sidecarStart > 0 && lines[sidecarStart - 1] === "") {
    blockStart = sidecarStart - 1;
  }
  const startOffset = lineOffset(lines, blockStart);
  let endOffset;
  if (sidecarEnd + 1 < lines.length && lines[sidecarEnd + 1] === "") {
    endOffset = lineOffset(lines, sidecarEnd + 1) + lines[sidecarEnd + 1].length + 1;
  } else {
    endOffset = lineOffset(lines, sidecarEnd) + lines[sidecarEnd].length + 1;
  }
  return [{
    offset: startOffset,
    length: endOffset - startOffset,
    newText: ""
  }];
}
function computeSidecarResolveAll(text, changes, languageId, action) {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }
  const lines = text.split("\n");
  const sidecarStart = findSidecarBlockStart2(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits = [];
  const tags = /* @__PURE__ */ new Set();
  for (const change of changes) {
    tags.add(change.id);
  }
  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped) {
      continue;
    }
    let matched = false;
    for (const tag of tags) {
      if (tagMatches(stripped.tag, tag)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      continue;
    }
    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;
    if (action === "accept") {
      if (stripped.isDeletion) {
        edits.push({ offset: start, length: lineLen + 1, newText: "" });
      } else {
        const cleanLine = stripTag(lines[i], syntax);
        edits.push({ offset: start, length: lineLen, newText: cleanLine });
      }
    } else {
      if (stripped.isDeletion) {
        const restoredLine = stripped.indent + stripped.code;
        edits.push({ offset: start, length: lineLen, newText: restoredLine });
      } else {
        edits.push({ offset: start, length: lineLen + 1, newText: "" });
      }
    }
  }
  if (edits.length === 0) {
    return [];
  }
  edits.push(...computeEntireSidecarBlockRemoval(lines, syntax));
  return edits;
}
var init_sidecar_accept_reject = __esm({
  "../../packages/core/dist-esm/operations/sidecar-accept-reject.js"() {
    "use strict";
    init_comment_syntax();
    init_constants();
  }
});

// ../../packages/core/dist-esm/workspace.js
var Workspace;
var init_workspace = __esm({
  "../../packages/core/dist-esm/workspace.js"() {
    "use strict";
    init_parser();
    init_sidecar_parser();
    init_accept_reject();
    init_sidecar_accept_reject();
    init_comment_syntax();
    init_navigation();
    init_tracking();
    init_comment();
    init_constants();
    Workspace = class {
      constructor() {
        this.criticParser = new CriticMarkupParser();
        this.sidecarParser = new SidecarParser();
      }
      /**
       * Parses a document into a VirtualDocument.
       *
       * When languageId is provided and the text contains a sidecar block,
       * dispatches to the SidecarParser for code files.
       * Otherwise uses CriticMarkupParser (markdown, unknown languages,
       * code files without sidecar block).
       */
      parse(text, languageId) {
        if (this.shouldUseSidecar(text, languageId)) {
          return this.sidecarParser.parse(text, languageId);
        }
        return this.criticParser.parse(text);
      }
      /**
       * Computes edits to accept a change.
       *
       * For sidecar-annotated code files (when text and languageId are provided
       * and a sidecar block is detected), returns TextEdit[] from computeSidecarAccept.
       * Otherwise wraps the single CriticMarkup TextEdit in an array.
       */
      acceptChange(change, text, languageId) {
        if (text !== void 0 && this.shouldUseSidecar(text, languageId)) {
          return computeSidecarAccept(text, change.id, languageId);
        }
        const edits = [computeAccept(change)];
        if (text !== void 0 && change.id) {
          edits.push(...computeFootnoteStatusEdits(text, [change.id], "accepted"));
        }
        return edits;
      }
      /**
       * Computes edits to reject a change.
       *
       * For sidecar-annotated code files (when text and languageId are provided
       * and a sidecar block is detected), returns TextEdit[] from computeSidecarReject.
       * Otherwise wraps the single CriticMarkup TextEdit in an array.
       */
      rejectChange(change, text, languageId) {
        if (text !== void 0 && this.shouldUseSidecar(text, languageId)) {
          return computeSidecarReject(text, change.id, languageId);
        }
        const edits = [computeReject(change)];
        if (text !== void 0 && change.id) {
          edits.push(...computeFootnoteStatusEdits(text, [change.id], "rejected"));
        }
        return edits;
      }
      /**
       * Accepts all changes in a document.
       *
       * For sidecar-annotated code files, uses computeSidecarResolveAll to
       * produce non-overlapping edits (single sidecar block removal).
       * For CriticMarkup, maps over changes in reverse document order.
       */
      acceptAll(doc, text, languageId) {
        if (text !== void 0 && this.shouldUseSidecar(text, languageId)) {
          return computeSidecarResolveAll(text, doc.getChanges(), languageId, "accept");
        }
        const changes = doc.getChanges();
        const edits = [...changes].reverse().map(computeAccept);
        if (text !== void 0) {
          const ids = changes.map((c) => c.id).filter((id) => id !== "");
          edits.push(...computeFootnoteStatusEdits(text, ids, "accepted"));
        }
        return edits;
      }
      /**
       * Rejects all changes in a document.
       *
       * For sidecar-annotated code files, uses computeSidecarResolveAll to
       * produce non-overlapping edits (single sidecar block removal).
       * For CriticMarkup, maps over changes in reverse document order.
       */
      rejectAll(doc, text, languageId) {
        if (text !== void 0 && this.shouldUseSidecar(text, languageId)) {
          return computeSidecarResolveAll(text, doc.getChanges(), languageId, "reject");
        }
        const changes = doc.getChanges();
        const edits = [...changes].reverse().map(computeReject);
        if (text !== void 0) {
          const ids = changes.map((c) => c.id).filter((id) => id !== "");
          edits.push(...computeFootnoteStatusEdits(text, ids, "rejected"));
        }
        return edits;
      }
      /**
       * Accepts all members of a change group (e.g., a move operation).
       * Returns TextEdits in reverse document order to preserve ranges when applied sequentially.
       */
      acceptGroup(doc, groupId, text) {
        const members = doc.getGroupMembers(groupId);
        const edits = [...members].sort((a, b) => b.range.start - a.range.start).map(computeAccept);
        if (text !== void 0) {
          const ids = [groupId, ...members.map((m) => m.id)].filter((id) => id !== "");
          edits.push(...computeFootnoteStatusEdits(text, ids, "accepted"));
        }
        return edits;
      }
      /**
       * Rejects all members of a change group (e.g., a move operation).
       * Returns TextEdits in reverse document order to preserve ranges when applied sequentially.
       */
      rejectGroup(doc, groupId, text) {
        const members = doc.getGroupMembers(groupId);
        const edits = [...members].sort((a, b) => b.range.start - a.range.start).map(computeReject);
        if (text !== void 0) {
          const ids = [groupId, ...members.map((m) => m.id)].filter((id) => id !== "");
          edits.push(...computeFootnoteStatusEdits(text, ids, "rejected"));
        }
        return edits;
      }
      nextChange(doc, cursorOffset) {
        return nextChange(doc, cursorOffset);
      }
      previousChange(doc, cursorOffset) {
        return previousChange(doc, cursorOffset);
      }
      wrapInsertion(insertedText, offset, scId) {
        return wrapInsertion(insertedText, offset, scId);
      }
      wrapDeletion(deletedText, offset, scId) {
        return wrapDeletion(deletedText, offset, scId);
      }
      wrapSubstitution(oldText, newText, offset, scId) {
        return wrapSubstitution(oldText, newText, offset, scId);
      }
      insertComment(commentText, offset, selectionRange, selectedText) {
        return insertComment(commentText, offset, selectionRange, selectedText);
      }
      changeAtOffset(doc, offset) {
        return doc.changeAtOffset(offset);
      }
      /**
       * Determines whether to use the SidecarParser for a given text + languageId.
       *
       * Returns true when ALL of:
       * 1. languageId is provided and is NOT 'markdown'
       * 2. The language has line-comment syntax in the comment syntax map
       * 3. The text contains a '-- ChangeTracks' sidecar block marker
       */
      shouldUseSidecar(text, languageId) {
        if (!languageId || languageId === "markdown") {
          return false;
        }
        const syntax = getCommentSyntax(languageId);
        if (!syntax) {
          return false;
        }
        return text.includes(SIDECAR_BLOCK_MARKER);
      }
    };
  }
});

// ../../node_modules/diff/libesm/diff/base.js
var Diff;
var init_base = __esm({
  "../../node_modules/diff/libesm/diff/base.js"() {
    Diff = class {
      diff(oldStr, newStr, options = {}) {
        let callback;
        if (typeof options === "function") {
          callback = options;
          options = {};
        } else if ("callback" in options) {
          callback = options.callback;
        }
        const oldString = this.castInput(oldStr, options);
        const newString = this.castInput(newStr, options);
        const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
        const newTokens = this.removeEmpty(this.tokenize(newString, options));
        return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
      }
      diffWithOptionsObj(oldTokens, newTokens, options, callback) {
        var _a;
        const done = (value) => {
          value = this.postProcess(value, options);
          if (callback) {
            setTimeout(function() {
              callback(value);
            }, 0);
            return void 0;
          } else {
            return value;
          }
        };
        const newLen = newTokens.length, oldLen = oldTokens.length;
        let editLength = 1;
        let maxEditLength = newLen + oldLen;
        if (options.maxEditLength != null) {
          maxEditLength = Math.min(maxEditLength, options.maxEditLength);
        }
        const maxExecutionTime = (_a = options.timeout) !== null && _a !== void 0 ? _a : Infinity;
        const abortAfterTimestamp = Date.now() + maxExecutionTime;
        const bestPath = [{ oldPos: -1, lastComponent: void 0 }];
        let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
        if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
        }
        let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
        const execEditLength = () => {
          for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
            let basePath;
            const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
            if (removePath) {
              bestPath[diagonalPath - 1] = void 0;
            }
            let canAdd = false;
            if (addPath) {
              const addPathNewPos = addPath.oldPos - diagonalPath;
              canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
            }
            const canRemove = removePath && removePath.oldPos + 1 < oldLen;
            if (!canAdd && !canRemove) {
              bestPath[diagonalPath] = void 0;
              continue;
            }
            if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
              basePath = this.addToPath(addPath, true, false, 0, options);
            } else {
              basePath = this.addToPath(removePath, false, true, 1, options);
            }
            newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
            if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
              return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
            } else {
              bestPath[diagonalPath] = basePath;
              if (basePath.oldPos + 1 >= oldLen) {
                maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
              }
              if (newPos + 1 >= newLen) {
                minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
              }
            }
          }
          editLength++;
        };
        if (callback) {
          (function exec() {
            setTimeout(function() {
              if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
                return callback(void 0);
              }
              if (!execEditLength()) {
                exec();
              }
            }, 0);
          })();
        } else {
          while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
            const ret = execEditLength();
            if (ret) {
              return ret;
            }
          }
        }
      }
      addToPath(path6, added, removed, oldPosInc, options) {
        const last = path6.lastComponent;
        if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
          return {
            oldPos: path6.oldPos + oldPosInc,
            lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
          };
        } else {
          return {
            oldPos: path6.oldPos + oldPosInc,
            lastComponent: { count: 1, added, removed, previousComponent: last }
          };
        }
      }
      extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
        const newLen = newTokens.length, oldLen = oldTokens.length;
        let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
        while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
          newPos++;
          oldPos++;
          commonCount++;
          if (options.oneChangePerToken) {
            basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
          }
        }
        if (commonCount && !options.oneChangePerToken) {
          basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
        }
        basePath.oldPos = oldPos;
        return newPos;
      }
      equals(left, right, options) {
        if (options.comparator) {
          return options.comparator(left, right);
        } else {
          return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
        }
      }
      removeEmpty(array) {
        const ret = [];
        for (let i = 0; i < array.length; i++) {
          if (array[i]) {
            ret.push(array[i]);
          }
        }
        return ret;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      castInput(value, options) {
        return value;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      tokenize(value, options) {
        return Array.from(value);
      }
      join(chars) {
        return chars.join("");
      }
      postProcess(changeObjects, options) {
        return changeObjects;
      }
      get useLongestToken() {
        return false;
      }
      buildValues(lastComponent, newTokens, oldTokens) {
        const components = [];
        let nextComponent;
        while (lastComponent) {
          components.push(lastComponent);
          nextComponent = lastComponent.previousComponent;
          delete lastComponent.previousComponent;
          lastComponent = nextComponent;
        }
        components.reverse();
        const componentLen = components.length;
        let componentPos = 0, newPos = 0, oldPos = 0;
        for (; componentPos < componentLen; componentPos++) {
          const component = components[componentPos];
          if (!component.removed) {
            if (!component.added && this.useLongestToken) {
              let value = newTokens.slice(newPos, newPos + component.count);
              value = value.map(function(value2, i) {
                const oldValue = oldTokens[oldPos + i];
                return oldValue.length > value2.length ? oldValue : value2;
              });
              component.value = this.join(value);
            } else {
              component.value = this.join(newTokens.slice(newPos, newPos + component.count));
            }
            newPos += component.count;
            if (!component.added) {
              oldPos += component.count;
            }
          } else {
            component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
            oldPos += component.count;
          }
        }
        return components;
      }
    };
  }
});

// ../../node_modules/diff/libesm/diff/character.js
function diffChars(oldStr, newStr, options) {
  return characterDiff.diff(oldStr, newStr, options);
}
var CharacterDiff, characterDiff;
var init_character = __esm({
  "../../node_modules/diff/libesm/diff/character.js"() {
    init_base();
    CharacterDiff = class extends Diff {
    };
    characterDiff = new CharacterDiff();
  }
});

// ../../node_modules/diff/libesm/diff/line.js
function diffLines(oldStr, newStr, options) {
  return lineDiff.diff(oldStr, newStr, options);
}
function tokenize(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  const retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (let i = 0; i < linesAndNewlines.length; i++) {
    const line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
}
var LineDiff, lineDiff;
var init_line = __esm({
  "../../node_modules/diff/libesm/diff/line.js"() {
    init_base();
    LineDiff = class extends Diff {
      constructor() {
        super(...arguments);
        this.tokenize = tokenize;
      }
      equals(left, right, options) {
        if (options.ignoreWhitespace) {
          if (!options.newlineIsToken || !left.includes("\n")) {
            left = left.trim();
          }
          if (!options.newlineIsToken || !right.includes("\n")) {
            right = right.trim();
          }
        } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
          if (left.endsWith("\n")) {
            left = left.slice(0, -1);
          }
          if (right.endsWith("\n")) {
            right = right.slice(0, -1);
          }
        }
        return super.equals(left, right, options);
      }
    };
    lineDiff = new LineDiff();
  }
});

// ../../node_modules/diff/libesm/index.js
var init_libesm = __esm({
  "../../node_modules/diff/libesm/index.js"() {
    init_character();
    init_line();
  }
});

// ../../packages/core/dist-esm/annotators/markdown-annotator.js
function annotateMarkdown(oldText, newText) {
  if (oldText === newText) {
    return newText;
  }
  const lineChanges = diffLines(oldText, newText);
  let result = "";
  for (let i = 0; i < lineChanges.length; i++) {
    const change = lineChanges[i];
    const next = lineChanges[i + 1];
    if (change.removed && next?.added) {
      result += charLevelAnnotation(change.value, next.value);
      i++;
    } else if (change.removed) {
      result += `{--${change.value}--}`;
    } else if (change.added) {
      result += `{++${change.value}++}`;
    } else {
      result += change.value;
    }
  }
  return result;
}
function charLevelAnnotation(oldText, newText) {
  const changes = diffChars(oldText, newText);
  let result = "";
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      result += `{~~${change.value}~>${next.value}~~}`;
      i++;
    } else if (change.removed) {
      result += `{--${change.value}--}`;
    } else if (change.added) {
      result += `{++${change.value}++}`;
    } else {
      result += change.value;
    }
  }
  return result;
}
var init_markdown_annotator = __esm({
  "../../packages/core/dist-esm/annotators/markdown-annotator.js"() {
    "use strict";
    init_libesm();
  }
});

// ../../packages/core/dist-esm/annotators/sidecar-annotator.js
function splitChangeLines(value) {
  const trimmed = value.endsWith("\n") ? value.slice(0, -1) : value;
  if (trimmed === "") {
    return [];
  }
  return trimmed.split("\n");
}
function annotateSidecar(oldText, newText, languageId, metadata) {
  if (oldText === newText) {
    return newText;
  }
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return void 0;
  }
  const lineChanges = diffLines(oldText, newText);
  const outputLines = [];
  const entries = [];
  let tagCounter = 0;
  for (let i = 0; i < lineChanges.length; i++) {
    const change = lineChanges[i];
    const next = lineChanges[i + 1];
    if (change.removed && next?.added) {
      tagCounter++;
      const tag = `ct-${tagCounter}`;
      const oldLines = splitChangeLines(change.value);
      const newLines = splitChangeLines(next.value);
      for (const line of oldLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, true));
      }
      for (const line of newLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, false));
      }
      entries.push({
        tag,
        type: "sub",
        original: oldLines.join("\n")
      });
      i++;
    } else if (change.removed) {
      tagCounter++;
      const tag = `ct-${tagCounter}`;
      const oldLines = splitChangeLines(change.value);
      for (const line of oldLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, true));
      }
      entries.push({
        tag,
        type: "del",
        original: oldLines.join("\n")
      });
    } else if (change.added) {
      tagCounter++;
      const tag = `ct-${tagCounter}`;
      const newLines = splitChangeLines(change.value);
      for (const line of newLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, false));
      }
      entries.push({
        tag,
        type: "ins"
      });
    } else {
      const lines = splitChangeLines(change.value);
      for (const line of lines) {
        outputLines.push(line);
      }
    }
  }
  const cm = syntax.line;
  const sidecarLines = [];
  const divider = "-".repeat(45);
  sidecarLines.push(`${cm} ${SIDECAR_BLOCK_MARKER} ${divider}`);
  for (const entry of entries) {
    sidecarLines.push(`${cm} [^${entry.tag}]: ${entry.type} | pending`);
    if (metadata?.author) {
      sidecarLines.push(`${cm}     author: ${metadata.author}`);
    }
    if (metadata?.date) {
      sidecarLines.push(`${cm}     date: ${metadata.date}`);
    }
    if (entry.original !== void 0) {
      const firstLine = entry.original.split("\n")[0];
      const originalDisplay = entry.original.includes("\n") ? `"${firstLine}" (+${entry.original.split("\n").length - 1} more lines)` : `"${firstLine}"`;
      sidecarLines.push(`${cm}     original: ${originalDisplay}`);
    }
  }
  sidecarLines.push(`${cm} ${divider}---------------------`);
  const codeSection = outputLines.join("\n");
  const sidecarSection = sidecarLines.join("\n");
  return `${codeSection}
${sidecarSection}
`;
}
var init_sidecar_annotator = __esm({
  "../../packages/core/dist-esm/annotators/sidecar-annotator.js"() {
    "use strict";
    init_libesm();
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
function formatTrackedHashLines(content, options) {
  const startLine = options?.startLine ?? 1;
  const lines = content.split("\n");
  const totalLines = lines.length;
  const maxLineNum = startLine + totalLines - 1;
  const padWidth = String(maxLineNum).length;
  return lines.map((line, i) => {
    const lineNum = startLine + i;
    const paddedNum = String(lineNum).padStart(padWidth, " ");
    const rawHash = computeLineHash(i, line, lines);
    return `${paddedNum}:${rawHash}|${line}`;
  }).join("\n");
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
function computeCommittedView(rawText) {
  const rawLines = rawText.split("\n");
  const footnoteInfos = parseFootnotes(rawText);
  const statusMap = /* @__PURE__ */ new Map();
  for (const [id, info] of footnoteInfos) {
    statusMap.set(id, {
      status: info.status === "accepted" || info.status === "rejected" ? info.status : "proposed",
      type: info.type
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
  for (const info of footnoteInfos.values()) {
    if (info.status === "proposed")
      summary.proposed++;
    else if (info.status === "accepted")
      summary.accepted++;
    else if (info.status === "rejected")
      summary.rejected++;
  }
  return { lines: committedLines, summary, committedToRaw, rawToCommitted };
}
function formatCommittedOutput(view, options) {
  const headerLines = [];
  headerLines.push(`## file: ${options.filePath}`);
  const summaryParts = [];
  if (view.summary.proposed > 0)
    summaryParts.push(`${view.summary.proposed}P`);
  if (view.summary.accepted > 0)
    summaryParts.push(`${view.summary.accepted}A`);
  if (view.summary.rejected > 0)
    summaryParts.push(`${view.summary.rejected}R`);
  const changeSummary = summaryParts.length > 0 ? summaryParts.join(" ") : "clean";
  headerLines.push(`## view: committed | tracking: ${options.trackingStatus} | changes: ${changeSummary}`);
  const totalLines = view.lines.length;
  if (totalLines > 0) {
    headerLines.push(`## lines: 1-${totalLines} of ${totalLines}`);
  } else {
    headerLines.push("## lines: (empty)");
  }
  const maxLineNum = totalLines > 0 ? view.lines[view.lines.length - 1].committedLineNum : 1;
  const padWidth = Math.max(String(maxLineNum).length, 2);
  const contentLines = view.lines.map((line) => {
    const num = String(line.committedLineNum).padStart(padWidth, " ");
    const flag = line.flag || " ";
    return `${num}:${line.hash}${flag}|${line.text}`;
  });
  return [...headerLines, "", ...contentLines].join("\n");
}
var init_committed_text = __esm({
  "../../packages/core/dist-esm/committed-text.js"() {
    "use strict";
    init_footnote_parser();
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

// ../../packages/core/dist-esm/renderers/three-zone-types.js
function resolveViewName(name) {
  return VIEW_NAME_ALIASES[name];
}
function nextViewName(current) {
  const idx = VIEW_NAMES.indexOf(current);
  return VIEW_NAMES[(idx + 1) % VIEW_NAMES.length];
}
var VIEW_NAME_ALIASES, VIEW_NAME_DISPLAY_NAMES, VIEW_NAMES;
var init_three_zone_types = __esm({
  "../../packages/core/dist-esm/renderers/three-zone-types.js"() {
    "use strict";
    VIEW_NAME_ALIASES = {
      "all-markup": "review",
      "simple": "changes",
      "final": "settled",
      "original": "raw",
      // Canonical names map to themselves
      "review": "review",
      "changes": "changes",
      "settled": "settled",
      "raw": "raw"
    };
    VIEW_NAME_DISPLAY_NAMES = {
      review: "All Markup",
      changes: "Simple Markup",
      settled: "Final",
      raw: "Original"
    };
    VIEW_NAMES = ["review", "changes", "settled", "raw"];
  }
});

// ../../packages/core/dist-esm/renderers/decoration-intents.js
function buildDecorationIntents(changeNodes, viewMode, pendingOverlay) {
  if (viewMode === "raw") {
    return [];
  }
  const intents = [];
  for (const node of changeNodes) {
    buildNodeIntents(node, viewMode, intents);
  }
  if (pendingOverlay) {
    buildPendingIntents(pendingOverlay, viewMode, intents);
  }
  intents.sort((a, b) => a.range.start - b.range.start);
  return intents;
}
function buildNodeIntents(node, viewMode, out) {
  if (node.moveRole === "from") {
    buildMoveSourceIntents(node, viewMode, out);
    return;
  }
  if (node.moveRole === "to") {
    buildMoveTargetIntents(node, viewMode, out);
    return;
  }
  switch (node.type) {
    case ChangeType.Insertion:
      buildInsertionIntents(node, viewMode, out);
      break;
    case ChangeType.Deletion:
      buildDeletionIntents(node, viewMode, out);
      break;
    case ChangeType.Substitution:
      buildSubstitutionIntents(node, viewMode, out);
      break;
    case ChangeType.Highlight:
      buildHighlightIntents(node, viewMode, out);
      break;
    case ChangeType.Comment:
      buildCommentIntents(node, viewMode, out);
      break;
  }
}
function metaFor(node) {
  return {
    author: node.metadata?.author ?? node.inlineMetadata?.author,
    status: node.metadata?.status ?? node.inlineMetadata?.status ?? node.status,
    scId: node.id
  };
}
function buildInsertionIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "insertion",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "insertion",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  }
}
function buildDeletionIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "deletion",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "deletion",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: "deletion",
      visibility: "hidden",
      metadata: meta
    });
  }
}
function buildSubstitutionIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (!node.originalRange || !node.modifiedRange)
    return;
  const separatorStart = node.originalRange.end;
  const separatorEnd = node.modifiedRange.start;
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.originalRange.start, end: node.originalRange.end },
      kind: "substitution-old",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, separatorStart, SUB_SEPARATOR_LEN, "visible", meta);
    out.push({
      range: { start: node.modifiedRange.start, end: node.modifiedRange.end },
      kind: "substitution-new",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.originalRange.start, end: node.originalRange.end },
      kind: "substitution-old",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, separatorStart, SUB_SEPARATOR_LEN, "hidden", meta);
    out.push({
      range: { start: node.modifiedRange.start, end: node.modifiedRange.end },
      kind: "substitution-new",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    out.push({
      range: { start: node.range.start, end: node.modifiedRange.start },
      kind: "substitution-old",
      visibility: "hidden",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  }
}
function buildHighlightIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "highlight",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "highlight",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  }
}
function buildCommentIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "comment",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "comment",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: "comment",
      visibility: "hidden",
      metadata: meta
    });
  }
}
function buildMoveSourceIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "move-source",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "move-source",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: "move-source",
      visibility: "hidden",
      metadata: meta
    });
  }
}
function buildMoveTargetIntents(node, viewMode, out) {
  const meta = metaFor(node);
  if (viewMode === "review") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "visible", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "move-target",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "visible", meta);
  } else if (viewMode === "changes") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: "move-target",
      visibility: "visible",
      metadata: meta
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  } else if (viewMode === "settled") {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, "hidden", meta);
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, "hidden", meta);
  }
}
function buildPendingIntents(overlay, viewMode, out) {
  if (viewMode === "raw")
    return;
  const range = {
    start: overlay.anchorOffset,
    end: overlay.anchorOffset + overlay.currentLength
  };
  if (viewMode === "review") {
    out.push({
      range: { start: range.start, end: range.start },
      kind: "delimiter",
      visibility: "faded"
    });
    out.push({
      range,
      kind: "pending",
      visibility: "faded"
    });
    out.push({
      range: { start: range.end, end: range.end },
      kind: "delimiter",
      visibility: "faded"
    });
  } else if (viewMode === "changes" || viewMode === "settled") {
    out.push({
      range,
      kind: "pending",
      visibility: "faded"
    });
  }
}
function pushDelimiter(out, start, length, visibility, metadata) {
  out.push({
    range: { start, end: start + length },
    kind: "delimiter",
    visibility,
    metadata
  });
}
var OPEN_DELIMITER_LEN, CLOSE_DELIMITER_LEN, SUB_SEPARATOR_LEN;
var init_decoration_intents = __esm({
  "../../packages/core/dist-esm/renderers/decoration-intents.js"() {
    "use strict";
    init_types();
    init_tokens();
    OPEN_DELIMITER_LEN = 3;
    CLOSE_DELIMITER_LEN = 3;
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
function formatAnsi(doc, options) {
  const showMarkup = options?.showMarkup ?? false;
  const useUnicodeStrike = options?.useUnicodeStrikethrough ?? false;
  const parts = [];
  parts.push(formatHeader2(doc.header));
  parts.push("");
  const padWidth = doc.lines.length > 0 ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2) : 2;
  for (const line of doc.lines) {
    parts.push(formatLine2(line, padWidth, showMarkup, useUnicodeStrike));
  }
  return parts.join("\n");
}
function formatHeader2(header) {
  const lines = [];
  lines.push(`${BOLD}${CYAN}${header.filePath}${RESET} ${DIM}| ${header.protocolMode} | ${header.trackingStatus}${RESET}`);
  const p = header.counts.proposed;
  const a = header.counts.accepted;
  const r = header.counts.rejected;
  const countParts = [];
  if (p > 0)
    countParts.push(`${YELLOW}${p} proposed${RESET}`);
  if (a > 0)
    countParts.push(`${GREEN}${a} accepted${RESET}`);
  if (r > 0)
    countParts.push(`${RED}${r} rejected${RESET}`);
  if (countParts.length > 0)
    lines.push(countParts.join(" | "));
  if (header.authors.length > 0) {
    lines.push(`${DIM}authors: ${header.authors.join(", ")}${RESET}`);
  }
  lines.push(`${DIM}${"\u2500".repeat(60)}${RESET}`);
  return lines.join("\n");
}
function formatLine2(line, padWidth, showMarkup, useUnicodeStrike) {
  const num = `${GRAY}${String(line.margin.lineNumber).padStart(padWidth, " ")}${RESET}`;
  let gutter;
  if (line.margin.flags.includes("P")) {
    gutter = `${RED}\u2503${RESET}`;
  } else if (line.margin.flags.includes("A")) {
    gutter = `${GREEN}\u2503${RESET}`;
  } else {
    gutter = `${DIM}\u2502${RESET}`;
  }
  const content = line.content.map((s) => formatSpan(s, showMarkup, useUnicodeStrike)).join("");
  const meta = formatMetadata2(line.metadata);
  if (meta) {
    return `${num} ${gutter} ${content} ${meta}`;
  }
  return `${num} ${gutter} ${content}`;
}
function unicodeStrike(text) {
  return Array.from(text).map((ch) => ch + "\u0336").join("");
}
function formatSpan(span, showMarkup, useUnicodeStrike) {
  const strike = useUnicodeStrike ? (t2) => unicodeStrike(t2) : (t2) => `${STRIKETHROUGH}${t2}`;
  switch (span.type) {
    case "plain":
      return span.text;
    case "insertion":
      return `${GREEN}${span.text}${RESET}`;
    case "deletion":
      return `${RED}${strike(span.text)}${RESET}`;
    case "sub_old":
      return `${RED}${strike(span.text)}${RESET}`;
    case "sub_arrow":
      return `${DIM}\u2192${RESET}`;
    case "sub_new":
      return `${GREEN}${span.text}${RESET}`;
    case "highlight":
      return `${BG_YELLOW}${span.text}${RESET}`;
    case "comment":
      return `${DIM}${ITALIC}${span.text}${RESET}`;
    case "anchor":
      return "";
    case "delimiter":
      return showMarkup ? `${DIM}${span.text}${RESET}` : "";
    default:
      return span.text;
  }
}
function formatMetadata2(metadata) {
  if (metadata.length === 0)
    return "";
  const parts = metadata.map((m) => {
    let block = m.changeId;
    if (m.author)
      block += ` ${m.author}:`;
    if (m.reason)
      block += ` ${m.reason}`;
    if (m.replyCount != null && m.replyCount > 0) {
      block += ` | ${m.replyCount} ${m.replyCount === 1 ? "reply" : "replies"}`;
    }
    return block;
  });
  return `${DIM}${parts.join(" ")}${RESET}`;
}
var RESET, BOLD, DIM, ITALIC, STRIKETHROUGH, RED, GREEN, YELLOW, CYAN, GRAY, BG_YELLOW;
var init_ansi = __esm({
  "../../packages/core/dist-esm/renderers/formatters/ansi.js"() {
    "use strict";
    RESET = "\x1B[0m";
    BOLD = "\x1B[1m";
    DIM = "\x1B[2m";
    ITALIC = "\x1B[3m";
    STRIKETHROUGH = "\x1B[9m";
    RED = "\x1B[31m";
    GREEN = "\x1B[32m";
    YELLOW = "\x1B[33m";
    CYAN = "\x1B[36m";
    GRAY = "\x1B[90m";
    BG_YELLOW = "\x1B[43m";
  }
});

// ../../packages/core/dist-esm/renderers/formatters/html.js
function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatHtml(doc, options) {
  const showMarkup = options?.showMarkup ?? true;
  const showAnchors = options?.showAnchors ?? true;
  const embedMeta = options?.embedMetadata ?? true;
  const showZone3 = options?.showZone3 ?? false;
  const prefix = options?.classPrefix ?? "ct";
  const padWidth = doc.lines.length > 0 ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2) : 2;
  const metaByChangeId = /* @__PURE__ */ new Map();
  if (embedMeta) {
    for (const line of doc.lines) {
      for (const m of line.metadata) {
        metaByChangeId.set(m.changeId, m);
      }
    }
  }
  const lines = doc.lines.map((line) => formatLine3(line, padWidth, showMarkup, showAnchors, showZone3, prefix, metaByChangeId));
  return lines.join("\n");
}
function formatLine3(line, padWidth, showMarkup, showAnchors, showZone3, prefix, metaByChangeId) {
  const num = String(line.margin.lineNumber).padStart(padWidth, " ");
  const hash = line.margin.hash;
  const flag = line.margin.flags.length > 0 ? line.margin.flags[0] : " ";
  const flagClass = flag === "P" ? ` ${prefix}-flag-proposed` : flag === "A" ? ` ${prefix}-flag-accepted` : "";
  const content = line.content.map((s) => formatSpan2(s, showMarkup, showAnchors, prefix, metaByChangeId)).join("");
  const zone3 = showZone3 ? formatZone3(line.metadata, prefix) : "";
  return `<div class="${prefix}-line${flagClass}"><span class="${prefix}-margin">${num}:${hash}${flag !== " " ? flag : " "}|</span>${content}${zone3}</div>`;
}
function formatSpan2(span, showMarkup, showAnchors, prefix, metaByChangeId) {
  switch (span.type) {
    case "plain":
      return esc(span.text);
    case "insertion":
      return `<span class="${prefix}-insertion">${esc(span.text)}</span>`;
    case "deletion":
      return `<span class="${prefix}-deletion">${esc(span.text)}</span>`;
    case "sub_old":
      return `<span class="${prefix}-sub-old">${esc(span.text)}</span>`;
    case "sub_arrow":
      return `<span class="${prefix}-sub-arrow">${esc(span.text)}</span>`;
    case "sub_new":
      return `<span class="${prefix}-sub-new">${esc(span.text)}</span>`;
    case "highlight":
      return `<span class="${prefix}-highlight">${esc(span.text)}</span>`;
    case "comment":
      return `<span class="${prefix}-comment">${esc(span.text)}</span>`;
    case "anchor": {
      if (!showAnchors)
        return "";
      const idMatch = span.text.match(/\[\^(ct-[\d.]+)\]/);
      const changeId = idMatch ? idMatch[1] : "";
      const meta = metaByChangeId.get(changeId);
      const dataAttrs = meta ? buildDataAttrs(meta) : "";
      return `<span class="${prefix}-anchor" data-fn-id="${esc(changeId)}"${dataAttrs}>${esc(span.text)}</span>`;
    }
    case "delimiter":
      if (!showMarkup)
        return "";
      return `<span class="${prefix}-delimiter">${esc(span.text)}</span>`;
    default:
      return esc(span.text);
  }
}
function buildDataAttrs(meta) {
  const attrs = [];
  if (meta.author)
    attrs.push(` data-author="${esc(meta.author)}"`);
  if (meta.status)
    attrs.push(` data-status="${esc(meta.status)}"`);
  if (meta.reason)
    attrs.push(` data-reason="${esc(meta.reason)}"`);
  if (meta.replyCount != null && meta.replyCount > 0) {
    attrs.push(` data-replies="${meta.replyCount}"`);
  }
  return attrs.join("");
}
function formatZone3(metadata, prefix) {
  if (metadata.length === 0)
    return "";
  const parts = metadata.map((m) => {
    let text = m.changeId;
    if (m.author)
      text += ` ${m.author}:`;
    if (m.reason)
      text += ` ${m.reason}`;
    if (m.replyCount && m.replyCount > 0) {
      text += ` | ${m.replyCount} ${m.replyCount === 1 ? "reply" : "replies"}`;
    }
    const statusClass = m.status ? ` ${prefix}-z3-${m.status}` : "";
    return `<span class="${prefix}-zone3${statusClass}" data-change-id="${esc(m.changeId)}">${esc(text)}</span>`;
  });
  return ` <span class="${prefix}-zone3-group">${parts.join(" ")}</span>`;
}
var init_html = __esm({
  "../../packages/core/dist-esm/renderers/formatters/html.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/renderers/formatters/index.js
function formatDocument(doc, options) {
  const useAnsi = options?.color ?? options?.isTTY ?? false;
  if (useAnsi) {
    return formatAnsi(doc, {
      showMarkup: options?.showMarkup ?? false,
      useUnicodeStrikethrough: options?.useUnicodeStrikethrough ?? false
    });
  }
  return formatPlainText(doc);
}
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
  const { footnotes } = options;
  let proposed = 0, accepted = 0, rejected = 0, threadCount = 0;
  const authorSet = /* @__PURE__ */ new Set();
  for (const fn of footnotes.values()) {
    if (fn.status === "proposed")
      proposed++;
    else if (fn.status === "accepted")
      accepted++;
    else if (fn.status === "rejected")
      rejected++;
    if (fn.replyCount > 0)
      threadCount++;
    if (fn.author)
      authorSet.add(fn.author);
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
function findFootnoteSectionRange(footnotes) {
  if (footnotes.size === 0)
    return null;
  let min = Infinity;
  let max = -Infinity;
  for (const fn of footnotes.values()) {
    if (fn.startLine < min)
      min = fn.startLine;
    if (fn.endLine > max)
      max = fn.endLine;
  }
  return [min, max];
}
var REF_EXTRACT_RE;
var init_view_builder_utils = __esm({
  "../../packages/core/dist-esm/renderers/view-builder-utils.js"() {
    "use strict";
    REF_EXTRACT_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/review.js
function buildReviewDocument(content, options) {
  const footnotes = parseFootnotes(content);
  const rawLines = content.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  const fnRange = findFootnoteSectionRange(footnotes);
  const lineRefMap = buildLineRefMap(rawLines);
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
    const contentSpans = buildContentSpans(rawLine, footnotes);
    const refIds = lineRefMap.get(i);
    const metadata = buildLineMetadata(refIds, footnotes);
    const flags = computeFlags(refIds, footnotes);
    const hash = computeLineHash(i, rawLine, rawLines);
    outputLines.push({
      margin: { lineNumber: lineNum, hash, flags },
      content: contentSpans,
      metadata,
      rawLineNumber: lineNum,
      sessionHashes: {
        raw: hash,
        settled: computeSettledLineHash(lineNum, rawLine, allSettled)
      }
    });
  }
  const header = buildDeliberationHeader({
    filePath: options.filePath,
    trackingStatus: options.trackingStatus,
    protocolMode: options.protocolMode,
    defaultView: options.defaultView,
    viewPolicy: options.viewPolicy,
    footnotes
  });
  return {
    view: "review",
    header,
    lines: outputLines
  };
}
function buildContentSpans(line, footnotes) {
  const spans = [];
  let lastIndex = 0;
  const re = new RegExp(CRITIC_MARKUP_RE.source, "g");
  for (const match of line.matchAll(re)) {
    const matchStart = match.index;
    if (matchStart > lastIndex) {
      const between = line.slice(lastIndex, matchStart);
      emitPlainAndAnchors(between, footnotes, spans);
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
    emitPlainAndAnchors(remaining, footnotes, spans);
  }
  if (spans.length === 0) {
    spans.push({ type: "plain", text: "" });
  }
  return spans;
}
function emitPlainAndAnchors(text, footnotes, spans) {
  let lastIdx = 0;
  const re = new RegExp(FOOTNOTE_REF_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const matchStart = match.index;
    const id = match[1];
    const info = footnotes.get(id);
    if (matchStart > lastIdx) {
      spans.push({ type: "plain", text: text.slice(lastIdx, matchStart) });
    }
    if (info) {
      spans.push({ type: "anchor", text: `[^${info.id}]` });
    } else {
      spans.push({ type: "plain", text: match[0] });
    }
    lastIdx = matchStart + match[0].length;
  }
  if (lastIdx < text.length) {
    spans.push({ type: "plain", text: text.slice(lastIdx) });
  }
}
function buildLineMetadata(refIds, footnotes) {
  if (!refIds)
    return [];
  const metadata = [];
  for (const id of refIds) {
    const info = footnotes.get(id);
    if (!info)
      continue;
    metadata.push({
      changeId: info.id,
      author: info.author,
      reason: info.reason || void 0,
      replyCount: info.replyCount > 0 ? info.replyCount : void 0,
      status: info.status
    });
  }
  return metadata;
}
function computeFlags(refIds, footnotes) {
  if (!refIds)
    return [];
  let hasProposed = false;
  let hasAccepted = false;
  for (const id of refIds) {
    const info = footnotes.get(id);
    if (!info)
      continue;
    if (info.status === "proposed")
      hasProposed = true;
    if (info.status === "accepted")
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
    init_footnote_parser();
    init_hashline();
    init_hashline_tracked();
    init_view_builder_utils();
    CRITIC_MARKUP_RE = /\{\+\+((?:[^+]|\+(?!\+\}))*?)\+\+\}|\{--((?:[^-]|-(?!-\}))*?)--\}|\{~~((?:[^~]|~(?!>))*?)~>((?:[^~]|~(?!~\}))*?)~~\}|\{==((?:[^=]|=(?!=\}))*?)==\}|\{>>((?:[^<]|<(?!<\}))*?)<<\}/g;
    FOOTNOTE_REF_RE = /\[\^(ct-\d+(?:\.\d+)?)\]/g;
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/changes.js
function buildChangesDocument(rawContent, options) {
  const footnotes = parseFootnotes(rawContent);
  const committedResult = computeCommittedView(rawContent);
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
    footnotes,
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
    init_footnote_parser();
    init_view_builder_utils();
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/settled.js
function buildSettledDocument(rawContent, options) {
  const footnotes = parseFootnotes(rawContent);
  const settledResult = computeSettledView(rawContent);
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
    footnotes,
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
    init_footnote_parser();
    init_view_builder_utils();
  }
});

// ../../packages/core/dist-esm/renderers/view-builders/raw.js
function buildRawDocument(rawContent, options) {
  const footnotes = parseFootnotes(rawContent);
  const rawLines = rawContent.split("\n");
  const allSettled = rawLines.map((l) => settledLine(l));
  const lines = rawLines.map((text, i) => ({
    margin: {
      lineNumber: i + 1,
      hash: computeLineHash(i, text, rawLines),
      flags: []
    },
    content: [{ type: "plain", text }],
    metadata: [],
    rawLineNumber: i + 1,
    sessionHashes: {
      raw: computeLineHash(i, text, rawLines),
      settled: computeSettledLineHash(i + 1, text, allSettled)
    }
  }));
  const header = buildDeliberationHeader({
    ...options,
    footnotes,
    lineRange: { start: 1, end: lines.length, total: lines.length }
  });
  const fnRange = findFootnoteSectionRange(footnotes);
  const footnoteSection = fnRange ? rawLines.slice(fnRange[0], fnRange[1] + 1).join("\n") : void 0;
  return { view: "raw", header, lines, footnoteSection };
}
var init_raw = __esm({
  "../../packages/core/dist-esm/renderers/view-builders/raw.js"() {
    "use strict";
    init_hashline();
    init_hashline_tracked();
    init_footnote_parser();
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
var DEFAULT_EDIT_BOUNDARY_CONFIG;
var init_types2 = __esm({
  "../../packages/core/dist-esm/edit-boundary/types.js"() {
    "use strict";
    DEFAULT_EDIT_BOUNDARY_CONFIG = {
      pauseThresholdMs: 3e4,
      breakOnNewline: true,
      pasteMinChars: 50
    };
  }
});

// ../../packages/core/dist-esm/edit-boundary/pending-buffer.js
function isEmpty(buf) {
  return buf.currentText.length === 0 && buf.originalText.length === 0;
}
function bufferEnd(buf) {
  return buf.anchorOffset + buf.currentText.length;
}
function containsOffset(buf, offset) {
  return offset >= buf.anchorOffset && offset < bufferEnd(buf);
}
function extend(buf, insertedText, now) {
  return {
    ...buf,
    currentText: buf.currentText + insertedText,
    cursorOffset: buf.cursorOffset + insertedText.length,
    lastEditTime: now
  };
}
function prependOriginal(buf, text, now) {
  return {
    ...buf,
    anchorOffset: buf.anchorOffset - text.length,
    originalText: text + buf.originalText,
    lastEditTime: now
  };
}
function appendOriginal(buf, text, now) {
  return {
    ...buf,
    originalText: buf.originalText + text,
    lastEditTime: now
  };
}
function spliceInsert(buf, docOffset, insertedText, now) {
  const relOffset = docOffset - buf.anchorOffset;
  if (relOffset < 0 || relOffset > buf.currentText.length) {
    throw new RangeError(`spliceInsert out of bounds: relOffset=${relOffset}, buffer length=${buf.currentText.length}`);
  }
  const before = buf.currentText.slice(0, relOffset);
  const after = buf.currentText.slice(relOffset);
  return {
    ...buf,
    currentText: before + insertedText + after,
    cursorOffset: relOffset + insertedText.length,
    lastEditTime: now
  };
}
function spliceDelete(buf, docOffset, deleteLength, now) {
  const relOffset = docOffset - buf.anchorOffset;
  const relEnd = relOffset + deleteLength;
  if (relOffset < 0 || relEnd > buf.currentText.length) {
    throw new RangeError(`spliceDelete out of bounds: rel=[${relOffset}, ${relEnd}), buffer length=${buf.currentText.length}`);
  }
  const before = buf.currentText.slice(0, relOffset);
  const after = buf.currentText.slice(relEnd);
  const newCurrentText = before + after;
  if (newCurrentText.length === 0 && buf.originalText.length === 0) {
    return null;
  }
  return {
    ...buf,
    currentText: newCurrentText,
    cursorOffset: relOffset,
    lastEditTime: now
  };
}
function createBuffer(anchorOffset, currentText, originalText, now, scId) {
  return {
    anchorOffset,
    currentText,
    originalText,
    cursorOffset: currentText.length,
    startTime: now,
    lastEditTime: now,
    scId
  };
}
var init_pending_buffer = __esm({
  "../../packages/core/dist-esm/edit-boundary/pending-buffer.js"() {
    "use strict";
  }
});

// ../../packages/core/dist-esm/edit-boundary/signal-classifier.js
function classifySignal(event, state) {
  const { pending, isComposing } = state;
  if (event.type === "editorSwitch" || event.type === "save" || event.type === "flush") {
    return "hard-break";
  }
  if (isComposing) {
    return "ignore";
  }
  if (pending === null) {
    return "break";
  }
  const end = bufferEnd(pending);
  if (event.type === "insertion" && state.config.breakOnNewline && event.text.includes("\n")) {
    return "break";
  }
  if (event.type === "insertion" && event.text.length >= state.config.pasteMinChars) {
    return "break";
  }
  if (event.type === "insertion") {
    if (event.offset === end)
      return "extend";
    if (containsOffset(pending, event.offset))
      return "splice";
    return "break";
  }
  if (event.type === "deletion") {
    if (event.offset + event.deletedText.length === pending.anchorOffset)
      return "extend";
    if (event.offset === end)
      return "extend";
    if (containsOffset(pending, event.offset))
      return "splice";
    return "break";
  }
  if (event.type === "substitution") {
    if (event.offset >= pending.anchorOffset && event.offset + event.oldText.length <= end) {
      return "splice";
    }
    return "break";
  }
  const _exhaustive = event;
  return _exhaustive;
}
var init_signal_classifier = __esm({
  "../../packages/core/dist-esm/edit-boundary/signal-classifier.js"() {
    "use strict";
    init_pending_buffer();
  }
});

// ../../packages/core/dist-esm/edit-boundary/state-machine.js
function processEvent(state, event, context) {
  if (state.pending !== null && state.config.pauseThresholdMs > 0 && (event.type === "insertion" || event.type === "deletion" || event.type === "substitution") && context.now - state.pending.lastEditTime > state.config.pauseThresholdMs) {
    return handleBreak(state, event, context);
  }
  const signal = classifySignal(event, state);
  switch (signal) {
    case "hard-break":
      return handleHardBreak(state);
    case "break":
      return handleBreak(state, event, context);
    case "extend":
      return handleExtend(state, event, context);
    case "splice":
      return handleSplice(state, event, context);
    case "ignore":
      return { newState: state, effects: [] };
  }
}
function createOverlay(buf) {
  return {
    anchorOffset: buf.anchorOffset,
    currentLength: buf.currentText.length,
    currentText: buf.currentText,
    originalText: buf.originalText,
    cursorOffset: buf.cursorOffset
  };
}
function flush(state) {
  const buf = state.pending;
  if (buf === null) {
    return { effects: [], clearedState: state };
  }
  const effects = [];
  const hasOriginal = buf.originalText.length > 0;
  const hasCurrent = buf.currentText.length > 0;
  if (!hasOriginal && !hasCurrent) {
  } else {
    let changeType;
    if (!hasOriginal && hasCurrent) {
      changeType = "insertion";
    } else if (hasOriginal && !hasCurrent) {
      changeType = "deletion";
    } else {
      changeType = "substitution";
    }
    effects.push({
      type: "crystallize",
      changeType,
      offset: buf.anchorOffset,
      length: changeType === "insertion" ? buf.currentText.length : changeType === "deletion" ? 0 : buf.currentText.length,
      currentText: buf.currentText,
      originalText: buf.originalText,
      scId: buf.scId
    });
  }
  effects.push({ type: "updatePendingOverlay", overlay: null }, { type: "mergeAdjacent", offset: buf.anchorOffset });
  return { effects, clearedState: { ...state, pending: null } };
}
function handleHardBreak(state) {
  const { effects, clearedState } = flush(state);
  return { newState: clearedState, effects };
}
function handleBreak(state, event, context) {
  const { effects: flushEffects, clearedState } = flush(state);
  if (event.type === "insertion") {
    if (state.config.breakOnNewline && event.text.includes("\n") || event.text.length >= state.config.pasteMinChars) {
      return {
        newState: clearedState,
        effects: [...flushEffects, {
          type: "crystallize",
          changeType: "insertion",
          offset: event.offset,
          length: event.text.length,
          currentText: event.text,
          originalText: ""
        }]
      };
    }
    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, event.text, "", context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: "updatePendingOverlay", overlay: createOverlay(buf) }]
    };
  }
  if (event.type === "deletion") {
    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, "", event.deletedText, context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: "updatePendingOverlay", overlay: createOverlay(buf) }]
    };
  }
  if (event.type === "substitution") {
    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, event.newText, event.oldText, context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: "updatePendingOverlay", overlay: createOverlay(buf) }]
    };
  }
  throw new Error(`Unreachable: unhandled event type in handleBreak: ${event.type}`);
}
function handleExtend(state, event, context) {
  const buf = state.pending;
  const now = context.now;
  let newBuf;
  if (event.type === "insertion") {
    newBuf = extend(buf, event.text, now);
  } else if (event.type === "deletion") {
    if (event.offset + event.deletedText.length === buf.anchorOffset) {
      newBuf = prependOriginal(buf, event.deletedText, now);
    } else {
      newBuf = appendOriginal(buf, event.deletedText, now);
    }
  } else {
    throw new Error("Unreachable: extend signal only dispatched for insertion/deletion");
  }
  return {
    newState: { ...state, pending: newBuf },
    effects: [{ type: "updatePendingOverlay", overlay: createOverlay(newBuf) }]
  };
}
function handleSplice(state, event, context) {
  const buf = state.pending;
  const now = context.now;
  if (event.type === "insertion") {
    const newBuf = spliceInsert(buf, event.offset, event.text, now);
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: "updatePendingOverlay", overlay: createOverlay(newBuf) }]
    };
  }
  if (event.type === "deletion") {
    const newBuf = spliceDelete(buf, event.offset, event.deletedText.length, now);
    if (newBuf === null) {
      return {
        newState: { ...state, pending: null },
        effects: [{ type: "updatePendingOverlay", overlay: null }]
      };
    }
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: "updatePendingOverlay", overlay: createOverlay(newBuf) }]
    };
  }
  if (event.type === "substitution") {
    const afterDelete = spliceDelete(buf, event.offset, event.oldText.length, now);
    if (afterDelete === null) {
      const newBuf2 = createBuffer(event.offset, event.newText, "", now, buf.scId);
      return {
        newState: { ...state, pending: newBuf2 },
        effects: [{ type: "updatePendingOverlay", overlay: createOverlay(newBuf2) }]
      };
    }
    const newBuf = spliceInsert(afterDelete, event.offset, event.newText, now);
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: "updatePendingOverlay", overlay: createOverlay(newBuf) }]
    };
  }
  throw new Error(`Unreachable: unhandled event type in handleSplice: ${event.type}`);
}
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
var dist_esm_exports = {};
__export(dist_esm_exports, {
  ChangeStatus: () => ChangeStatus,
  ChangeType: () => ChangeType,
  CriticMarkupParser: () => CriticMarkupParser,
  DEFAULT_EDIT_BOUNDARY_CONFIG: () => DEFAULT_EDIT_BOUNDARY_CONFIG,
  FOOTNOTE_CONTINUATION: () => FOOTNOTE_CONTINUATION,
  FOOTNOTE_DEF_LENIENT: () => FOOTNOTE_DEF_LENIENT,
  FOOTNOTE_DEF_START: () => FOOTNOTE_DEF_START,
  FOOTNOTE_DEF_START_QUICK: () => FOOTNOTE_DEF_START_QUICK,
  FOOTNOTE_DEF_STATUS: () => FOOTNOTE_DEF_STATUS,
  FOOTNOTE_DEF_STATUS_VALUE: () => FOOTNOTE_DEF_STATUS_VALUE,
  FOOTNOTE_DEF_STRICT: () => FOOTNOTE_DEF_STRICT,
  FOOTNOTE_ID_NUMERIC_PATTERN: () => FOOTNOTE_ID_NUMERIC_PATTERN,
  FOOTNOTE_ID_PATTERN: () => FOOTNOTE_ID_PATTERN,
  FOOTNOTE_REF_ANCHORED: () => FOOTNOTE_REF_ANCHORED,
  HAS_CRITIC_MARKUP: () => HAS_CRITIC_MARKUP,
  HashlineMismatchError: () => HashlineMismatchError,
  SIDECAR_BLOCK_MARKER: () => SIDECAR_BLOCK_MARKER,
  SidecarParser: () => SidecarParser,
  TokenType: () => TokenType,
  VALID_DECISIONS: () => VALID_DECISIONS,
  VIEW_NAMES: () => VIEW_NAMES,
  VIEW_NAME_ALIASES: () => VIEW_NAME_ALIASES,
  VIEW_NAME_DISPLAY_NAMES: () => VIEW_NAME_DISPLAY_NAMES,
  VirtualDocument: () => VirtualDocument,
  Workspace: () => Workspace,
  annotateMarkdown: () => annotateMarkdown,
  annotateSidecar: () => annotateSidecar,
  appendFootnote: () => appendFootnote,
  appendOriginal: () => appendOriginal,
  applyProposeChange: () => applyProposeChange,
  applyReview: () => applyReview,
  applySingleOperation: () => applySingleOperation,
  bufferContainsOffset: () => containsOffset,
  bufferEnd: () => bufferEnd,
  buildChangesDocument: () => buildChangesDocument,
  buildDecorationIntents: () => buildDecorationIntents,
  buildDeliberationHeader: () => buildDeliberationHeader,
  buildLineRefMap: () => buildLineRefMap,
  buildRawDocument: () => buildRawDocument,
  buildReviewDocument: () => buildReviewDocument,
  buildSettledDocument: () => buildSettledDocument,
  buildViewDocument: () => buildViewDocument,
  buildViewSurfaceMap: () => buildViewSurfaceMap,
  buildWhitespaceCollapseMap: () => buildWhitespaceCollapseMap,
  checkCriticMarkupOverlap: () => checkCriticMarkupOverlap,
  classifySignal: () => classifySignal,
  collapseWhitespace: () => collapseWhitespace,
  compactToLevel0: () => compactToLevel0,
  compactToLevel1: () => compactToLevel1,
  compareTimestamps: () => compareTimestamps,
  computeAccept: () => computeAccept,
  computeAcceptParts: () => computeAcceptParts,
  computeAmendEdits: () => computeAmendEdits,
  computeApprovalLineEdit: () => computeApprovalLineEdit,
  computeCommittedLine: () => computeCommittedLine,
  computeCommittedView: () => computeCommittedView,
  computeFootnoteArchiveLineEdit: () => computeFootnoteArchiveLineEdit,
  computeFootnoteStatusEdits: () => computeFootnoteStatusEdits,
  computeLineHash: () => computeLineHash,
  computeOriginalText: () => computeOriginalText,
  computeReject: () => computeReject,
  computeRejectParts: () => computeRejectParts,
  computeReplyEdit: () => computeReplyEdit,
  computeResolutionEdit: () => computeResolutionEdit,
  computeSettledLineHash: () => computeSettledLineHash,
  computeSettledReplace: () => computeSettledReplace,
  computeSettledText: () => computeSettledText,
  computeSettledView: () => computeSettledView,
  computeSidecarAccept: () => computeSidecarAccept,
  computeSidecarReject: () => computeSidecarReject,
  computeSidecarResolveAll: () => computeSidecarResolveAll,
  computeSupersedeResult: () => computeSupersedeResult,
  computeUnresolveEdit: () => computeUnresolveEdit,
  contentZoneText: () => contentZoneText,
  countFootnoteHeadersWithStatus: () => countFootnoteHeadersWithStatus,
  createBuffer: () => createBuffer,
  defaultNormalizer: () => defaultNormalizer,
  detectNoOp: () => detectNoOp,
  diagnosticConfusableNormalize: () => diagnosticConfusableNormalize,
  ensureHashlineReady: () => ensureHashlineReady,
  ensureL2: () => ensureL2,
  escapeRegex: () => escapeRegex,
  extendBuffer: () => extend,
  extractLineRange: () => extractLineRange,
  findAllProposedOverlaps: () => findAllProposedOverlaps,
  findChildFootnoteIds: () => findChildFootnoteIds,
  findCodeZones: () => findCodeZones,
  findDiscussionInsertionIndex: () => findDiscussionInsertionIndex,
  findFootnoteBlock: () => findFootnoteBlock,
  findFootnoteBlockStart: () => findFootnoteBlockStart,
  findFootnoteSectionRange: () => findFootnoteSectionRange,
  findReviewInsertionIndex: () => findReviewInsertionIndex,
  findSidecarBlockStart: () => findSidecarBlockStart,
  findUniqueMatch: () => findUniqueMatch,
  footnoteRefGlobal: () => footnoteRefGlobal,
  footnoteRefNumericGlobal: () => footnoteRefNumericGlobal,
  formatAnsi: () => formatAnsi,
  formatCommittedOutput: () => formatCommittedOutput,
  formatDocument: () => formatDocument,
  formatHashLines: () => formatHashLines,
  formatHtml: () => formatHtml,
  formatPlainText: () => formatPlainText,
  formatTimestamp: () => formatTimestamp,
  formatTrackedHashLines: () => formatTrackedHashLines,
  formatTrackedHeader: () => formatTrackedHeader,
  generateFootnoteDefinition: () => generateFootnoteDefinition,
  generateTrackingHeader: () => generateTrackingHeader,
  getCommentSyntax: () => getCommentSyntax,
  guardOverlap: () => guardOverlap,
  hasCriticMarkup: () => hasCriticMarkup,
  initHashline: () => initHashline,
  inlineMarkupAll: () => inlineMarkupAll,
  insertComment: () => insertComment,
  insertTrackingHeader: () => insertTrackingHeader,
  isBufferEmpty: () => isEmpty,
  lineOffset: () => lineOffset,
  markupWithRef: () => markupWithRef,
  multiLineComment: () => multiLineComment,
  multiLineDeletion: () => multiLineDeletion,
  multiLineHighlight: () => multiLineHighlight,
  multiLineInsertion: () => multiLineInsertion,
  multiLineSubstitution: () => multiLineSubstitution,
  nextChange: () => nextChange,
  nextViewName: () => nextViewName,
  normalizedIndexOf: () => normalizedIndexOf,
  nowTimestamp: () => nowTimestamp,
  parseAt: () => parseAt,
  parseFootnoteHeader: () => parseFootnoteHeader,
  parseFootnotes: () => parseFootnotes,
  parseLineRef: () => parseLineRef,
  parseOp: () => parseOp,
  parseProjectConfig: () => parseProjectConfig,
  parseTimestamp: () => parseTimestamp,
  parseTrackingHeader: () => parseTrackingHeader,
  prependOriginal: () => prependOriginal,
  previousChange: () => previousChange,
  processEvent: () => processEvent,
  promoteToLevel1: () => promoteToLevel1,
  promoteToLevel2: () => promoteToLevel2,
  relocateHashRef: () => relocateHashRef,
  replaceUnique: () => replaceUnique,
  resolveAt: () => resolveAt,
  resolveChangeById: () => resolveChangeById,
  resolveOverlapWithAuthor: () => resolveOverlapWithAuthor,
  resolveViewName: () => resolveViewName,
  scanMaxCtId: () => scanMaxCtId,
  settleAcceptedChangesOnly: () => settleAcceptedChangesOnly,
  settleRejectedChangesOnly: () => settleRejectedChangesOnly,
  settledLine: () => settledLine,
  singleLineComment: () => singleLineComment,
  singleLineDeletion: () => singleLineDeletion,
  singleLineHighlight: () => singleLineHighlight,
  singleLineInsertion: () => singleLineInsertion,
  singleLineSubstitution: () => singleLineSubstitution,
  skipInlineCode: () => skipInlineCode,
  spliceDelete: () => spliceDelete,
  spliceInsert: () => spliceInsert,
  stripBoundaryEcho: () => stripBoundaryEcho,
  stripCriticMarkup: () => stripCriticMarkup,
  stripCriticMarkupToCommittedWithMap: () => stripCriticMarkupToCommittedWithMap,
  stripCriticMarkupWithMap: () => stripCriticMarkupWithMap,
  stripHashlinePrefixes: () => stripHashlinePrefixes,
  stripLineComment: () => stripLineComment,
  stripRefsFromContent: () => stripRefsFromContent,
  tryDiagnosticConfusableMatch: () => tryDiagnosticConfusableMatch,
  tryMatchFenceClose: () => tryMatchFenceClose,
  tryMatchFenceOpen: () => tryMatchFenceOpen,
  unicodeName: () => unicodeName,
  validateLineRef: () => validateLineRef,
  viewAwareFind: () => viewAwareFind,
  whitespaceCollapsedFind: () => whitespaceCollapsedFind,
  whitespaceCollapsedIsAmbiguous: () => whitespaceCollapsedIsAmbiguous,
  wrapDeletion: () => wrapDeletion,
  wrapInsertion: () => wrapInsertion,
  wrapLineComment: () => wrapLineComment,
  wrapSubstitution: () => wrapSubstitution
});
var init_dist_esm = __esm({
  "../../packages/core/dist-esm/index.js"() {
    "use strict";
    init_config();
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
    init_workspace();
    init_comment_syntax();
    init_markdown_annotator();
    init_sidecar_annotator();
    init_sidecar_parser();
    init_sidecar_accept_reject();
    init_tracking_header();
    init_text_normalizer();
    init_settled_text();
    init_hashline();
    init_hashline_tracked();
    init_hashline_cleanup();
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
  }
});

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

// ../llm-jail/dist/src/types.js
var PRE_HANDLER_MAP = {
  read: "onRead",
  write: "onWrite",
  delete: "onDelete"
};

// ../llm-jail/dist/src/recognizers/edit-write-read.js
import * as path from "node:path";
var TOOL_OP_MAP = {
  edit: "write",
  write: "write",
  read: "read"
};
function analyzeEditWriteRead(call) {
  const op = TOOL_OP_MAP[call.tool];
  if (!op)
    return [];
  const filePath = call.input.file_path;
  if (!filePath)
    return [];
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(call.cwd, filePath);
  return [{ op, file: absPath, source: call }];
}

// ../llm-jail/dist/src/recognizers/bash.js
import * as path2 from "node:path";
function splitCommand(command) {
  const segments = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      current += ch;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&" || ch === "|" && command[i + 1] === "|") {
      if (current.trim())
        segments.push(current.trim());
      current = "";
      i++;
      continue;
    }
    if (ch === ";" || ch === "|") {
      if (current.trim())
        segments.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim())
    segments.push(current.trim());
  return segments;
}
function extractRedirect(segment) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote)
      continue;
    if (ch === ">") {
      const isAppend = segment[i + 1] === ">";
      const afterOp = isAppend ? i + 2 : i + 1;
      const file = segment.slice(afterOp).trim();
      const command = segment.slice(0, i).trim();
      if (file)
        return { file, command };
    }
  }
  return null;
}
function parseArgv(segment) {
  const args = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (const ch of segment) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (ch === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current)
    args.push(current);
  return args;
}
var recognizers = [];
function registerRecognizer(r) {
  recognizers.push(r);
}
function analyzeBash(call) {
  const command = call.input.command;
  if (!command)
    return [];
  const segments = splitCommand(command);
  const ops = [];
  for (const segment of segments) {
    const redirect = extractRedirect(segment);
    if (redirect) {
      const absFile = path2.isAbsolute(redirect.file) ? redirect.file : path2.resolve(call.cwd, redirect.file);
      ops.push({ op: "write", file: absFile, source: call });
    }
    const argv = parseArgv(redirect ? redirect.command : segment);
    if (argv.length === 0)
      continue;
    const cmdName = path2.basename(argv[0]);
    for (const recognizer of recognizers) {
      const matches = typeof recognizer.command === "string" ? cmdName === recognizer.command : recognizer.command.test(cmdName);
      if (matches) {
        const results = recognizer.extract(argv, segment);
        for (const match of results) {
          const absFile = path2.isAbsolute(match.file) ? match.file : path2.resolve(call.cwd, match.file);
          ops.push({ op: match.op, file: absFile, source: call });
        }
        break;
      }
    }
  }
  return ops;
}

// ../llm-jail/dist/src/recognizers/sed.js
var sedRecognizer = {
  command: "sed",
  extract(argv) {
    let hasInPlace = false;
    let hasExplicitExpr = false;
    const nonFlagArgs2 = [];
    let skipNext = false;
    for (let i = 1; i < argv.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      const arg = argv[i];
      if (arg === "-i" || arg.startsWith("-i.") || arg.startsWith("-i=")) {
        hasInPlace = true;
      } else if (arg === "-e" || arg === "-f") {
        hasExplicitExpr = true;
        skipNext = true;
      } else if (arg.startsWith("-")) {
      } else {
        nonFlagArgs2.push(arg);
      }
    }
    if (!hasInPlace)
      return [];
    const files = hasExplicitExpr ? nonFlagArgs2 : nonFlagArgs2.slice(1);
    return files.map((f) => ({ op: "write", file: f }));
  }
};

// ../llm-jail/dist/src/recognizers/file-commands.js
var VALUE_FLAGS = /* @__PURE__ */ new Set(["-n", "-c"]);
function nonFlagArgs(argv, skipValueFlags = false) {
  const result = [];
  let skip = false;
  for (let i = 1; i < argv.length; i++) {
    if (skip) {
      skip = false;
      continue;
    }
    const a = argv[i];
    if (a.startsWith("-")) {
      if (skipValueFlags && VALUE_FLAGS.has(a))
        skip = true;
      continue;
    }
    result.push(a);
  }
  return result;
}
function lastNonFlagArg(argv) {
  const args = nonFlagArgs(argv);
  return args[args.length - 1];
}
var cpRecognizer = {
  command: "cp",
  extract(argv) {
    const dest = lastNonFlagArg(argv);
    return dest ? [{ op: "write", file: dest }] : [];
  }
};
var mvRecognizer = {
  command: "mv",
  extract(argv) {
    const args = nonFlagArgs(argv);
    if (args.length < 2)
      return [];
    const dest = args[args.length - 1];
    const sources = args.slice(0, -1);
    return [
      { op: "write", file: dest },
      ...sources.map((f) => ({ op: "delete", file: f }))
    ];
  }
};
var rmRecognizer = {
  command: "rm",
  extract(argv) {
    return nonFlagArgs(argv).map((f) => ({ op: "delete", file: f }));
  }
};
var teeRecognizer = {
  command: "tee",
  extract(argv) {
    return nonFlagArgs(argv).map((f) => ({ op: "write", file: f }));
  }
};
function readRecognizer(name) {
  return {
    command: name,
    extract(argv) {
      return nonFlagArgs(argv, true).map((f) => ({ op: "read", file: f }));
    }
  };
}
function metaWriteRecognizer(name) {
  return {
    command: name,
    extract(argv) {
      return nonFlagArgs(argv).map((f) => ({ op: "write", file: f }));
    }
  };
}
var fileCommandRecognizers = [
  cpRecognizer,
  mvRecognizer,
  rmRecognizer,
  teeRecognizer,
  readRecognizer("cat"),
  readRecognizer("head"),
  readRecognizer("tail"),
  readRecognizer("less"),
  metaWriteRecognizer("touch"),
  metaWriteRecognizer("truncate"),
  metaWriteRecognizer("chmod"),
  metaWriteRecognizer("chown")
];

// ../llm-jail/dist/src/recognizers/redirects.js
function noOpRecognizer(name) {
  return {
    command: name,
    extract() {
      return [];
    }
  };
}
var redirectRecognizers = [
  noOpRecognizer("echo"),
  noOpRecognizer("printf")
];

// ../llm-jail/dist/src/recognizers/interpreters.js
function extractFilesFromScript(script, patterns) {
  const matches = [];
  for (const pattern of patterns) {
    let match;
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    while ((match = re.exec(script)) !== null) {
      const file = match[1];
      if (file) {
        matches.push({ op: "write", file });
      }
    }
  }
  return matches;
}
function getInlineScript(argv) {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "-c" || argv[i] === "-e") {
      return argv[i + 1] ?? null;
    }
  }
  return null;
}
var pythonRecognizer = {
  command: /^python[23]?$/,
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script)
      return [];
    return extractFilesFromScript(script, [
      /open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"][wa]/,
      /Path\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_text/
    ]);
  }
};
var nodeRecognizer = {
  command: /^node$/,
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script)
      return [];
    return extractFilesFromScript(script, [
      /writeFileSync\s*\(\s*['"]([^'"]+)['"]/,
      /writeFile\s*\(\s*['"]([^'"]+)['"]/,
      /createWriteStream\s*\(\s*['"]([^'"]+)['"]/
    ]);
  }
};
var perlRecognizer = {
  command: "perl",
  extract(argv) {
    const hasInPlace = argv.some((a) => a === "-i" || a === "-pi" || a.startsWith("-pi"));
    if (!hasInPlace)
      return [];
    const files = [];
    let hasExplicitExpr = false;
    let pastExpression = false;
    for (const a of argv.slice(1)) {
      if (a === "-e") {
        hasExplicitExpr = true;
        break;
      }
    }
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === "-e") {
        pastExpression = true;
        i++;
        continue;
      }
      if (argv[i].startsWith("-"))
        continue;
      if (hasExplicitExpr) {
        if (pastExpression) {
          files.push({ op: "write", file: argv[i] });
        }
      } else {
        if (pastExpression) {
          files.push({ op: "write", file: argv[i] });
        } else {
          pastExpression = true;
        }
      }
    }
    return files;
  }
};
var rubyRecognizer = {
  command: "ruby",
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script)
      return [];
    return extractFilesFromScript(script, [
      /File\.write\s*\(\s*['"]([^'"]+)['"]/,
      /File\.open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]w/
    ]);
  }
};
var interpreterRecognizers = [
  pythonRecognizer,
  nodeRecognizer,
  perlRecognizer,
  rubyRecognizer
];

// ../llm-jail/dist/src/analyzer.js
var initialized = false;
function ensureInitialized() {
  if (initialized)
    return;
  initialized = true;
  registerRecognizer(sedRecognizer);
  for (const r of fileCommandRecognizers)
    registerRecognizer(r);
  for (const r of redirectRecognizers)
    registerRecognizer(r);
  for (const r of interpreterRecognizers)
    registerRecognizer(r);
}
function analyze(call) {
  ensureInitialized();
  const tool = call.tool.toLowerCase();
  if (tool === "edit" || tool === "write" || tool === "read") {
    return analyzeEditWriteRead(call);
  }
  if (tool === "bash") {
    return analyzeBash(call);
  }
  return [];
}

// ../llm-jail/dist/src/evaluate.js
async function evaluate(call, rules) {
  let advisory = null;
  for (const rule of rules) {
    if (!rule.onToolCall)
      continue;
    const verdict = await rule.onToolCall(call);
    if (verdict.action === "deny")
      return verdict;
    if (verdict.action === "warn" && !advisory)
      advisory = verdict;
  }
  const ops = analyze(call);
  if (ops.length === 0)
    return advisory ?? { action: "allow" };
  for (const op of ops) {
    for (const rule of rules) {
      if (!rule.scope(op.file))
        continue;
      const handlerKey = PRE_HANDLER_MAP[op.op];
      const handler = rule[handlerKey];
      if (!handler)
        continue;
      const verdict = await handler(op);
      if (verdict.action === "deny")
        return verdict;
      if (verdict.action === "warn" && !advisory)
        advisory = verdict;
    }
  }
  return advisory ?? { action: "allow" };
}

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
function skipUntil(str, ptr, sep3, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep3) {
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
import * as path3 from "node:path";
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
      intercept_tools: typeof hooks?.["intercept_tools"] === "boolean" ? hooks["intercept_tools"] : DEFAULT_CONFIG.hooks.intercept_tools,
      intercept_bash: typeof hooks?.["intercept_bash"] === "boolean" ? hooks["intercept_bash"] : DEFAULT_CONFIG.hooks.intercept_bash,
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
  let dir = path3.resolve(startDir);
  const root = path3.parse(dir).root;
  while (true) {
    const candidate = path3.join(dir, ".changetracks", "config.toml");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
    }
    const parent = path3.dirname(dir);
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
function isFileInScope(filePath, config, projectDir) {
  let relative3;
  if (path3.isAbsolute(filePath)) {
    relative3 = path3.relative(projectDir, filePath);
  } else {
    relative3 = filePath;
  }
  relative3 = relative3.split(path3.sep).join("/");
  const matchesInclude = (0, import_picomatch.default)(config.tracking.include);
  const matchesExclude = (0, import_picomatch.default)(config.tracking.exclude);
  return matchesInclude(relative3) && !matchesExclude(relative3);
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
    intercept_tools: true,
    intercept_bash: false,
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

// src/changetracks-rules.ts
import * as fs3 from "node:fs";
import * as fsPromises from "node:fs/promises";

// src/scope.ts
var import_picomatch2 = __toESM(require_picomatch2(), 1);
import * as path4 from "node:path";
function isFileExcludedFromHooks(filePath, config, projectDir) {
  if (config.hooks.exclude.length === 0) return false;
  let relative3;
  if (path4.isAbsolute(filePath)) {
    relative3 = path4.relative(projectDir, filePath);
  } else {
    relative3 = filePath;
  }
  relative3 = relative3.split(path4.sep).join("/");
  return (0, import_picomatch2.default)(config.hooks.exclude)(relative3);
}

// src/changetracks-rules.ts
init_dist_esm();

// src/core/redirect-formatter.ts
init_dist_esm();
function formatRedirect(input) {
  const { toolName, filePath, oldText, newText, fileContent, config } = input;
  if (toolName === "Write") {
    return formatWriteRedirect(filePath, fileContent, newText, config);
  }
  if (config.protocol.mode === "compact" && config.hashline.enabled) {
    return formatCompactRedirect(filePath, oldText, newText, fileContent);
  }
  return formatClassicRedirect(filePath, oldText, newText);
}
function formatClassicRedirect(filePath, oldText, newText) {
  const escOld = oldText.replace(/"/g, '\\"');
  const escNew = newText.replace(/"/g, '\\"');
  return `This file is tracked (strict mode). Your edit, ready to submit:

  propose_change(
    file="${filePath}",
    old_text="${escOld}",
    new_text="${escNew}",
    reason="[describe what this change achieves]"
  )`;
}
function formatCompactRedirect(filePath, oldText, newText, fileContent) {
  const lines = fileContent.split("\n");
  const lineIdx = lines.findIndex((l) => l.includes(oldText.split("\n")[0]));
  if (lineIdx === -1) {
    return `This file is tracked (strict mode, compact). Text not found in file.
Use read_tracked_file to get current content and LINE:HASH coordinates.`;
  }
  const lineNum = lineIdx + 1;
  const hash = computeLineHash(lineIdx, lines[lineIdx], lines);
  const oldLines = oldText.split("\n");
  if (oldLines.length > 1) {
    const endLineIdx = Math.min(lineIdx + oldLines.length - 1, lines.length - 1);
    const endHash = computeLineHash(endLineIdx, lines[endLineIdx], lines);
    return `This file is tracked (strict mode, compact). Your edit spans lines ${lineNum}-${endLineIdx + 1}:

  propose_change(
    file="${filePath}",
    at="${lineNum}:${hash}-${endLineIdx + 1}:${endHash}",
    op="~>${newText.replace(/"/g, '\\"')} >>describe what this change achieves"
  )

Hash range replaces the full block \u2014 no need to reproduce old text.`;
  }
  return `This file is tracked (strict mode, compact). Your edit, ready to submit:

  propose_change(
    file="${filePath}",
    at="${lineNum}:${hash}",
    op="${oldText}~>${newText} >>describe what this change achieves"
  )

The >>annotation is your reasoning \u2014 it becomes part of the change's footnote.`;
}
function formatWriteRedirect(filePath, oldContent, newContent, config) {
  if (newContent.startsWith(oldContent) && newContent.length > oldContent.length) {
    const inserted = newContent.slice(oldContent.length);
    const oldLines = oldContent.split("\n");
    const lastLine = oldLines.length;
    if (config.protocol.mode === "compact" && config.hashline.enabled) {
      const hash = computeLineHash(lastLine - 1, oldLines[lastLine - 1], oldLines);
      return `This file is tracked (strict mode, compact). Detected insertion after line ${lastLine}:

  propose_change(
    file="${filePath}",
    at="${lastLine}:${hash}",
    op="+${inserted.replace(/"/g, '\\"')} >>describe what this change achieves"
  )`;
    }
    return `This file is tracked (strict mode). Detected insertion after last line:

  propose_change(
    file="${filePath}",
    old_text="",
    new_text="${inserted.slice(0, 200).replace(/"/g, '\\"')}${inserted.length > 200 ? "..." : ""}",
    insert_after="${oldLines[lastLine - 1].slice(0, 80).replace(/"/g, '\\"')}",
    reason="[describe what this change achieves]"
  )`;
  }
  return `This file is tracked (strict mode). Your Write changes multiple sections.
Read the file to get coordinates, then submit changes as a batch:

  read_tracked_file(file="${filePath}")

  propose_change(
    file="${filePath}",
    changes=[...]
  )`;
}
function formatReadRedirect(filePath, config) {
  const view = config.policy?.default_view ?? "review";
  return `This file is tracked (strict mode). Use read_tracked_file for tracked content:

  read_tracked_file(
    file="${filePath}",
    view="${view}"
  )

This provides change metadata, hashline coordinates, and deliberation context.`;
}

// src/pending.ts
import * as fs2 from "node:fs/promises";
import * as path5 from "node:path";
function pendingPath(projectDir) {
  return path5.join(projectDir, ".changetracks", "pending.json");
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
async function appendPendingEdit(projectDir, edit) {
  const filePath = pendingPath(projectDir);
  await fs2.mkdir(path5.dirname(filePath), { recursive: true });
  const existing = await readPendingEdits(projectDir);
  existing.push(edit);
  await atomicWriteJson(filePath, existing);
}

// src/core/edit-tracker.ts
function classifyEdit(toolName, oldText, newText) {
  if (toolName === "Write") return "creation";
  if (oldText === "" && newText !== "") return "insertion";
  if (newText === "" && oldText !== "") return "deletion";
  return "substitution";
}
function shouldLogEdit(policyMode) {
  return policyMode === "safety-net";
}
async function logEdit(projectDir, sessionId, filePath, oldText, newText, toolName, contextBefore, contextAfter) {
  const editClass = classifyEdit(toolName, oldText, newText);
  const edit = {
    file: filePath,
    old_text: oldText,
    new_text: newText,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: sessionId,
    context_before: contextBefore,
    context_after: contextAfter,
    tool_name: toolName,
    edit_class: editClass
  };
  await appendPendingEdit(projectDir, edit);
}
async function logReadAudit(projectDir, sessionId, filePath) {
  const edit = {
    file: filePath,
    old_text: "",
    new_text: "",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: sessionId,
    context_before: "read_tracked_file"
  };
  await appendPendingEdit(projectDir, edit);
}

// src/changetracks-rules.ts
function buildChangeTracksRule(config, projectDir, sessionId) {
  function isInScope(file) {
    if (!isFileInScope(file, config, projectDir)) {
      if (fs3.existsSync(file)) {
        try {
          const head = fs3.readFileSync(file, "utf-8").slice(0, 500);
          const header = parseTrackingHeader(head);
          if (header?.status === "tracked") return true;
        } catch {
        }
      }
      return false;
    }
    if (fs3.existsSync(file)) {
      try {
        const head = fs3.readFileSync(file, "utf-8").slice(0, 500);
        const header = parseTrackingHeader(head);
        if (header?.status === "untracked") return false;
      } catch {
      }
    }
    if (isFileExcludedFromHooks(file, config, projectDir)) return false;
    return true;
  }
  return {
    name: "changetracks",
    scope: isInScope,
    onToolCall: (call) => {
      if (config.author.enforcement === "required") {
        const mcpWriteTools = ["propose_change", "amend_change", "review_changes", "supersede_change"];
        if (mcpWriteTools.includes(call.tool) && !call.input.author) {
          return {
            action: "deny",
            reason: 'Author is required by project policy. Add author parameter (e.g., author: "ai:claude-opus-4.6").'
          };
        }
      }
      return { action: "allow" };
    },
    onWrite: async (op) => {
      if (config.policy.creation_tracking !== "none" && !fs3.existsSync(op.file)) {
        return {
          action: "allow",
          agentHint: "New file will be created with ChangeTracks tracking header and creation footnote."
        };
      }
      if (config.policy.mode === "permissive") {
        return { action: "allow" };
      }
      if (config.policy.mode === "strict") {
        let hint;
        try {
          const fileContent = await fsPromises.readFile(op.file, "utf-8");
          if (config.hashline.enabled) {
            const { initHashline: initHashline2 } = await Promise.resolve().then(() => (init_dist_esm(), dist_esm_exports));
            await initHashline2();
          }
          const relPath = op.file.startsWith(projectDir) ? op.file.slice(projectDir.length + 1) : op.file;
          hint = formatRedirect({
            toolName: op.source.tool === "edit" ? "Edit" : "Write",
            filePath: relPath,
            oldText: op.source.input.old_string ?? "",
            newText: op.source.input.new_string ?? op.source.input.content ?? "",
            fileContent,
            config: { protocol: config.protocol, hashline: config.hashline }
          });
        } catch {
          hint = `BLOCKED: This file is tracked by ChangeTracks (policy: strict). Use propose_change instead of Edit/Write.`;
        }
        return {
          action: "deny",
          reason: hint,
          userMessage: "ChangeTracks blocked a raw edit on a tracked file."
        };
      }
      const hashlineTip = config.hashline.enabled ? "\nTip: Use read_tracked_file first for LINE:HASH coordinates." : "";
      return {
        action: "warn",
        agentHint: `This file is tracked by ChangeTracks (policy: safety-net). Edit will be auto-wrapped but reasoning is lost. Use propose_change for tracked edits with context.${hashlineTip}`
      };
    },
    onRead: (op) => {
      if (config.policy.mode === "strict") {
        const relPath = op.file.startsWith(projectDir) ? op.file.slice(projectDir.length + 1) : op.file;
        return {
          action: "deny",
          reason: formatReadRedirect(relPath, { policy: config.policy }),
          userMessage: "ChangeTracks blocked a raw read on a tracked file."
        };
      }
      return { action: "allow" };
    },
    onDelete: () => {
      if (config.policy.mode === "permissive") return { action: "allow" };
      return {
        action: "deny",
        reason: "This file is tracked by ChangeTracks. Tracked files cannot be deleted directly.",
        agentHint: "Deletion of tracked files is not supported. Use propose_change to mark content for deletion instead."
      };
    },
    afterWrite: async (op, _result) => {
      if (!shouldLogEdit(config.policy.mode)) return;
      const oldText = op.source.input.old_string ?? "";
      const newText = op.source.input.new_string ?? op.source.input.content ?? "";
      let contextBefore;
      let contextAfter;
      try {
        const fileContent = await fsPromises.readFile(op.file, "utf-8");
        if (newText) {
          const editPos = fileContent.indexOf(newText);
          if (editPos > 0) contextBefore = fileContent.slice(Math.max(0, editPos - 50), editPos);
          if (editPos >= 0) contextAfter = fileContent.slice(editPos + newText.length, editPos + newText.length + 50);
        }
      } catch {
      }
      await logEdit(projectDir, sessionId, op.file, oldText, newText, op.source.tool, contextBefore, contextAfter);
    },
    afterRead: async (op, _result) => {
      await logReadAudit(projectDir, sessionId, op.file);
    }
  };
}

// src/adapters/claude-code/pre-tool-use.ts
async function handlePreToolUse(input) {
  if (!input.tool_name || !input.cwd) return {};
  const projectDir = input.cwd;
  const sessionId = input.session_id ?? "unknown";
  const config = await loadConfig(projectDir);
  const tool = input.tool_name.toLowerCase();
  const isBuiltInTool = tool === "edit" || tool === "write" || tool === "read";
  const isBashTool = tool === "bash";
  if (isBuiltInTool && !config.hooks.intercept_tools) return {};
  if (isBashTool && !config.hooks.intercept_bash) return {};
  const toolCall = {
    tool,
    input: input.tool_input ?? {},
    cwd: projectDir
  };
  const rule = buildChangeTracksRule(config, projectDir, sessionId);
  const verdict = await evaluate(toolCall, [rule]);
  return verdictToHookResult(verdict);
}
function verdictToHookResult(verdict) {
  if (verdict.action === "deny") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: verdict.reason ?? verdict.agentHint ?? "Blocked by LLM Jail"
      }
    };
  }
  if (verdict.action === "warn" || verdict.agentHint) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: verdict.agentHint
      }
    };
  }
  return {};
}

// src/pre-tool-use.ts
async function main() {
  const input = await readStdin();
  const result = await handlePreToolUse(input);
  writeStdout(result);
}
main().catch((err) => {
  process.stderr.write(`changetracks PreToolUse hook error: ${err}
`);
  writeStdout({});
});
export {
  handlePreToolUse
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
//# sourceMappingURL=pre-tool-use.js.map
