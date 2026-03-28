#!/usr/bin/env node
// PROBE 1 — Phase 2: Can beforeReadFile BLOCK reads on tracked .md files?
//
// Only blocks .md files in the workspace. Passes through everything else
// (Cursor internal reads, MCP tool schemas, non-md files).
//
// Test: Open this project in Cursor, ask the agent to read a tracked .md file.
// Expected: agent sees the deny message instead of the file content.
// Check: cat /tmp/sc-probe-before-read-file.jsonl | grep '"blocked"'

const LOG_FILE = '/tmp/sc-probe-before-read-file.jsonl';
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const timestamp = new Date().toISOString();
  const parsed = safeParseJSON(input);

  const filePath = parsed?.file_path || '';
  const workspaceRoots = parsed?.workspace_roots || [];

  // Determine if this is a tracked .md file we should try blocking
  const shouldBlock = isTrackedMarkdown(filePath, workspaceRoots);

  const logEntry = {
    timestamp,
    event: 'beforeReadFile',
    file_path: filePath,
    should_block: shouldBlock,
    blocked: shouldBlock,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  if (shouldBlock) {
    // Try blocking — test all plausible response formats
    const response = {
      continue: false,
      permission: 'deny',
      userMessage: '[SC PROBE] Blocked read of tracked file: ' + path.basename(filePath),
      agentMessage: 'BLOCKED: This file is tracked by ChangeDown. Use the read_tracked_file MCP tool instead of reading the file directly. Example: read_tracked_file(file="' + filePath + '")'
    };
    process.stdout.write(JSON.stringify(response));
  } else {
    // Pass through — not a tracked file
    process.stdout.write('{}');
  }
});

function isTrackedMarkdown(filePath, workspaceRoots) {
  if (!filePath) return false;

  // Must be a .md file
  if (!filePath.endsWith('.md')) return false;

  // Must be inside a workspace root (not Cursor internals)
  const inWorkspace = workspaceRoots.some(root => filePath.startsWith(root));
  if (!inWorkspace) return false;

  // Skip .cursor/ internal files
  if (filePath.includes('/.cursor/')) return false;

  // Skip node_modules
  if (filePath.includes('/node_modules/')) return false;

  return true;
}

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}
