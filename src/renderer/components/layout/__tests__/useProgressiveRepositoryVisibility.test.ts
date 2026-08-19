/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Repository } from '@/App/constants';
import {
  INITIAL_INACTIVE_REPOSITORY_LIMIT,
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

function Harness({
  activePaths = [],
  resetKey = '',
  searchActive = false,
}: {
  activePaths?: string[];
  resetKey?: string;
  searchActive?: boolean;
}) {
  snapshot = useProgressiveRepositoryVisibility({
    repositories,
    selectedRepo: '/repo/0',
    activeRepositoryPaths: activePaths,
    searchActive,
    resetKey,
  });
  return React.createElement('div');
}

describe('useProgressiveRepositoryVisibility', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    snapshot = null;
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
});
