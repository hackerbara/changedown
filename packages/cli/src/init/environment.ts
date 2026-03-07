import { execSync } from 'child_process';

export type EnvironmentType = 'vscode' | 'terminal-agent' | 'terminal-plain' | 'ci';

export interface EnvironmentInfo {
  type: EnvironmentType;
  detectedAgents: string[];
  isInteractive: boolean;
}

export interface DetectEnvironmentOptions {
  /** Override TTY detection (defaults to process.stdout.isTTY) */
  isTTY?: boolean;
  /** Override environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Override command existence checker (defaults to which/where lookup) */
  commandChecker?: (cmd: string) => boolean;
}

/**
 * Detect the runtime environment to adapt init output.
 *
 * Detection order:
 * 1. Non-interactive (CI, piped output) — stdout is not a TTY
 * 2. VS Code / Cursor integrated terminal — VSCODE_PID or TERM_PROGRAM=vscode
 * 3. Terminal with agent CLIs — claude, cursor, or opencode on PATH
 * 4. Plain terminal — no agents detected
 */
export function detectEnvironment(options?: DetectEnvironmentOptions): EnvironmentInfo {
  const isTTY = options?.isTTY ?? !!process.stdout.isTTY;
  const env = options?.env ?? process.env;
  const checkCommand = options?.commandChecker ?? commandExists;

  // Non-interactive detection (CI, piped output)
  if (!isTTY) {
    return { type: 'ci', detectedAgents: [], isInteractive: false };
  }

  // VS Code / Cursor integrated terminal
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') {
    const agents = detectAgentCommands(checkCommand);
    return { type: 'vscode', detectedAgents: agents, isInteractive: true };
  }

  // Plain terminal — check for agent CLIs
  const agents = detectAgentCommands(checkCommand);
  if (agents.length > 0) {
    return { type: 'terminal-agent', detectedAgents: agents, isInteractive: true };
  }

  return { type: 'terminal-plain', detectedAgents: [], isInteractive: true };
}

function detectAgentCommands(checkCommand: (cmd: string) => boolean): string[] {
  const agents: string[] = [];
  const candidates = ['claude', 'cursor', 'opencode'];
  for (const cmd of candidates) {
    if (checkCommand(cmd)) {
      agents.push(cmd);
    }
  }
  return agents;
}

function commandExists(cmd: string): boolean {
  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whereCmd} ${JSON.stringify(cmd)}`, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}
