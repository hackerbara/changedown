import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Optional plugin config read from project's .opencode/changetracks.json.
 * Allows opt-out of skills/instructions injection (explicit by default).
 */
export interface ChangeTracksOpencodeConfig {
  skills?: { enabled?: boolean };
  instructions?: { enabled?: boolean };
}

const DEFAULT_CONFIG: Required<ChangeTracksOpencodeConfig> = {
  skills: { enabled: true },
  instructions: { enabled: true },
};

export async function loadOpencodePluginConfig(projectDirectory: string): Promise<ChangeTracksOpencodeConfig> {
  const configPath = path.join(projectDirectory, '.opencode', 'changetracks.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ChangeTracksOpencodeConfig;
    return {
      skills: { ...DEFAULT_CONFIG.skills, ...parsed.skills },
      instructions: { ...DEFAULT_CONFIG.instructions, ...parsed.instructions },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
