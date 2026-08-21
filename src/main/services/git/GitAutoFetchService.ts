import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { type GitAutoFetchCompletedPayload, IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { GitService } from './GitService';

const FETCH_INTERVAL_MS = 3 * 60 * 1000;
const HEAD_POLL_INTERVAL_MS = 5 * 1000;
const HEAD_POLL_CONCURRENCY = 4;
const MIN_FOCUS_INTERVAL_MS = 1 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const RESOURCE_EXHAUSTION_BACKOFF_MS = 10 * 60 * 1000;
const RESOURCE_EXHAUSTION_ERROR_CODES = new Set(['EBADF', 'EMFILE', 'ENFILE']);

type HeadTrackingState = {
  repositoryPath: string;
  headPath: string;
  signature: string | null;
};

type PendingHeadTracking = {
  repositoryPath: string;
  version: number;
};

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

async function resolveTrackedHeadPath(worktreePath: string): Promise<string | null> {
  const gitPath = join(worktreePath, '.git');

  try {
    const gitStats = await fs.stat(gitPath);
    if (gitStats.isDirectory()) {
      return join(gitPath, 'HEAD');
    }

    if (!gitStats.isFile()) {
      return null;
    }

    const gitDirEntry = await fs.readFile(gitPath, 'utf8');
    const gitDirMatch = gitDirEntry.match(/^gitdir:\s*(.+)\s*$/im);
    if (!gitDirMatch?.[1]) {
      return null;
    }

    const resolvedGitDir = resolve(worktreePath, gitDirMatch[1].trim());
    return join(resolvedGitDir, 'HEAD');
  } catch {
    return null;
  }
}

async function readHeadSignature(headPath: string): Promise<string | null> {
  try {
    return (await fs.readFile(headPath, 'utf8')).trim();
  } catch {
    return null;
  }
}

function getResourceExhaustionErrorCode(error: unknown): string | null {
  const nodeError = error as NodeJS.ErrnoException;
  if (typeof nodeError?.code === 'string' && RESOURCE_EXHAUSTION_ERROR_CODES.has(nodeError.code)) {
    return nodeError.code;
  }

  const message = error instanceof Error ? error.message : String(error);
  for (const errorCode of RESOURCE_EXHAUSTION_ERROR_CODES) {
    if (message.includes(errorCode)) {
      return errorCode;
    }
  }

  return null;
}

class GitAutoFetchService {
  private mainWindow: BrowserWindow | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private headPollIntervalId: NodeJS.Timeout | null = null;
  private startupFetchTimeoutId: NodeJS.Timeout | null = null;
  private lastFetchTime = 0;
  private repositoryWorktreePaths: Map<string, Set<string>> = new Map();
  private worktreeRepositoryPaths: Map<string, string> = new Map();
  private enabled = false;
  private fetching = false;
  private onFocusHandler: (() => void) | null = null;
  private onBlurHandler: (() => void) | null = null;
  private windowFocused = false;
  private trackedHeadStates: Map<string, HeadTrackingState> = new Map();
  private pendingHeadTracking = new Map<string, PendingHeadTracking>();
  private headTrackingVersions = new Map<string, number>();
  private headPollInFlight = false;
  private headPollGeneration = 0;
  private resourceBackoffUntil = 0;

  init(window: BrowserWindow): void {
    if (this.mainWindow) {
      console.warn('GitAutoFetchService already initialized');
      return;
    }

    this.mainWindow = window;
    this.windowFocused = typeof window.isFocused === 'function' ? window.isFocused() : true;
    this.onFocusHandler = () => {
      this.windowFocused = true;
      this.syncHeadPolling();
      if (!this.enabled) {
        return;
      }

      const now = Date.now();
      if (now - this.lastFetchTime >= MIN_FOCUS_INTERVAL_MS) {
        void this.fetchAll();
      }
    };
    this.onBlurHandler = () => {
      this.windowFocused = false;
      this.syncHeadPolling();
    };
    window.on('focus', this.onFocusHandler);
    window.on('blur', this.onBlurHandler);

    if (this.enabled) {
      this.start();
    }

    this.syncHeadPolling();
  }

  cleanup(): void {
    this.stop();
    this.stopHeadPolling();
    this.headPollGeneration += 1;
    this.headPollInFlight = false;
    this.clearWorktrees();

    if (this.mainWindow) {
      if (this.onFocusHandler) {
        this.mainWindow.off('focus', this.onFocusHandler);
      }
      if (this.onBlurHandler) {
        this.mainWindow.off('blur', this.onBlurHandler);
      }
      this.onFocusHandler = null;
      this.onBlurHandler = null;
    }

    this.mainWindow = null;
    this.windowFocused = false;
    this.enabled = false;
    this.fetching = false;
    this.lastFetchTime = 0;
    this.resourceBackoffUntil = 0;
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
    this.resourceBackoffUntil = 0;
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

    this.removeTrackedHeadState(normalizedPath);
  }

  clearWorktrees(): void {
    const trackedPaths = new Set([
      ...this.trackedHeadStates.keys(),
      ...this.pendingHeadTracking.keys(),
      ...this.worktreeRepositoryPaths.keys(),
    ]);
    for (const worktreePath of trackedPaths) {
      this.invalidateHeadTracking(worktreePath);
    }
    this.trackedHeadStates.clear();
    this.pendingHeadTracking.clear();
    this.repositoryWorktreePaths.clear();
    this.worktreeRepositoryPaths.clear();
    this.syncHeadPolling();
  }

  private async fetchAll(): Promise<void> {
    if (!this.enabled || this.repositoryWorktreePaths.size === 0 || this.fetching) {
      return;
    }

    if (this.resourceBackoffUntil > Date.now()) {
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
          const resourceErrorCode = getResourceExhaustionErrorCode(error);
          if (resourceErrorCode) {
            this.resourceBackoffUntil = Date.now() + RESOURCE_EXHAUSTION_BACKOFF_MS;
            console.warn('Suspending git auto fetch after resource exhaustion:', {
              repositoryPath,
              errorCode: resourceErrorCode,
              backoffUntil: new Date(this.resourceBackoffUntil).toISOString(),
            });
            break;
          }

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

  private startHeadPolling(): void {
    if (this.headPollIntervalId) {
      return;
    }

    this.headPollIntervalId = setInterval(() => {
      this.pollHeadChanges();
    }, HEAD_POLL_INTERVAL_MS);
  }

  private stopHeadPolling(): void {
    if (this.headPollIntervalId) {
      clearInterval(this.headPollIntervalId);
      this.headPollIntervalId = null;
    }
  }

  private syncHeadPolling(): void {
    if (this.mainWindow && this.windowFocused && this.trackedHeadStates.size > 0) {
      this.startHeadPolling();
      return;
    }

    this.stopHeadPolling();
  }

  private pollHeadChanges(): void {
    if (!this.mainWindow || !this.windowFocused || this.headPollInFlight) {
      return;
    }

    this.headPollInFlight = true;
    const generation = this.headPollGeneration;
    void this.pollHeadChangesAsync().finally(() => {
      if (this.headPollGeneration === generation) {
        this.headPollInFlight = false;
      }
    });
  }

  private async pollHeadChangesAsync(): Promise<void> {
    const changedRepositoryPaths = new Set<string>();
    const headStates = [...this.trackedHeadStates.entries()];
    let nextIndex = 0;

    const pollNextHead = async (): Promise<void> => {
      while (nextIndex < headStates.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const [worktreePath, headState] = headStates[currentIndex];
        const nextSignature = await readHeadSignature(headState.headPath);

        if (this.trackedHeadStates.get(worktreePath) !== headState) {
          continue;
        }

        if (nextSignature === headState.signature) {
          continue;
        }

        if (headState.signature !== null) {
          changedRepositoryPaths.add(headState.repositoryPath);
        }

        headState.signature = nextSignature;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(HEAD_POLL_CONCURRENCY, headStates.length) }, pollNextHead)
    );

    if (changedRepositoryPaths.size > 0) {
      this.notifyCompleted([...changedRepositoryPaths]);
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
    }

    const repositoryWorktrees =
      this.repositoryWorktreePaths.get(normalizedRepositoryPath) ?? new Set<string>();
    repositoryWorktrees.add(normalizedPath);
    this.repositoryWorktreePaths.set(normalizedRepositoryPath, repositoryWorktrees);
    this.worktreeRepositoryPaths.set(normalizedPath, normalizedRepositoryPath);

    this.scheduleHeadTracking(normalizedPath, normalizedRepositoryPath);
  }

  private removeTrackedHeadState(worktreePath: string): void {
    this.invalidateHeadTracking(worktreePath);
    this.trackedHeadStates.delete(worktreePath);

    this.syncHeadPolling();
  }

  private scheduleHeadTracking(worktreePath: string, repositoryPath: string): void {
    const currentState = this.trackedHeadStates.get(worktreePath);
    const pending = this.pendingHeadTracking.get(worktreePath);
    if (
      currentState?.repositoryPath === repositoryPath ||
      pending?.repositoryPath === repositoryPath
    ) {
      this.syncHeadPolling();
      return;
    }

    const version = this.invalidateHeadTracking(worktreePath);
    this.trackedHeadStates.delete(worktreePath);
    this.pendingHeadTracking.set(worktreePath, { repositoryPath, version });
    void this.resolveHeadTrackingState(worktreePath, repositoryPath, version);
  }

  private async resolveHeadTrackingState(
    worktreePath: string,
    repositoryPath: string,
    version: number
  ): Promise<void> {
    try {
      const headPath = await resolveTrackedHeadPath(worktreePath);
      const signature = headPath ? await readHeadSignature(headPath) : null;
      if (
        this.headTrackingVersions.get(worktreePath) !== version ||
        this.worktreeRepositoryPaths.get(worktreePath) !== repositoryPath
      ) {
        return;
      }

      if (!headPath || signature === null) {
        this.trackedHeadStates.delete(worktreePath);
        return;
      }

      this.trackedHeadStates.set(worktreePath, {
        repositoryPath,
        headPath,
        signature,
      });
    } finally {
      const pending = this.pendingHeadTracking.get(worktreePath);
      if (pending?.version === version) {
        this.pendingHeadTracking.delete(worktreePath);
      }

      this.syncHeadPolling();
    }
  }

  private invalidateHeadTracking(worktreePath: string): number {
    const version = (this.headTrackingVersions.get(worktreePath) ?? 0) + 1;
    this.headTrackingVersions.set(worktreePath, version);
    this.pendingHeadTracking.delete(worktreePath);
    return version;
  }
}

export const gitAutoFetchService = new GitAutoFetchService();
