#!/usr/bin/env node
// PROBE 4: stop — what does Cursor send when the agent stops?
//
// Key questions:
// - Is session_id present?
// - What other context is available (conversation_id, generation_id)?
// - Does it support systemMessage in the response (like Claude Code)?

const LOG_FILE = '/tmp/sc-probe-stop.jsonl';

const fs = require('fs');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const timestamp = new Date().toISOString();
  const parsed = safeParseJSON(input);

  const logEntry = { timestamp, event: 'stop', input: parsed };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  // Try returning a systemMessage to see if Cursor displays it
  process.stdout.write(JSON.stringify({
    systemMessage: '[SC PROBE] Stop hook fired successfully. Session data logged.'
  }));
});

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}
