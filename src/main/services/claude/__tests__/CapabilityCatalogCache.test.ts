import type { ClaudeCapabilityCatalog } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClaudeCapabilityCatalogCache,
  type ClaudeCapabilityCatalogCacheDependencies,
} from '../CapabilityCatalogCache';

function createCatalog(generatedAt: number): ClaudeCapabilityCatalog {
  return {
    capabilities: [],
    disabledNativeSkills: [],
    sharedMcpServers: [],
    personalMcpServers: [],
    generatedAt,
  };
}

function createCache(
  dependencies: Partial<ClaudeCapabilityCatalogCacheDependencies> = {}
): ClaudeCapabilityCatalogCache {
  return new ClaudeCapabilityCatalogCache({
    listCatalog: async () => createCatalog(Date.now()),
    getWatchTargets: () => [],
    watchDirectory: () => null,
    ...dependencies,
  });
}

describe('ClaudeCapabilityCatalogCache', () => {
  const caches: ClaudeCapabilityCatalogCache[] = [];

  afterEach(() => {
    for (const cache of caches) {
      cache.dispose();
    }
    caches.length = 0;
  });

  it('reuses a fresh local catalog for repeated reads with the same scope', async () => {
    const listCatalog = vi.fn(async () => createCatalog(1));
    const cache = createCache({ listCatalog });
    caches.push(cache);

    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });

    expect(listCatalog).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent local catalog reads for the same scope', async () => {
    let resolveCatalog: ((catalog: ClaudeCapabilityCatalog) => void) | undefined;
    const listCatalog = vi.fn(
      () =>
        new Promise<ClaudeCapabilityCatalog>((resolve) => {
          resolveCatalog = resolve;
        })
    );
    const cache = createCache({ listCatalog });
    caches.push(cache);

    const firstRead = cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    const secondRead = cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    resolveCatalog?.(createCatalog(1));

    await expect(Promise.all([firstRead, secondRead])).resolves.toEqual([
      createCatalog(1),
      createCatalog(1),
    ]);
    expect(listCatalog).toHaveBeenCalledTimes(1);
  });

  it('invalidates a scoped catalog when a watched source changes', async () => {
    const listCatalog = vi
      .fn<() => Promise<ClaudeCapabilityCatalog>>()
      .mockResolvedValueOnce(createCatalog(1))
      .mockResolvedValueOnce(createCatalog(2));
    let notifyChange: (() => void) | undefined;
    const close = vi.fn();
    const cache = createCache({
      listCatalog,
      getWatchTargets: () => [{ directoryPath: '/catalog-root' }],
      watchDirectory: (_target, onChange) => {
        notifyChange = onChange;
        return { close };
      },
    });
    caches.push(cache);

    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    notifyChange?.();
    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });

    expect(listCatalog).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('notifies listeners when a nested skill file invalidates a cached workspace catalog', async () => {
    let notifyChange: ((fileName?: string | null) => void) | undefined;
    const onInvalidated = vi.fn();
    const cache = createCache({
      getWatchTargets: () => [{ directoryPath: '/repo/.agents/skills', recursive: true }],
      watchDirectory: (_target, onChange) => {
        notifyChange = onChange;
        return { close: vi.fn() };
      },
    });
    caches.push(cache);

    cache.onInvalidated(onInvalidated);
    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    notifyChange?.('new-skill/SKILL.md');

    expect(onInvalidated).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktree',
    });
  });

  it('starts watching before discovery so a new skill cannot be retained by an in-flight scan', async () => {
    let notifyChange: ((fileName?: string | null) => void) | undefined;
    const listCatalog = vi
      .fn<() => Promise<ClaudeCapabilityCatalog>>()
      .mockImplementationOnce(async () => {
        notifyChange?.('new-skill/SKILL.md');
        return createCatalog(1);
      })
      .mockResolvedValueOnce(createCatalog(2));
    const cache = createCache({
      listCatalog,
      getWatchTargets: () => [{ directoryPath: '/repo/.agents/skills', recursive: true }],
      watchDirectory: (_target, onChange) => {
        notifyChange = onChange;
        return { close: vi.fn() };
      },
    });
    caches.push(cache);
    const request = { repoPath: '/repo', worktreePath: '/repo/worktree' };

    await cache.getCatalog(request);
    await expect(cache.getCatalog(request)).resolves.toEqual(createCatalog(2));

    expect(listCatalog).toHaveBeenCalledTimes(2);
  });

  it('refreshes a catalog when an explicit workspace mutation invalidates its scope', async () => {
    const listCatalog = vi
      .fn<() => Promise<ClaudeCapabilityCatalog>>()
      .mockResolvedValueOnce(createCatalog(1))
      .mockResolvedValueOnce(createCatalog(2));
    const cache = createCache({ listCatalog });
    caches.push(cache);

    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });
    cache.invalidateWorkspace('/repo/worktree');
    await cache.getCatalog({ repoPath: '/repo', worktreePath: '/repo/worktree' });

    expect(listCatalog).toHaveBeenCalledTimes(2);
  });

  it('does not reuse an in-flight catalog after its workspace is invalidated', async () => {
    const resolvers: Array<(catalog: ClaudeCapabilityCatalog) => void> = [];
    const listCatalog = vi.fn(
      () =>
        new Promise<ClaudeCapabilityCatalog>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const cache = createCache({ listCatalog });
    caches.push(cache);
    const request = { repoPath: '/repo', worktreePath: '/repo/worktree' };

    const staleRead = cache.getCatalog(request);
    cache.invalidateWorkspace(request.worktreePath);
    const refreshedRead = cache.getCatalog(request);
    resolvers[0]?.(createCatalog(1));
    resolvers[1]?.(createCatalog(2));

    await expect(staleRead).resolves.toEqual(createCatalog(1));
    await expect(refreshedRead).resolves.toEqual(createCatalog(2));
    await expect(cache.getCatalog(request)).resolves.toEqual(createCatalog(2));
    expect(listCatalog).toHaveBeenCalledTimes(2);
  });

  it('does not retain a catalog when disposal happens during an in-flight read', async () => {
    let resolveCatalog: ((catalog: ClaudeCapabilityCatalog) => void) | undefined;
    const listCatalog = vi
      .fn<() => Promise<ClaudeCapabilityCatalog>>()
      .mockImplementationOnce(
        () =>
          new Promise<ClaudeCapabilityCatalog>((resolve) => {
            resolveCatalog = resolve;
          })
      )
      .mockResolvedValueOnce(createCatalog(2));
    const close = vi.fn();
    const watchDirectory = vi.fn(() => ({ close }));
    const cache = createCache({
      listCatalog,
      getWatchTargets: () => [{ directoryPath: '/catalog-root' }],
      watchDirectory,
    });
    caches.push(cache);
    const request = { repoPath: '/repo', worktreePath: '/repo/worktree' };

    const inFlightRead = cache.getCatalog(request);
    cache.dispose();
    resolveCatalog?.(createCatalog(1));
    await expect(inFlightRead).resolves.toEqual(createCatalog(1));

    await expect(cache.getCatalog(request)).resolves.toEqual(createCatalog(2));
    expect(listCatalog).toHaveBeenCalledTimes(2);
    expect(watchDirectory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reuses a fresh remote catalog without creating local filesystem watchers', async () => {
    const listCatalog = vi.fn(async () => createCatalog(1));
    const watchDirectory = vi.fn(() => ({ close: vi.fn() }));
    const cache = createCache({ listCatalog, watchDirectory });
    caches.push(cache);
    const repoPath = toRemoteVirtualPath('connection-1', '/srv/repo');

    await cache.getCatalog({ repoPath, worktreePath: repoPath });
    await cache.getCatalog({ repoPath, worktreePath: repoPath });

    expect(listCatalog).toHaveBeenCalledTimes(1);
    expect(watchDirectory).not.toHaveBeenCalled();
  });

  it('refreshes a remote catalog after explicit invalidation', async () => {
    const listCatalog = vi
      .fn<() => Promise<ClaudeCapabilityCatalog>>()
      .mockResolvedValueOnce(createCatalog(1))
      .mockResolvedValueOnce(createCatalog(2));
    const cache = createCache({ listCatalog });
    caches.push(cache);
    const repoPath = toRemoteVirtualPath('connection-1', '/srv/repo');

    await cache.getCatalog({ repoPath, worktreePath: repoPath });
    cache.invalidateWorkspace(repoPath);

    await expect(cache.getCatalog({ repoPath, worktreePath: repoPath })).resolves.toEqual(
      createCatalog(2)
    );
    expect(listCatalog).toHaveBeenCalledTimes(2);
  });
});
