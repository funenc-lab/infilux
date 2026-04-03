import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sharedSessionStateTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const mkdirSync = vi.fn();
  const readFileSync = vi.fn<(path: string, encoding?: BufferEncoding) => string | Buffer>(
    (_path: string, encoding?: BufferEncoding) => {
      if (encoding === 'utf-8') {
        return '{}';
      }
      return Buffer.from('file');
    }
  );
  const renameSync = vi.fn();
  const writeFileSync = vi.fn();
  const appGetPath = vi.fn((name: string) => `/electron/${name}`);

  function reset() {
    existsSync.mockReset();
    mkdirSync.mockReset();
    readFileSync.mockReset();
    renameSync.mockReset();
    writeFileSync.mockReset();
    appGetPath.mockReset();

    existsSync.mockReturnValue(false);
    readFileSync.mockImplementation((_path: string, encoding?: BufferEncoding) => {
      if (encoding === 'utf-8') {
        return '{}';
      }
      return Buffer.from('file');
    });
    appGetPath.mockImplementation((name: string) => `/electron/${name}`);
  }

  return {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
    appGetPath,
    reset,
  };
});

vi.mock('node:fs', () => ({
  existsSync: sharedSessionStateTestDoubles.existsSync,
  mkdirSync: sharedSessionStateTestDoubles.mkdirSync,
  readFileSync: sharedSessionStateTestDoubles.readFileSync,
  renameSync: sharedSessionStateTestDoubles.renameSync,
  writeFileSync: sharedSessionStateTestDoubles.writeFileSync,
}));

vi.mock('electron', () => ({
  app: {
    getPath: sharedSessionStateTestDoubles.appGetPath,
  },
}));

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalRuntimeChannel = process.env.INFILUX_RUNTIME_CHANNEL;
const originalProfile = process.env.ENSOAI_PROFILE;

describe('SharedSessionState', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sharedSessionStateTestDoubles.reset();
    process.env.HOME = '/Users/tester';
    delete process.env.USERPROFILE;
    delete process.env.INFILUX_RUNTIME_CHANNEL;
    delete process.env.ENSOAI_PROFILE;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    if (originalRuntimeChannel === undefined) {
      delete process.env.INFILUX_RUNTIME_CHANNEL;
    } else {
      process.env.INFILUX_RUNTIME_CHANNEL = originalRuntimeChannel;
    }
    if (originalProfile === undefined) {
      delete process.env.ENSOAI_PROFILE;
    } else {
      process.env.ENSOAI_PROFILE = originalProfile;
    }
    vi.restoreAllMocks();
  });

  it('reads, caches, and updates shared settings and session state', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const sharedRoot = '/Users/tester/.infilux';
    const settingsPath = `${sharedRoot}/settings.json`;
    const sessionPath = `${sharedRoot}/session-state.json`;

    sharedSessionStateTestDoubles.existsSync.mockImplementation(
      (target: string) => target === sessionPath
    );
    sharedSessionStateTestDoubles.readFileSync.mockImplementation(
      (target: string, encoding?: BufferEncoding) => {
        if (target === sessionPath && encoding === 'utf-8') {
          return JSON.stringify({
            version: 2,
            updatedAt: 42,
            settingsData: { theme: 'dark' },
            localStorage: 'invalid',
            persistentAgentSessions: [
              {
                uiSessionId: 'session-1',
                backendSessionId: 'backend-1',
                providerSessionId: 'provider-1',
                agentId: 'claude',
                agentCommand: 'claude',
                environment: 'native',
                repoPath: '/repo',
                cwd: '/repo/worktree',
                displayName: 'Claude',
                activated: true,
                initialized: true,
                hostKind: 'tmux',
                hostSessionKey: 'enso-session-1',
                recoveryPolicy: 'auto',
                createdAt: 10,
                updatedAt: 11,
                lastKnownState: 'live',
              },
              {
                uiSessionId: '',
                agentId: 'invalid',
              },
            ],
            todos: {
              '/repo': [
                { id: 'todo-2', title: 'Second', status: 'done', order: 2 },
                { id: 'todo-1', title: 'First', status: 'done', order: 1 },
                { id: 'todo-3', title: 'Third', status: 'todo', order: 3 },
              ],
            },
          });
        }
        if (encoding === 'utf-8') {
          return '{}';
        }
        return Buffer.from('file');
      }
    );

    const sharedState = await import('../SharedSessionState');

    expect(sharedState.readSharedSettings()).toEqual({});

    sharedState.writeSharedSettings({ theme: 'light' });
    expect(sharedSessionStateTestDoubles.mkdirSync).toHaveBeenCalledWith(sharedRoot, {
      recursive: true,
    });
    expect(sharedSessionStateTestDoubles.writeFileSync).toHaveBeenCalledWith(
      `${settingsPath}.tmp`,
      JSON.stringify({ theme: 'light' }, null, 2),
      'utf-8'
    );
    expect(sharedSessionStateTestDoubles.renameSync).toHaveBeenCalledWith(
      `${settingsPath}.tmp`,
      settingsPath
    );

    sharedSessionStateTestDoubles.readFileSync.mockClear();
    expect(sharedState.readSharedSettings()).toEqual({ theme: 'light' });
    expect(sharedSessionStateTestDoubles.readFileSync).not.toHaveBeenCalled();

    sharedState.clearSharedStateCache();

    expect(sharedState.readSharedSessionState()).toEqual({
      version: 2,
      updatedAt: 42,
      settingsData: { theme: 'dark' },
      localStorage: {},
      persistentAgentSessions: [
        {
          uiSessionId: 'session-1',
          backendSessionId: 'backend-1',
          providerSessionId: 'provider-1',
          agentId: 'claude',
          agentCommand: 'claude',
          environment: 'native',
          repoPath: '/repo',
          cwd: '/repo/worktree',
          displayName: 'Claude',
          activated: true,
          initialized: true,
          hostKind: 'tmux',
          hostSessionKey: 'enso-session-1',
          recoveryPolicy: 'auto',
          createdAt: 10,
          updatedAt: 11,
          lastKnownState: 'live',
        },
      ],
      todos: {
        '/repo': [
          { id: 'todo-2', title: 'Second', status: 'done', order: 2 },
          { id: 'todo-1', title: 'First', status: 'done', order: 1 },
          { id: 'todo-3', title: 'Third', status: 'todo', order: 3 },
        ],
      },
    });

    expect(sharedState.readSharedTodoTasks('/repo').map((task) => task.id)).toEqual([
      'todo-1',
      'todo-2',
      'todo-3',
    ]);

    sharedState.writeSharedLocalStorageSnapshot({ sidebar: 'collapsed' });
    expect(sharedState.getSharedLocalStorageSnapshot()).toEqual({ sidebar: 'collapsed' });

    expect(sharedState.readPersistentAgentSessions()).toEqual([
      {
        uiSessionId: 'session-1',
        backendSessionId: 'backend-1',
        providerSessionId: 'provider-1',
        agentId: 'claude',
        agentCommand: 'claude',
        environment: 'native',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        displayName: 'Claude',
        activated: true,
        initialized: true,
        hostKind: 'tmux',
        hostSessionKey: 'enso-session-1',
        recoveryPolicy: 'auto',
        createdAt: 10,
        updatedAt: 11,
        lastKnownState: 'live',
      },
    ]);

    sharedState.writePersistentAgentSessions([
      {
        uiSessionId: 'session-2',
        agentId: 'codex',
        agentCommand: 'codex',
        environment: 'native',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        displayName: 'Codex',
        activated: true,
        initialized: false,
        hostKind: 'tmux',
        hostSessionKey: 'enso-session-2',
        recoveryPolicy: 'auto',
        createdAt: 20,
        updatedAt: 21,
        lastKnownState: 'reconnecting',
      },
    ]);
    expect(sharedState.readPersistentAgentSessions()).toEqual([
      {
        uiSessionId: 'session-2',
        agentId: 'codex',
        agentCommand: 'codex',
        environment: 'native',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        displayName: 'Codex',
        activated: true,
        initialized: false,
        hostKind: 'tmux',
        hostSessionKey: 'enso-session-2',
        recoveryPolicy: 'auto',
        createdAt: 20,
        updatedAt: 21,
        lastKnownState: 'reconnecting',
      },
    ]);

    sharedState.writeSharedSettingsToSession({ theme: 'blue' });
    expect(sharedState.readSharedSettingsFromSession()).toEqual({ theme: 'blue' });

    const updated = sharedState.updateSharedSessionState((current) => ({
      ...current,
      todos: {
        ...current.todos,
        '/next': [],
      },
      persistentAgentSessions: current.persistentAgentSessions.concat({
        uiSessionId: 'session-3',
        agentId: 'cursor',
        agentCommand: 'cursor-agent',
        environment: 'native',
        repoPath: '/repo',
        cwd: '/repo/other',
        displayName: 'Cursor',
        activated: false,
        initialized: false,
        hostKind: 'tmux',
        hostSessionKey: 'enso-session-3',
        recoveryPolicy: 'manual',
        createdAt: 30,
        updatedAt: 31,
        lastKnownState: 'dead',
      }),
    }));
    expect(updated.todos['/next']).toEqual([]);
    expect(updated.persistentAgentSessions).toHaveLength(2);
    expect(sharedSessionStateTestDoubles.renameSync).toHaveBeenCalledWith(
      `${sessionPath}.tmp`,
      sessionPath
    );

    nowSpy.mockRestore();
  });

  it('falls back to defaults, exposes state paths, and manages migration markers', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_123);
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    sharedSessionStateTestDoubles.appGetPath.mockReturnValue('/fallback/home');
    sharedSessionStateTestDoubles.existsSync.mockImplementation(
      (target: string) =>
        target.endsWith('.local-settings-migrated') ||
        target.endsWith('.local-localstorage-migrated')
    );

    const sharedState = await import('../SharedSessionState');

    expect(sharedState.readSharedSessionState()).toEqual({
      version: 2,
      updatedAt: 1_700_000_000_123,
      settingsData: {},
      localStorage: {},
      persistentAgentSessions: [],
      todos: {},
    });

    expect(sharedState.getSharedStatePaths()).toEqual({
      root: '/fallback/home/.infilux',
      settingsPath: '/fallback/home/.infilux/settings.json',
      sessionPath: '/fallback/home/.infilux/session-state.json',
      settingsMarkerPath: '/fallback/home/.infilux/.local-settings-migrated',
      todoMarkerPath: '/fallback/home/.infilux/.local-todo-migrated',
      localStorageMarkerPath: '/fallback/home/.infilux/.local-localstorage-migrated',
    });

    expect(sharedState.isLegacySettingsMigrated()).toBe(true);
    expect(sharedState.isLegacyTodoMigrated()).toBe(false);
    expect(sharedState.isLegacyLocalStorageMigrated()).toBe(true);

    sharedState.markLegacySettingsMigrated();
    sharedState.markLegacyTodoMigrated();
    sharedState.markLegacyLocalStorageMigrated();

    expect(sharedSessionStateTestDoubles.mkdirSync).toHaveBeenCalledWith(
      '/fallback/home/.infilux',
      {
        recursive: true,
      }
    );
    expect(sharedSessionStateTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/fallback/home/.infilux/.local-settings-migrated',
      '1700000000123',
      'utf-8'
    );
    expect(sharedSessionStateTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/fallback/home/.infilux/.local-todo-migrated',
      '1700000000123',
      'utf-8'
    );
    expect(sharedSessionStateTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/fallback/home/.infilux/.local-localstorage-migrated',
      '1700000000123',
      'utf-8'
    );

    nowSpy.mockRestore();
  });

  it('isolates shared state roots for development profiles', async () => {
    process.env.INFILUX_RUNTIME_CHANNEL = 'dev';
    process.env.ENSOAI_PROFILE = 'feature branch';

    const sharedState = await import('../SharedSessionState');

    expect(sharedState.getSharedStatePaths()).toEqual({
      root: '/Users/tester/.infilux-dev/feature-branch',
      settingsPath: '/Users/tester/.infilux-dev/feature-branch/settings.json',
      sessionPath: '/Users/tester/.infilux-dev/feature-branch/session-state.json',
      settingsMarkerPath: '/Users/tester/.infilux-dev/feature-branch/.local-settings-migrated',
      todoMarkerPath: '/Users/tester/.infilux-dev/feature-branch/.local-todo-migrated',
      localStorageMarkerPath:
        '/Users/tester/.infilux-dev/feature-branch/.local-localstorage-migrated',
    });
  });

  it('falls back to the default development profile when the sanitized profile is empty', async () => {
    process.env.INFILUX_RUNTIME_CHANNEL = 'dev';
    process.env.ENSOAI_PROFILE = ' !!! ';

    const sharedState = await import('../SharedSessionState');

    expect(sharedState.getSharedStatePaths()).toEqual({
      root: '/Users/tester/.infilux-dev/dev',
      settingsPath: '/Users/tester/.infilux-dev/dev/settings.json',
      sessionPath: '/Users/tester/.infilux-dev/dev/session-state.json',
      settingsMarkerPath: '/Users/tester/.infilux-dev/dev/.local-settings-migrated',
      todoMarkerPath: '/Users/tester/.infilux-dev/dev/.local-todo-migrated',
      localStorageMarkerPath: '/Users/tester/.infilux-dev/dev/.local-localstorage-migrated',
    });
  });
});
