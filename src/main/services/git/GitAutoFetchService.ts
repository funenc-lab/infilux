import { existsSync, type FSWatcher, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { type GitAutoFetchCompletedPayload, IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { GitService } from './GitService';

const FETCH_INTERVAL_MS = 3 * 60 * 1000;
const MIN_FOCUS_INTERVAL_MS = 1 * 60 * 1000;
const HEAD_CHANGE_DEBOUNCE_MS = 300;
const FETCH_TIMEOUT_MS = 30_000;

function isDisposedWindowSendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Render frame was disposed') ||
    error.message.includes('Object has been destroyed')
  );
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

class GitAutoFetchService {
  private mainWindow: BrowserWindow | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private startupFetchTimeoutId: NodeJS.Timeout | null = null;
  private lastFetchTime = 0;
  private repositoryWorktreePaths: Map<string, Set<string>> = new Map();
  private worktreeRepositoryPaths: Map<string, string> = new Map();
  private enabled = false;
  private fetching = false;
  private onFocusHandler: (() => void) | null = null;
  private headWatchers: Map<string, FSWatcher> = new Map();
  private headDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  init(window: BrowserWindow): void {
    if (this.mainWindow) {
      console.warn('GitAutoFetchService already initialized');
      return;
    }

    this.mainWindow = window;
    this.onFocusHandler = () => {
      if (!this.enabled) {
        return;
      }

      const now = Date.now();
      if (now - this.lastFetchTime >= MIN_FOCUS_INTERVAL_MS) {
        void this.fetchAll();
      }
    };
    window.on('focus', this.onFocusHandler);

    if (this.enabled) {
      this.start();
    }
  }

  cleanup(): void {
    this.stop();
    this.clearWorktrees();

    if (this.mainWindow && this.onFocusHandler) {
      this.mainWindow.off('focus', this.onFocusHandler);
      this.onFocusHandler = null;
    }

    this.mainWindow = null;
    this.enabled = false;
    this.fetching = false;
    this.lastFetchTime = 0;
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      void this.fetchAll();
    }, FETCH_INTERVAL_MS);

    this.startupFetchTimeoutId = setTimeout(() => {
      this.startupFetchTimeoutId = null;
      void this.fetchAll();
    }, 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.startupFetchTimeoutId) {
      clearTimeout(this.startupFetchTimeoutId);
      this.startupFetchTimeoutId = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.start();
      return;
    }

    this.stop();
    this.fetching = false;
  }

  registerWorktree(path: string): void {
    this.registerRepositoryWorktree(path, path);
  }

  syncRepositoryWorktrees(repositoryPath: string, worktreePaths: string[]): void {
    const normalizedRepositoryPath = resolve(repositoryPath);
    const nextWorktreePaths = new Set(worktreePaths.map((path) => resolve(path)));
    const previousWorktreePaths = this.repositoryWorktreePaths.get(normalizedRepositoryPath);

    if (previousWorktreePaths) {
      for (const previousPath of previousWorktreePaths) {
        if (!nextWorktreePaths.has(previousPath)) {
          this.unregisterWorktree(previousPath);
        }
      }
    }

    for (const worktreePath of nextWorktreePaths) {
      this.registerRepositoryWorktree(worktreePath, normalizedRepositoryPath);
    }

    if (nextWorktreePaths.size === 0) {
      this.repositoryWorktreePaths.delete(normalizedRepositoryPath);
    }
  }

  unregisterWorktree(path: string): void {
    const normalizedPath = resolve(path);
    const repositoryPath = this.worktreeRepositoryPaths.get(normalizedPath);

    if (repositoryPath) {
      const repositoryWorktrees = this.repositoryWorktreePaths.get(repositoryPath);
      repositoryWorktrees?.delete(normalizedPath);
      if (repositoryWorktrees && repositoryWorktrees.size === 0) {
        this.repositoryWorktreePaths.delete(repositoryPath);
      }
      this.worktreeRepositoryPaths.delete(normalizedPath);
    }

    this.unwatchHead(normalizedPath);
  }

  clearWorktrees(): void {
    for (const worktreePath of [...this.worktreeRepositoryPaths.keys()]) {
      this.unwatchHead(worktreePath);
    }

    this.repositoryWorktreePaths.clear();
    this.worktreeRepositoryPaths.clear();
  }

  private async fetchAll(): Promise<void> {
    if (!this.enabled || this.repositoryWorktreePaths.size === 0 || this.fetching) {
      return;
    }

    this.fetching = true;
    const completedRepositoryPaths = new Set<string>();

    try {
      this.lastFetchTime = Date.now();

      for (const repositoryPath of this.repositoryWorktreePaths.keys()) {
        if (!this.enabled) {
          break;
        }

        try {
          const git = new GitService(repositoryPath);
          await withTimeout(git.fetch(), FETCH_TIMEOUT_MS, 'fetch');
          completedRepositoryPaths.add(repositoryPath);

          if (!this.enabled) {
            break;
          }

          const submodules = await git.listSubmodules();
          const submodulePromises = submodules
            .filter((submodule) => submodule.initialized)
            .map((submodule) =>
              withTimeout(
                git.fetchSubmodule(submodule.path),
                FETCH_TIMEOUT_MS,
                'submodule fetch'
              ).catch((error) => {
                console.debug(`Auto fetch submodule failed for ${submodule.path}:`, error);
              })
            );
          await Promise.all(submodulePromises);
        } catch (error) {
          console.debug(`Auto fetch failed for ${repositoryPath}:`, error);
        }
      }
    } finally {
      this.fetching = false;
    }

    this.notifyCompleted([...completedRepositoryPaths]);
  }

  private notifyCompleted(repositoryPaths: string[]): void {
    const normalizedRepositoryPaths = [
      ...new Set(repositoryPaths.map((path) => resolve(path))),
    ].sort();
    if (normalizedRepositoryPaths.length === 0) {
      return;
    }

    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    if (this.mainWindow.webContents.isDestroyed()) {
      return;
    }

    try {
      const payload: GitAutoFetchCompletedPayload = {
        timestamp: Date.now(),
        repositoryPaths: normalizedRepositoryPaths,
      };
      this.mainWindow.webContents.send(IPC_CHANNELS.GIT_AUTO_FETCH_COMPLETED, payload);
    } catch (error) {
      if (isDisposedWindowSendError(error)) {
        return;
      }

      console.warn('Failed to notify renderer about git auto fetch completion:', error);
    }
  }

  private watchHead(worktreePath: string, repositoryPath: string): void {
    if (this.headWatchers.has(worktreePath)) {
      return;
    }

    const headPath = join(worktreePath, '.git', 'HEAD');
    if (!existsSync(headPath)) {
      return;
    }

    try {
      const watcher = watch(headPath, () => {
        const existingTimer = this.headDebounceTimers.get(worktreePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          this.headDebounceTimers.delete(worktreePath);
          this.notifyCompleted([repositoryPath]);
        }, HEAD_CHANGE_DEBOUNCE_MS);

        this.headDebounceTimers.set(worktreePath, timer);
      });

      watcher.on('error', () => this.unwatchHead(worktreePath));
      this.headWatchers.set(worktreePath, watcher);
    } catch {
      // Silent fail: periodic auto-fetch remains as fallback.
    }
  }

  private unwatchHead(worktreePath: string): void {
    const timer = this.headDebounceTimers.get(worktreePath);
    if (timer) {
      clearTimeout(timer);
      this.headDebounceTimers.delete(worktreePath);
    }

    const watcher = this.headWatchers.get(worktreePath);
    if (watcher) {
      watcher.close();
      this.headWatchers.delete(worktreePath);
    }
  }

  private registerRepositoryWorktree(path: string, repositoryPath: string): void {
    const normalizedPath = resolve(path);
    const normalizedRepositoryPath = resolve(repositoryPath);
    const previousRepositoryPath = this.worktreeRepositoryPaths.get(normalizedPath);

    if (previousRepositoryPath && previousRepositoryPath !== normalizedRepositoryPath) {
      const previousRepositoryWorktrees = this.repositoryWorktreePaths.get(previousRepositoryPath);
      previousRepositoryWorktrees?.delete(normalizedPath);
      if (previousRepositoryWorktrees && previousRepositoryWorktrees.size === 0) {
        this.repositoryWorktreePaths.delete(previousRepositoryPath);
      }
      this.unwatchHead(normalizedPath);
    }

    const repositoryWorktrees =
      this.repositoryWorktreePaths.get(normalizedRepositoryPath) ?? new Set<string>();
    repositoryWorktrees.add(normalizedPath);
    this.repositoryWorktreePaths.set(normalizedRepositoryPath, repositoryWorktrees);
    this.worktreeRepositoryPaths.set(normalizedPath, normalizedRepositoryPath);
    this.watchHead(normalizedPath, normalizedRepositoryPath);
  }
}

export const gitAutoFetchService = new GitAutoFetchService();
