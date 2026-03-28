import { parseTrackingHeader } from '@changedown/core';
import { isFileInScope, type ChangeDownConfig } from './config.js';
import * as fs from 'node:fs/promises';

export interface TrackingStatus {
  status: 'tracked' | 'untracked';
  source: 'file_header' | 'project_config' | 'global_default';
  header_present: boolean;
  project_default: 'tracked' | 'untracked';
  auto_header: boolean;
}

/**
 * Resolves the tracking status of a file using three-layer precedence:
 *
 * 1. **File header** — `<!-- changedown.com/v1: tracked|untracked -->` in the
 *    first 5 lines takes highest priority.
 * 2. **Project config** — if the file matches include/exclude globs, the
 *    `tracking.default` config value is used.
 * 3. **Global default** — files outside scope are `untracked`.
 *
 * If the file does not exist, layer 1 is skipped (no header) and resolution
 * falls through to layers 2/3.
 */
export async function resolveTrackingStatus(
  filePath: string,
  config: ChangeDownConfig,
  projectDir: string,
): Promise<TrackingStatus> {
  const projectDefault = config.tracking.default;
  const autoHeader = config.tracking.auto_header;

  // Layer 1: Check file for tracking header
  let fileContent: string | null = null;
  try {
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — skip header check, fall through to config/global
  }

  if (fileContent !== null) {
    const header = parseTrackingHeader(fileContent);
    if (header !== null) {
      return {
        status: header.status,
        source: 'file_header',
        header_present: true,
        project_default: projectDefault,
        auto_header: autoHeader,
      };
    }
  }

  // Layer 2: Check project config (include/exclude globs)
  if (isFileInScope(filePath, config, projectDir)) {
    return {
      status: projectDefault,
      source: 'project_config',
      header_present: false,
      project_default: projectDefault,
      auto_header: autoHeader,
    };
  }

  // Layer 3: Global default — file is out of scope
  return {
    status: 'untracked',
    source: 'global_default',
    header_present: false,
    project_default: projectDefault,
    auto_header: autoHeader,
  };
}
