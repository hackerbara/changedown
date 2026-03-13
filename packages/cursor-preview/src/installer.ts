import { promises as fs } from 'fs';

export const PATCH_MARKER = '/* CHANGETRACKS_LEXICAL_BRIDGE */';
const PATCH_END = '/* END_CHANGETRACKS_LEXICAL_BRIDGE */';

export async function isPatchInstalled(workbenchPath: string): Promise<boolean> {
  const content = await fs.readFile(workbenchPath, 'utf8');
  return content.includes(PATCH_MARKER);
}

export async function patchWorkbench(
  workbenchPath: string,
  bridgeScriptPath: string,
  bridgeCssPath: string,
): Promise<void> {
  let content = await fs.readFile(workbenchPath, 'utf8');
  const backupPath = workbenchPath + '.ct-backup';

  // Create backup if not already backed up
  try {
    await fs.access(backupPath);
  } catch {
    await fs.writeFile(backupPath, content);
  }

  // Remove existing patch if present
  if (content.includes(PATCH_MARKER)) {
    const startIdx = content.indexOf(PATCH_MARKER);
    const endIdx = content.indexOf(PATCH_END);
    if (startIdx >= 0 && endIdx >= 0) {
      content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_END.length);
    }
  }

  const patch = `
${PATCH_MARKER}
;(function() {
  var sc = document.createElement('script');
  sc.src = '${bridgeScriptPath.replace(/'/g, "\\'")}';
  sc.dataset.changetracks = 'lexical-bridge';
  document.head.appendChild(sc);
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '${bridgeCssPath.replace(/'/g, "\\'")}';
  link.dataset.changetracks = 'lexical-css';
  document.head.appendChild(link);
})();
${PATCH_END}`;

  content += patch;
  await fs.writeFile(workbenchPath, content);
}

export async function unpatchWorkbench(workbenchPath: string): Promise<void> {
  const backupPath = workbenchPath + '.ct-backup';
  try {
    const backup = await fs.readFile(backupPath, 'utf8');
    await fs.writeFile(workbenchPath, backup);
    await fs.unlink(backupPath);
  } catch {
    // No backup available — strip patch from content directly
    let content = await fs.readFile(workbenchPath, 'utf8');
    if (content.includes(PATCH_MARKER)) {
      const startIdx = content.indexOf(PATCH_MARKER);
      const endIdx = content.indexOf(PATCH_END);
      if (startIdx >= 0 && endIdx >= 0) {
        content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_END.length);
        await fs.writeFile(workbenchPath, content);
      }
    }
  }
}
