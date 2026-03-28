import type { Recognizer } from '../types.js';

/** Flags whose next argv element is a value, not a file operand. */
const VALUE_FLAGS = new Set(['-n', '-c']);

function nonFlagArgs(argv: string[], skipValueFlags = false): string[] {
  const result: string[] = [];
  let skip = false;
  for (let i = 1; i < argv.length; i++) {
    if (skip) { skip = false; continue; }
    const a = argv[i];
    if (a.startsWith('-')) {
      if (skipValueFlags && VALUE_FLAGS.has(a)) skip = true;
      continue;
    }
    result.push(a);
  }
  return result;
}

function lastNonFlagArg(argv: string[]): string | undefined {
  const args = nonFlagArgs(argv);
  return args[args.length - 1];
}

const cpRecognizer: Recognizer = {
  command: 'cp',
  extract(argv) {
    const dest = lastNonFlagArg(argv);
    return dest ? [{ op: 'write', file: dest }] : [];
  },
};

const mvRecognizer: Recognizer = {
  command: 'mv',
  extract(argv) {
    const args = nonFlagArgs(argv);
    if (args.length < 2) return [];
    const dest = args[args.length - 1];
    const sources = args.slice(0, -1);
    return [
      { op: 'write' as const, file: dest },
      ...sources.map(f => ({ op: 'delete' as const, file: f })),
    ];
  },
};

const rmRecognizer: Recognizer = {
  command: 'rm',
  extract(argv) {
    return nonFlagArgs(argv).map(f => ({ op: 'delete' as const, file: f }));
  },
};

const teeRecognizer: Recognizer = {
  command: 'tee',
  extract(argv) {
    return nonFlagArgs(argv).map(f => ({ op: 'write' as const, file: f }));
  },
};

function readRecognizer(name: string): Recognizer {
  return {
    command: name,
    extract(argv) {
      return nonFlagArgs(argv, true).map(f => ({ op: 'read' as const, file: f }));
    },
  };
}

function metaWriteRecognizer(name: string): Recognizer {
  return {
    command: name,
    extract(argv) {
      return nonFlagArgs(argv).map(f => ({ op: 'write' as const, file: f }));
    },
  };
}

export const fileCommandRecognizers: Recognizer[] = [
  cpRecognizer,
  mvRecognizer,
  rmRecognizer,
  teeRecognizer,
  readRecognizer('cat'),
  readRecognizer('head'),
  readRecognizer('tail'),
  readRecognizer('less'),
  metaWriteRecognizer('touch'),
  metaWriteRecognizer('truncate'),
  metaWriteRecognizer('chmod'),
  metaWriteRecognizer('chown'),
];
