import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AgentStatus {
  name: string;
  detected: boolean;
  configured: boolean;
}

/**
 * Detect which AI coding agents are installed on this machine.
 */
export function detectAgents(): AgentStatus[] {
  const agents: AgentStatus[] = [];

  // Claude Code
  const claudeDetected = commandExists('claude');
  agents.push({
    name: 'claude',
    detected: claudeDetected,
    configured: claudeDetected && hasClaudePlugin(),
  });

  // Cursor
  const cursorDetected = commandExists('cursor');
  agents.push({
    name: 'cursor',
    detected: cursorDetected,
    configured: false,
  });

  // OpenCode
  const opencodeDetected = commandExists('opencode');
  agents.push({
    name: 'opencode',
    detected: opencodeDetected,
    configured: false,
  });

  return agents;
}

/**
 * Configure detected agents for the given project directory.
 * Writes configuration files where possible and returns a summary of actions taken.
 */
export async function configureAgents(
  projectDir: string,
  agents: AgentStatus[],
): Promise<string[]> {
  const results: string[] = [];

  for (const agent of agents) {
    if (!agent.detected) continue;

    if (agent.name === 'claude') {
      // Register the marketplace in ~/.claude/settings.json
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const mergePayload = {
        extraKnownMarketplaces: {
          'changedown': {
            source: { source: 'github', repo: 'hackerbara/changedown' },
          },
        },
        enabledPlugins: { 'changedown@changedown': true },
      };
      try {
        mergeJsonFile(settingsPath, mergePayload);
        results.push('Claude Code: marketplace registered in ~/.claude/settings.json — run /plugin install changedown in your next session');
      } catch {
        results.push('Claude Code: run /plugin marketplace add hackerbara/changedown in your next session');
      }
    }

    if (agent.name === 'cursor') {
      results.push('Cursor: install the ChangeDown extension (.vsix) and enable MCP in Settings → Features → MCP');
    }

    if (agent.name === 'opencode') {
      results.push('OpenCode: add @changedown/opencode-plugin to your opencode.json');
    }
  }

  return results;
}

function commandExists(cmd: string): boolean {
  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whereCmd} ${JSON.stringify(cmd)}`, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasClaudePlugin(): boolean {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) return false;
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const plugins = settings.plugins || [];
    return plugins.some((p: string) => p.includes('changedown'));
  } catch {
    return false;
  }
}

/** Deep-merge an object into a JSON file, creating the file if it doesn't exist. */
function mergeJsonFile(filePath: string, mergeObj: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { /* start fresh */ }
  }
  const merged = deepMerge(existing, mergeObj);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv && typeof sv === 'object' && !Array.isArray(sv) &&
      tv && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}
