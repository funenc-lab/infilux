import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const claudeCompletionsTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const windows: Array<{
    isDestroyed: ReturnType<typeof vi.fn>;
    webContents: { send: ReturnType<typeof vi.fn> };
  }> = [];

  const getClaudeSlashCompletionsSnapshot = vi.fn();
  const learnClaudeSlashCompletion = vi.fn();
  const refreshClaudeSlashCompletions = vi.fn();
  const startClaudeSlashCompletionsWatcher = vi.fn();
  const stopClaudeSlashCompletionsWatcher = vi.fn();
  const getRepositoryEnvironmentContext = vi.fn();
  const listRepositoryRemoteDirectory = vi.fn();
  const resolveRepositoryRuntimeContext = vi.fn((repoPath?: string) =>
    repoPath?.startsWith('/__remote__/')
      ? { kind: 'remote', connectionId: 'conn-1' }
      : { kind: 'local' }
  );
  const remoteConnectionCall = vi.fn();

  let watcherCallback:
    | ((snapshot: import('@shared/types').ClaudeSlashCompletionsSnapshot) => void)
    | undefined;

  function createWindow(options?: { destroyed?: boolean; throws?: boolean }) {
    const send = vi.fn();
    if (options?.throws) {
      send.mockImplementation(() => {
        throw new Error('send failed');
      });
    }
    const win = {
      isDestroyed: vi.fn(() => options?.destroyed ?? false),
      webContents: { send },
    };
    windows.push(win);
    return win;
  }

  function reset() {
    handlers.clear();
    windows.length = 0;
    watcherCallback = undefined;

    getClaudeSlashCompletionsSnapshot.mockReset();
    getClaudeSlashCompletionsSnapshot.mockResolvedValue({
      items: [{ kind: 'command', label: '/local', insertText: '/local ', source: 'builtin' }],
      updatedAt: 10,
    });
    learnClaudeSlashCompletion.mockReset();
    learnClaudeSlashCompletion.mockResolvedValue(true);
    refreshClaudeSlashCompletions.mockReset();
    refreshClaudeSlashCompletions.mockResolvedValue({
      items: [
        {
          kind: 'command',
          label: '/remote-skill',
          insertText: '/remote-skill ',
          source: 'builtin',
        },
        {
          kind: 'command',
          label: '/builtin-only',
          insertText: '/builtin-only ',
          source: 'builtin',
        },
        { kind: 'command', label: '/local-user', insertText: '/local-user ', source: 'user' },
      ],
      updatedAt: 20,
    });
    startClaudeSlashCompletionsWatcher.mockReset();
    startClaudeSlashCompletionsWatcher.mockImplementation(
      async (
        callback: (snapshot: import('@shared/types').ClaudeSlashCompletionsSnapshot) => void
      ) => {
        watcherCallback = callback;
      }
    );
    stopClaudeSlashCompletionsWatcher.mockReset();
    stopClaudeSlashCompletionsWatcher.mockResolvedValue(undefined);
    getRepositoryEnvironmentContext.mockReset();
    getRepositoryEnvironmentContext.mockResolvedValue({
      kind: 'remote',
      connectionId: 'conn-1',
      claudeCommandsDir: '/commands',
      claudeSkillsDir: '/skills',
    });
    listRepositoryRemoteDirectory.mockReset();
    listRepositoryRemoteDirectory.mockImplementation(
      async (_repoPath: string, remotePath: string) => {
        if (remotePath === '/commands') {
          return [
            { isDirectory: false, name: 'explain.md', path: '/commands/explain.md' },
            { isDirectory: false, name: 'skip.txt', path: '/commands/skip.txt' },
          ];
        }
        if (remotePath === '/skills') {
          return [
            { isDirectory: true, name: 'remote-skill', path: '/skills/remote-skill' },
            { isDirectory: true, name: 'fallback-skill', path: '/skills/fallback-skill' },
            { isDirectory: true, name: 'binary-skill', path: '/skills/binary-skill' },
            { isDirectory: true, name: 'error-skill', path: '/skills/error-skill' },
          ];
        }
        if (remotePath === '/skills/remote-skill') {
          return [{ isDirectory: false, name: 'SKILL.md', path: '/skills/remote-skill/SKILL.md' }];
        }
        if (remotePath === '/skills/fallback-skill') {
          return [
            { isDirectory: false, name: 'skill.md', path: '/skills/fallback-skill/skill.md' },
          ];
        }
        if (remotePath === '/skills/binary-skill') {
          return [{ isDirectory: false, name: 'skill.md', path: '/skills/binary-skill/skill.md' }];
        }
        if (remotePath === '/skills/error-skill') {
          return [{ isDirectory: false, name: 'skill.md', path: '/skills/error-skill/skill.md' }];
        }
        return [];
      }
    );
    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockImplementation((repoPath?: string) =>
      repoPath?.startsWith('/__remote__/')
        ? { kind: 'remote', connectionId: 'conn-1' }
        : { kind: 'local' }
    );
    remoteConnectionCall.mockReset();
    remoteConnectionCall.mockImplementation(
      async (_connectionId: string, _method: string, payload: { path: string }) => {
        if (payload.path === '/commands/explain.md') {
          return { content: '# Explain command\nExtra body' };
        }
        if (payload.path === '/skills/remote-skill/SKILL.md') {
          return {
            content: [
              '---',
              'name: remote-skill',
              'description: Remote skill description',
              '---',
              '# Heading',
            ].join('\n'),
          };
        }
        if (payload.path === '/skills/fallback-skill/skill.md') {
          return { content: '# Fallback heading\nDetails' };
        }
        if (payload.path === '/skills/binary-skill/skill.md') {
          return { content: '', isBinary: true };
        }
        throw new Error('remote read failed');
      }
    );
  }

  return {
    handlers,
    windows,
    getClaudeSlashCompletionsSnapshot,
    learnClaudeSlashCompletion,
    refreshClaudeSlashCompletions,
    startClaudeSlashCompletionsWatcher,
    stopClaudeSlashCompletionsWatcher,
    getRepositoryEnvironmentContext,
    listRepositoryRemoteDirectory,
    resolveRepositoryRuntimeContext,
    remoteConnectionCall,
    createWindow,
    getWatcherCallback: () => watcherCallback,
    reset,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => claudeCompletionsTestDoubles.windows),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      claudeCompletionsTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/claude/ClaudeCompletionsManager', () => ({
  getClaudeSlashCompletionsSnapshot: claudeCompletionsTestDoubles.getClaudeSlashCompletionsSnapshot,
  learnClaudeSlashCompletion: claudeCompletionsTestDoubles.learnClaudeSlashCompletion,
  refreshClaudeSlashCompletions: claudeCompletionsTestDoubles.refreshClaudeSlashCompletions,
  startClaudeSlashCompletionsWatcher:
    claudeCompletionsTestDoubles.startClaudeSlashCompletionsWatcher,
  stopClaudeSlashCompletionsWatcher: claudeCompletionsTestDoubles.stopClaudeSlashCompletionsWatcher,
}));

vi.mock('../../services/remote/RemoteEnvironmentService', () => ({
  getRepositoryEnvironmentContext: claudeCompletionsTestDoubles.getRepositoryEnvironmentContext,
  listRepositoryRemoteDirectory: claudeCompletionsTestDoubles.listRepositoryRemoteDirectory,
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: claudeCompletionsTestDoubles.resolveRepositoryRuntimeContext,
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    call: claudeCompletionsTestDoubles.remoteConnectionCall,
  },
}));

function getHandler(channel: string) {
  const handler = claudeCompletionsTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('Claude completions IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    claudeCompletionsTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers local completion handlers, broadcasts watcher updates, and stops watchers', async () => {
    claudeCompletionsTestDoubles.createWindow();
    claudeCompletionsTestDoubles.createWindow({ destroyed: true });
    claudeCompletionsTestDoubles.createWindow({ throws: true });

    const { registerClaudeCompletionsHandlers, stopClaudeCompletionsWatchers } = await import(
      '../claudeCompletions'
    );
    registerClaudeCompletionsHandlers();

    expect(await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_GET)({})).toEqual({
      items: [{ kind: 'command', label: '/local', insertText: '/local ', source: 'builtin' }],
      updatedAt: 10,
    });
    expect(await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_REFRESH)({})).toEqual({
      items: [
        {
          kind: 'command',
          label: '/remote-skill',
          insertText: '/remote-skill ',
          source: 'builtin',
        },
        {
          kind: 'command',
          label: '/builtin-only',
          insertText: '/builtin-only ',
          source: 'builtin',
        },
        { kind: 'command', label: '/local-user', insertText: '/local-user ', source: 'user' },
      ],
      updatedAt: 20,
    });
    expect(await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_LEARN)({}, undefined, '/explain')).toBe(
      true
    );

    const snapshot = {
      items: [{ kind: 'command', label: '/watcher', insertText: '/watcher ', source: 'builtin' }],
      updatedAt: 99,
    } as import('@shared/types').ClaudeSlashCompletionsSnapshot;
    claudeCompletionsTestDoubles.getWatcherCallback()?.(snapshot);

    expect(claudeCompletionsTestDoubles.windows[0]?.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.CLAUDE_COMPLETIONS_UPDATED,
      snapshot
    );
    expect(claudeCompletionsTestDoubles.windows[1]?.webContents.send).not.toHaveBeenCalled();
    expect(claudeCompletionsTestDoubles.windows[2]?.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.CLAUDE_COMPLETIONS_UPDATED,
      snapshot
    );

    await stopClaudeCompletionsWatchers();
    expect(claudeCompletionsTestDoubles.stopClaudeSlashCompletionsWatcher).toHaveBeenCalledTimes(1);
    expect(claudeCompletionsTestDoubles.learnClaudeSlashCompletion).toHaveBeenCalledWith(
      '/explain'
    );
  });

  it('builds a remote completions snapshot from remote commands and skills', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234);

    const { registerClaudeCompletionsHandlers } = await import('../claudeCompletions');
    registerClaudeCompletionsHandlers();

    const snapshot = await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_GET)({}, '/__remote__/repo');

    expect(snapshot).toEqual({
      items: [
        {
          kind: 'command',
          label: '/remote-skill',
          insertText: '/remote-skill ',
          source: 'builtin',
        },
        {
          kind: 'command',
          label: '/builtin-only',
          insertText: '/builtin-only ',
          source: 'builtin',
        },
        {
          kind: 'command',
          label: '/explain',
          insertText: '/explain ',
          description: 'Explain command',
          source: 'user',
        },
        {
          kind: 'skill',
          label: '/fallback-skill',
          insertText: '/fallback-skill ',
          description: 'Fallback heading',
          source: 'user',
        },
      ],
      updatedAt: 1234,
    });

    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_REFRESH)({}, '/__remote__/repo')
    ).toEqual(snapshot);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_COMPLETIONS_LEARN)({}, '/__remote__/repo', '/ignored')
    ).toBe(false);

    expect(claudeCompletionsTestDoubles.listRepositoryRemoteDirectory).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/commands'
    );
    expect(claudeCompletionsTestDoubles.listRepositoryRemoteDirectory).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/skills'
    );
    expect(claudeCompletionsTestDoubles.remoteConnectionCall).toHaveBeenCalledWith(
      'conn-1',
      'fs:read',
      { path: '/commands/explain.md' }
    );

    nowSpy.mockRestore();
  });

  it('warns when the watcher fails to start', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    claudeCompletionsTestDoubles.startClaudeSlashCompletionsWatcher.mockRejectedValueOnce(
      new Error('watcher failed')
    );

    const { registerClaudeCompletionsHandlers } = await import('../claudeCompletions');
    registerClaudeCompletionsHandlers();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
