import type { Recognizer } from '../types.js';

function noOpRecognizer(name: string): Recognizer {
  return {
    command: name,
    extract() { return []; },
  };
}

export const redirectRecognizers: Recognizer[] = [
  noOpRecognizer('echo'),
  noOpRecognizer('printf'),
];
