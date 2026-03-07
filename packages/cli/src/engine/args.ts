/**
 * MCP tool argument helpers.
 * Accept both snake_case (schema) and camelCase (some clients) so agents
 * don't get "empty" or "missing" errors when the wrong case is sent.
 */

/**
 * Read a string argument accepting snake_case or camelCase keys.
 * Returns default string when both are missing or null/undefined.
 */
export function strArg(
  args: Record<string, unknown>,
  snake: string,
  camel: string,
  defaultValue = ''
): string {
  const v = (args[snake] ?? args[camel]) as string | undefined | null;
  return v ?? defaultValue;
}

/**
 * Read an optional string argument accepting snake_case or camelCase keys.
 * Returns undefined when both are missing or null; otherwise returns String(value).
 */
export function optionalStrArg(
  args: Record<string, unknown>,
  snake: string,
  camel: string
): string | undefined {
  const v = args[snake] ?? args[camel];
  if (v === undefined || v === null) return undefined;
  return String(v);
}
