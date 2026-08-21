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

export type ClaudeCapabilityCatalogInvalidationListener = (
  request: ClaudePolicyCatalogRequest
) => void;

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
  watchers: CapabilityCatalogWatcher[];
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
  private readonly invalidationListeners = new Set<ClaudeCapabilityCatalogInvalidationListener>();
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
    if (this.disposed) {
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

    let resolveCatalog!: (catalog: ClaudeCapabilityCatalog) => void;
    let rejectCatalog!: (error: unknown) => void;
    const catalogPromise = new Promise<ClaudeCapabilityCatalog>((resolve, reject) => {
      resolveCatalog = resolve;
      rejectCatalog = reject;
    });
    const pendingRequest: PendingCatalogRequest = {
      promise: catalogPromise,
      revision,
      watchers: [],
    };
    this.pending.set(key, pendingRequest);
    pendingRequest.watchers = this.createWatchers(key, request);

    let listingPromise: Promise<ClaudeCapabilityCatalog>;
    try {
      listingPromise = Promise.resolve(this.dependencies.listCatalog(request));
    } catch (error) {
      this.pending.delete(key);
      this.closeWatchers(pendingRequest.watchers);
      rejectCatalog(error);
      return catalogPromise;
    }

    void listingPromise
      .then((catalog) => {
        if (!this.disposed && this.getRevision(key) === revision) {
          this.storeCatalog(key, catalog, revision, pendingRequest.watchers);
        }
        resolveCatalog(catalog);
      })
      .catch((error: unknown) => {
        rejectCatalog(error);
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === catalogPromise) {
          this.pending.delete(key);
          if (this.cache.get(key)?.watchers !== pendingRequest.watchers) {
            this.closeWatchers(pendingRequest.watchers);
          }
        }
      });
    return catalogPromise;
  }

  onInvalidated(listener: ClaudeCapabilityCatalogInvalidationListener): () => void {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
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
    for (const pending of this.pending.values()) {
      this.closeWatchers(pending.watchers);
    }
    this.pending.clear();
    this.revisions.clear();
    this.invalidationListeners.clear();
  }

  private storeCatalog(
    key: string,
    catalog: ClaudeCapabilityCatalog,
    revision: number,
    watchers: CapabilityCatalogWatcher[]
  ): void {
    this.removeEntry(key);

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
    this.closeWatchers(entry.watchers);
  }

  private getRevision(key: string): number {
    return this.revisions.get(key) ?? 0;
  }

  private invalidateKey(key: string): void {
    const pending = this.pending.get(key);
    const hasActiveCatalog = this.cache.has(key) || Boolean(pending);
    this.revisions.set(key, this.getRevision(key) + 1);
    this.removeEntry(key);
    if (pending) {
      this.pending.delete(key);
      this.closeWatchers(pending.watchers);
    }
    if (hasActiveCatalog) {
      this.notifyInvalidated(this.fromCacheKey(key));
    }
  }

  private createWatchers(
    key: string,
    request: ClaudePolicyCatalogRequest
  ): CapabilityCatalogWatcher[] {
    if (isRemoteCatalogRequest(request)) {
      return [];
    }

    return this.dependencies
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
  }

  private closeWatchers(watchers: CapabilityCatalogWatcher[]): void {
    for (const watcher of watchers) {
      watcher.close();
    }
  }

  private fromCacheKey(key: string): ClaudePolicyCatalogRequest {
    const [repoPath, worktreePath] = JSON.parse(key) as [string, string];
    return {
      ...(repoPath ? { repoPath } : {}),
      ...(worktreePath ? { worktreePath } : {}),
    };
  }

  private notifyInvalidated(request: ClaudePolicyCatalogRequest): void {
    for (const listener of this.invalidationListeners) {
      listener(request);
    }
  }
}
