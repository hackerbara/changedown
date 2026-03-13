#!/usr/bin/env node
/**
 * Patches Cursor's workbench.desktop.main.js to inline the ChangeTracks
 * lexical bridge script and CSS. Run with: node install.mjs [--uninstall]
 *
 * Requires Cursor to be closed. Restart Cursor after patching.
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PATCH_MARKER = '/* CHANGETRACKS_LEXICAL_BRIDGE */';
const PATCH_END = '/* END_CHANGETRACKS_LEXICAL_BRIDGE */';

const WORKBENCH_PATH = '/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

async function install() {
  // Read the bridge JS bundle and CSS
  const bridgeJs = await fs.readFile(join(__dirname, 'dist', 'lexical-bridge.js'), 'utf8');
  const bridgeCss = await fs.readFile(join(__dirname, 'css', 'lexical.css'), 'utf8');

  let content = await fs.readFile(WORKBENCH_PATH, 'utf8');

  // Backup
  const backupPath = WORKBENCH_PATH + '.sc-backup';
  try {
    await fs.access(backupPath);
    console.log('Backup already exists at', backupPath);
  } catch {
    await fs.writeFile(backupPath, content);
    console.log('Created backup at', backupPath);
  }

  // Remove existing patch if present
  if (content.includes(PATCH_MARKER)) {
    const startIdx = content.indexOf(PATCH_MARKER);
    const endIdx = content.indexOf(PATCH_END);
    if (startIdx >= 0 && endIdx >= 0) {
      content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_END.length);
      console.log('Removed existing patch');
    }
  }

  // Inline the JS and CSS directly into the workbench
  const patch = `
${PATCH_MARKER}
;(function() {
  /* Inject CSS */
  var style = document.createElement('style');
  style.dataset.changetracks = 'lexical-css';
  style.textContent = ${JSON.stringify(bridgeCss)};
  document.head.appendChild(style);

  /* Inject bridge script */
  var script = document.createElement('script');
  script.dataset.changetracks = 'lexical-bridge';
  script.textContent = ${JSON.stringify(bridgeJs)};
  document.head.appendChild(script);
})();
${PATCH_END}`;

  content += patch;
  await fs.writeFile(WORKBENCH_PATH, content);
  console.log('Patched workbench successfully!');
  console.log('Restart Cursor to see changes.');
}

async function uninstall() {
  const backupPath = WORKBENCH_PATH + '.sc-backup';
  try {
    const backup = await fs.readFile(backupPath, 'utf8');
    await fs.writeFile(WORKBENCH_PATH, backup);
    await fs.unlink(backupPath);
    console.log('Restored from backup. Restart Cursor.');
  } catch {
    let content = await fs.readFile(WORKBENCH_PATH, 'utf8');
    if (content.includes(PATCH_MARKER)) {
      const startIdx = content.indexOf(PATCH_MARKER);
      const endIdx = content.indexOf(PATCH_END);
      if (startIdx >= 0 && endIdx >= 0) {
        content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_END.length);
        await fs.writeFile(WORKBENCH_PATH, content);
        console.log('Stripped patch from workbench. Restart Cursor.');
      }
    } else {
      console.log('No patch found — workbench is clean.');
    }
  }
}

const arg = process.argv[2];
if (arg === '--uninstall' || arg === '-u') {
  await uninstall();
} else {
  await install();
}
