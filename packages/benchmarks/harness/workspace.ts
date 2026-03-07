import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CreateTempWorkspaceOptions {
  /** If set, create workspace inside this directory (e.g. repo root) so the session dir is inside the OpenCode project. */
  inside?: string;
  /** If true, initialize a fresh git repo inside the workspace after copying fixtures.
   *  This prevents the parent repo's .gitignore from blocking `git add` and provides isolation. */
  gitInit?: boolean;
  /** If true, inject .opencode/opencode.json with absolute path to the SC MCP server
   *  and .changetracks/config.toml so the agent has propose_change, read_tracked_file, etc. */
  injectChangeTracks?: boolean;
  /** Protocol mode for ChangeTracks config: "classic" (Surface B) or "compact" (Surface C).
   *  Only used when injectChangeTracks is true. Default: "classic". */
  protocolMode?: "classic" | "compact";
  /** If true, inject .changetracks/config.toml but skip .opencode/opencode.json.
   *  Used for Surface D (CLI-only) to avoid MCP schema overhead.
   *  Only takes effect when injectChangeTracks is true. */
  disableChangeTracksPlugin?: boolean;
  /** If true, inject full V1 config (author enforcement, settlement, view policy).
   *  Used for Surfaces F and G. Only used when injectChangeTracks is true. */
  v1Config?: boolean;
  /** If true, enable experimental patch wrapping in [hooks]. */
  patchWrapExperimental?: boolean;
}

/**
 * Create a temporary workspace by copying the contents of a fixture directory.
 * @param fixtureDir - Absolute or relative path to the fixture directory (e.g. docs/test-fixtures/benchmark-adr/)
 * @param options - Optional. Use inside: "." to create workspace inside repo so OpenCode sees it as part of the project.
 *                  Use gitInit: true to initialize a fresh git repo (recommended for all benchmark workspaces).
 * @returns Path to the new temp directory
 */
export async function createTempWorkspace(
  fixtureDir: string,
  options: CreateTempWorkspaceOptions = {}
): Promise<string> {
  const resolvedFixture = path.isAbsolute(fixtureDir)
    ? fixtureDir
    : path.resolve(process.cwd(), fixtureDir);
  const baseDir = options.inside
    ? path.join(path.resolve(process.cwd(), options.inside), ".bench-workspace")
    : os.tmpdir();
  await fs.mkdir(baseDir, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(baseDir, "bench-adr-"));
  await cpRecursive(resolvedFixture, tempDir);

  // Inject ChangeTracks MCP config so OpenCode discovers propose_change, read_tracked_file, etc.
  // Uses absolute path to MCP server binary so it works from any workspace location.
  if (options.injectChangeTracks) {
    const repoRoot = path.resolve(process.cwd());
    const mcpServerPath = path.join(repoRoot, "changetracks-plugin", "mcp-server", "dist", "index.js");

    // .opencode/opencode.json — MCP server config + plugin registration
    // Skip for Surface D (disableChangeTracksPlugin = true) to avoid MCP schema overhead
    if (!options.disableChangeTracksPlugin) {
      const opencodeDir = path.join(tempDir, ".opencode");
      await fs.mkdir(opencodeDir, { recursive: true });
      const opencodePluginPath = path.join(repoRoot, "packages", "opencode-plugin");
      await fs.writeFile(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          "$schema": "https://opencode.ai/config.json",
          mcp: {
            "changetracks": {
              type: "local",
              command: ["node", mcpServerPath],
            },
          },
          plugin: [opencodePluginPath],
        }, null, 2)
      );
    }

    // .changetracks/config.toml — minimal tracking config for benchmark
    // (Created for ALL surfaces when injectChangeTracks is true)
    const scDir = path.join(tempDir, ".changetracks");
    await fs.mkdir(scDir, { recursive: true });
    const configLines = [
      '[tracking]',
      'include = ["**/*.md"]',
      '',
      '[author]',
      'default = "ai:benchmark-agent"',
      'enforcement = "optional"',
      '',
      '[matching]',
      'mode = "normalized"',
      '',
      '[hashline]',
      'enabled = true',
    ];

    if (options.protocolMode === "compact") {
      configLines.push(
        '',
        '[protocol]',
        'mode = "compact"',
        'level = 2',
      );
    }

    if (options.v1Config) {
      configLines.push(
        '',
        '[policy]',
        'default_view = "review"',
        '',
        '[settlement]',
        'auto_on_approve = true',
        'auto_on_reject = true',
      );

      // Upgrade author enforcement from "optional" to "required" for V1
      // Scope search after [author] section to avoid matching enforcement in other sections
      const authorIdx = configLines.indexOf('[author]');
      if (authorIdx >= 0) {
        const enforcementIdx = configLines.findIndex(
          (l, i) => i > authorIdx && l.startsWith('enforcement')
        );
        if (enforcementIdx >= 0) {
          configLines[enforcementIdx] = 'enforcement = "required"';
        }
      }
    }

    if (options.patchWrapExperimental) {
      configLines.push(
        '',
        '[hooks]',
        'patch_wrap_experimental = true',
      );
    }

    configLines.push('');
    await fs.writeFile(
      path.join(scDir, "config.toml"),
      configLines.join("\n")
    );
  }

  // Initialize a fresh git repo so agent git operations work against
  // the local repo, not the parent repo (avoids .gitignore conflicts).
  if (options.gitInit) {
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["add", "-A"], { cwd: tempDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "initial", "--allow-empty"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "bench",
          GIT_AUTHOR_EMAIL: "bench@test",
          GIT_COMMITTER_NAME: "bench",
          GIT_COMMITTER_EMAIL: "bench@test",
        },
      }
    );
  }

  return tempDir;
}

export async function cpRecursive(src: string, dest: string, exclude: string[] = []): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await cpRecursive(srcPath, destPath, exclude);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
