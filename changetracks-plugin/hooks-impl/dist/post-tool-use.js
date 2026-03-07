#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// ../../packages/cli/node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "../../packages/cli/node_modules/picomatch/lib/constants.js"(exports, module) {
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

// ../../packages/cli/node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "../../packages/cli/node_modules/picomatch/lib/utils.js"(exports) {
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
    exports.basename = (path4, { windows } = {}) => {
      const segs = path4.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// ../../packages/cli/node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "../../packages/cli/node_modules/picomatch/lib/scan.js"(exports, module) {
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

// ../../packages/cli/node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "../../packages/cli/node_modules/picomatch/lib/parse.js"(exports, module) {
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

// ../../packages/cli/node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "../../packages/cli/node_modules/picomatch/lib/picomatch.js"(exports, module) {
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

// ../../packages/cli/node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "../../packages/cli/node_modules/picomatch/index.js"(exports, module) {
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

// node_modules/picomatch/lib/constants.js
var require_constants2 = __commonJS({
  "node_modules/picomatch/lib/constants.js"(exports, module) {
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

// node_modules/picomatch/lib/utils.js
var require_utils2 = __commonJS({
  "node_modules/picomatch/lib/utils.js"(exports) {
    "use strict";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants2();
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
    exports.basename = (path4, { windows } = {}) => {
      const segs = path4.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// node_modules/picomatch/lib/scan.js
var require_scan2 = __commonJS({
  "node_modules/picomatch/lib/scan.js"(exports, module) {
    "use strict";
    var utils = require_utils2();
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
    } = require_constants2();
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

// node_modules/picomatch/lib/parse.js
var require_parse2 = __commonJS({
  "node_modules/picomatch/lib/parse.js"(exports, module) {
    "use strict";
    var constants = require_constants2();
    var utils = require_utils2();
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

// node_modules/picomatch/lib/picomatch.js
var require_picomatch3 = __commonJS({
  "node_modules/picomatch/lib/picomatch.js"(exports, module) {
    "use strict";
    var scan = require_scan2();
    var parse3 = require_parse2();
    var utils = require_utils2();
    var constants = require_constants2();
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

// node_modules/picomatch/index.js
var require_picomatch4 = __commonJS({
  "node_modules/picomatch/index.js"(exports, module) {
    "use strict";
    var pico = require_picomatch3();
    var utils = require_utils2();
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

// src/adapters/claude-code/post-tool-use.ts
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
CriticMarkupParser.RESOLVED_RE = /^resolved\s+(@\S+)\s+(\S+)(?::\s*(.*))?$/;
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
function isFileInScope(filePath, config, projectDir) {
  let relative3;
  if (path.isAbsolute(filePath)) {
    relative3 = path.relative(projectDir, filePath);
  } else {
    relative3 = filePath;
  }
  relative3 = relative3.split(path.sep).join("/");
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

// src/scope.ts
var import_picomatch2 = __toESM(require_picomatch4(), 1);
import * as path2 from "node:path";
function isFileExcludedFromHooks(filePath, config, projectDir) {
  if (config.hooks.exclude.length === 0) return false;
  let relative3;
  if (path2.isAbsolute(filePath)) {
    relative3 = path2.relative(projectDir, filePath);
  } else {
    relative3 = filePath;
  }
  relative3 = relative3.split(path2.sep).join("/");
  return (0, import_picomatch2.default)(config.hooks.exclude)(relative3);
}

// src/pending.ts
import * as fs2 from "node:fs/promises";
import * as path3 from "node:path";
function pendingPath(projectDir) {
  return path3.join(projectDir, ".changetracks", "pending.json");
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
  await fs2.mkdir(path3.dirname(filePath), { recursive: true });
  const existing = await readPendingEdits(projectDir);
  existing.push(edit);
  await fs2.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");
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

// src/adapters/claude-code/post-tool-use.ts
async function handlePostToolUse(input) {
  const { tool_name, tool_input, session_id, cwd } = input;
  if (!cwd || !tool_input) {
    return { logged: false };
  }
  const projectDir = cwd;
  if (tool_name === "read_tracked_file") {
    const filePath2 = tool_input.file ?? "";
    if (!filePath2) {
      return { logged: false };
    }
    await logReadAudit(projectDir, session_id ?? "unknown", filePath2);
    return { logged: true };
  }
  if (tool_name === "Read") {
    const filePath2 = tool_input.file_path ?? "";
    if (!filePath2) {
      return { logged: false };
    }
    const config2 = await loadConfig(projectDir);
    if (!isFileInScope(filePath2, config2, projectDir)) {
      return { logged: false };
    }
    if (isFileExcludedFromHooks(filePath2, config2, projectDir)) {
      return { logged: false };
    }
    await logReadAudit(projectDir, session_id ?? "unknown", filePath2);
    return { logged: true };
  }
  if (tool_name !== "Edit" && tool_name !== "Write") {
    return { logged: false };
  }
  const filePath = tool_input.file_path ?? "";
  if (!filePath) {
    return { logged: false };
  }
  const config = await loadConfig(projectDir);
  if (!isFileInScope(filePath, config, projectDir)) {
    return { logged: false };
  }
  if (isFileExcludedFromHooks(filePath, config, projectDir)) {
    return { logged: false };
  }
  let creationWrapped = false;
  if (tool_name === "Write" && config.policy.creation_tracking !== "none") {
    try {
      const content = await fs3.readFile(filePath, "utf-8");
      const TRACKING_HEADER = "<!-- ctrcks.com/v1: tracked -->";
      if (!content.startsWith(TRACKING_HEADER)) {
        const author = process.env.CHANGETRACKS_AUTHOR ?? (config.author.default || "unknown");
        const ts = nowTimestamp();
        const date = ts.date;
        let wrapped = TRACKING_HEADER + "\n" + content;
        const footnote = `

[^ct-1]: ${author} | ${date} | creation | proposed
    ${author} ${ts.raw}: File created`;
        wrapped += footnote;
        await fs3.writeFile(filePath, wrapped, "utf-8");
        creationWrapped = true;
      }
    } catch {
    }
  }
  const oldText = tool_input.old_string ?? "";
  const newText = tool_input.new_string ?? tool_input.content ?? "";
  if (!shouldLogEdit(config.policy.mode)) {
    return { logged: creationWrapped };
  }
  let contextBefore;
  let contextAfter;
  try {
    const fileContent = await fs3.readFile(filePath, "utf-8");
    if (newText) {
      const editPos = fileContent.indexOf(newText);
      if (editPos > 0) {
        contextBefore = fileContent.slice(Math.max(0, editPos - 50), editPos);
      }
      if (editPos >= 0) {
        contextAfter = fileContent.slice(
          editPos + newText.length,
          editPos + newText.length + 50
        );
      }
    }
  } catch {
  }
  await logEdit(
    projectDir,
    session_id ?? "unknown",
    filePath,
    oldText,
    newText,
    tool_name,
    contextBefore,
    contextAfter
  );
  return { logged: true };
}

// src/post-tool-use.ts
async function main() {
  const input = await readStdin();
  await handlePostToolUse(input);
  writeStdout({});
}
main().catch((err) => {
  process.stderr.write(`changetracks PostToolUse hook error: ${err}
`);
  writeStdout({});
});
export {
  handlePostToolUse
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
//# sourceMappingURL=post-tool-use.js.map
