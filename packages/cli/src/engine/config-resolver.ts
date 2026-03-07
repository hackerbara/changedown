import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { loadConfig, DEFAULT_CONFIG, type ChangeTracksConfig } from './config.js';

interface CachedProject {
  projectDir: string;
  config: ChangeTracksConfig;
}

/**
 * Lazy, per-file config resolver with caching.
 *
 * Instead of loading config once at startup from a guessed project directory,
 * discovers `.changetracks/config.toml` by walking up from each file path.
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
   * Walks up from the file's directory looking for `.changetracks/config.toml`.
   * Returns cached config if the same project root was already discovered.
   * Falls back to defaults if no config is found.
   */
  async forFile(filePath: string): Promise<{ config: ChangeTracksConfig; projectDir: string }> {
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
   * If absolute, returns as-is. If relative, resolves against the most
   * recently discovered project directory, or the fallback directory.
   */
  resolveFilePath(file: string): string {
    if (path.isAbsolute(file)) {
      return file;
    }

    // For relative paths, use a stable project anchor.
    // Prefer: host-provided session roots (MCP) > last discovered project root > fallback/PWD discovery.
    const firstSessionRoot = this.sessionRoots[0];
    const inferredProject =
      firstSessionRoot ||
      this.lastProjectDir ||
      ConfigResolver.findProjectRootSync(this.fallbackDir) ||
      ConfigResolver.findProjectRootSync(process.env['PWD'] ?? '');

    if (!inferredProject) {
      throw new Error(
        `Cannot resolve relative path "${file}" because project root is unknown. ` +
        'Use an absolute path or set CHANGETRACKS_PROJECT_DIR to the workspace root.'
      );
    }

    if (!this.lastProjectDir) {
      this.lastProjectDir = inferredProject;
    }
    return path.resolve(inferredProject, file);
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
  async lastConfig(): Promise<ChangeTracksConfig> {
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
   * Walk up from `startDir` looking for a directory containing `.changetracks/`.
   * Returns the project root (parent of `.changetracks/`) or undefined.
   */
  private async findProjectRoot(startDir: string): Promise<string | undefined> {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;

    while (true) {
      try {
        await fs.access(path.join(dir, '.changetracks', 'config.toml'));
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
   * Walks up from startDir until it finds `.changetracks/config.toml`.
   */
  private static findProjectRootSync(startDir: string): string | undefined {
    if (!startDir) return undefined;
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;

    while (true) {
      if (existsSync(path.join(dir, '.changetracks', 'config.toml'))) {
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
   * Start watching `.changetracks/config.toml` for a project root.
   * On change, invalidates the cached config so the next forFile() re-reads.
   * Debounced at 100ms (fs.watch fires multiple events per save).
   * Idempotent — won't create duplicate watchers for the same project.
   */
  private watchConfig(projectDir: string): void {
    if (this.watchers.has(projectDir)) return;

    const configPath = path.join(projectDir, '.changetracks', 'config.toml');
    try {
      const watcher = watch(configPath, () => {
        // Debounce: clear previous timer, set new one
        const existing = this.debounceTimers.get(projectDir);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(projectDir, setTimeout(() => {
          this.debounceTimers.delete(projectDir);
          this.cache.delete(projectDir);
          console.error(`changetracks: config changed, cache invalidated for ${projectDir}`);
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
