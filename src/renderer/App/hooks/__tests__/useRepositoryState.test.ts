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
});
