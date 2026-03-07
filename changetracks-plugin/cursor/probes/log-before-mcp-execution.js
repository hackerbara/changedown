#!/usr/bin/env node
// PROBE 2: beforeMCPExecution — what does Cursor send for MCP calls?
//
// Logs all MCP tool call details: server name, tool name, inputs.
// Also tests deny on a specific tool (set DENY_TOOL to test blocking).

const DENY_TOOL = ''; // e.g. 'propose_change' to test blocking that specific tool
const LOG_FILE = '/tmp/sc-probe-before-mcp-execution.jsonl';

const fs = require('fs');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const timestamp = new Date().toISOString();
  const parsed = safeParseJSON(input);

  const logEntry = { timestamp, event: 'beforeMCPExecution', input: parsed, deny_tool: DENY_TOOL || null };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  // If DENY_TOOL is set and matches, try blocking
  const toolName = parsed?.tool_name || parsed?.toolName || '';
  if (DENY_TOOL && toolName === DENY_TOOL) {
    process.stdout.write(JSON.stringify({
      continue: false,
      permission: 'deny',
      userMessage: `[SC PROBE] Blocked MCP tool: ${toolName}`,
      agentMessage: `MCP tool ${toolName} was blocked by ChangeTracks probe.`
    }));
  } else {
    process.stdout.write('{}');
  }
});

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}
