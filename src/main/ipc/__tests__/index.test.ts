import type { PersistentAgentSessionRecord } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const indexTestDoubles = vi.hoisted(() => {
  const registerGitHandlers = vi.fn();
  const registerWorktreeHandlers = vi.fn();
  const registerFileHandlers = vi.fn();
  const registerSessionHandlers = vi.fn();
  const registerAgentInputHandlers = vi.fn();
  const registerSessionStorageHandlers = vi.fn();
  const registerAgentHandlers = vi.fn();
  const registerAgentSubagentHandlers = vi.fn();
  const registerAgentSessionHandlers = vi.fn();
  const registerDialogHandlers = vi.fn();
  const registerAppHandlers = vi.fn();
  const registerCliHandlers = vi.fn();
  const registerShellHandlers = vi.fn();
  const registerSettingsHandlers = vi.fn();
  const registerLogHandlers = vi.fn();
  const registerNotificationHandlers = vi.fn();
  const registerRemoteHandlers = vi.fn();
  const registerUpdaterHandlers = vi.fn();
  const registerSearchHandlers = vi.fn();
  const registerHapiHandlers = vi.fn();
  const registerClaudeProviderHandlers = vi.fn();
  const registerClaudeConfigHandlers = vi.fn();
  const registerClaudeCompletionsHandlers = vi.fn();
  const registerWebInspectorHandlers = vi.fn();
  const registerTempWorkspaceHandlers = vi.fn();
  const registerTmuxHandlers = vi.fn();
  const registerTodoHandlers = vi.fn();

  const cleanupExecInPtys = vi.fn();
  const cleanupExecInPtysSync = vi.fn();
  const cleanupHapi = vi.fn();
  const cleanupHapiSync = vi.fn();
  const destroyAllTerminals = vi.fn();
  const destroyAllTerminalsAndWait = vi.fn();
  const stopAllFileWatchers = vi.fn();
  const stopAllFileWatchersSync = vi.fn();
  const stopClaudeCompletionsWatchers = vi.fn();
  const cleanupTempFiles = vi.fn();
  const cleanupTempFilesSync = vi.fn();
  const cleanupTmuxSync = vi.fn();
  const stopAllCodeReviews = vi.fn();
  const clearAllGitServices = vi.fn();
  const clearAllWorktreeServices = vi.fn();
  const autoUpdaterCleanup = vi.fn();
  const disposeClaudeIdeBridge = vi.fn();
  const remoteCleanup = vi.fn();
  const cleanupTodo = vi.fn();
  const cleanupTodoSync = vi.fn();
  const webInspectorStop = vi.fn();
  const listCachedSessionsSync = vi.fn<() => PersistentAgentSessionRecord[]>(() => []);

  function reset() {
    const fns = [
      registerGitHandlers,
      registerWorktreeHandlers,
      registerFileHandlers,
      registerSessionHandlers,
      registerAgentInputHandlers,
      registerSessionStorageHandlers,
      registerAgentHandlers,
      registerAgentSubagentHandlers,
      registerAgentSessionHandlers,
      registerDialogHandlers,
      registerAppHandlers,
      registerCliHandlers,
      registerShellHandlers,
      registerSettingsHandlers,
      registerLogHandlers,
      registerNotificationHandlers,
      registerRemoteHandlers,
      registerUpdaterHandlers,
      registerSearchHandlers,
      registerHapiHandlers,
      registerClaudeProviderHandlers,
      registerClaudeConfigHandlers,
      registerClaudeCompletionsHandlers,
      registerWebInspectorHandlers,
      registerTempWorkspaceHandlers,
      registerTmuxHandlers,
      registerTodoHandlers,
      cleanupExecInPtys,
      cleanupExecInPtysSync,
      cleanupHapi,
      cleanupHapiSync,
      destroyAllTerminals,
      destroyAllTerminalsAndWait,
      stopAllFileWatchers,
      stopAllFileWatchersSync,
      stopClaudeCompletionsWatchers,
      cleanupTempFiles,
      cleanupTempFilesSync,
      cleanupTmuxSync,
      stopAllCodeReviews,
      clearAllGitServices,
      clearAllWorktreeServices,
      autoUpdaterCleanup,
      disposeClaudeIdeBridge,
      remoteCleanup,
      cleanupTodo,
      cleanupTodoSync,
      webInspectorStop,
      listCachedSessionsSync,
    ];

    for (const fn of fns) {
      fn.mockReset();
    }

    cleanupExecInPtys.mockResolvedValue(undefined);
    cleanupHapi.mockResolvedValue(undefined);
    destroyAllTerminalsAndWait.mockResolvedValue(undefined);
    stopAllFileWatchers.mockResolvedValue(undefined);
    stopClaudeCompletionsWatchers.mockResolvedValue(undefined);
    cleanupTempFiles.mockResolvedValue(undefined);
    remoteCleanup.mockResolvedValue(undefined);
    cleanupTodo.mockResolvedValue(undefined);
    webInspectorStop.mockResolvedValue(undefined);
    listCachedSessionsSync.mockReturnValue([]);
  }

  return {
    registerGitHandlers,
    registerWorktreeHandlers,
    registerFileHandlers,
    registerSessionHandlers,
    registerAgentInputHandlers,
    registerSessionStorageHandlers,
    registerAgentHandlers,
    registerAgentSubagentHandlers,
    registerAgentSessionHandlers,
    registerDialogHandlers,
    registerAppHandlers,
    registerCliHandlers,
    registerShellHandlers,
    registerSettingsHandlers,
    registerLogHandlers,
    registerNotificationHandlers,
    registerRemoteHandlers,
    registerUpdaterHandlers,
    registerSearchHandlers,
    registerHapiHandlers,
    registerClaudeProviderHandlers,
    registerClaudeConfigHandlers,
    registerClaudeCompletionsHandlers,
    registerWebInspectorHandlers,
    registerTempWorkspaceHandlers,
    registerTmuxHandlers,
    registerTodoHandlers,
    cleanupExecInPtys,
    cleanupExecInPtysSync,
    cleanupHapi,
    cleanupHapiSync,
    destroyAllTerminals,
    destroyAllTerminalsAndWait,
    stopAllFileWatchers,
    stopAllFileWatchersSync,
    stopClaudeCompletionsWatchers,
    cleanupTempFiles,
    cleanupTempFilesSync,
    cleanupTmuxSync,
    stopAllCodeReviews,
    clearAllGitServices,
    clearAllWorktreeServices,
    autoUpdaterCleanup,
    disposeClaudeIdeBridge,
    remoteCleanup,
    cleanupTodo,
    cleanupTodoSync,
    webInspectorStop,
    listCachedSessionsSync,
    reset,
  };
});

function makePersistentAgentSessionRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'claude',
    agentCommand: 'claude',
    customPath: undefined,
    customArgs: undefined,
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
    metadata: undefined,
    ...overrides,
  };
}

vi.mock('../../services/ai', () => ({
  stopAllCodeReviews: indexTestDoubles.stopAllCodeReviews,
}));

vi.mock('../../services/claude/ClaudeIdeBridge', () => ({
  disposeClaudeIdeBridge: indexTestDoubles.disposeClaudeIdeBridge,
}));

vi.mock('../../services/updater/AutoUpdater', () => ({
  autoUpdaterService: {
    cleanup: indexTestDoubles.autoUpdaterCleanup,
  },
}));

vi.mock('../../services/webInspector', () => ({
  webInspectorServer: {
    stop: indexTestDoubles.webInspectorStop,
  },
}));

vi.mock('../../utils/shell', () => ({
  cleanupExecInPtys: indexTestDoubles.cleanupExecInPtys,
  cleanupExecInPtysSync: indexTestDoubles.cleanupExecInPtysSync,
}));

vi.mock('../agent', () => ({
  registerAgentHandlers: indexTestDoubles.registerAgentHandlers,
}));

vi.mock('../agentInput', () => ({
  registerAgentInputHandlers: indexTestDoubles.registerAgentInputHandlers,
}));

vi.mock('../agentSession', () => ({
  registerAgentSessionHandlers: indexTestDoubles.registerAgentSessionHandlers,
}));

vi.mock('../app', () => ({
  registerAppHandlers: indexTestDoubles.registerAppHandlers,
}));

vi.mock('../claudeCompletions', () => ({
  registerClaudeCompletionsHandlers: indexTestDoubles.registerClaudeCompletionsHandlers,
  stopClaudeCompletionsWatchers: indexTestDoubles.stopClaudeCompletionsWatchers,
}));

vi.mock('../claudeConfig', () => ({
  registerClaudeConfigHandlers: indexTestDoubles.registerClaudeConfigHandlers,
}));

vi.mock('../claudeProvider', () => ({
  registerClaudeProviderHandlers: indexTestDoubles.registerClaudeProviderHandlers,
}));

vi.mock('../cli', () => ({
  registerCliHandlers: indexTestDoubles.registerCliHandlers,
}));

vi.mock('../dialog', () => ({
  registerDialogHandlers: indexTestDoubles.registerDialogHandlers,
}));

vi.mock('../files', () => ({
  cleanupTempFiles: indexTestDoubles.cleanupTempFiles,
  cleanupTempFilesSync: indexTestDoubles.cleanupTempFilesSync,
  registerFileHandlers: indexTestDoubles.registerFileHandlers,
  stopAllFileWatchers: indexTestDoubles.stopAllFileWatchers,
  stopAllFileWatchersSync: indexTestDoubles.stopAllFileWatchersSync,
}));

vi.mock('../git', () => ({
  clearAllGitServices: indexTestDoubles.clearAllGitServices,
  registerGitHandlers: indexTestDoubles.registerGitHandlers,
}));

vi.mock('../hapi', () => ({
  autoStartHapi: vi.fn(),
  cleanupHapi: indexTestDoubles.cleanupHapi,
  cleanupHapiSync: indexTestDoubles.cleanupHapiSync,
  registerHapiHandlers: indexTestDoubles.registerHapiHandlers,
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    cleanup: indexTestDoubles.remoteCleanup,
  },
}));

vi.mock('../log', () => ({
  registerLogHandlers: indexTestDoubles.registerLogHandlers,
}));

vi.mock('../notification', () => ({
  registerNotificationHandlers: indexTestDoubles.registerNotificationHandlers,
}));

vi.mock('../remote', () => ({
  registerRemoteHandlers: indexTestDoubles.registerRemoteHandlers,
}));

vi.mock('../search', () => ({
  registerSearchHandlers: indexTestDoubles.registerSearchHandlers,
}));

vi.mock('../session', () => ({
  destroyAllTerminals: indexTestDoubles.destroyAllTerminals,
  destroyAllTerminalsAndWait: indexTestDoubles.destroyAllTerminalsAndWait,
  registerSessionHandlers: indexTestDoubles.registerSessionHandlers,
}));

vi.mock('../sessionStorage', () => ({
  registerSessionStorageHandlers: indexTestDoubles.registerSessionStorageHandlers,
}));

vi.mock('../settings', () => ({
  registerSettingsHandlers: indexTestDoubles.registerSettingsHandlers,
}));

vi.mock('../shell', () => ({
  registerShellHandlers: indexTestDoubles.registerShellHandlers,
}));

vi.mock('../tempWorkspace', () => ({
  registerTempWorkspaceHandlers: indexTestDoubles.registerTempWorkspaceHandlers,
}));

vi.mock('../tmux', () => ({
  cleanupTmuxSync: indexTestDoubles.cleanupTmuxSync,
  registerTmuxHandlers: indexTestDoubles.registerTmuxHandlers,
}));

vi.mock('../todo', () => ({
  cleanupTodo: indexTestDoubles.cleanupTodo,
  cleanupTodoSync: indexTestDoubles.cleanupTodoSync,
  registerTodoHandlers: indexTestDoubles.registerTodoHandlers,
}));

vi.mock('../updater', () => ({
  registerUpdaterHandlers: indexTestDoubles.registerUpdaterHandlers,
}));

vi.mock('../webInspector', () => ({
  registerWebInspectorHandlers: indexTestDoubles.registerWebInspectorHandlers,
}));

vi.mock('../worktree', () => ({
  clearAllWorktreeServices: indexTestDoubles.clearAllWorktreeServices,
  registerWorktreeHandlers: indexTestDoubles.registerWorktreeHandlers,
}));

vi.mock('../agentSubagent', () => ({
  registerAgentSubagentHandlers: indexTestDoubles.registerAgentSubagentHandlers,
}));

vi.mock('../../services/SharedSessionState', () => ({
  readPersistentAgentSessions: vi.fn(() => []),
}));

vi.mock('../../services/session/PersistentAgentSessionService', () => ({
  persistentAgentSessionService: {
    listCachedSessionsSync: indexTestDoubles.listCachedSessionsSync,
  },
}));

describe('ipc index', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    indexTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers every IPC domain handler', async () => {
    const { registerIpcHandlers } = await import('../index');
    registerIpcHandlers();

    const registerFns = [
      indexTestDoubles.registerGitHandlers,
      indexTestDoubles.registerWorktreeHandlers,
      indexTestDoubles.registerFileHandlers,
      indexTestDoubles.registerSessionHandlers,
      indexTestDoubles.registerAgentInputHandlers,
      indexTestDoubles.registerSessionStorageHandlers,
      indexTestDoubles.registerAgentHandlers,
      indexTestDoubles.registerAgentSubagentHandlers,
      indexTestDoubles.registerAgentSessionHandlers,
      indexTestDoubles.registerDialogHandlers,
      indexTestDoubles.registerAppHandlers,
      indexTestDoubles.registerCliHandlers,
      indexTestDoubles.registerShellHandlers,
      indexTestDoubles.registerSettingsHandlers,
      indexTestDoubles.registerLogHandlers,
      indexTestDoubles.registerNotificationHandlers,
      indexTestDoubles.registerRemoteHandlers,
      indexTestDoubles.registerUpdaterHandlers,
      indexTestDoubles.registerSearchHandlers,
      indexTestDoubles.registerHapiHandlers,
      indexTestDoubles.registerClaudeProviderHandlers,
      indexTestDoubles.registerClaudeConfigHandlers,
      indexTestDoubles.registerClaudeCompletionsHandlers,
      indexTestDoubles.registerWebInspectorHandlers,
      indexTestDoubles.registerTempWorkspaceHandlers,
      indexTestDoubles.registerTmuxHandlers,
      indexTestDoubles.registerTodoHandlers,
    ];

    for (const fn of registerFns) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  }, 15000);

  it('cleans up async resources and falls back when terminal shutdown fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    indexTestDoubles.destroyAllTerminalsAndWait.mockRejectedValueOnce(new Error('pty still busy'));

    const { cleanupAllResources } = await import('../index');
    await cleanupAllResources();

    expect(indexTestDoubles.cleanupExecInPtys).toHaveBeenCalledWith(4000);
    expect(indexTestDoubles.cleanupHapi).toHaveBeenCalledWith(4000);
    expect(indexTestDoubles.destroyAllTerminalsAndWait).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.destroyAllTerminals).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.stopAllFileWatchers).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.stopClaudeCompletionsWatchers).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTempFiles).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTmuxSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.webInspectorStop).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.stopAllCodeReviews).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.clearAllGitServices).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.clearAllWorktreeServices).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.autoUpdaterCleanup).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.disposeClaudeIdeBridge).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.remoteCleanup).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTodo).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[cleanup] terminals warning:',
      expect.objectContaining({ message: 'pty still busy' })
    );
  });

  it('logs sync cleanup steps and force-cleans every synchronous resource', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { cleanupAllResourcesSync } = await import('../index');
    cleanupAllResourcesSync();

    expect(indexTestDoubles.cleanupExecInPtysSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupHapiSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTmuxSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.webInspectorStop).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.destroyAllTerminals).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.stopAllCodeReviews).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.stopAllFileWatchersSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.clearAllGitServices).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.clearAllWorktreeServices).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.autoUpdaterCleanup).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.disposeClaudeIdeBridge).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.remoteCleanup).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTodoSync).toHaveBeenCalledTimes(1);
    expect(indexTestDoubles.cleanupTempFilesSync).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenNthCalledWith(1, '[app] Sync cleanup starting...');
    expect(logSpy).toHaveBeenNthCalledWith(2, '[app] Sync cleanup done');
  });

  it('still cleans up the tmux server when cached records are missing host sessions', async () => {
    indexTestDoubles.listCachedSessionsSync.mockReturnValue([
      makePersistentAgentSessionRecord({
        hostKind: 'tmux',
        lastKnownState: 'missing-host-session',
      }),
    ]);

    const { cleanupAllResourcesSync } = await import('../index');
    cleanupAllResourcesSync();

    expect(indexTestDoubles.cleanupTmuxSync).toHaveBeenCalledTimes(1);
  });

  it('ignores remote virtual-path tmux records when deciding sync cleanup', async () => {
    indexTestDoubles.listCachedSessionsSync.mockReturnValue([
      makePersistentAgentSessionRecord({
        hostKind: 'tmux',
        lastKnownState: 'live',
        cwd: toRemoteVirtualPath('conn-1', '/repo/worktree'),
      }),
    ]);

    const { cleanupAllResourcesSync } = await import('../index');
    cleanupAllResourcesSync();

    expect(indexTestDoubles.cleanupTmuxSync).toHaveBeenCalledTimes(1);
  });
});
