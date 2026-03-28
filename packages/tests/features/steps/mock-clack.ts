import type { ClackAdapter } from 'changedown/init/runner';

const CANCEL = Symbol('cancel');

export type PromptHandler = (prompt: {
  type: 'text' | 'select' | 'confirm';
  message: string;
  options?: Array<{ value: any; label: string; hint?: string }>;
  initialValue?: any;
}) => string | boolean | symbol;

/**
 * Callback-based mock of ClackAdapter for Gherkin tests.
 * Delegates prompt answers to a handler function and records
 * every interaction for assertion.
 */
export class MockClack implements ClackAdapter {
  private handler: PromptHandler;

  /** Every prompt shown, with the response returned. */
  readonly prompts: Array<{
    type: 'text' | 'select' | 'confirm';
    message: string;
    response: string | boolean | symbol;
  }> = [];

  /** All log calls: { level: 'info'|'success'|'warn', text }. */
  readonly logs: Array<{ level: string; text: string }> = [];

  /** All intro() texts. */
  readonly intros: string[] = [];

  /** All outro() texts. */
  readonly outros: string[] = [];

  /** All note() calls. */
  readonly notes: Array<{ text: string; title?: string }> = [];

  /** All cancel() texts. */
  readonly cancels: string[] = [];

  constructor(handler: PromptHandler) {
    this.handler = handler;
  }

  intro(text: string): void {
    this.intros.push(text);
  }

  outro(text: string): void {
    this.outros.push(text);
  }

  cancel(text: string): void {
    this.cancels.push(text);
  }

  async text(opts: {
    message: string;
    initialValue?: string;
    placeholder?: string;
  }): Promise<string | symbol> {
    const response = this.handler({
      type: 'text',
      message: opts.message,
      initialValue: opts.initialValue,
    });
    this.prompts.push({ type: 'text', message: opts.message, response });
    return response;
  }

  async select<T>(opts: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
    initialValue?: T;
  }): Promise<T | symbol> {
    const response = this.handler({
      type: 'select',
      message: opts.message,
      options: opts.options,
      initialValue: opts.initialValue,
    });
    this.prompts.push({ type: 'select', message: opts.message, response });
    return response as T | symbol;
  }

  async confirm(opts: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol> {
    const response = this.handler({
      type: 'confirm',
      message: opts.message,
      initialValue: opts.initialValue,
    });
    this.prompts.push({ type: 'confirm', message: opts.message, response });
    return response as boolean | symbol;
  }

  log = {
    info: (text: string): void => {
      this.logs.push({ level: 'info', text });
    },
    success: (text: string): void => {
      this.logs.push({ level: 'success', text });
    },
    warn: (text: string): void => {
      this.logs.push({ level: 'warn', text });
    },
  };

  note(text: string, title?: string): void {
    this.notes.push({ text, title });
  }

  isCancel(value: unknown): value is symbol {
    return typeof value === 'symbol';
  }

  // --- Helpers for assertions ---

  /** Check if a prompt containing `substr` was shown. */
  hasPrompt(substr: string): boolean {
    return this.prompts.some((p) => p.message.includes(substr));
  }

  /** Check if any log (any level) contains `substr`. */
  hasLog(substr: string): boolean {
    return this.logs.some((l) => l.text.includes(substr));
  }

  /** Check if a note with title containing `substr` was shown. */
  hasNote(substr: string): boolean {
    return this.notes.some(
      (n) => (n.title?.includes(substr) || n.text.includes(substr)),
    );
  }

  /** The CANCEL symbol for building response maps. */
  static readonly CANCEL = CANCEL;
}

/**
 * Build a PromptHandler from a response map.
 * Keys are message substrings. Values are the response to return.
 * Unmatched prompts return initialValue (safe default).
 */
export function responseMapHandler(
  responses: Map<string, string | boolean | symbol>,
): PromptHandler {
  return (prompt) => {
    for (const [key, value] of responses) {
      if (prompt.message.includes(key)) {
        return value;
      }
    }
    // Safe default: return initialValue if no match
    if (prompt.initialValue !== undefined) {
      return prompt.initialValue as string | boolean;
    }
    // Last resort: return empty string for text, false for confirm
    return prompt.type === 'confirm' ? false : '';
  };
}
