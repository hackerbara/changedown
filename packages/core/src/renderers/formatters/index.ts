import { formatPlainText } from './plain-text.js';
import { formatAnsi, type AnsiFormatOptions } from './ansi.js';
import type { ThreeZoneDocument } from '../three-zone-types.js';

export { formatPlainText } from './plain-text.js';
export { formatAnsi, type AnsiFormatOptions } from './ansi.js';

export interface ThreeZoneFormatOptions {
  /** Explicit color override. If undefined, uses isTTY. */
  color?: boolean;
  /** Auto-detected from stdout. */
  isTTY?: boolean;
  /** When true, show CriticMarkup delimiters in ANSI output. */
  showMarkup?: boolean;
  /** Use Unicode combining stroke instead of ANSI \x1b[9m. */
  useUnicodeStrikethrough?: boolean;
}

export function formatDocument(doc: ThreeZoneDocument, options?: ThreeZoneFormatOptions): string {
  const useAnsi = options?.color ?? options?.isTTY ?? false;
  if (useAnsi) {
    return formatAnsi(doc, {
      showMarkup: options?.showMarkup ?? false,
      useUnicodeStrikethrough: options?.useUnicodeStrikethrough ?? false,
    });
  }
  return formatPlainText(doc);
}
