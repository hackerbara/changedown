import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Optional plugin config read from project's .opencode/changedown.json.
 * Allows opt-out of skills/instructions injection (explicit by default).
 */
export interface ChangeDownOpencodeConfig {
  skills?: { enabled?: boolean };
  instructions?: { enabled?: boolean };
}

const DEFAULT_CONFIG: Required<ChangeDownOpencodeConfig> = {
  skills: { enabled: true },
  instructions: { enabled: true },
};

export async function loadOpencodePluginConfig(projectDirectory: string): Promise<ChangeDownOpencodeConfig> {
  const configPath = path.join(projectDirectory, '.opencode', 'changedown.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ChangeDownOpencodeConfig;
    return {
      skills: { ...DEFAULT_CONFIG.skills, ...parsed.skills },
      instructions: { ...DEFAULT_CONFIG.instructions, ...parsed.instructions },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
