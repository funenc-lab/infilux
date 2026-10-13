/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Repository } from '@/App/constants';
import {
  INITIAL_INACTIVE_REPOSITORY_LIMIT,
  useGroupedRepositoryPagination,
  useProgressiveRepositoryVisibility,
} from '../useProgressiveRepositoryVisibility';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repositories: Repository[] = Array.from({ length: 20 }, (_, index) => ({
  id: `repo-${index}`,
  name: `Repo ${index}`,
  path: `/repo/${index}`,
  lastAccessedAt: index,
}));

type Snapshot = ReturnType<typeof useProgressiveRepositoryVisibility>;
let snapshot: Snapshot | null = null;
type GroupedSnapshot = ReturnType<typeof useGroupedRepositoryPagination>;
let groupedSnapshot: GroupedSnapshot | null = null;

function Harness({
  activePaths = [],
  initialInactiveLimit,
  repositoryList = repositories,
  resetKey = '',
  searchActive = false,
  selectedRepo = '/repo/0',
}: {
  activePaths?: string[];
  initialInactiveLimit?: number;
  repositoryList?: Repository[];
  resetKey?: string;
  searchActive?: boolean;
  selectedRepo?: string | null;
}) {
  snapshot = useProgressiveRepositoryVisibility({
    repositories: repositoryList,
    selectedRepo,
    activeRepositoryPaths: activePaths,
    initialInactiveLimit,
    searchActive,
    resetKey,
  });
  return React.createElement('div');
}

function GroupedHarness({ groupIds, resetKey }: { groupIds: string[]; resetKey: string }) {
  groupedSnapshot = useGroupedRepositoryPagination({ groupIds, resetKey });
  return React.createElement('div');
}

describe('useProgressiveRepositoryVisibility', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    snapshot = null;
    groupedSnapshot = null;
  });

  it('reveals inactive repositories in stable batches while retaining formerly active projects', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { activePaths: ['/repo/1'] }));
    });

    expect(snapshot?.repositories).toHaveLength(INITIAL_INACTIVE_REPOSITORY_LIMIT + 2);
    expect(snapshot?.nextBatchSize).toBe(8);

    await act(async () => {
      snapshot?.showMore();
    });

    expect(snapshot?.repositories).toHaveLength(18);
    expect(snapshot?.hiddenCount).toBe(2);

    await act(async () => {
      root.render(React.createElement(Harness));
    });

    expect(snapshot?.repositories.some((repository) => repository.path === '/repo/1')).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('resets the inactive budget when the visibility scope changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { resetKey: 'all' }));
    });
    await act(async () => {
      snapshot?.showMore();
    });
    expect(snapshot?.repositories).toHaveLength(17);

    await act(async () => {
      root.render(React.createElement(Harness, { resetKey: 'group-a' }));
    });
    expect(snapshot?.repositories).toHaveLength(9);

    await act(async () => {
      root.unmount();
    });
  });

  it('appends new batches without moving previously displayed repositories', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(Harness, { activePaths: ['/repo/1'] }));
      });
      await act(async () => {
        root.render(React.createElement(Harness));
      });
      const previousPaths = snapshot!.repositories.map((repository) => repository.path);

      await act(async () => {
        snapshot!.showMore();
      });

      expect(
        snapshot!.repositories.map((repository) => repository.path).slice(0, previousPaths.length)
      ).toEqual(previousPaths);
      expect(snapshot!.hiddenCount).toBe(2);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('keeps loaded rows in place when a displayed repository is selected and accessed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => snapshot!.showMore());
      const previousPaths = snapshot!.repositories.map((repository) => repository.path);
      const accessedRepositories = repositories.map((repository) =>
        repository.path === '/repo/15' ? { ...repository, lastAccessedAt: 1000 } : repository
      );

      await act(async () => {
        root.render(
          React.createElement(Harness, {
            repositoryList: accessedRepositories,
            selectedRepo: '/repo/15',
          })
        );
      });

      expect(
        snapshot!.repositories.map((repository) => repository.path).slice(0, previousPaths.length)
      ).toEqual(previousPaths);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('retains the loaded budget when an unrelated repository is removed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => snapshot!.showMore());
      const previousPaths = snapshot!.repositories.map((repository) => repository.path);

      await act(async () => {
        root.render(
          React.createElement(Harness, {
            repositoryList: repositories.filter((repository) => repository.path !== '/repo/2'),
          })
        );
      });

      expect(snapshot!.repositories.map((repository) => repository.path)).toEqual(previousPaths);
      expect(snapshot!.hiddenCount).toBe(2);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('does not replace visible inactive rows when a hidden repository becomes more recent', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(Harness)));
      const previousPaths = snapshot!.repositories.map((repository) => repository.path);

      await act(async () => {
        root.render(
          React.createElement(Harness, {
            repositoryList: repositories.map((repository) =>
              repository.path === '/repo/2' ? { ...repository, lastAccessedAt: 1000 } : repository
            ),
          })
        );
      });

      expect(snapshot!.repositories.map((repository) => repository.path)).toEqual(previousPaths);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('honors manual inventory reordering without resetting the loaded budget', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const orderedRepositories = repositories.map((repository) => ({
      ...repository,
      lastAccessedAt: undefined,
    }));

    try {
      await act(async () => {
        root.render(React.createElement(Harness, { repositoryList: orderedRepositories }));
      });
      await act(async () => snapshot!.showMore());
      const reorderedRepositories = [...orderedRepositories];
      const [movedRepository] = reorderedRepositories.splice(15, 1);
      reorderedRepositories.splice(1, 0, movedRepository);

      await act(async () => {
        root.render(React.createElement(Harness, { repositoryList: reorderedRepositories }));
      });

      expect(snapshot!.repositories.map((repository) => repository.path)).toEqual(
        reorderedRepositories.slice(0, 17).map((repository) => repository.path)
      );
      expect(snapshot!.hiddenCount).toBe(3);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('uses a configured initial inactive limit while preserving selected and active projects', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          activePaths: ['/repo/1'],
          initialInactiveLimit: 4,
        })
      );
    });

    expect(snapshot?.repositories).toHaveLength(6);
    expect(snapshot?.hiddenCount).toBe(14);
    expect(snapshot?.nextBatchSize).toBe(8);

    await act(async () => {
      snapshot?.showMore();
    });

    expect(snapshot?.repositories).toHaveLength(14);

    await act(async () => {
      root.unmount();
    });
  });

  it('resets an expanded budget after entering and leaving search', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { resetKey: 'all' }));
    });
    await act(async () => {
      snapshot?.showMore();
    });
    expect(snapshot?.repositories).toHaveLength(17);

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          resetKey: 'search:repo',
          searchActive: true,
        })
      );
    });
    expect(snapshot?.repositories).toHaveLength(20);

    await act(async () => {
      root.render(React.createElement(Harness, { resetKey: 'all' }));
    });
    expect(snapshot?.repositories).toHaveLength(9);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps surviving group budgets when another group is removed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(GroupedHarness, { groupIds: ['alpha', 'beta'], resetKey: 'all' })
      );
    });

    expect(groupedSnapshot?.getPage('alpha', 20)).toMatchObject({
      visibleCount: INITIAL_INACTIVE_REPOSITORY_LIMIT,
      hiddenCount: 12,
    });
    expect(groupedSnapshot?.getPage('beta', 10)).toMatchObject({
      visibleCount: INITIAL_INACTIVE_REPOSITORY_LIMIT,
      hiddenCount: 2,
    });

    await act(async () => {
      groupedSnapshot?.showMore('alpha');
    });

    expect(groupedSnapshot?.getPage('alpha', 20)).toMatchObject({ visibleCount: 16 });
    expect(groupedSnapshot?.getPage('beta', 10)).toMatchObject({ visibleCount: 8 });

    await act(async () => {
      root.render(React.createElement(GroupedHarness, { groupIds: ['alpha'], resetKey: 'all' }));
    });

    expect(groupedSnapshot?.getPage('alpha', 20)).toMatchObject({ visibleCount: 16 });

    await act(async () => {
      root.unmount();
    });
  });

  it('resets group budgets only when the visibility scope changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(GroupedHarness, { groupIds: ['alpha'], resetKey: 'all' }));
      });
      await act(async () => groupedSnapshot!.showMore('alpha'));

      await act(async () => {
        root.render(
          React.createElement(GroupedHarness, { groupIds: ['alpha', 'beta'], resetKey: 'all' })
        );
      });
      expect(groupedSnapshot!.getPage('alpha', 20).visibleCount).toBe(16);
      expect(groupedSnapshot!.getPage('beta', 20).visibleCount).toBe(8);

      await act(async () => {
        root.render(
          React.createElement(GroupedHarness, { groupIds: ['alpha'], resetKey: 'group:alpha' })
        );
      });
      expect(groupedSnapshot!.getPage('alpha', 20).visibleCount).toBe(8);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
