import { Buffer } from 'node:buffer';
import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

const preloadTestDoubles = vi.hoisted(() => {
  const exposed = new Map<string, unknown>();
  const listeners = new Map<string, Listener>();

  const exposeInMainWorld = vi.fn((key: string, value: unknown) => {
    exposed.set(key, value);
  });
  const invoke = vi.fn(
    async (channel: string, ...args: unknown[]): Promise<unknown> => ({ channel, args })
  );
  const on = vi.fn((channel: string, listener: Listener) => {
    listeners.set(channel, listener);
  });
  const off = vi.fn((channel: string, listener: Listener) => {
    if (listeners.get(channel) === listener) {
      listeners.delete(channel);
    }
  });
  const send = vi.fn();
  const removeListener = vi.fn((channel: string, listener: Listener) => {
    if (listeners.get(channel) === listener) {
      listeners.delete(channel);
    }
  });
  const openExternal = vi.fn(async (_url: string) => undefined);
  const openPath = vi.fn(async (path: string) => `opened:${path}`);
  const getPathForFile = vi.fn((file: unknown) => `/resolved/${String(file)}`);

  function reset() {
    exposed.clear();
    listeners.clear();
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    off.mockClear();
    send.mockClear();
    removeListener.mockClear();
    openExternal.mockClear();
    openPath.mockClear();
    getPathForFile.mockClear();
  }

  function emit(channel: string, ...args: unknown[]) {
    const listener = listeners.get(channel);
    if (!listener) {
      throw new Error(`Missing listener for ${channel}`);
    }
    listener(...args);
  }

  return {
    exposed,
    listeners,
    exposeInMainWorld,
    invoke,
    on,
    off,
    send,
    removeListener,
    openExternal,
    openPath,
    getPathForFile,
    emit,
    reset,
  };
});

vi.mock('electron-log/preload.js', () => ({}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: preloadTestDoubles.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: preloadTestDoubles.invoke,
    on: preloadTestDoubles.on,
    off: preloadTestDoubles.off,
    send: preloadTestDoubles.send,
    removeListener: preloadTestDoubles.removeListener,
  },
  shell: {
    openExternal: preloadTestDoubles.openExternal,
    openPath: preloadTestDoubles.openPath,
  },
  webUtils: {
    getPathForFile: preloadTestDoubles.getPathForFile,
  },
}));

type ElectronAPI = import('../index').ElectronAPI;

async function loadElectronAPI(): Promise<ElectronAPI> {
  await import('../index');
  const api = preloadTestDoubles.exposed.get('electronAPI');
  if (!api) {
    throw new Error('electronAPI was not exposed');
  }
  return api as ElectronAPI;
}

describe('preload bridge', () => {
  const originalArgv = [...process.argv];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    preloadTestDoubles.reset();
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it('exposes electronAPI and Buffer to the renderer', async () => {
    const api = await loadElectronAPI();

    expect(preloadTestDoubles.exposeInMainWorld).toHaveBeenCalledTimes(2);
    expect(preloadTestDoubles.exposed.get('Buffer')).toBe(Buffer);
    expect(api.env.HOME).toBeTypeOf('string');
    expect(api.env.platform).toBe(process.platform);
    expect(api.env.appVersion).toBeTypeOf('string');
    expect(api.utils.getPathForFile('file.bin' as never)).toBe('/resolved/file.bin');
    expect(preloadTestDoubles.getPathForFile).toHaveBeenCalledWith('file.bin');
  });

  it('exposes the bootstrap theme snapshot parsed from additional arguments', async () => {
    process.argv = [
      ...originalArgv,
      `--infilux-bootstrap-theme=${encodeURIComponent(
        JSON.stringify({
          theme: 'system',
          terminalTheme: 'Xcode WWDC',
          systemShouldUseDarkColors: false,
        })
      )}`,
    ];

    const api = await loadElectronAPI();

    expect(api.env.bootstrapTheme).toEqual({
      theme: 'system',
      terminalTheme: 'Xcode WWDC',
      systemShouldUseDarkColors: false,
    });
  });

  it('routes invoke-based APIs to the expected IPC channels', async () => {
    const api = await loadElectronAPI();

    const invocationCases: Array<{ run: () => Promise<unknown>; expected: unknown[] }> = [
      { run: () => api.git.getStatus('/repo'), expected: [IPC_CHANNELS.GIT_STATUS, '/repo'] },
      {
        run: () => api.git.getLog('/repo', 5, 2, 'submodule'),
        expected: [IPC_CHANNELS.GIT_LOG, '/repo', 5, 2, 'submodule'],
      },
      {
        run: () => api.git.createBranch('/repo', 'feature/x', 'main'),
        expected: [IPC_CHANNELS.GIT_BRANCH_CREATE, '/repo', 'feature/x', 'main'],
      },
      {
        run: () => api.git.push('/repo', 'origin', 'main', true),
        expected: [IPC_CHANNELS.GIT_PUSH, '/repo', 'origin', 'main', true],
      },
      {
        run: () => api.git.getCommitDiff('/repo', 'abc', 'src/a.ts', 'M', 'submodule'),
        expected: [IPC_CHANNELS.GIT_COMMIT_DIFF, '/repo', 'abc', 'src/a.ts', 'M', 'submodule'],
      },
      {
        run: () =>
          api.git.generateCommitMessage('/repo', {
            maxDiffLines: 300,
            timeout: 1_000,
            provider: 'openai',
            model: 'gpt',
          }),
        expected: [
          IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
          '/repo',
          { maxDiffLines: 300, timeout: 1_000, provider: 'openai', model: 'gpt' },
        ],
      },
      {
        run: () =>
          api.git.startCodeReview('/repo', {
            provider: 'claude',
            model: 'sonnet',
            reviewId: 'review-1',
            prompt: 'review',
          }),
        expected: [
          IPC_CHANNELS.GIT_CODE_REVIEW_START,
          '/repo',
          { provider: 'claude', model: 'sonnet', reviewId: 'review-1', prompt: 'review' },
        ],
      },
      {
        run: () =>
          api.worktree.merge('/repo', { sourceBranch: 'feature', targetBranch: 'main' } as never),
        expected: [
          IPC_CHANNELS.WORKTREE_MERGE,
          '/repo',
          { sourceBranch: 'feature', targetBranch: 'main' },
        ],
      },
      {
        run: () =>
          api.worktree.continueMerge('/repo', 'merge commit', { deleteSource: true } as never),
        expected: [
          IPC_CHANNELS.WORKTREE_MERGE_CONTINUE,
          '/repo',
          'merge commit',
          { deleteSource: true },
        ],
      },
      {
        run: () => api.tempWorkspace.remove('/tmp/work', '/tmp'),
        expected: [IPC_CHANNELS.TEMP_WORKSPACE_REMOVE, '/tmp/work', '/tmp'],
      },
      { run: () => api.file.read('/repo/a.ts'), expected: [IPC_CHANNELS.FILE_READ, '/repo/a.ts'] },
      {
        run: () => api.file.createFile('/repo/new.ts'),
        expected: [IPC_CHANNELS.FILE_CREATE, '/repo/new.ts', '', undefined],
      },
      {
        run: () => api.file.batchMove(['/repo/a.ts'], '/repo/dest', []),
        expected: [IPC_CHANNELS.FILE_BATCH_MOVE, ['/repo/a.ts'], '/repo/dest', []],
      },
      {
        run: () => api.terminal.resize('terminal-1', { cols: 100, rows: 30 }),
        expected: [IPC_CHANNELS.TERMINAL_RESIZE, 'terminal-1', { cols: 100, rows: 30 }],
      },
      {
        run: () => api.session.attach({ sessionId: 'session-1', readOnly: false } as never),
        expected: [IPC_CHANNELS.SESSION_ATTACH, { sessionId: 'session-1', readOnly: false }],
      },
      { run: () => api.agent.list(), expected: [IPC_CHANNELS.AGENT_LIST] },
      {
        run: () => api.app.getPath('logs'),
        expected: [IPC_CHANNELS.APP_GET_PATH, 'logs'],
      },
      {
        run: () => api.app.setLanguage('en'),
        expected: [IPC_CHANNELS.APP_SET_LANGUAGE, 'en'],
      },
      {
        run: () => api.app.setProxy({ enabled: true, host: '127.0.0.1', port: 7890 } as never),
        expected: [IPC_CHANNELS.APP_SET_PROXY, { enabled: true, host: '127.0.0.1', port: 7890 }],
      },
      {
        run: () =>
          api.dialog.openFile({
            filters: [{ name: 'TypeScript', extensions: ['ts'] }],
            showHiddenFiles: true,
          }),
        expected: [
          IPC_CHANNELS.DIALOG_OPEN_FILE,
          {
            filters: [{ name: 'TypeScript', extensions: ['ts'] }],
            showHiddenFiles: true,
          },
        ],
      },
      {
        run: () => api.remote.connect('profile-1'),
        expected: [IPC_CHANNELS.REMOTE_CONNECT, 'profile-1'],
      },
      {
        run: () => api.remote.listDirectory('profile-1', '/var/www'),
        expected: [IPC_CHANNELS.REMOTE_DIRECTORY_LIST, 'profile-1', '/var/www'],
      },
      {
        run: () => api.remote.respondAuthPrompt({ requestId: 'auth-1', approved: true } as never),
        expected: [IPC_CHANNELS.REMOTE_AUTH_RESPONSE, { requestId: 'auth-1', approved: true }],
      },
      {
        run: () => api.sessionStorage.syncLocalStorage({ theme: 'dark' }),
        expected: [IPC_CHANNELS.SESSION_STORAGE_SYNC_LOCAL_STORAGE, { theme: 'dark' }],
      },
      {
        run: () => api.contextMenu.show([{ id: 'copy', label: 'Copy' }]),
        expected: [IPC_CHANNELS.CONTEXT_MENU_SHOW, [{ id: 'copy', label: 'Copy' }]],
      },
      {
        run: () => api.cli.detectOne('/repo', 'claude', undefined, '/usr/local/bin/claude'),
        expected: [
          IPC_CHANNELS.CLI_DETECT_ONE,
          '/repo',
          'claude',
          undefined,
          '/usr/local/bin/claude',
        ],
      },
      {
        run: () => api.tmux.check('/repo', true),
        expected: [IPC_CHANNELS.TMUX_CHECK, '/repo', true],
      },
      {
        run: () => api.settings.previewLegacyImportFromTypicalPaths(),
        expected: [IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_AUTO_PREVIEW],
      },
      {
        run: () => api.settings.applyLegacyImport('/tmp/settings.json'),
        expected: [IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY, '/tmp/settings.json'],
      },
      {
        run: () =>
          api.todo.aiPolish({
            text: 'Draft',
            timeout: 1_000,
            provider: 'claude',
            model: 'sonnet',
          }),
        expected: [
          IPC_CHANNELS.TODO_AI_POLISH,
          { text: 'Draft', timeout: 1_000, provider: 'claude', model: 'sonnet' },
        ],
      },
      {
        run: () => api.shell.detect('/repo'),
        expected: [IPC_CHANNELS.SHELL_DETECT, '/repo'],
      },
      {
        run: () => api.window.getRepositoryRuntimeContext('/repo'),
        expected: [IPC_CHANNELS.WINDOW_GET_REPOSITORY_RUNTIME_CONTEXT, '/repo'],
      },
      {
        run: () => api.notification.show({ title: 'Done', sessionId: 'session-1' }),
        expected: [IPC_CHANNELS.NOTIFICATION_SHOW, { title: 'Done', sessionId: 'session-1' }],
      },
      {
        run: () => api.updater.setAutoUpdateEnabled(true),
        expected: [IPC_CHANNELS.UPDATER_SET_AUTO_UPDATE_ENABLED, true],
      },
      {
        run: () => api.mcp.setEnabled(true, ['/repo']),
        expected: [IPC_CHANNELS.MCP_BRIDGE_SET_ENABLED, true, ['/repo']],
      },
      {
        run: () => api.claudeProvider.readSettings('/repo'),
        expected: [IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS, '/repo'],
      },
      {
        run: () => api.claudeProvider.apply('/repo', { provider: 'claude' } as never),
        expected: [IPC_CHANNELS.CLAUDE_PROVIDER_APPLY, '/repo', { provider: 'claude' }],
      },
      {
        run: () => api.claudeConfig.mcp.upsert('/repo', { id: 'server-1' } as never),
        expected: [IPC_CHANNELS.CLAUDE_MCP_UPSERT, '/repo', { id: 'server-1' }],
      },
      {
        run: () => api.claudeConfig.prompts.backup('/repo'),
        expected: [IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP, '/repo'],
      },
      {
        run: () => api.claudeConfig.plugins.install('/repo', 'plugin-name', 'market'),
        expected: [IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL, '/repo', 'plugin-name', 'market'],
      },
      {
        run: () => api.claudeConfig.plugins.marketplaces.refresh('/repo', 'market'),
        expected: [IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH, '/repo', 'market'],
      },
      {
        run: () => api.claudeCompletions.refresh('/repo'),
        expected: [IPC_CHANNELS.CLAUDE_COMPLETIONS_REFRESH, '/repo'],
      },
      {
        run: () => api.search.content({ repoPath: '/repo', query: 'TODO' } as never),
        expected: [IPC_CHANNELS.SEARCH_CONTENT, { repoPath: '/repo', query: 'TODO' }],
      },
      {
        run: () =>
          api.hapi.start({
            webappPort: 3000,
            cliApiToken: 'token',
            telegramBotToken: 'bot',
            webappUrl: 'http://localhost:3000',
            allowedChatIds: '1,2',
          }),
        expected: [
          IPC_CHANNELS.HAPI_START,
          {
            webappPort: 3000,
            cliApiToken: 'token',
            telegramBotToken: 'bot',
            webappUrl: 'http://localhost:3000',
            allowedChatIds: '1,2',
          },
        ],
      },
      { run: () => api.hapiRunner.getStatus(), expected: [IPC_CHANNELS.HAPI_RUNNER_GET_STATUS] },
      {
        run: () => api.happy.checkGlobal('/repo', false),
        expected: [IPC_CHANNELS.HAPPY_CHECK_GLOBAL, '/repo', false],
      },
      {
        run: () => api.cloudflared.start({ mode: 'quick', port: 8080 }),
        expected: [IPC_CHANNELS.CLOUDFLARED_START, { mode: 'quick', port: 8080 }],
      },
      {
        run: () => api.webInspector.start(),
        expected: [IPC_CHANNELS.WEB_INSPECTOR_START],
      },
      {
        run: () => api.webInspector.stop(),
        expected: [IPC_CHANNELS.WEB_INSPECTOR_STOP],
      },
      {
        run: () => api.webInspector.status(),
        expected: [IPC_CHANNELS.WEB_INSPECTOR_STATUS],
      },
      {
        run: () => api.log.updateConfig({ enabled: true, level: 'debug' }),
        expected: [IPC_CHANNELS.LOG_UPDATE_CONFIG, { enabled: true, level: 'debug' }],
      },
      { run: () => api.log.getPath(), expected: [IPC_CHANNELS.LOG_GET_PATH] },
    ];

    for (const { run, expected } of invocationCases) {
      await run();
      expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(...expected);
    }
  });

  it('routes agent session bridge APIs to the expected IPC channels', async () => {
    const api = await loadElectronAPI();

    const restoreRequest = {
      repoPath: '/repo',
      cwd: '/repo/worktree',
    };
    const persistentRecord = {
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
      createdAt: 1,
      updatedAt: 2,
      lastKnownState: 'live',
    } as const;

    await api.agentSession.listRecoverable();
    expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE
    );

    await api.agentSession.restoreWorktreeSessions(restoreRequest);
    expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE,
      restoreRequest
    );

    await api.agentSession.reconcile('session-1');
    expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.AGENT_SESSION_RECONCILE,
      'session-1'
    );

    await api.agentSession.markPersistent(persistentRecord);
    expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT,
      persistentRecord
    );

    await api.agentSession.abandon('session-1');
    expect(preloadTestDoubles.invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.AGENT_SESSION_ABANDON,
      'session-1'
    );
  });

  it('routes send-based APIs and native shell APIs correctly', async () => {
    const api = await loadElectronAPI();

    api.app.confirmClose(true);
    api.app.respondCloseRequest('request-1', { confirmed: true, dirtyPaths: ['/repo/a.ts'] });
    api.app.respondCloseSaveRequest('request-2', { ok: true });
    api.mcp.sendSelectionChanged({
      text: 'const value = 1;',
      filePath: '/repo/a.ts',
      fileUrl: 'file:///repo/a.ts',
      selection: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 5 },
        isEmpty: false,
      },
    });
    api.mcp.sendAtMentioned({ filePath: '/repo/a.ts', lineStart: 1, lineEnd: 2 });

    await api.shell.openExternal('https://example.com');
    expect(preloadTestDoubles.openExternal).toHaveBeenCalledWith('https://example.com');

    await expect(api.shell.openPath('/__enso_remote__/repo/a.ts')).rejects.toThrow(
      'Remote paths cannot be revealed locally'
    );
    await expect(
      api.appDetector.openWith('/__enso_remote__/repo/a.ts', 'com.editor.app')
    ).rejects.toThrow('Remote files cannot be opened with local applications');

    expect(await api.shell.openPath('/repo/a.ts')).toBe('opened:/repo/a.ts');
    expect(await api.appDetector.openWith('/repo/a.ts', 'com.editor.app', { line: 3 })).toEqual({
      channel: IPC_CHANNELS.APP_OPEN_WITH,
      args: ['/repo/a.ts', 'com.editor.app', { line: 3 }],
    });

    expect(preloadTestDoubles.send).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.APP_CLOSE_CONFIRM,
      true
    );
    expect(preloadTestDoubles.send).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.APP_CLOSE_RESPONSE,
      'request-1',
      { confirmed: true, dirtyPaths: ['/repo/a.ts'] }
    );
    expect(preloadTestDoubles.send).toHaveBeenNthCalledWith(
      3,
      IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
      'request-2',
      { ok: true }
    );
    expect(preloadTestDoubles.send).toHaveBeenNthCalledWith(
      4,
      IPC_CHANNELS.MCP_SELECTION_CHANGED,
      expect.objectContaining({ filePath: '/repo/a.ts' })
    );
    expect(preloadTestDoubles.send).toHaveBeenNthCalledWith(5, IPC_CHANNELS.MCP_AT_MENTIONED, {
      filePath: '/repo/a.ts',
      lineStart: 1,
      lineEnd: 2,
    });
    expect(preloadTestDoubles.openPath).toHaveBeenCalledWith('/repo/a.ts');
  });

  it('hydrates runtime metrics from renderer memory on each call and falls back when unavailable', async () => {
    const api = await loadElectronAPI();
    const processWithMemoryInfo = process as NodeJS.Process & {
      getProcessMemoryInfo?: () => Promise<{
        private: number;
        shared: number;
        residentSet?: number;
      }>;
    };
    const originalGetProcessMemoryInfo = processWithMemoryInfo.getProcessMemoryInfo;
    const getProcessMemoryInfo = vi
      .fn()
      .mockResolvedValueOnce({ private: 4096, shared: 1024, residentSet: 6144 })
      .mockRejectedValueOnce(new Error('renderer memory unavailable'));

    Object.defineProperty(processWithMemoryInfo, 'getProcessMemoryInfo', {
      value: getProcessMemoryInfo,
      configurable: true,
    });

    preloadTestDoubles.invoke
      .mockResolvedValueOnce({
        capturedAt: 1,
        processCount: 2,
        rendererProcessId: 10,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 20480,
        totalAppPrivateBytesKb: 10240,
      })
      .mockResolvedValueOnce({
        capturedAt: 2,
        processCount: 2,
        rendererProcessId: 10,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 22528,
        totalAppPrivateBytesKb: 11264,
      });

    try {
      const first = await api.app.getRuntimeMetrics();
      const second = await api.app.getRuntimeMetrics();

      expect(preloadTestDoubles.invoke).toHaveBeenNthCalledWith(
        1,
        IPC_CHANNELS.APP_GET_RUNTIME_METRICS
      );
      expect(preloadTestDoubles.invoke).toHaveBeenNthCalledWith(
        2,
        IPC_CHANNELS.APP_GET_RUNTIME_METRICS
      );
      expect(first.rendererMemory).toEqual({
        privateKb: 4096,
        sharedKb: 1024,
        residentSetKb: 6144,
      });
      expect(second.rendererMemory).toBeNull();
      expect(getProcessMemoryInfo).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(processWithMemoryInfo, 'getProcessMemoryInfo', {
        value: originalGetProcessMemoryInfo,
        configurable: true,
      });
    }
  });

  it('hydrates resource snapshots and routes resource actions through the app bridge', async () => {
    const api = await loadElectronAPI();
    const resourceApi = api.app as typeof api.app & {
      getResourceSnapshot: () => Promise<{
        capturedAt: number;
        runtime: {
          capturedAt: number;
          processCount: number;
          rendererProcessId: number | null;
          rendererMemory: {
            privateKb: number;
            sharedKb: number;
            residentSetKb: number | null;
          } | null;
          rendererMetric: null;
          browserMetric: null;
          gpuMetric: null;
          totalAppWorkingSetSizeKb: number;
          totalAppPrivateBytesKb: number;
        };
        resources: unknown[];
      }>;
      executeResourceAction: (action: {
        kind: 'kill-session';
        resourceId: string;
        sessionId: string;
      }) => Promise<unknown>;
    };
    const processWithMemoryInfo = process as NodeJS.Process & {
      getProcessMemoryInfo?: () => Promise<{
        private: number;
        shared: number;
        residentSet?: number;
      }>;
    };
    const originalGetProcessMemoryInfo = processWithMemoryInfo.getProcessMemoryInfo;
    const appGetResourceSnapshotChannel = 'app:getResourceSnapshot';
    const appExecuteResourceActionChannel = 'app:executeResourceAction';

    Object.defineProperty(processWithMemoryInfo, 'getProcessMemoryInfo', {
      value: vi.fn().mockResolvedValue({
        private: 5120,
        shared: 2048,
        residentSet: 7168,
      }),
      configurable: true,
    });

    preloadTestDoubles.invoke
      .mockResolvedValueOnce({
        capturedAt: 2,
        runtime: {
          capturedAt: 2,
          processCount: 3,
          rendererProcessId: 55,
          rendererMemory: null,
          rendererMetric: null,
          browserMetric: null,
          gpuMetric: null,
          totalAppWorkingSetSizeKb: 30720,
          totalAppPrivateBytesKb: 12288,
        },
        resources: [],
      })
      .mockResolvedValueOnce({
        ok: true,
        kind: 'kill-session',
        resourceId: 'session:session-1',
        message: 'done',
      });

    try {
      const snapshot = await resourceApi.getResourceSnapshot();
      const actionResult = await resourceApi.executeResourceAction({
        kind: 'kill-session',
        resourceId: 'session:session-1',
        sessionId: 'session-1',
      });

      expect(preloadTestDoubles.invoke).toHaveBeenNthCalledWith(1, appGetResourceSnapshotChannel);
      expect(preloadTestDoubles.invoke).toHaveBeenNthCalledWith(
        2,
        appExecuteResourceActionChannel,
        {
          kind: 'kill-session',
          resourceId: 'session:session-1',
          sessionId: 'session-1',
        }
      );
      expect(snapshot.runtime.rendererMemory).toEqual({
        privateKb: 5120,
        sharedKb: 2048,
        residentSetKb: 7168,
      });
      expect(actionResult).toEqual({
        ok: true,
        kind: 'kill-session',
        resourceId: 'session:session-1',
        message: 'done',
      });
    } finally {
      Object.defineProperty(processWithMemoryInfo, 'getProcessMemoryInfo', {
        value: originalGetProcessMemoryInfo,
        configurable: true,
      });
    }
  });

  it('registers event listeners, forwards payloads, and unsubscribes correctly', async () => {
    const api = await loadElectronAPI();

    const directCases = [
      {
        channel: IPC_CHANNELS.GIT_CODE_REVIEW_DATA,
        register: (callback: (value: unknown) => void) =>
          api.git.onCodeReviewData(callback as never),
        emitted: [{ reviewId: 'r1', type: 'data', data: 'line' }],
        expected: [{ reviewId: 'r1', type: 'data', data: 'line' }],
      },
      {
        channel: IPC_CHANNELS.GIT_CLONE_PROGRESS,
        register: (callback: (value: unknown) => void) =>
          api.git.onCloneProgress(callback as never),
        emitted: [{ receivedObjects: 1 }],
        expected: [{ receivedObjects: 1 }],
      },
      {
        channel: IPC_CHANNELS.GIT_AUTO_FETCH_COMPLETED,
        register: (callback: (value: unknown) => void) =>
          api.git.onAutoFetchCompleted(callback as never),
        emitted: [{ timestamp: 123 }],
        expected: [{ timestamp: 123 }],
      },
      {
        channel: IPC_CHANNELS.FILE_CHANGE,
        register: (callback: (value: unknown) => void) => api.file.onChange(callback as never),
        emitted: [{ type: 'change', path: '/repo/a.ts' }],
        expected: [{ type: 'change', path: '/repo/a.ts' }],
      },
      {
        channel: IPC_CHANNELS.SESSION_DATA,
        register: (callback: (value: unknown) => void) => api.session.onData(callback as never),
        emitted: [{ sessionId: 'session-1', data: 'hello' }],
        expected: [{ sessionId: 'session-1', data: 'hello' }],
      },
      {
        channel: IPC_CHANNELS.SESSION_EXIT,
        register: (callback: (value: unknown) => void) => api.session.onExit(callback as never),
        emitted: [{ sessionId: 'session-1', exitCode: 0 }],
        expected: [{ sessionId: 'session-1', exitCode: 0 }],
      },
      {
        channel: IPC_CHANNELS.SESSION_STATE,
        register: (callback: (value: unknown) => void) => api.session.onState(callback as never),
        emitted: [{ sessionId: 'session-1', active: true }],
        expected: [{ sessionId: 'session-1', active: true }],
      },
      {
        channel: IPC_CHANNELS.APP_UPDATE_AVAILABLE,
        register: (callback: (value: unknown) => void) => api.app.onUpdateAvailable(callback),
        emitted: [{ version: '1.0.0' }],
        expected: [{ version: '1.0.0' }],
      },
      {
        channel: IPC_CHANNELS.APP_CLOSE_REQUEST,
        register: (callback: (value: unknown) => void) => api.app.onCloseRequest(callback as never),
        emitted: [{ requestId: 'close-1' }],
        expected: [{ requestId: 'close-1' }],
      },
      {
        channel: IPC_CHANNELS.APP_OPEN_PATH,
        register: (callback: (value: unknown) => void) => api.app.onOpenPath(callback),
        emitted: ['/repo/a.ts'],
        expected: ['/repo/a.ts'],
      },
      {
        channel: IPC_CHANNELS.REMOTE_AUTH_PROMPT,
        register: (callback: (value: unknown) => void) =>
          api.remote.onAuthPrompt(callback as never),
        emitted: [{ requestId: 'auth-1' }],
        expected: [{ requestId: 'auth-1' }],
      },
      {
        channel: IPC_CHANNELS.REMOTE_STATUS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.remote.onStatusChange(callback as never),
        emitted: [{ connectionId: 'conn-1', status: 'connected' }],
        expected: [{ connectionId: 'conn-1', status: 'connected' }],
      },
      {
        channel: IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.window.onMaximizedChange(callback as never),
        emitted: [true],
        expected: [true],
      },
      {
        channel: IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.window.onDevToolsStateChange(callback as never),
        emitted: [false],
        expected: [false],
      },
      {
        channel: IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.window.onFullScreenChange(callback as never),
        emitted: [true],
        expected: [true],
      },
      {
        channel: IPC_CHANNELS.NOTIFICATION_CLICK,
        register: (callback: (value: unknown) => void) =>
          api.notification.onClick(callback as never),
        emitted: ['session-1'],
        expected: ['session-1'],
      },
      {
        channel: IPC_CHANNELS.AGENT_STOP_NOTIFICATION,
        register: (callback: (value: unknown) => void) =>
          api.notification.onAgentStop(callback as never),
        emitted: [{ sessionId: 'session-1' }],
        expected: [{ sessionId: 'session-1' }],
      },
      {
        channel: IPC_CHANNELS.AGENT_ASK_USER_QUESTION_NOTIFICATION,
        register: (callback: (value: unknown) => void) =>
          api.notification.onAskUserQuestion(callback as never),
        emitted: [{ sessionId: 'session-1', toolInput: { prompt: 'q' } }],
        expected: [{ sessionId: 'session-1', toolInput: { prompt: 'q' } }],
      },
      {
        channel: IPC_CHANNELS.AGENT_PRE_TOOL_USE_NOTIFICATION,
        register: (callback: (value: unknown) => void) =>
          api.notification.onPreToolUse(callback as never),
        emitted: [{ sessionId: 'session-1', toolName: 'write' }],
        expected: [{ sessionId: 'session-1', toolName: 'write' }],
      },
      {
        channel: IPC_CHANNELS.AGENT_STATUS_UPDATE,
        register: (callback: (value: unknown) => void) =>
          api.notification.onAgentStatusUpdate(callback as never),
        emitted: [{ sessionId: 'session-1', version: '1.0.0' }],
        expected: [{ sessionId: 'session-1', version: '1.0.0' }],
      },
      {
        channel: IPC_CHANNELS.UPDATER_STATUS,
        register: (callback: (value: unknown) => void) => api.updater.onStatus(callback as never),
        emitted: [{ status: 'available' }],
        expected: [{ status: 'available' }],
      },
      {
        channel: IPC_CHANNELS.CLAUDE_PROVIDER_SETTINGS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.claudeProvider.onSettingsChanged(callback as never),
        emitted: [{ settings: {}, extracted: {} }],
        expected: [{ settings: {}, extracted: {} }],
      },
      {
        channel: IPC_CHANNELS.CLAUDE_COMPLETIONS_UPDATED,
        register: (callback: (value: unknown) => void) =>
          api.claudeCompletions.onUpdated(callback as never),
        emitted: [{ items: [], updatedAt: 1 }],
        expected: [{ items: [], updatedAt: 1 }],
      },
      {
        channel: IPC_CHANNELS.HAPI_STATUS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.hapi.onStatusChanged(callback as never),
        emitted: [{ running: true }],
        expected: [{ running: true }],
      },
      {
        channel: IPC_CHANNELS.HAPI_RUNNER_STATUS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.hapiRunner.onStatusChanged(callback as never),
        emitted: [{ running: true }],
        expected: [{ running: true }],
      },
      {
        channel: IPC_CHANNELS.CLOUDFLARED_STATUS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.cloudflared.onStatusChanged(callback as never),
        emitted: [{ running: true, installed: true }],
        expected: [{ running: true, installed: true }],
      },
      {
        channel: IPC_CHANNELS.WEB_INSPECTOR_STATUS_CHANGED,
        register: (callback: (value: unknown) => void) =>
          api.webInspector.onStatusChange(callback as never),
        emitted: [{ running: true }],
        expected: [{ running: true }],
      },
      {
        channel: IPC_CHANNELS.WEB_INSPECTOR_DATA,
        register: (callback: (value: unknown) => void) =>
          api.webInspector.onData(callback as never),
        emitted: [{ entries: [] }],
        expected: [{ entries: [] }],
      },
    ];

    for (const testCase of directCases) {
      const received: unknown[][] = [];
      const unsubscribe = testCase.register((...args: unknown[]) => {
        received.push(args);
      });

      preloadTestDoubles.emit(testCase.channel, {}, ...testCase.emitted);
      expect(received).toEqual([testCase.expected]);
      unsubscribe();
      expect(preloadTestDoubles.off).toHaveBeenCalledWith(testCase.channel, expect.any(Function));
    }

    const menuActions: string[] = [];
    const unsubscribeMenu = api.menu.onAction((action) => {
      menuActions.push(action);
    });
    preloadTestDoubles.emit('menu-action', {}, 'open-settings');
    expect(menuActions).toEqual(['open-settings']);
    unsubscribeMenu();
    expect(preloadTestDoubles.removeListener).toHaveBeenCalledWith(
      'menu-action',
      expect.any(Function)
    );

    const terminalData: Array<{ id: string; data: string }> = [];
    const unsubscribeTerminalData = api.terminal.onData((payload) => {
      terminalData.push(payload);
    });
    preloadTestDoubles.emit(
      IPC_CHANNELS.SESSION_DATA,
      {},
      { sessionId: 'terminal-1', data: 'out' }
    );
    expect(terminalData).toEqual([{ id: 'terminal-1', data: 'out' }]);
    unsubscribeTerminalData();

    const terminalExit: Array<{ id: string; exitCode: number; signal?: number }> = [];
    const unsubscribeTerminalExit = api.terminal.onExit((payload) => {
      terminalExit.push(payload);
    });
    preloadTestDoubles.emit(
      IPC_CHANNELS.SESSION_EXIT,
      {},
      { sessionId: 'terminal-1', exitCode: 0, signal: 15 }
    );
    expect(terminalExit).toEqual([{ id: 'terminal-1', exitCode: 0, signal: 15 }]);
    unsubscribeTerminalExit();

    const closeSaveRequests: Array<[string, string]> = [];
    const unsubscribeCloseSave = api.app.onCloseSaveRequest((requestId, path) => {
      closeSaveRequests.push([requestId, path]);
    });
    preloadTestDoubles.emit(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, {}, 'request-1', '/repo/a.ts');
    expect(closeSaveRequests).toEqual([['request-1', '/repo/a.ts']]);
    unsubscribeCloseSave();
  });
});
