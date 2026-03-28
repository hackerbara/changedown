#!/usr/bin/env node
// PROBE 5: beforeShellExecution — what does Cursor send for shell commands?
//
// This is the closest equivalent to Claude Code's PreToolUse for Edit/Write.
// Key question: does Cursor route Edit/Write through this hook, or only
// actual terminal commands? If Edit/Write doesn't trigger this, then
// afterFileEdit is our only interception point.

const LOG_FILE = '/tmp/sc-probe-before-shell-execution.jsonl';

const fs = require('fs');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const timestamp = new Date().toISOString();
  const parsed = safeParseJSON(input);

  const logEntry = { timestamp, event: 'beforeShellExecution', input: parsed };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  // Pass through — just observe
  process.stdout.write('{}');
});

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}
