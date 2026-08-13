import * as path from 'node:path';
import type { ClaudeCapabilityCatalog, ClaudePolicyCatalogRequest } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';

const DEFAULT_CACHE_TTL_MS = 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 16;

export interface CapabilityCatalogWatchTarget {
  directoryPath: string;
  expectedFileName?: string;
  recursive?: boolean;
}

export interface CapabilityCatalogWatcher {
  close(): void;
}

export interface ClaudeCapabilityCatalogCacheDependencies {
  listCatalog: (request: ClaudePolicyCatalogRequest) => Promise<ClaudeCapabilityCatalog>;
  getWatchTargets: (request: ClaudePolicyCatalogRequest) => CapabilityCatalogWatchTarget[];
  watchDirectory: (
    target: CapabilityCatalogWatchTarget,
    onChange: (fileName?: string | null) => void
  ) => CapabilityCatalogWatcher | null;
  now?: () => number;
  cacheTtlMs?: number;
  maxEntries?: number;
}

interface CacheEntry {
  catalog: ClaudeCapabilityCatalog;
  revision: number;
  expiresAt: number;
  lastAccessedAt: number;
  watchers: CapabilityCatalogWatcher[];
}

interface PendingCatalogRequest {
  promise: Promise<ClaudeCapabilityCatalog>;
  revision: number;
}

function toCacheKey(request: ClaudePolicyCatalogRequest): string {
  const repoPath = request.repoPath ? path.resolve(request.repoPath) : '';
  const worktreePath = request.worktreePath ? path.resolve(request.worktreePath) : '';
  return JSON.stringify([repoPath, worktreePath]);
}

function isRemoteCatalogRequest(request: ClaudePolicyCatalogRequest): boolean {
  return Boolean(
    (request.repoPath && isRemoteVirtualPath(request.repoPath)) ||
      (request.worktreePath && isRemoteVirtualPath(request.worktreePath))
  );
}

function matchesWorkspacePath(candidatePath: string | undefined, workspacePath: string): boolean {
  return candidatePath ? path.resolve(candidatePath) === path.resolve(workspacePath) : false;
}

export class ClaudeCapabilityCatalogCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, PendingCatalogRequest>();
  private readonly revisions = new Map<string, number>();
  private disposed = false;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly maxEntries: number;

  constructor(private readonly dependencies: ClaudeCapabilityCatalogCacheDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.cacheTtlMs = dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = dependencies.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async getCatalog(request: ClaudePolicyCatalogRequest): Promise<ClaudeCapabilityCatalog> {
    if (this.disposed || isRemoteCatalogRequest(request)) {
      return this.dependencies.listCatalog(request);
    }

    const key = toCacheKey(request);
    const currentTime = this.now();
    const revision = this.getRevision(key);
    const cached = this.cache.get(key);
    if (cached && cached.revision === revision && cached.expiresAt > currentTime) {
      cached.lastAccessedAt = currentTime;
      return cached.catalog;
    }
    if (cached) {
      this.removeEntry(key);
    }

    const pending = this.pending.get(key);
    if (pending?.revision === revision) {
      return pending.promise;
    }

    const catalogPromise = this.dependencies
      .listCatalog(request)
      .then((catalog) => {
        if (!this.disposed && this.getRevision(key) === revision) {
          this.storeCatalog(key, request, catalog, revision);
        }
        return catalog;
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === catalogPromise) {
          this.pending.delete(key);
        }
      });
    this.pending.set(key, { promise: catalogPromise, revision });
    return catalogPromise;
  }

  invalidateWorkspace(workspacePath: string): void {
    const keys = new Set([...this.cache.keys(), ...this.pending.keys()]);
    for (const key of keys) {
      const [repoPath, worktreePath] = JSON.parse(key) as [string, string];
      if (
        matchesWorkspacePath(repoPath, workspacePath) ||
        matchesWorkspacePath(worktreePath, workspacePath)
      ) {
        this.invalidateKey(key);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const [key, entry] of this.cache) {
      this.removeEntry(key, entry);
    }
    this.pending.clear();
    this.revisions.clear();
  }

  private storeCatalog(
    key: string,
    request: ClaudePolicyCatalogRequest,
    catalog: ClaudeCapabilityCatalog,
    revision: number
  ): void {
    this.removeEntry(key);

    const watchers = this.dependencies
      .getWatchTargets(request)
      .map((target) =>
        this.dependencies.watchDirectory(target, (fileName) => {
          if (
            target.expectedFileName &&
            fileName &&
            path.basename(fileName) !== target.expectedFileName
          ) {
            return;
          }
          this.invalidateKey(key);
        })
      )
      .filter((watcher): watcher is CapabilityCatalogWatcher => watcher !== null);
    const currentTime = this.now();
    this.cache.set(key, {
      catalog,
      revision,
      expiresAt: currentTime + this.cacheTtlMs,
      lastAccessedAt: currentTime,
      watchers,
    });
    this.evictLeastRecentlyUsedEntries();
  }

  private evictLeastRecentlyUsedEntries(): void {
    while (this.cache.size > this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestAccessedAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.cache) {
        if (entry.lastAccessedAt < oldestAccessedAt) {
          oldestKey = key;
          oldestAccessedAt = entry.lastAccessedAt;
        }
      }
      if (!oldestKey) {
        return;
      }
      this.removeEntry(oldestKey);
    }
  }

  private removeEntry(key: string, entry = this.cache.get(key)): void {
    if (!entry) {
      return;
    }
    this.cache.delete(key);
    for (const watcher of entry.watchers) {
      watcher.close();
    }
  }

  private getRevision(key: string): number {
    return this.revisions.get(key) ?? 0;
  }

  private invalidateKey(key: string): void {
    this.revisions.set(key, this.getRevision(key) + 1);
    this.removeEntry(key);
  }
}
