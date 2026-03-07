#!/usr/bin/env node
// PROBE 3: afterFileEdit — what context does Cursor provide after edits?
//
// Key questions:
// - Does it include file path?
// - Does it include old/new content or just the diff?
// - Does it include session_id?
// - What other fields are available?

const LOG_FILE = '/tmp/sc-probe-after-file-edit.jsonl';

const fs = require('fs');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const timestamp = new Date().toISOString();
  const parsed = safeParseJSON(input);

  const logEntry = { timestamp, event: 'afterFileEdit', input: parsed };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  // afterFileEdit is post-hoc — no blocking possible, just observe
  process.stdout.write('{}');
});

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}
