import * as fs from 'fs';
import * as path from 'path';

const GITIGNORE_ENTRIES = [
  '',
  '# ChangeDown transient state',
  '.changedown/pending.json',
];

export interface GitignoreResult {
  action: 'appended' | 'created' | 'skipped';
  path: string;
}

/**
 * Append ChangeDown entries to an existing .gitignore.
 * Returns 'appended' if entries were added, 'skipped' if already present.
 */
export function ensureGitignoreEntries(projectDir: string): GitignoreResult {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  if (existing.includes('.changedown/pending.json')) {
    return { action: 'skipped', path: gitignorePath };
  }

  const newContent = existing.trimEnd() + '\n' + GITIGNORE_ENTRIES.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, newContent, 'utf8');
  return { action: 'appended', path: gitignorePath };
}

/**
 * Create a new .gitignore with ChangeDown entries.
 */
export function createGitignore(projectDir: string): GitignoreResult {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const content = GITIGNORE_ENTRIES.slice(1).join('\n') + '\n'; // skip leading blank line
  fs.writeFileSync(gitignorePath, content, 'utf8');
  return { action: 'created', path: gitignorePath };
}

/**
 * Check whether a .gitignore exists in the project directory.
 */
export function hasGitignore(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, '.gitignore'));
}
