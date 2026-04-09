import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const auxTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const getSessionState = vi.fn();
  const syncLocalStorage = vi.fn();
  const importLegacyLocalStorage = vi.fn();
  const isLegacyLocalStorageMigrated = vi.fn();

  const tmuxCheck = vi.fn();
  const tmuxKillSession = vi.fn();
  const tmuxScrollClient = vi.fn();
  const tmuxKillServer = vi.fn();
  const tmuxKillServerSync = vi.fn();
  const remoteCall = vi.fn();
  const resolveRepositoryRuntimeContext = vi.fn((repoPath?: string) =>
    repoPath?.startsWith('/__remote__/')
      ? { kind: 'remote', connectionId: 'conn-1' }
      : { kind: 'local' }
  );

  const detectShells = vi.fn();
  const resolveShellForCommand = vi.fn();

  const agentList = vi.fn();
  const AgentRegistry = vi.fn(function (this: { list: () => unknown }) {
    this.list = auxTestDoubles.agentList;
  });
  const BUILTIN_AGENTS = [{ id: 'claude-code' }];

  const initializeTodo = vi.fn();
  const migrateFromLocalStorage = vi.fn();
  const closeTodo = vi.fn();
  const closeTodoSync = vi.fn();
  const getTodoTasks = vi.fn();
  const addTodoTask = vi.fn();
  const updateTodoTask = vi.fn();
  const deleteTodoTask = vi.fn();
  const moveTodoTask = vi.fn();
  const reorderTodoTasks = vi.fn();
  const polishTodoTask = vi.fn();

  const sessionDestroyAll = vi.fn();
  const sessionDestroyAllAndWait = vi.fn();
  const registerSessionHandlers = vi.fn();

  function reset() {
    handlers.clear();

    getSessionState.mockReset();
    getSessionState.mockReturnValue({ active: 'session-1' });
    syncLocalStorage.mockReset();
    importLegacyLocalStorage.mockReset();
    isLegacyLocalStorageMigrated.mockReset();
    isLegacyLocalStorageMigrated.mockReturnValue(true);

    tmuxCheck.mockReset();
    tmuxCheck.mockResolvedValue({ installed: true });
    tmuxKillSession.mockReset();
    tmuxKillSession.mockResolvedValue({ killed: true });
    tmuxScrollClient.mockReset();
    tmuxScrollClient.mockResolvedValue({ applied: true, paneId: '%0' });
    tmuxKillServer.mockReset();
    tmuxKillServer.mockResolvedValue(undefined);
    tmuxKillServerSync.mockReset();
    remoteCall.mockReset();
    remoteCall.mockResolvedValue({ remote: true });
    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockImplementation((repoPath?: string) =>
      repoPath?.startsWith('/__remote__/')
        ? { kind: 'remote', connectionId: 'conn-1' }
        : { kind: 'local' }
    );

    detectShells.mockReset();
    detectShells.mockResolvedValue([{ shell: '/bin/zsh' }]);
    resolveShellForCommand.mockReset();
    resolveShellForCommand.mockReturnValue({ shell: '/bin/zsh', execArgs: ['-lc'] });

    agentList.mockReset();
    agentList.mockReturnValue([{ id: 'claude-code' }]);
    AgentRegistry.mockClear();

    initializeTodo.mockReset();
    initializeTodo.mockResolvedValue(undefined);
    migrateFromLocalStorage.mockReset();
    migrateFromLocalStorage.mockResolvedValue({ migrated: true });
    closeTodo.mockReset();
    closeTodo.mockResolvedValue(undefined);
    closeTodoSync.mockReset();
    getTodoTasks.mockReset();
    getTodoTasks.mockReturnValue([{ id: 'task-1' }]);
    addTodoTask.mockReset();
    addTodoTask.mockResolvedValue({ id: 'task-1' });
    updateTodoTask.mockReset();
    updateTodoTask.mockResolvedValue({ updated: true });
    deleteTodoTask.mockReset();
    deleteTodoTask.mockResolvedValue({ deleted: true });
    moveTodoTask.mockReset();
    moveTodoTask.mockResolvedValue({ moved: true });
    reorderTodoTasks.mockReset();
    reorderTodoTasks.mockResolvedValue({ reordered: true });
    polishTodoTask.mockReset();
    polishTodoTask.mockResolvedValue({
      success: true,
      title: 'Polished title',
      description: 'Polished description',
    });

    sessionDestroyAll.mockReset();
    sessionDestroyAllAndWait.mockReset();
    sessionDestroyAllAndWait.mockResolvedValue(undefined);
    registerSessionHandlers.mockReset();
  }

  return {
    handlers,
    getSessionState,
    syncLocalStorage,
    importLegacyLocalStorage,
    isLegacyLocalStorageMigrated,
    tmuxCheck,
    tmuxKillSession,
    tmuxScrollClient,
    tmuxKillServer,
    tmuxKillServerSync,
    remoteCall,
    resolveRepositoryRuntimeContext,
    detectShells,
    resolveShellForCommand,
    agentList,
    AgentRegistry,
    BUILTIN_AGENTS,
    initializeTodo,
    migrateFromLocalStorage,
    closeTodo,
    closeTodoSync,
    getTodoTasks,
    addTodoTask,
    updateTodoTask,
    deleteTodoTask,
    moveTodoTask,
    reorderTodoTasks,
    polishTodoTask,
    sessionDestroyAll,
    sessionDestroyAllAndWait,
    registerSessionHandlers,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      auxTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/LocalSessionManager', () => ({
  localSessionManager: {
    getSessionState: auxTestDoubles.getSessionState,
    syncLocalStorage: auxTestDoubles.syncLocalStorage,
    importLegacyLocalStorage: auxTestDoubles.importLegacyLocalStorage,
    getTodoTasks: auxTestDoubles.getTodoTasks,
    addTodoTask: auxTestDoubles.addTodoTask,
    updateTodoTask: auxTestDoubles.updateTodoTask,
    deleteTodoTask: auxTestDoubles.deleteTodoTask,
    moveTodoTask: auxTestDoubles.moveTodoTask,
    reorderTodoTasks: auxTestDoubles.reorderTodoTasks,
  },
}));

vi.mock('../../services/SharedSessionState', () => ({
  isLegacyLocalStorageMigrated: auxTestDoubles.isLegacyLocalStorageMigrated,
}));

vi.mock('../../services/cli/TmuxDetector', () => ({
  tmuxDetector: {
    check: auxTestDoubles.tmuxCheck,
    killSession: auxTestDoubles.tmuxKillSession,
    scrollClient: auxTestDoubles.tmuxScrollClient,
    killServer: auxTestDoubles.tmuxKillServer,
    killServerSync: auxTestDoubles.tmuxKillServerSync,
  },
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    call: auxTestDoubles.remoteCall,
  },
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: auxTestDoubles.resolveRepositoryRuntimeContext,
}));

vi.mock('../../services/terminal/ShellDetector', () => ({
  shellDetector: {
    detectShells: auxTestDoubles.detectShells,
    resolveShellForCommand: auxTestDoubles.resolveShellForCommand,
  },
}));

vi.mock('../../services/agent/AgentRegistry', () => ({
  AgentRegistry: auxTestDoubles.AgentRegistry,
  BUILTIN_AGENTS: auxTestDoubles.BUILTIN_AGENTS,
}));

vi.mock('../../services/ai', () => ({
  polishTodoTask: auxTestDoubles.polishTodoTask,
}));

vi.mock('../../services/todo/TodoService', () => ({
  initialize: auxTestDoubles.initializeTodo,
  migrateFromLocalStorage: auxTestDoubles.migrateFromLocalStorage,
  close: auxTestDoubles.closeTodo,
  closeSync: auxTestDoubles.closeTodoSync,
}));

vi.mock('../session', () => ({
  destroyAllTerminals: auxTestDoubles.sessionDestroyAll,
  destroyAllTerminalsAndWait: auxTestDoubles.sessionDestroyAllAndWait,
  registerSessionHandlers: auxTestDoubles.registerSessionHandlers,
}));

function getHandler(channel: string) {
  const handler = auxTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('auxiliary IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    auxTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers session storage handlers and delegates to the local session manager', async () => {
    const { registerSessionStorageHandlers } = await import('../sessionStorage');
    registerSessionStorageHandlers();

    expect(await getHandler(IPC_CHANNELS.SESSION_STORAGE_GET)({})).toEqual({ active: 'session-1' });
    expect(
      await getHandler(IPC_CHANNELS.SESSION_STORAGE_SYNC_LOCAL_STORAGE)({}, { key: 'value' })
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.SESSION_STORAGE_IMPORT_LOCAL_STORAGE)({}, { old: 'snapshot' })
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.SESSION_STORAGE_IS_LEGACY_LOCAL_STORAGE_MIGRATED)({})
    ).toBe(true);

    expect(auxTestDoubles.syncLocalStorage).toHaveBeenCalledWith({ key: 'value' });
    expect(auxTestDoubles.importLegacyLocalStorage).toHaveBeenCalledWith({ old: 'snapshot' });
  });

  it('registers tmux handlers for local and remote repositories and cleans up the tmux server', async () => {
    const { cleanupTmux, cleanupTmuxSync, registerTmuxHandlers } = await import('../tmux');
    registerTmuxHandlers();

    expect(await getHandler(IPC_CHANNELS.TMUX_CHECK)({}, '/repo', true)).toEqual({
      installed: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.TMUX_KILL_SESSION)({}, '/repo', {
        name: 'enso',
        serverName: 'enso',
      })
    ).toEqual({
      killed: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.TMUX_SCROLL_CLIENT)({}, '/repo', {
        sessionName: 'enso-ui-session-1',
        direction: 'up',
        amount: 4,
      })
    ).toEqual({
      applied: true,
      paneId: '%0',
    });

    expect(await getHandler(IPC_CHANNELS.TMUX_CHECK)({}, '/__remote__/repo', false)).toEqual({
      remote: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.TMUX_KILL_SESSION)({}, '/__remote__/repo', {
        name: 'enso',
        serverName: 'enso',
      })
    ).toEqual({
      remote: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.TMUX_SCROLL_CLIENT)({}, '/__remote__/repo', {
        sessionName: 'enso-ui-session-1',
        direction: 'down',
        amount: 2,
      })
    ).toEqual({
      remote: true,
    });

    await cleanupTmux();
    cleanupTmuxSync();

    expect(auxTestDoubles.tmuxCheck).toHaveBeenCalledWith(true);
    expect(auxTestDoubles.tmuxKillSession).toHaveBeenCalledWith('enso', 'enso');
    expect(auxTestDoubles.tmuxScrollClient).toHaveBeenCalledWith({
      sessionName: 'enso-ui-session-1',
      direction: 'up',
      amount: 4,
    });
    expect(auxTestDoubles.remoteCall).toHaveBeenNthCalledWith(1, 'conn-1', 'tmux:check', {
      forceRefresh: false,
    });
    expect(auxTestDoubles.remoteCall).toHaveBeenNthCalledWith(2, 'conn-1', 'tmux:killSession', {
      name: 'enso',
      serverName: 'enso',
    });
    expect(auxTestDoubles.remoteCall).toHaveBeenNthCalledWith(
      3,
      'conn-1',
      'tmux:scrollClient',
      expect.objectContaining({
        sessionName: 'enso-ui-session-1',
        direction: 'down',
        amount: 2,
        serverName: expect.any(String),
      })
    );
    expect(auxTestDoubles.tmuxKillServer).toHaveBeenCalledTimes(1);
    expect(auxTestDoubles.tmuxKillServerSync).toHaveBeenCalledTimes(1);
  });

  it('registers shell handlers for local and remote runtime contexts', async () => {
    const { registerShellHandlers } = await import('../shell');
    registerShellHandlers();

    expect(await getHandler(IPC_CHANNELS.SHELL_DETECT)({}, '/repo')).toEqual([
      { shell: '/bin/zsh' },
    ]);
    expect(
      await getHandler(IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND)({}, '/repo', {
        path: '/bin/zsh',
      })
    ).toEqual({
      shell: '/bin/zsh',
      execArgs: ['-lc'],
    });

    expect(await getHandler(IPC_CHANNELS.SHELL_DETECT)({}, '/__remote__/repo')).toEqual({
      remote: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND)({}, '/__remote__/repo', {
        path: '/bin/bash',
      })
    ).toEqual({
      remote: true,
    });

    expect(auxTestDoubles.detectShells).toHaveBeenCalledTimes(1);
    expect(auxTestDoubles.resolveShellForCommand).toHaveBeenCalledWith({ path: '/bin/zsh' });
    expect(auxTestDoubles.remoteCall).toHaveBeenNthCalledWith(1, 'conn-1', 'shell:detect', {});
    expect(auxTestDoubles.remoteCall).toHaveBeenNthCalledWith(
      2,
      'conn-1',
      'shell:resolveForCommand',
      {
        config: { path: '/bin/bash' },
      }
    );
  });

  it('registers the agent list handler using the built-in registry', async () => {
    const { registerAgentHandlers } = await import('../agent');
    registerAgentHandlers();

    expect(await getHandler(IPC_CHANNELS.AGENT_LIST)({})).toEqual([{ id: 'claude-code' }]);
    expect(auxTestDoubles.AgentRegistry).toHaveBeenCalledWith(auxTestDoubles.BUILTIN_AGENTS);
  });

  it('registers todo handlers, waits for initialization before migration and exposes cleanup helpers', async () => {
    let resolveInitialize!: () => void;
    auxTestDoubles.initializeTodo.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInitialize = resolve;
        })
    );

    const { cleanupTodo, cleanupTodoSync, registerTodoHandlers } = await import('../todo');
    registerTodoHandlers();

    const migratePromise = getHandler(IPC_CHANNELS.TODO_MIGRATE)({}, '{"boards":[]}');
    await Promise.resolve();
    expect(auxTestDoubles.migrateFromLocalStorage).not.toHaveBeenCalled();

    resolveInitialize();
    expect(await migratePromise).toEqual({ migrated: true });

    expect(await getHandler(IPC_CHANNELS.TODO_GET_TASKS)({}, '/repo')).toEqual([{ id: 'task-1' }]);
    expect(
      await getHandler(IPC_CHANNELS.TODO_ADD_TASK)({}, '/repo', {
        id: 'task-1',
        title: 'Draft',
        description: '',
        priority: 'high',
        status: 'todo',
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    ).toEqual({ id: 'task-1' });
    expect(
      await getHandler(IPC_CHANNELS.TODO_UPDATE_TASK)({}, '/repo', 'task-1', { status: 'doing' })
    ).toEqual({ updated: true });
    expect(await getHandler(IPC_CHANNELS.TODO_DELETE_TASK)({}, '/repo', 'task-1')).toEqual({
      deleted: true,
    });
    expect(await getHandler(IPC_CHANNELS.TODO_MOVE_TASK)({}, '/repo', 'task-1', 'done', 0)).toEqual(
      {
        moved: true,
      }
    );
    expect(
      await getHandler(IPC_CHANNELS.TODO_REORDER_TASKS)({}, '/repo', 'done', ['task-1'])
    ).toEqual({
      reordered: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.TODO_AI_POLISH)(
        {},
        {
          text: 'Polish this task',
          timeout: 1000,
          provider: 'claude-code',
          model: 'sonnet',
          reasoningEffort: 'medium',
          prompt: 'keep it concise',
        }
      )
    ).toEqual({
      success: true,
      title: 'Polished title',
      description: 'Polished description',
    });

    await cleanupTodo();
    cleanupTodoSync();

    expect(auxTestDoubles.getTodoTasks).toHaveBeenCalledWith('/repo');
    expect(auxTestDoubles.addTodoTask).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ id: 'task-1' })
    );
    expect(auxTestDoubles.polishTodoTask).toHaveBeenCalledWith({
      text: 'Polish this task',
      timeout: 1000,
      provider: 'claude-code',
      model: 'sonnet',
      reasoningEffort: 'medium',
      prompt: 'keep it concise',
    });
    expect(auxTestDoubles.closeTodo).toHaveBeenCalledTimes(1);
    expect(auxTestDoubles.closeTodoSync).toHaveBeenCalledTimes(1);
  });

  it('re-exports terminal handlers from the session module', async () => {
    const terminal = await import('../terminal');

    expect(terminal.destroyAllTerminals).toBe(auxTestDoubles.sessionDestroyAll);
    expect(terminal.destroyAllTerminalsAndWait).toBe(auxTestDoubles.sessionDestroyAllAndWait);
    expect(terminal.registerTerminalHandlers).toBe(auxTestDoubles.registerSessionHandlers);
  });
});
