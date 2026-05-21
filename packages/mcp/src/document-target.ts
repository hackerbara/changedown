import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type NormalizedDocumentTarget = {
  uri: string;
  filePath?: string;
};

export function normalizeDocumentTarget(input: string, baseDir: string): NormalizedDocumentTarget {
  if (input.startsWith('word://')) {
    return { uri: input };
  }

  if (input.startsWith('file://')) {
    const filePath = fileURLToPath(input);
    return {
      uri: pathToFileURL(filePath).href,
      filePath,
    };
  }

  const filePath = path.isAbsolute(input)
    ? input
    : path.resolve(baseDir, input);

  return {
    uri: pathToFileURL(filePath).href,
    filePath,
  };
}
