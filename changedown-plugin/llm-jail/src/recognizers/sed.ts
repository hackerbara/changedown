import type { Recognizer, RecognizerMatch } from '../types.js';

export const sedRecognizer: Recognizer = {
  command: 'sed',
  extract(argv: string[]): RecognizerMatch[] {
    let hasInPlace = false;
    let hasExplicitExpr = false;
    const nonFlagArgs: string[] = [];
    let skipNext = false;

    for (let i = 1; i < argv.length; i++) {
      if (skipNext) { skipNext = false; continue; }
      const arg = argv[i];
      if (arg === '-i' || arg.startsWith('-i.') || arg.startsWith('-i=')) {
        hasInPlace = true;
      } else if (arg === '-e' || arg === '-f') {
        hasExplicitExpr = true;
        skipNext = true;
      } else if (arg.startsWith('-')) {
        // other flags, skip
      } else {
        nonFlagArgs.push(arg);
      }
    }

    if (!hasInPlace) return [];
    // When -e/-f is used, expression is consumed by the flag; all nonFlagArgs are files.
    // Otherwise, the first nonFlagArg is the expression.
    const files = hasExplicitExpr ? nonFlagArgs : nonFlagArgs.slice(1);
    return files.map(f => ({ op: 'write' as const, file: f }));
  },
};
