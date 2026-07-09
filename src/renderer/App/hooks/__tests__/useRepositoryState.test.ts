/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository, RepositoryGroup } from '../../constants';
import { STORAGE_KEYS } from '../../storage';
import { useRepositoryState } from '../useRepositoryState';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const GROUPS: RepositoryGroup[] = [
  {
    id: 'group-a',
    name: 'Group A',
    emoji: 'A',
    color: '#111111',
    order: 0,
  },
  {
    id: 'group-b',
    name: 'Group B',
    emoji: 'B',
    color: '#222222',
    order: 1,
  },
];

const REPOSITORIES: Repository[] = [
  {
    id: 'local:repo-a',
    name: 'Repo A',
    path: '/repo/a',
    kind: 'local',
    groupId: 'group-a',
  },
];

type RepositoryStateSnapshot = ReturnType<typeof useRepositoryState>;

let latestSnapshot: RepositoryStateSnapshot | null = null;

function installSessionStorageBridge(sharedSnapshot: Record<string, string> = {}) {
  const sessionStorage = {
    get: vi.fn(async () => ({ localStorage: sharedSnapshot })),
    syncLocalStorage: vi.fn(async (_snapshot: Record<string, string>) => true),
    importLocalStorage: vi.fn(async (_snapshot: Record<string, string>) => true),
    isLegacyLocalStorageMigrated: vi.fn(async () => true),
  };

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      env: {
        platform: 'darwin',
      },
      sessionStorage,
    },
  });

  return sessionStorage;
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  throw lastError;
}

function RepositoryStateHarness() {
  latestSnapshot = useRepositoryState();
  return React.createElement('div');
}

async function mountRepositoryStateHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(RepositoryStateHarness));
  });

  return {
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useRepositoryState', () => {
  beforeEach(() => {
    latestSnapshot = null;
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_GROUPS, JSON.stringify(GROUPS));
    localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(REPOSITORIES));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('moves repositories by path when sidebar actions pass a path instead of the repository id', async () => {
    const mounted = await mountRepositoryStateHarness();

    expect(latestSnapshot?.repositories[0]?.groupId).toBe('group-a');

    await act(async () => {
      latestSnapshot?.handleMoveToGroup('/repo/a', 'group-b');
    });

    const storedRepositories = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.REPOSITORIES) ?? '[]'
    ) as Repository[];

    expect(storedRepositories[0]).toMatchObject({
      id: 'local:repo-a',
      path: '/repo/a',
      groupId: 'group-b',
    });
    expect(latestSnapshot?.repositories[0]?.groupId).toBe('group-b');

    await mounted.unmount();
  });

  it('syncs an explicitly cleared repository list to shared session storage', async () => {
    const sessionStorage = installSessionStorageBridge({
      [STORAGE_KEYS.REPOSITORIES]: JSON.stringify(REPOSITORIES),
      [STORAGE_KEYS.SELECTED_REPO]: '/repo/a',
    });
    const mounted = await mountRepositoryStateHarness();

    await act(async () => {
      latestSnapshot?.saveRepositories([]);
      latestSnapshot?.setSelectedRepo(null);
    });

    await waitForAssertion(() => {
      expect(sessionStorage.syncLocalStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          [STORAGE_KEYS.REPOSITORIES]: '[]',
        })
      );
    });
    const syncedSnapshot = sessionStorage.syncLocalStorage.mock.calls.at(-1)?.[0] ?? {};
    expect(syncedSnapshot).not.toHaveProperty(STORAGE_KEYS.SELECTED_REPO);

    await mounted.unmount();
  });
});
