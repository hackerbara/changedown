import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync, realpathSync, watch, type FSWatcher } from 'node:fs';
import { loadConfig, DEFAULT_CONFIG, type ChangeDownConfig } from './config.js';

interface CachedProject {
  projectDir: string;
  config: ChangeDownConfig;
}

/**
 * Lazy, per-file config resolver with caching.
 *
 * Instead of loading config once at startup from a guessed project directory,
 * discovers `.changedown/config.toml` by walking up from each file path.
 * Results are cached by discovered project root so the filesystem walk only
 * happens once per project per session.
 *
 * This makes the MCP server work identically whether launched from:
 * - A workspace `mcp.json` (Cursor)
 * - The plugin cache (`~/.claude/plugins/cache/...`)
 * - Claude Code with no project context
 * - Any other MCP host
 */
export class ConfigResolver {
  /** Map from project root path → cached config */
  private cache: Map<string, CachedProject> = new Map();

  /** Active file watchers per project root */
  private watchers: Map<string, FSWatcher> = new Map();

  /** Debounce timers per project root */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Most recently resolved project dir, used as fallback for relative paths */
  private lastProjectDir: string | undefined;

  /** Optional fallback dir for resolving relative paths when no project found yet */
  private fallbackDir: string;

  /**
   * Host-provided session roots (e.g. from MCP roots/list).
   * When set, relative paths resolve against the first root; resolveDir() and
   * lastConfig() use the first root when no file has been resolved yet.
   */
  private sessionRoots: string[] = [];

  constructor(fallbackDir?: string) {
    this.fallbackDir = fallbackDir ?? process.cwd();
  }

  /**
   * Set workspace roots provided by the host (e.g. MCP roots/list).
   * Pass decoded filesystem paths (not file:// URIs). Replaces any previous session roots.
   */
  setSessionRoots(roots: string[]): void {
    this.sessionRoots = roots.filter(Boolean).map((r) => r.trim()).filter(Boolean);
  }

  /**
   * Resolve config for a given absolute file path.
   *
   * Walks up from the file's directory looking for `.changedown/config.toml`.
   * Returns cached config if the same project root was already discovered.
   * Falls back to defaults if no config is found.
   */
  async forFile(filePath: string): Promise<{ config: ChangeDownConfig; projectDir: string }> {
    const dir = path.dirname(filePath);
    const projectRoot = await this.findProjectRoot(dir);

    if (projectRoot) {
      // Check cache
      const cached = this.cache.get(projectRoot);
      if (cached) {
        this.lastProjectDir = cached.projectDir;
        return { config: cached.config, projectDir: cached.projectDir };
      }

      // Load, cache, and start watching for changes
      const config = await loadConfig(projectRoot);
      const entry: CachedProject = { projectDir: projectRoot, config };
      this.cache.set(projectRoot, entry);
      this.lastProjectDir = projectRoot;
      this.watchConfig(projectRoot);
      return { config, projectDir: projectRoot };
    }

    // No project root found — use defaults
    return { config: structuredClone(DEFAULT_CONFIG), projectDir: this.resolveDir() };
  }

  /**
   * Resolve a file path argument from a tool call.
   *
   * Resolves relative paths against the inferred project root, then validates
   * that the final resolved path (after symlink resolution) stays within the
   * project boundary. Rejects paths that escape the project directory.
   */
  resolveFilePath(file: string): string {
    const projectRoot = this.inferProjectRoot(file);

    let resolved: string;
    if (path.isAbsolute(file)) {
      resolved = path.resolve(file);
    } else {
      resolved = path.resolve(projectRoot, file);
    }

    if (!this.lastProjectDir) {
      this.lastProjectDir = projectRoot;
    }

    // Resolve symlinks to prevent symlink-based boundary escapes.
    // If the file doesn't exist yet (new file creation), resolve the
    // parent directory's realpath and append the basename.
    const realResolved = this.resolveRealPath(resolved);

    // Boundary check: the resolved real path must be within the project root.
    // Resolve the project root's realpath too, in case it's itself a symlink.
    const realProjectRoot = this.resolveRealPath(projectRoot);
    const normalizedRoot = realProjectRoot.endsWith(path.sep) ? realProjectRoot : realProjectRoot + path.sep;

    if (!realResolved.startsWith(normalizedRoot) && realResolved !== realProjectRoot) {
      throw new Error(
        `Path "${file}" resolves to "${realResolved}" which is outside the project root "${realProjectRoot}". ` +
        'File operations are restricted to the project directory for security.'
      );
    }

    return realResolved;
  }

  /**
   * Infer the project root directory using the standard fallback chain.
   * Used by resolveFilePath for both absolute and relative path validation.
   */
  private inferProjectRoot(file: string): string {
    const firstSessionRoot = this.sessionRoots[0];
    const inferredProject =
      firstSessionRoot ||
      this.lastProjectDir ||
      ConfigResolver.findProjectRootSync(this.fallbackDir) ||
      ConfigResolver.findProjectRootSync(process.env['PWD'] ?? '');

    if (!inferredProject) {
      throw new Error(
        `Cannot resolve path "${file}" because project root is unknown. ` +
        'Use an absolute path or set CHANGEDOWN_PROJECT_DIR to the workspace root.'
      );
    }

    return inferredProject;
  }

  /**
   * Resolve a path to its real filesystem path (following symlinks).
   * If the path doesn't exist, resolves the nearest existing ancestor
   * and appends the remaining segments — this supports new file creation
   * within the project boundary.
   */
  private resolveRealPath(filePath: string): string {
    try {
      return realpathSync(filePath);
    } catch {
      // File doesn't exist yet. Walk up to find the nearest existing ancestor,
      // resolve its realpath, then append the remaining path segments.
      const segments: string[] = [];
      let current = filePath;

      while (true) {
        const parent = path.dirname(current);
        if (parent === current) {
          // Reached filesystem root without finding an existing path.
          // Return the original normalized path as-is.
          return path.resolve(filePath);
        }
        segments.unshift(path.basename(current));
        current = parent;

        try {
          const realParent = realpathSync(current);
          return path.join(realParent, ...segments);
        } catch {
          // This ancestor doesn't exist either, keep walking up.
        }
      }
    }
  }

  /**
   * Returns the most recently discovered project dir, or fallback.
   * Useful for `get_tracking_status()` with no file arg.
   */
  resolveDir(): string {
    return this.lastProjectDir ?? this.sessionRoots[0] ?? this.fallbackDir;
  }

  /**
   * Returns the last resolved config if any project was discovered.
   * If no file has been resolved yet, attempts to discover config from
   * the fallback directory. Returns defaults only if no config is found.
   *
   * Used by tools that don't have a file path (e.g. `get_tracking_status()`
   * with no args, `begin_change_group`).
   */
  async lastConfig(): Promise<ChangeDownConfig> {
    if (this.lastProjectDir) {
      const cached = this.cache.get(this.lastProjectDir);
      if (cached) return cached.config;
    }

    // Prefer first session root (MCP), then fallback dir (first call with no prior file resolution)
    const startDir = this.sessionRoots[0] ?? this.fallbackDir;
    const projectRoot = await this.findProjectRoot(startDir);
    if (projectRoot) {
      const config = await loadConfig(projectRoot);
      this.cache.set(projectRoot, { projectDir: projectRoot, config });
      this.lastProjectDir = projectRoot;
      this.watchConfig(projectRoot);
      return config;
    }

    return structuredClone(DEFAULT_CONFIG);
  }

  /**
   * Walk up from `startDir` looking for a directory containing `.changedown/`.
   * Returns the project root (parent of `.changedown/`) or undefined.
   */
  private async findProjectRoot(startDir: string): Promise<string | undefined> {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;

    while (true) {
      try {
        await fs.access(path.join(dir, '.changedown', 'config.toml'));
        return dir;
      } catch {
        // Not found at this level
      }

      const parent = path.dirname(dir);
      if (parent === dir || dir === root) {
        return undefined;
      }
      dir = parent;
    }
  }

  /**
   * Synchronous project root lookup used by resolveFilePath.
   * Walks up from startDir until it finds `.changedown/config.toml`.
   */
  private static findProjectRootSync(startDir: string): string | undefined {
    if (!startDir) return undefined;
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;

    while (true) {
      if (existsSync(path.join(dir, '.changedown', 'config.toml'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir || dir === root) {
        return undefined;
      }
      dir = parent;
    }
  }

  /**
   * Start watching `.changedown/config.toml` for a project root.
   * On change, invalidates the cached config so the next forFile() re-reads.
   * Debounced at 100ms (fs.watch fires multiple events per save).
   * Idempotent — won't create duplicate watchers for the same project.
   */
  private watchConfig(projectDir: string): void {
    if (this.watchers.has(projectDir)) return;

    const configPath = path.join(projectDir, '.changedown', 'config.toml');
    try {
      const watcher = watch(configPath, () => {
        // Debounce: clear previous timer, set new one
        const existing = this.debounceTimers.get(projectDir);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(projectDir, setTimeout(() => {
          this.debounceTimers.delete(projectDir);
          this.cache.delete(projectDir);
          console.error(`changedown: config changed, cache invalidated for ${projectDir}`);
        }, 100));
      });

      // Don't let the watcher keep the process alive
      (watcher as any).unref?.();

      watcher.on('error', () => {
        // Config file deleted or became inaccessible — stop watching
        this.stopWatching(projectDir);
      });

      this.watchers.set(projectDir, watcher);
    } catch {
      // watch() can throw if file doesn't exist — ignore silently
    }
  }

  /**
   * Stop watching a specific project's config.
   */
  private stopWatching(projectDir: string): void {
    const watcher = this.watchers.get(projectDir);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectDir);
    }
    const timer = this.debounceTimers.get(projectDir);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectDir);
    }
  }

  /**
   * Stop all watchers and clear the cache. Call on server shutdown.
   */
  dispose(): void {
    for (const projectDir of this.watchers.keys()) {
      this.stopWatching(projectDir);
    }
    this.cache.clear();
  }
}
