import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GROUP_ID, DEFAULT_GROUP_COLOR, DEFAULT_TAB_ORDER } from '../constants';

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    get length() {
      return data.size;
    },
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

async function loadStorageModule(options?: {
  platform?: string;
  initialStorage?: Record<string, string>;
}) {
  vi.resetModules();

  const localStorageMock = createLocalStorageMock(options?.initialStorage);
  vi.stubGlobal('localStorage', localStorageMock);

  if (options?.platform) {
    vi.stubGlobal('navigator', { platform: options.platform });
  }

  const module = await import('../storage');
  return {
    ...module,
    localStorageMock,
  };
}

describe('storage helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads numeric, boolean, tab, and worktree values from storage with safe fallbacks', async () => {
    const env = await loadStorageModule({
      initialStorage: {
        'custom-number': '12',
        'custom-bool-true': 'true',
        'custom-bool-false': 'false',
        [envKey('WORKTREE_TABS')]: JSON.stringify({
          '/repo/current': 'file',
        }),
        [envKey('ACTIVE_WORKTREES')]: JSON.stringify({
          '/repo': '/repo/worktrees/current',
        }),
        [envKey('WORKTREE_ORDER')]: JSON.stringify({
          '/repo': {
            '/repo/worktrees/current': 2,
          },
        }),
        [envKey('TAB_ORDER')]: JSON.stringify(['terminal', 'chat', 'terminal', 'invalid', 'todo']),
      },
      platform: 'MacIntel',
    });

    expect(env.getStoredNumber('custom-number', 0)).toBe(12);
    expect(env.getStoredNumber('missing-number', 7)).toBe(7);
    expect(env.getStoredBoolean('custom-bool-true', false)).toBe(true);
    expect(env.getStoredBoolean('custom-bool-false', true)).toBe(false);
    expect(env.getStoredBoolean('missing-bool', true)).toBe(true);
    expect(env.getStoredTabMap()).toEqual({
      '/repo/current': 'file',
    });
    expect(env.getStoredWorktreeMap()).toEqual({
      '/repo': '/repo/worktrees/current',
    });
    expect(env.getStoredWorktreeOrderMap()).toEqual({
      '/repo': {
        '/repo/worktrees/current': 2,
      },
    });
    expect(env.getStoredTabOrder()).toEqual(['terminal', 'chat', 'todo', 'file', 'source-control']);

    env.saveWorktreeOrderMap({
      '/repo': {
        '/repo/worktrees/next': 1,
      },
    });
    env.saveTabOrder(['todo', 'chat', 'todo', 'settings', 'terminal']);

    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.WORKTREE_ORDER,
      JSON.stringify({
        '/repo': {
          '/repo/worktrees/next': 1,
        },
      })
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.TAB_ORDER,
      JSON.stringify(['todo', 'chat', 'terminal', 'file', 'source-control'])
    );
  });

  it('falls back safely when stored JSON is invalid or malformed', async () => {
    const env = await loadStorageModule({
      initialStorage: {
        [envKey('WORKTREE_TABS')]: '{invalid',
        [envKey('ACTIVE_WORKTREES')]: '{invalid',
        [envKey('WORKTREE_ORDER')]: '{invalid',
        [envKey('TAB_ORDER')]: '{invalid',
        [envKey('REPOSITORY_SETTINGS')]: '{invalid',
        [envKey('REPOSITORY_GROUPS')]: '{invalid',
        [envKey('GROUP_COLLAPSED_STATE')]: '{invalid',
        [`${envKey('FILE_TREE_EXPANDED_PREFIX')}:/repo/current`]: '{invalid',
      },
    });

    expect(env.getStoredTabMap()).toEqual({});
    expect(env.getStoredWorktreeMap()).toEqual({});
    expect(env.getStoredWorktreeOrderMap()).toEqual({});
    expect(env.getStoredTabOrder()).toEqual([...DEFAULT_TAB_ORDER]);
    expect(env.getStoredRepositorySettings()).toEqual({});
    expect(env.getStoredGroups()).toEqual([]);
    expect(env.getStoredGroupCollapsedState()).toEqual({});
    expect(env.loadFileTreeExpandedPaths('/repo/current')).toEqual(new Set());
  });

  it('normalizes paths, workspace keys, and repository ids using platform rules', async () => {
    const macEnv = await loadStorageModule({ platform: 'MacIntel' });
    expect(macEnv.normalizePath('/Repo/Main///')).toBe('/repo/main');
    expect(macEnv.normalizePath('/private/var/folders/demo/worktree/')).toBe(
      '/var/folders/demo/worktree'
    );
    expect(macEnv.cleanPath('/Repo/Main///')).toBe('/Repo/Main');
    expect(macEnv.normalizeWorkspacePathKey('/Repo/Main///')).toBe('/repo/main');
    expect(macEnv.pathsEqual('/Repo/Main/', '/repo/main')).toBe(true);
    expect(
      macEnv.pathsEqual('/private/var/folders/demo/worktree', '/var/folders/demo/worktree')
    ).toBe(true);
    expect(
      macEnv.ensureRepositoryId({
        path: '/Repo/Main',
        kind: 'local',
      }).id
    ).toBe('local:/repo/main');
    expect(
      macEnv.ensureRepositoryId({
        id: 'existing-id',
        path: '/Repo/Main',
      }).id
    ).toBe('existing-id');

    const windowsEnv = await loadStorageModule({ platform: 'Win32' });
    expect(windowsEnv.normalizePath('C:\\Repo\\Main\\\\')).toBe('c:\\repo\\main');
    expect(windowsEnv.normalizeWorkspacePathKey('C:\\Repo\\Main\\\\')).toBe('c:/repo/main');
    expect(
      windowsEnv.ensureRepositoryId({
        path: 'C:\\Repo\\Main',
        kind: 'remote',
        connectionId: 'conn-1',
      }).id
    ).toBe('remote:conn-1:c:/repo/main');

    const linuxEnv = await loadStorageModule({ platform: 'Linux x86_64' });
    expect(linuxEnv.normalizePath('/Repo/Main///')).toBe('/Repo/Main');
    expect(linuxEnv.pathsEqual('/Repo/Main', '/repo/main')).toBe(false);
    expect(linuxEnv.normalizeWorkspacePathKey('/Repo/Main///')).toBe('/Repo/Main');
    expect(linuxEnv.normalizeWorkspacePathKey('/Repo/Main///', 'win32')).toBe('/repo/main');
  });

  it('reads and persists repository settings and repository groups', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        [envKey('REPOSITORY_SETTINGS')]: JSON.stringify({
          '/repo/current': {
            autoInitWorktree: true,
            initScript: 'echo ready',
            hidden: true,
          },
        }),
        [envKey('REPOSITORY_GROUPS')]: JSON.stringify([
          {
            id: 'group-1',
            name: 'Alpha',
            emoji: '🚀',
            color: '#FF00AA',
            order: '2',
          },
          {
            id: 'group-2',
            name: 'Beta',
            emoji: 3,
            color: 'invalid',
            order: 'not-a-number',
          },
          {
            id: '',
            name: 'Missing',
          },
        ]),
      },
    });

    expect(env.getStoredRepositorySettings()).toEqual({
      '/repo/current': {
        autoInitWorktree: true,
        initScript: 'echo ready',
        hidden: true,
      },
    });
    expect(env.getRepositorySettings('/Repo/Current')).toEqual({
      autoInitWorktree: true,
      initScript: 'echo ready',
      hidden: true,
    });
    expect(env.getRepositorySettings('/Repo/Unknown')).toBe(env.DEFAULT_REPOSITORY_SETTINGS);

    expect(env.getStoredGroups()).toEqual([
      {
        id: 'group-1',
        name: 'Alpha',
        emoji: '🚀',
        order: 2,
        color: '#ff00aa',
      },
      {
        id: 'group-2',
        name: 'Beta',
        emoji: '',
        order: 1,
        color: DEFAULT_GROUP_COLOR,
      },
    ]);

    env.saveRepositorySettings('/Repo/New', {
      autoInitWorktree: true,
      initScript: 'pnpm install',
      hidden: false,
    });
    env.saveGroups([
      {
        id: 'group-3',
        name: 'Gamma',
        emoji: '🧪',
        order: 5,
        color: '#abcdef',
      },
    ]);
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.REPOSITORY_SETTINGS,
      JSON.stringify({
        '/repo/current': {
          autoInitWorktree: true,
          initScript: 'echo ready',
          hidden: true,
        },
        '/repo/new': {
          autoInitWorktree: true,
          initScript: 'pnpm install',
          hidden: false,
        },
      })
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.REPOSITORY_GROUPS,
      JSON.stringify([
        {
          id: 'group-3',
          name: 'Gamma',
          emoji: '🧪',
          order: 5,
          color: '#abcdef',
        },
      ])
    );
  });

  it('migrates group defaults and persists active and collapsed group state', async () => {
    const env = await loadStorageModule();

    expect(env.getActiveGroupId()).toBe(ALL_GROUP_ID);

    env.migrateRepositoryGroups();
    env.saveActiveGroupId('group-9');
    env.saveGroupCollapsedState({ 'group-9': true });

    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.REPOSITORY_GROUPS,
      JSON.stringify([])
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.ACTIVE_GROUP,
      ALL_GROUP_ID
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.ACTIVE_GROUP,
      'group-9'
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.GROUP_COLLAPSED_STATE,
      JSON.stringify({ 'group-9': true })
    );

    const persistedEnv = await loadStorageModule({
      initialStorage: {
        [envKey('ACTIVE_GROUP')]: 'group-9',
        [envKey('GROUP_COLLAPSED_STATE')]: JSON.stringify({ 'group-9': true }),
      },
    });
    expect(persistedEnv.getActiveGroupId()).toBe('group-9');
    expect(persistedEnv.getStoredGroupCollapsedState()).toEqual({ 'group-9': true });
  });

  it('loads and saves tree sidebar expanded repositories and temp workspace section state', async () => {
    const env = await loadStorageModule({
      initialStorage: {
        [envKey('TREE_SIDEBAR_EXPANDED_REPOS')]: JSON.stringify(['/Repo/A', '/Repo/B/']),
        [envKey('TREE_SIDEBAR_TEMP_EXPANDED')]: 'false',
      },
      platform: 'MacIntel',
    });

    expect(env.getStoredTreeSidebarExpandedRepos()).toEqual(['/repo/a', '/repo/b']);
    expect(env.getStoredTreeSidebarTempExpanded()).toBe(false);

    env.saveTreeSidebarExpandedRepos(['/Repo/C/', '/Repo/D']);
    env.saveTreeSidebarTempExpanded(true);

    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.TREE_SIDEBAR_EXPANDED_REPOS,
      JSON.stringify(['/repo/c', '/repo/d'])
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.TREE_SIDEBAR_TEMP_EXPANDED,
      'true'
    );
  });

  it('loads and saves file tree expanded paths while tolerating storage failures', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        [`${envKey('FILE_TREE_EXPANDED_PREFIX')}:/repo/root`]: JSON.stringify([
          '/repo/root/src',
          '/repo/root/test',
        ]),
      },
    });

    expect(env.loadFileTreeExpandedPaths('/Repo/Root')).toEqual(
      new Set(['/repo/root/src', '/repo/root/test'])
    );

    env.saveFileTreeExpandedPaths('/Repo/Root', new Set(['/repo/root/docs']));
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      `${env.STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX}:/repo/root`,
      JSON.stringify(['/repo/root/docs'])
    );

    env.localStorageMock.setItem.mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() =>
      env.saveFileTreeExpandedPaths('/Repo/Root', new Set(['/repo/root/ignored']))
    ).not.toThrow();
  });

  it('imports the legacy sidebar-related localStorage snapshot with an allowlist', async () => {
    const env = await loadStorageModule({
      initialStorage: {
        'custom-unrelated': 'keep-me',
      },
    });

    const appliedKeys = env.applyImportedLegacyLocalStorageSnapshot({
      [envKey('REPOSITORIES')]:
        '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo","kind":"local"}]',
      [envKey('SELECTED_REPO')]: '/repo/demo',
      [`${envKey('FILE_TREE_EXPANDED_PREFIX')}:/repo/demo`]: '["/repo/demo/src"]',
      'custom-unrelated': 'ignore-me',
    });

    expect(appliedKeys).toEqual([
      env.STORAGE_KEYS.REPOSITORIES,
      env.STORAGE_KEYS.SELECTED_REPO,
      `${env.STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX}:/repo/demo`,
    ]);
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.REPOSITORIES,
      '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo","kind":"local"}]'
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.SELECTED_REPO,
      '/repo/demo'
    );
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      `${env.STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX}:/repo/demo`,
      '["/repo/demo/src"]'
    );
    expect(env.localStorageMock.setItem).not.toHaveBeenCalledWith('custom-unrelated', 'ignore-me');
  });

  it('builds and compares managed localStorage snapshots consistently', async () => {
    const env = await loadStorageModule({
      initialStorage: {
        [envKey('REPOSITORIES')]:
          '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo","kind":"local"}]',
        [envKey('SELECTED_REPO')]: '/repo/demo',
        [`${envKey('FILE_TREE_EXPANDED_PREFIX')}:/repo/demo`]: '["/repo/demo/src"]',
        'custom-unrelated': 'ignore-me',
      },
    });

    expect(env.getManagedLocalStorageSnapshot()).toEqual({
      [env.STORAGE_KEYS.REPOSITORIES]:
        '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo","kind":"local"}]',
      [env.STORAGE_KEYS.SELECTED_REPO]: '/repo/demo',
      [`${env.STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX}:/repo/demo`]: '["/repo/demo/src"]',
    });

    expect(
      env.hasManagedLocalStorageDifferences(
        {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
        },
        {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/next"}]',
        }
      )
    ).toBe(true);
    expect(
      env.hasManagedLocalStorageDifferences(
        {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
          'custom-unrelated': 'ignore-me',
        },
        {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
        }
      )
    ).toBe(false);
    expect(
      env.hasManagedRepositoryState({
        [env.STORAGE_KEYS.WORKTREE_TABS]: '{}',
      })
    ).toBe(false);
    expect(
      env.hasManagedRepositoryState({
        [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
      })
    ).toBe(true);
    expect(
      env.shouldHydrateManagedLocalStorageFromSharedSnapshot({
        currentSnapshot: {
          [env.STORAGE_KEYS.WORKTREE_TABS]: '{}',
        },
        sharedSnapshot: {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
          [env.STORAGE_KEYS.SELECTED_REPO]: '/repo/demo',
        },
        legacyLocalStorageMigrated: false,
      })
    ).toBe(true);
    expect(
      env.shouldSyncManagedLocalStorageToSharedSession({
        currentSnapshot: {
          [env.STORAGE_KEYS.WORKTREE_TABS]: '{}',
        },
        sharedSnapshot: {
          [env.STORAGE_KEYS.REPOSITORIES]: '[{"path":"/repo/demo"}]',
        },
      })
    ).toBe(false);
  });
});

function envKey(key: keyof typeof import('../storage').STORAGE_KEYS): string {
  const keyMap: Record<keyof typeof import('../storage').STORAGE_KEYS, string> = {
    REPOSITORIES: 'enso-repositories',
    SELECTED_REPO: 'enso-selected-repo',
    REMOTE_PROFILES: 'enso-remote-profiles',
    ACTIVE_WORKTREE: 'enso-active-worktree',
    ACTIVE_WORKTREES: 'enso-active-worktrees',
    WORKTREE_TABS: 'enso-worktree-tabs',
    WORKTREE_ORDER: 'enso-worktree-order',
    TAB_ORDER: 'enso-tab-order',
    REPOSITORY_WIDTH: 'enso-repository-width',
    WORKTREE_WIDTH: 'enso-worktree-width',
    FILE_SIDEBAR_WIDTH: 'enso-file-sidebar-width',
    TREE_SIDEBAR_WIDTH: 'enso-tree-sidebar-width',
    REPOSITORY_COLLAPSED: 'enso-repository-collapsed',
    WORKTREE_COLLAPSED: 'enso-worktree-collapsed',
    FILE_SIDEBAR_COLLAPSED: 'enso-file-sidebar-collapsed',
    REPOSITORY_SETTINGS: 'enso-repository-settings',
    REPOSITORY_GROUPS: 'enso-repository-groups',
    ACTIVE_GROUP: 'enso-active-group',
    GROUP_COLLAPSED_STATE: 'enso-group-collapsed-state',
    TREE_SIDEBAR_EXPANDED_REPOS: 'enso-tree-sidebar-expanded-repos',
    TREE_SIDEBAR_TEMP_EXPANDED: 'enso-tree-sidebar-temp-expanded',
    TODO_BOARDS: 'enso-todo-boards',
    FILE_TREE_EXPANDED_PREFIX: 'enso-file-tree-expanded',
    SC_REPO_LIST_EXPANDED: 'enso-sc-repo-list-expanded',
    SC_CHANGES_EXPANDED: 'enso-sc-changes-expanded',
    SC_HISTORY_EXPANDED: 'enso-sc-history-expanded',
  };
  return keyMap[key];
}
