/**
 * Standard MCP tool result shape used by all tool handlers.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Creates a standard error result for MCP tool handlers.
 * Use this for simple error messages. Tool handlers with structured error
 * codes (propose-change, get-change, propose-batch) define their own
 * specialized errorResult functions.
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
