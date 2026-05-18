import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '../../constants';
import { STORAGE_KEYS } from '../../storage';
import { useWorktreeState } from '../useWorktreeState';

function createLocalStorageMock(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

function WorktreeStateProbe({ onActiveTab }: { onActiveTab: (activeTab: TabId) => void }) {
  const { activeTab } = useWorktreeState();
  onActiveTab(activeTab);
  return React.createElement('div');
}

describe('useWorktreeState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts on the persisted non-file worktree tab for the selected repository', () => {
    const onActiveTab = vi.fn();
    vi.stubGlobal(
      'localStorage',
      createLocalStorageMock({
        [STORAGE_KEYS.SELECTED_REPO]: '/repo',
        [STORAGE_KEYS.WORKTREE_TABS]: JSON.stringify({
          '/repo/worktree': 'terminal',
        }),
        [STORAGE_KEYS.ACTIVE_WORKTREES]: JSON.stringify({
          '/repo': '/repo/worktree',
        }),
      })
    );

    renderToStaticMarkup(React.createElement(WorktreeStateProbe, { onActiveTab }));

    expect(onActiveTab).toHaveBeenCalledWith('terminal');
  });

  it('falls back to chat instead of restoring the file tab on startup', () => {
    const onActiveTab = vi.fn();
    vi.stubGlobal(
      'localStorage',
      createLocalStorageMock({
        [STORAGE_KEYS.SELECTED_REPO]: '/repo',
        [STORAGE_KEYS.WORKTREE_TABS]: JSON.stringify({
          '/repo/worktree': 'file',
        }),
        [STORAGE_KEYS.ACTIVE_WORKTREES]: JSON.stringify({
          '/repo': '/repo/worktree',
        }),
      })
    );

    renderToStaticMarkup(React.createElement(WorktreeStateProbe, { onActiveTab }));

    expect(onActiveTab).toHaveBeenCalledWith('chat');
  });
});
