import type { Recognizer, RecognizerMatch } from '../types.js';

function extractFilesFromScript(
  script: string,
  patterns: RegExp[],
): RecognizerMatch[] {
  const matches: RecognizerMatch[] = [];
  for (const pattern of patterns) {
    let match;
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    while ((match = re.exec(script)) !== null) {
      const file = match[1];
      if (file) {
        matches.push({ op: 'write', file });
      }
    }
  }
  return matches;
}

function getInlineScript(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '-c' || argv[i] === '-e') {
      return argv[i + 1] ?? null;
    }
  }
  return null;
}

const pythonRecognizer: Recognizer = {
  command: /^python[23]?$/,
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script) return [];
    return extractFilesFromScript(script, [
      /open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"][wa]/,
      /Path\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_text/,
    ]);
  },
};

const nodeRecognizer: Recognizer = {
  command: /^node$/,
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script) return [];
    return extractFilesFromScript(script, [
      /writeFileSync\s*\(\s*['"]([^'"]+)['"]/,
      /writeFile\s*\(\s*['"]([^'"]+)['"]/,
      /createWriteStream\s*\(\s*['"]([^'"]+)['"]/,
    ]);
  },
};

const perlRecognizer: Recognizer = {
  command: 'perl',
  extract(argv) {
    const hasInPlace = argv.some(a => a === '-i' || a === '-pi' || a.startsWith('-pi'));
    if (!hasInPlace) return [];

    const files: RecognizerMatch[] = [];
    let hasExplicitExpr = false;
    let pastExpression = false;
    // First pass: check for -e flag
    for (const a of argv.slice(1)) {
      if (a === '-e') { hasExplicitExpr = true; break; }
    }
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-e') { pastExpression = true; i++; continue; }
      if (argv[i].startsWith('-')) continue;
      if (hasExplicitExpr) {
        // With -e, all non-flag args after expression are files
        if (pastExpression) {
          files.push({ op: 'write', file: argv[i] });
        }
      } else {
        // Without -e, first non-flag arg is expression, rest are files
        if (pastExpression) {
          files.push({ op: 'write', file: argv[i] });
        } else {
          pastExpression = true; // skip expression
        }
      }
    }
    return files;
  },
};

const rubyRecognizer: Recognizer = {
  command: 'ruby',
  extract(argv) {
    const script = getInlineScript(argv);
    if (!script) return [];
    return extractFilesFromScript(script, [
      /File\.write\s*\(\s*['"]([^'"]+)['"]/,
      /File\.open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]w/,
    ]);
  },
};

export const interpreterRecognizers: Recognizer[] = [
  pythonRecognizer,
  nodeRecognizer,
  perlRecognizer,
  rubyRecognizer,
];
