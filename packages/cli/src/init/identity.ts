import { execSync } from 'child_process';
import * as os from 'os';

/**
 * Resolve the user's author identity from available sources.
 * Resolution order: git config user.name → system username → 'unknown'
 */
export function resolveIdentity(cwd?: string): string {
  // 1. Git config
  try {
    const gitName = execSync('git config user.name', {
      encoding: 'utf8',
      timeout: 3000,
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (gitName) return gitName;
  } catch {
    // git not available or no user.name set
  }

  // 2. System username
  try {
    const username = os.userInfo().username;
    if (username) return username;
  } catch {
    // userInfo can throw on some systems
  }

  // 3. Environment variables
  const envUser = process.env.USER || process.env.USERNAME || '';
  if (envUser) return envUser;

  // 4. Last resort
  return 'unknown';
}
