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
  const getAllTodoProjects = vi.fn();
  const getTodoTasks = vi.fn();
  const addTodoTask = vi.fn();
  const updateTodoTask = vi.fn();
  const deleteTodoTask = vi.fn();
  const moveTodoTask = vi.fn();
  const reorderTodoTasks = vi.fn();
  const migrateTodoBoardsFromLocalStorage = vi.fn();
  const polishTodoTask = vi.fn();
  const generateTodoTasks = vi.fn();

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
    getAllTodoProjects.mockReset();
    getAllTodoProjects.mockReturnValue([{ repoPath: '/repo', tasks: [{ id: 'task-1' }] }]);
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
    migrateTodoBoardsFromLocalStorage.mockReset();
    migrateTodoBoardsFromLocalStorage.mockReturnValue({ migratedTaskCount: 1 });
    polishTodoTask.mockReset();
    polishTodoTask.mockResolvedValue({
      success: true,
      title: 'Polished title',
      description: 'Polished description',
    });
    generateTodoTasks.mockReset();
    generateTodoTasks.mockResolvedValue({
      success: true,
      tasks: [
        {
          title: 'Generated task',
          description: 'Generated description',
          priority: 'medium',
          agentId: 'codex',
        },
      ],
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
    getAllTodoProjects,
    getTodoTasks,
    addTodoTask,
    updateTodoTask,
    deleteTodoTask,
    moveTodoTask,
    reorderTodoTasks,
    migrateTodoBoardsFromLocalStorage,
    polishTodoTask,
    generateTodoTasks,
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
    getAllTodoProjects: auxTestDoubles.getAllTodoProjects,
    getTodoTasks: auxTestDoubles.getTodoTasks,
    addTodoTask: auxTestDoubles.addTodoTask,
    updateTodoTask: auxTestDoubles.updateTodoTask,
    deleteTodoTask: auxTestDoubles.deleteTodoTask,
    moveTodoTask: auxTestDoubles.moveTodoTask,
    reorderTodoTasks: auxTestDoubles.reorderTodoTasks,
    migrateTodoBoardsFromLocalStorage: auxTestDoubles.migrateTodoBoardsFromLocalStorage,
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
  generateTodoTasks: auxTestDoubles.generateTodoTasks,
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

  it('registers todo handlers, migrates localStorage into shared state, and exposes cleanup helpers', async () => {
    const { cleanupTodo, cleanupTodoSync, registerTodoHandlers } = await import('../todo');
    registerTodoHandlers();

    expect(await getHandler(IPC_CHANNELS.TODO_MIGRATE)({}, '{"boards":[]}')).toEqual({
      migratedTaskCount: 1,
    });

    expect(await getHandler(IPC_CHANNELS.TODO_GET_TASKS)({}, '/repo')).toEqual([{ id: 'task-1' }]);
    expect(await getHandler(IPC_CHANNELS.TODO_GET_ALL_PROJECTS)({})).toEqual([
      { repoPath: '/repo', tasks: [{ id: 'task-1' }] },
    ]);
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
        context: {
          repoPath: '/repo',
          worktreePath: '/repo/worktree',
          files: [{ path: 'src/main/index.ts' }],
        },
      })
    ).toEqual({ id: 'task-1' });
    expect(
      await getHandler(IPC_CHANNELS.TODO_UPDATE_TASK)({}, '/repo', 'task-1', {
        status: 'doing',
        context: {
          repoPath: '/repo',
          worktreePath: '/repo/worktree',
          files: [{ path: 'src/renderer/App.tsx', label: 'App.tsx' }],
        },
      })
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
          timeout: 60,
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
    expect(
      await getHandler(IPC_CHANNELS.TODO_AI_GENERATE_TASKS)(
        {},
        {
          text: 'Create a project plan',
          timeout: 60,
          provider: 'codex-cli',
          model: 'gpt-5.2',
          reasoningEffort: 'medium',
          repoPath: '/repo',
          worktreePath: '/repo/worktree',
          context: {
            repoPath: '/repo',
            worktreePath: '/repo/worktree',
            dependencyTaskIds: ['task-1', 'task-1', ' '],
            executionGate: {
              approvedAt: 123,
              requiresApproval: true,
            },
            files: [{ path: 'src/renderer/App.tsx', label: 'App.tsx' }],
            directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
          },
          agents: [
            {
              agentId: 'codex',
              command: 'codex',
              isDefault: true,
              name: 'Codex',
            },
          ],
          maxTasks: 5,
        }
      )
    ).toEqual({
      success: true,
      tasks: [
        {
          title: 'Generated task',
          description: 'Generated description',
          priority: 'medium',
          agentId: 'codex',
        },
      ],
    });

    await cleanupTodo();
    cleanupTodoSync();

    expect(auxTestDoubles.getAllTodoProjects).toHaveBeenCalledWith();
    expect(auxTestDoubles.getTodoTasks).toHaveBeenCalledWith('/repo');
    expect(auxTestDoubles.addTodoTask).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({
        id: 'task-1',
        context: {
          repoPath: '/repo',
          worktreePath: '/repo/worktree',
          files: [{ path: 'src/main/index.ts' }],
        },
      })
    );
    expect(auxTestDoubles.updateTodoTask).toHaveBeenCalledWith(
      '/repo',
      'task-1',
      expect.objectContaining({
        context: {
          repoPath: '/repo',
          worktreePath: '/repo/worktree',
          files: [{ path: 'src/renderer/App.tsx', label: 'App.tsx' }],
        },
      })
    );
    expect(auxTestDoubles.polishTodoTask).toHaveBeenCalledWith({
      text: 'Polish this task',
      timeout: 60,
      provider: 'claude-code',
      model: 'sonnet',
      reasoningEffort: 'medium',
      prompt: 'keep it concise',
    });
    expect(auxTestDoubles.generateTodoTasks).toHaveBeenCalledWith({
      text: 'Create a project plan',
      timeout: 60,
      provider: 'codex-cli',
      model: 'gpt-5.2',
      reasoningEffort: 'medium',
      repoPath: '/repo',
      worktreePath: '/repo/worktree',
      context: {
        repoPath: '/repo',
        worktreePath: '/repo/worktree',
        dependencyTaskIds: ['task-1'],
        executionGate: {
          approvedAt: 123,
          requiresApproval: true,
        },
        files: [{ path: 'src/renderer/App.tsx', label: 'App.tsx' }],
        directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
      },
      agents: [
        {
          agentId: 'codex',
          command: 'codex',
          isDefault: true,
          name: 'Codex',
        },
      ],
      maxTasks: 5,
    });
    expect(auxTestDoubles.initializeTodo).not.toHaveBeenCalled();
    expect(auxTestDoubles.migrateTodoBoardsFromLocalStorage).toHaveBeenCalledWith('{"boards":[]}');
    expect(auxTestDoubles.migrateFromLocalStorage).not.toHaveBeenCalled();
    expect(auxTestDoubles.closeTodo).toHaveBeenCalledTimes(1);
    expect(auxTestDoubles.closeTodoSync).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid todo AI polish provider and model payloads at the IPC boundary', async () => {
    const { registerTodoHandlers } = await import('../todo');
    registerTodoHandlers();

    await expect(
      getHandler(IPC_CHANNELS.TODO_AI_POLISH)(
        {},
        {
          text: 'Polish this task',
          timeout: 60,
          provider: 'claude-code; rm -rf /',
          model: 'sonnet',
        }
      )
    ).rejects.toThrow('Unsupported AI provider');

    await expect(
      getHandler(IPC_CHANNELS.TODO_AI_POLISH)(
        {},
        {
          text: 'Polish this task',
          timeout: 60,
          provider: 'claude-code',
          model: 'gpt-5.2',
        }
      )
    ).rejects.toThrow('Unsupported model');

    expect(auxTestDoubles.polishTodoTask).not.toHaveBeenCalled();
  });

  it('rejects invalid todo AI task generation provider and agent payloads at the IPC boundary', async () => {
    const { registerTodoHandlers } = await import('../todo');
    registerTodoHandlers();

    await expect(
      getHandler(IPC_CHANNELS.TODO_AI_GENERATE_TASKS)(
        {},
        {
          text: 'Plan this work',
          timeout: 60,
          provider: 'codex-cli',
          model: 'sonnet',
          agents: [],
        }
      )
    ).rejects.toThrow('Unsupported model');

    await expect(
      getHandler(IPC_CHANNELS.TODO_AI_GENERATE_TASKS)(
        {},
        {
          text: 'Plan this work',
          timeout: 60,
          provider: 'codex-cli',
          model: 'gpt-5.2',
          agents: [{ agentId: '', command: 'codex', name: 'Codex' }],
        }
      )
    ).rejects.toThrow('Todo AI generate agent id must be a non-empty string');

    expect(auxTestDoubles.generateTodoTasks).not.toHaveBeenCalled();
  });

  it('re-exports terminal handlers from the session module', async () => {
    const terminal = await import('../terminal');

    expect(terminal.destroyAllTerminals).toBe(auxTestDoubles.sessionDestroyAll);
    expect(terminal.destroyAllTerminalsAndWait).toBe(auxTestDoubles.sessionDestroyAllAndWait);
    expect(terminal.registerTerminalHandlers).toBe(auxTestDoubles.registerSessionHandlers);
  });
});
