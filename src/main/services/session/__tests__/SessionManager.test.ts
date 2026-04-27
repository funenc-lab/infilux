import { IPC_CHANNELS, type SessionAttachResult, type SessionDescriptor } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionTestDoubles = vi.hoisted(() => {
  const windowRegistry = new Map<
    number,
    {
      webContents: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean };
      isDestroyed: () => boolean;
    }
  >();

  class MockBrowserWindow {
    id: number;
    webContents: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean };

    constructor(id: number) {
      this.id = id;
      this.webContents = {
        send: vi.fn(),
        isDestroyed: () => false,
      };
      windowRegistry.set(id, this as never);
    }

    isDestroyed(): boolean {
      return false;
    }

    static fromId(id: number) {
      return windowRegistry.get(id) ?? null;
    }

    static fromWebContents(target: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean }) {
      for (const window of windowRegistry.values()) {
        if (window.webContents === target) {
          return window as MockBrowserWindow;
        }
      }
      return null;
    }
  }

  type PtyCallbacks = {
    onData: (data: string) => void;
    onExit: (exitCode: number, signal?: number) => void;
  };

  const ptyInstances: MockPtyManager[] = [];

  class MockPtyManager {
    private nextId = 1;
    private createError: Error | null = null;
    readonly callbacks = new Map<string, PtyCallbacks>();
    readonly destroy = vi.fn((sessionId: string) => {
      this.callbacks.delete(sessionId);
    });
    readonly write = vi.fn();
    readonly resize = vi.fn();
    readonly getProcessActivity = vi.fn(async () => false);
    readonly getProcessInfo = vi.fn(async (sessionId: string) => {
      const session = this.callbacks.has(sessionId);
      return session ? { pid: 3001, isActive: false, isAlive: true } : null;
    });
    readonly destroyAll = vi.fn();
    readonly destroyAllAndWait = vi.fn(async () => {});

    constructor() {
      ptyInstances.push(this);
    }

    allocateId(): string {
      return `local-${this.nextId++}`;
    }

    failNextCreate(error: Error): void {
      this.createError = error;
    }

    create(
      _options: unknown,
      onData: (data: string) => void,
      onExit: (exitCode: number, signal?: number) => void,
      sessionId: string
    ): void {
      if (this.createError) {
        const error = this.createError;
        this.createError = null;
        throw error;
      }
      this.callbacks.set(sessionId, { onData, onExit });
    }

    emitData(sessionId: string, data: string): void {
      this.callbacks.get(sessionId)?.onData(data);
    }

    emitExit(sessionId: string, exitCode: number, signal?: number): void {
      this.callbacks.get(sessionId)?.onExit(exitCode, signal);
    }
  }

  const remoteDataListeners = new Map<string, (payload: unknown) => void>();
  const remoteExitListeners = new Map<string, (payload: unknown) => void>();
  const remoteDisconnectListeners = new Map<string, () => void>();
  const remoteStatusListeners = new Map<
    string,
    (status: { connected: boolean; recoverable?: boolean; phase?: string }) => void
  >();
  const remoteOffCallbacks: ReturnType<typeof vi.fn>[] = [];
  const supervisorCreateSession = vi.fn();
  const supervisorAttachSession = vi.fn();
  const supervisorDetachSession = vi.fn();
  const supervisorKillSession = vi.fn();
  const supervisorWriteSession = vi.fn();
  const supervisorResizeSession = vi.fn();
  const supervisorGetSessionActivity = vi.fn();
  const supervisorHasSession = vi.fn();
  const supervisorOnData = vi.fn();
  const supervisorOnExit = vi.fn();
  const supervisorOnDisconnect = vi.fn();
  const persistentAbandonSession = vi.fn();
  const tmuxEnsureServerHealthy = vi.fn();
  const tmuxCaptureSessionHistory = vi.fn();
  const logInfo = vi.fn();
  const requestMainProcessDiagnosticsCapture = vi.fn(() => 'diag-session');
  const registerMainProcessDiagnosticsCollector = vi.fn(() => vi.fn());
  const remoteConnectionManager = {
    getStatus: vi.fn<(connectionId: string) => { connected: boolean; recoverable?: boolean }>(),
    call: vi.fn<(connectionId: string, method: string, payload: unknown) => Promise<unknown>>(),
    addEventListener: vi.fn(
      async (connectionId: string, event: string, listener: (payload: unknown) => void) => {
        if (event === 'remote:session:data') {
          remoteDataListeners.set(connectionId, listener);
        }
        if (event === 'remote:session:exit') {
          remoteExitListeners.set(connectionId, listener);
        }
        const off = vi.fn(() => {
          if (event === 'remote:session:data') {
            remoteDataListeners.delete(connectionId);
          }
          if (event === 'remote:session:exit') {
            remoteExitListeners.delete(connectionId);
          }
        });
        remoteOffCallbacks.push(off);
        return off;
      }
    ),
    onDidDisconnect: vi.fn((connectionId: string, listener: () => void) => {
      remoteDisconnectListeners.set(connectionId, listener);
      const off = vi.fn(() => {
        remoteDisconnectListeners.delete(connectionId);
      });
      remoteOffCallbacks.push(off);
      return off;
    }),
    onDidStatusChange: vi.fn(
      (
        connectionId: string,
        listener: (status: { connected: boolean; recoverable?: boolean; phase?: string }) => void
      ) => {
        remoteStatusListeners.set(connectionId, listener);
        const off = vi.fn(() => {
          remoteStatusListeners.delete(connectionId);
        });
        remoteOffCallbacks.push(off);
        return off;
      }
    ),
  };

  return {
    windowRegistry,
    MockBrowserWindow,
    ptyInstances,
    MockPtyManager,
    remoteDataListeners,
    remoteExitListeners,
    remoteDisconnectListeners,
    remoteStatusListeners,
    remoteOffCallbacks,
    supervisorCreateSession,
    supervisorAttachSession,
    supervisorDetachSession,
    supervisorKillSession,
    supervisorWriteSession,
    supervisorResizeSession,
    supervisorGetSessionActivity,
    supervisorHasSession,
    supervisorOnData,
    supervisorOnExit,
    supervisorOnDisconnect,
    persistentAbandonSession,
    tmuxEnsureServerHealthy,
    tmuxCaptureSessionHistory,
    logInfo,
    requestMainProcessDiagnosticsCapture,
    registerMainProcessDiagnosticsCollector,
    remoteConnectionManager,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: sessionTestDoubles.MockBrowserWindow,
}));

vi.mock('../../terminal/PtyManager', () => ({
  PtyManager: sessionTestDoubles.MockPtyManager,
}));

vi.mock('../../remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: sessionTestDoubles.remoteConnectionManager,
}));

vi.mock('../LocalSupervisorRuntime', () => ({
  localSupervisorRuntime: {
    createSession: sessionTestDoubles.supervisorCreateSession,
    attachSession: sessionTestDoubles.supervisorAttachSession,
    detachSession: sessionTestDoubles.supervisorDetachSession,
    killSession: sessionTestDoubles.supervisorKillSession,
    writeSession: sessionTestDoubles.supervisorWriteSession,
    resizeSession: sessionTestDoubles.supervisorResizeSession,
    getSessionActivity: sessionTestDoubles.supervisorGetSessionActivity,
    hasSession: sessionTestDoubles.supervisorHasSession,
    onData: sessionTestDoubles.supervisorOnData,
    onExit: sessionTestDoubles.supervisorOnExit,
    onDisconnect: sessionTestDoubles.supervisorOnDisconnect,
  },
}));

vi.mock('../PersistentAgentSessionService', () => ({
  persistentAgentSessionService: {
    abandonSession: sessionTestDoubles.persistentAbandonSession,
  },
}));

vi.mock('../../cli/TmuxDetector', () => ({
  tmuxDetector: {
    ensureServerHealthy: sessionTestDoubles.tmuxEnsureServerHealthy,
    captureSessionHistory: sessionTestDoubles.tmuxCaptureSessionHistory,
  },
}));

vi.mock('../../../utils/mainProcessDiagnostics', () => ({
  requestMainProcessDiagnosticsCapture: sessionTestDoubles.requestMainProcessDiagnosticsCapture,
  registerMainProcessDiagnosticsCollector:
    sessionTestDoubles.registerMainProcessDiagnosticsCollector,
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    info: sessionTestDoubles.logInfo,
  },
}));

import { SessionManager } from '../SessionManager';

function createWindow(id: number) {
  return new sessionTestDoubles.MockBrowserWindow(id);
}

function getWindowSendCalls(id: number) {
  return sessionTestDoubles.windowRegistry.get(id)?.webContents.send.mock.calls ?? [];
}

type SessionRecordView = {
  sessionId: string;
  backend: 'local' | 'remote';
  connectionId?: string;
  attachedWindowIds: Set<number>;
  streamState?: 'buffering' | 'attaching' | 'live';
  runtimeState?: 'live' | 'reconnecting' | 'dead';
  replayBuffer?: string;
};

function getManagedSessions(manager: SessionManager) {
  return Reflect.get(manager, 'sessions') as Map<string, SessionRecordView>;
}

function getPrivateMethod<Args extends unknown[], Return>(
  manager: SessionManager,
  name: string
): (...args: Args) => Return {
  return Reflect.get(manager, name).bind(manager) as (...args: Args) => Return;
}

function makeRemoteDescriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
  return {
    sessionId: 'remote-1',
    backend: 'remote',
    kind: 'terminal',
    cwd: '/workspace',
    persistOnDisconnect: true,
    createdAt: 1,
    runtimeState: 'live',
    metadata: undefined,
    ...overrides,
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionTestDoubles.windowRegistry.clear();
    sessionTestDoubles.ptyInstances.length = 0;
    sessionTestDoubles.remoteDataListeners.clear();
    sessionTestDoubles.remoteExitListeners.clear();
    sessionTestDoubles.remoteDisconnectListeners.clear();
    sessionTestDoubles.remoteStatusListeners.clear();
    sessionTestDoubles.remoteOffCallbacks.length = 0;
    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: true,
      recoverable: true,
    });
    sessionTestDoubles.remoteConnectionManager.call.mockReset();
    sessionTestDoubles.remoteConnectionManager.addEventListener.mockClear();
    sessionTestDoubles.remoteConnectionManager.onDidDisconnect.mockClear();
    sessionTestDoubles.remoteConnectionManager.onDidStatusChange.mockClear();
    sessionTestDoubles.supervisorCreateSession.mockReset();
    sessionTestDoubles.supervisorCreateSession.mockResolvedValue({
      session: {
        sessionId: 'supervisor-created',
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 101,
      },
    });
    sessionTestDoubles.supervisorAttachSession.mockReset();
    sessionTestDoubles.supervisorAttachSession.mockResolvedValue({
      session: {
        sessionId: 'supervisor-created',
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 101,
      },
      replay: 'supervisor replay',
    });
    sessionTestDoubles.supervisorDetachSession.mockReset();
    sessionTestDoubles.supervisorDetachSession.mockResolvedValue(undefined);
    sessionTestDoubles.supervisorKillSession.mockReset();
    sessionTestDoubles.supervisorKillSession.mockResolvedValue(undefined);
    sessionTestDoubles.supervisorWriteSession.mockReset();
    sessionTestDoubles.supervisorResizeSession.mockReset();
    sessionTestDoubles.supervisorGetSessionActivity.mockReset();
    sessionTestDoubles.supervisorGetSessionActivity.mockResolvedValue(false);
    sessionTestDoubles.supervisorHasSession.mockReset();
    sessionTestDoubles.supervisorHasSession.mockResolvedValue(true);
    sessionTestDoubles.supervisorOnData.mockReset();
    sessionTestDoubles.supervisorOnData.mockReturnValue(() => {});
    sessionTestDoubles.supervisorOnExit.mockReset();
    sessionTestDoubles.supervisorOnExit.mockReturnValue(() => {});
    sessionTestDoubles.supervisorOnDisconnect.mockReset();
    sessionTestDoubles.supervisorOnDisconnect.mockReturnValue(() => {});
    sessionTestDoubles.persistentAbandonSession.mockReset();
    sessionTestDoubles.persistentAbandonSession.mockResolvedValue([]);
    sessionTestDoubles.tmuxEnsureServerHealthy.mockReset();
    sessionTestDoubles.tmuxEnsureServerHealthy.mockResolvedValue(true);
    sessionTestDoubles.tmuxCaptureSessionHistory.mockReset();
    sessionTestDoubles.tmuxCaptureSessionHistory.mockResolvedValue('');
    sessionTestDoubles.logInfo.mockReset();
    sessionTestDoubles.requestMainProcessDiagnosticsCapture.mockReset();
    sessionTestDoubles.requestMainProcessDiagnosticsCapture.mockReturnValue('diag-session');
    sessionTestDoubles.registerMainProcessDiagnosticsCollector.mockReset();
    sessionTestDoubles.registerMainProcessDiagnosticsCollector.mockReturnValue(vi.fn());
  });

  it('buffers local output until attach completes and destroys the session when the last window detaches', async () => {
    createWindow(1);
    const manager = new SessionManager();

    const createResult = await manager.create(1, { cwd: '/repo-a' });
    const sessionId = createResult.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    pty.emitData(sessionId, 'hello');
    expect(getWindowSendCalls(1)).toEqual([]);

    const attachResult = await manager.attach(1, { sessionId });
    expect(attachResult.replay).toBe('hello');

    pty.emitData(sessionId, ' world');
    expect(getWindowSendCalls(1)).toEqual([]);

    await vi.runAllTimersAsync();

    expect(getWindowSendCalls(1)).toContainEqual(['session:data', { sessionId, data: ' world' }]);

    await manager.detach(1, sessionId);

    expect(pty.destroy).toHaveBeenCalledWith(sessionId);
    expect(manager.list(1)).toEqual([]);
  });

  it('creates local sessions from web contents, rolls back failed PTY creation, and proxies local controls', async () => {
    const window = createWindow(1);
    const target = window.webContents as unknown as Parameters<SessionManager['create']>[0];
    const manager = new SessionManager();
    const pty = sessionTestDoubles.ptyInstances[0];

    pty.failNextCreate(new Error('pty create failed'));
    await expect(manager.create(target, { cwd: '/boom' })).rejects.toThrow('pty create failed');
    expect(manager.list(1)).toEqual([]);

    const opened = await manager.create(target, { cwd: '/repo', kind: 'terminal' });
    manager.write(opened.session.sessionId, 'pwd\n');
    manager.resize(opened.session.sessionId, 120, 40);
    pty.getProcessActivity.mockResolvedValueOnce(true);

    expect(pty.write).toHaveBeenCalledWith(opened.session.sessionId, 'pwd\n');
    expect(pty.resize).toHaveBeenCalledWith(opened.session.sessionId, 120, 40);
    await expect(manager.getActivity(opened.session.sessionId)).resolves.toBe(true);

    await manager.create(1, { cwd: '/repo/sub' });
    await manager.detachWindowSessions(1);

    expect(pty.destroy).toHaveBeenCalledWith(opened.session.sessionId);
    expect(pty.destroy).toHaveBeenCalledWith('local-2');
    expect(manager.list(1)).toEqual([]);

    manager.destroyAllLocal();
    await manager.destroyAllLocalAndWait();

    expect(pty.destroyAll).toHaveBeenCalledTimes(1);
    expect(pty.destroyAllAndWait).toHaveBeenCalledTimes(1);
  });

  it('ensures tmux host health before creating persistent local unix agent sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();

    const opened = await manager.create(1, {
      cwd: '/repo-agent',
      kind: 'agent',
      persistOnDisconnect: true,
      hostSession: {
        kind: 'tmux',
        serverName: 'enso',
        sessionName: 'enso-ui-session-1',
      },
    });

    expect(opened.session.sessionId).toBe('local-1');
    expect(sessionTestDoubles.tmuxEnsureServerHealthy).toHaveBeenCalledWith('enso');
  });

  it('surfaces tmux health check resource exhaustion as a session creation error', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const error = new Error(
      'fork failed: resource temporarily unavailable'
    ) as NodeJS.ErrnoException;
    error.code = 'EAGAIN';
    sessionTestDoubles.tmuxEnsureServerHealthy.mockRejectedValueOnce(error);

    await expect(
      manager.create(1, {
        cwd: '/repo-agent',
        kind: 'agent',
        persistOnDisconnect: true,
        hostSession: {
          kind: 'tmux',
          serverName: 'infilux',
          sessionName: 'infilux-ui-session-1',
        },
      })
    ).rejects.toThrow('System resources exhausted while checking tmux server: infilux');

    expect(sessionTestDoubles.requestMainProcessDiagnosticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'session-tmux-healthcheck-resource-exhausted',
        throttleKey: 'session-tmux-healthcheck-resource-exhausted:infilux',
        error,
        context: expect.objectContaining({
          windowId: 1,
          cwd: '/repo-agent',
          kind: 'agent',
          serverName: 'infilux',
          sessionName: 'infilux-ui-session-1',
          errorCode: 'EAGAIN',
        }),
      })
    );
  });

  it('seeds recovered tmux agent sessions with captured host history before attach', async () => {
    createWindow(1);
    const manager = new SessionManager();
    sessionTestDoubles.tmuxCaptureSessionHistory.mockResolvedValueOnce(
      'RECOVERY-LINE-001\nRECOVERY-LINE-002\n'
    );

    const opened = await manager.create(1, {
      cwd: '/repo-agent',
      kind: 'agent',
      persistOnDisconnect: true,
      hostSession: {
        kind: 'tmux',
        serverName: 'enso',
        sessionName: 'enso-ui-session-1',
      },
    });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    pty.emitData(sessionId, 'RECOVERY-LINE-002\n');
    pty.emitData(sessionId, 'prompt> ');

    const attached = await manager.attach(1, { sessionId });

    expect(sessionTestDoubles.tmuxCaptureSessionHistory).toHaveBeenCalledWith(
      'enso-ui-session-1',
      'enso'
    );
    expect(attached.replay).toBe('RECOVERY-LINE-001\nRECOVERY-LINE-002\nprompt> ');
  });

  it('records tmux agent startup stages before creating the local pty', async () => {
    createWindow(1);
    const manager = new SessionManager();

    await manager.create(1, {
      cwd: '/repo-agent',
      kind: 'agent',
      persistOnDisconnect: true,
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'infilux-ui-session-1',
      },
    });

    const startupMessages = sessionTestDoubles.logInfo.mock.calls
      .map((call) => call[0])
      .filter((message): message is string => typeof message === 'string');

    expect(startupMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[agent-startup][main][infilux-ui-session-1] session-create-start'),
        expect.stringContaining(
          '[agent-startup][main][infilux-ui-session-1] tmux-healthcheck-start'
        ),
        expect.stringContaining(
          '[agent-startup][main][infilux-ui-session-1] tmux-healthcheck-done'
        ),
        expect.stringContaining(
          '[agent-startup][main][infilux-ui-session-1] tmux-history-capture-start'
        ),
        expect.stringContaining(
          '[agent-startup][main][infilux-ui-session-1] tmux-history-capture-done'
        ),
        expect.stringContaining('[agent-startup][main][local-1] pty-create-start'),
        expect.stringContaining('[agent-startup][main][local-1] pty-create-returned'),
      ])
    );
  });

  it('accepts BrowserWindow targets and safely handles missing sessions or unresolved web contents', async () => {
    const window = createWindow(3);
    const manager = new SessionManager();

    const opened = await manager.create(
      window as unknown as Parameters<SessionManager['create']>[0],
      {
        cwd: '/repo',
      }
    );
    expect(opened.session.sessionId).toBe('local-1');

    const orphanTarget = {
      send: vi.fn(),
      isDestroyed: () => false,
    } as unknown as Parameters<SessionManager['create']>[0];
    await expect(manager.create(orphanTarget, { cwd: '/repo-orphan' })).rejects.toThrow(
      'Window not found for session'
    );

    await expect(manager.attach(3, { sessionId: 'missing-session' })).rejects.toThrow(
      'Session not found: missing-session'
    );

    await expect(manager.detach(3, 'missing-session')).resolves.toBeUndefined();
    await expect(manager.kill('missing-session')).resolves.toBeUndefined();
    expect(manager.write('missing-session', 'pwd\n')).toBeUndefined();
    expect(manager.resize('missing-session', 120, 40)).toBeUndefined();
    await expect(manager.getActivity('missing-session')).resolves.toBe(false);
    await expect(manager.getSessionRuntimeInfo('missing-session')).resolves.toBeNull();
  });

  it('reports unified runtime info for PTY, supervisor, remote, and missing sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();

    const localOpened = await manager.create(1, { cwd: '/repo', kind: 'terminal' });
    const pty = sessionTestDoubles.ptyInstances[0];
    pty.getProcessInfo.mockResolvedValueOnce({
      pid: 4101,
      isActive: false,
      isAlive: true,
    });

    await expect(manager.getSessionRuntimeInfo(localOpened.session.sessionId)).resolves.toEqual({
      pid: 4101,
      isActive: false,
      isAlive: true,
    });

    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    sessionTestDoubles.supervisorCreateSession.mockResolvedValueOnce({
      session: {
        sessionId: 'supervisor-session-1',
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 501,
      },
    });
    sessionTestDoubles.supervisorGetSessionActivity.mockResolvedValueOnce(true);
    sessionTestDoubles.supervisorHasSession.mockResolvedValueOnce(false);

    try {
      const supervisorOpened = await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      await expect(
        manager.getSessionRuntimeInfo(supervisorOpened.session.sessionId)
      ).resolves.toEqual({
        pid: null,
        isActive: true,
        isAlive: false,
      });
    } finally {
      platform.mockRestore();
    }

    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: makeRemoteDescriptor({
        sessionId: 'remote-runtime',
      }),
      replay: '',
    });
    await manager.attach(1, {
      sessionId: 'remote-runtime',
      cwd: toRemoteVirtualPath('conn-1', '/workspace'),
    });

    await expect(manager.getSessionRuntimeInfo('remote-runtime')).resolves.toEqual({
      pid: null,
      isActive: null,
      isAlive: null,
    });
    await expect(manager.getSessionRuntimeInfo('missing-session')).resolves.toBeNull();
  });

  it('returns a session descriptor for active sessions and null for missing or removed sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-descriptor', kind: 'terminal' });

    expect(manager.getSessionDescriptor(opened.session.sessionId)).toEqual(
      expect.objectContaining({
        sessionId: opened.session.sessionId,
        backend: 'local',
        cwd: '/repo-descriptor',
        kind: 'terminal',
      })
    );
    expect(manager.getSessionDescriptor('missing-session')).toBeNull();

    await manager.kill(opened.session.sessionId);

    expect(manager.getSessionDescriptor(opened.session.sessionId)).toBeNull();
  });

  it('returns local sessions to buffering when attach activation runs without attached windows', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-buffering' });
    const sessionId = opened.session.sessionId;

    await manager.attach(1, { sessionId });

    const session = getManagedSessions(manager).get(sessionId);
    expect(session).toBeDefined();

    session?.attachedWindowIds.clear();
    await vi.runAllTimersAsync();

    expect(session?.streamState).toBe('buffering');
  });

  it('no-ops when delayed local attach activation runs after the session is gone', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const activateLocalStreamAfterAttach = getPrivateMethod<[string, number], void>(
      manager,
      'activateLocalStreamAfterAttach'
    );

    activateLocalStreamAfterAttach('missing-local-session', 0);
    await vi.runAllTimersAsync();

    expect(manager.list(1)).toEqual([]);
  });

  it('emits pending local exits after attach activation completes', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-a' });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    pty.emitData(sessionId, 'boot');
    await manager.attach(1, { sessionId });
    pty.emitExit(sessionId, 130, 9);

    await vi.runAllTimersAsync();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId, exitCode: 130, signal: 9 },
    ]);
    expect(manager.list(1)).toEqual([]);
  });

  it('keeps local sessions alive while another window remains attached', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-shared' });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    await manager.attach(2, { sessionId });
    await manager.detach(1, sessionId);

    expect(pty.destroy).not.toHaveBeenCalledWith(sessionId);
    expect(manager.list(2)).toEqual([
      expect.objectContaining({
        sessionId,
      }),
    ]);
  });

  it('streams local data immediately after activation and emits exits for live PTY sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-live' });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    await manager.attach(1, { sessionId });
    await vi.runAllTimersAsync();

    pty.emitData(sessionId, 'after attach');
    pty.emitExit(sessionId, 0);

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_DATA,
      { sessionId, data: 'after attach' },
    ]);
    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId, exitCode: 0, signal: undefined },
    ]);
    expect(manager.list(1)).toEqual([]);
  });

  it('ignores empty local output and late PTY data after a session has already been removed', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, { cwd: '/repo-ignore' });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    await manager.attach(1, { sessionId });
    await vi.runAllTimersAsync();

    pty.emitData(sessionId, '');
    expect(
      getWindowSendCalls(1).filter(
        (call) => call[0] === IPC_CHANNELS.SESSION_DATA && call[1]?.sessionId === sessionId
      )
    ).toEqual([]);

    pty.destroy.mockImplementation(() => {});
    await manager.kill(sessionId);
    const sendCountAfterKill = getWindowSendCalls(1).length;

    pty.emitData(sessionId, 'late output');

    expect(getWindowSendCalls(1)).toHaveLength(sendCountAfterKill);
  });

  it('abandons persistent ui session records when non-persistent agent sessions exit', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const opened = await manager.create(1, {
      cwd: '/repo-a',
      kind: 'agent',
      persistOnDisconnect: false,
      metadata: {
        uiSessionId: 'ui-session-1',
      },
    });
    const sessionId = opened.session.sessionId;
    const pty = sessionTestDoubles.ptyInstances[0];

    pty.emitExit(sessionId, 0);

    expect(sessionTestDoubles.persistentAbandonSession).toHaveBeenCalledWith('ui-session-1');
  });

  it('keeps persistent ui session records for local unix agent exits so tmux recovery survives app restart', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    try {
      const opened = await manager.create(1, {
        cwd: '/repo-a',
        kind: 'agent',
        persistOnDisconnect: true,
        metadata: {
          uiSessionId: 'ui-session-1',
        },
      });
      const sessionId = opened.session.sessionId;
      const pty = sessionTestDoubles.ptyInstances[0];

      pty.emitExit(sessionId, 0);

      expect(sessionTestDoubles.persistentAbandonSession).not.toHaveBeenCalled();
    } finally {
      platform.mockRestore();
    }
  });

  it('uses the supervisor runtime for persistent Windows agent sessions and restores them by backend session id', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();

    sessionTestDoubles.supervisorCreateSession.mockResolvedValueOnce({
      session: {
        sessionId: 'supervisor-session-1',
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 501,
      },
    });
    sessionTestDoubles.supervisorAttachSession
      .mockResolvedValueOnce({
        session: {
          sessionId: 'supervisor-session-1',
          backend: 'local',
          kind: 'agent',
          cwd: 'C:/repo',
          persistOnDisconnect: true,
          createdAt: 501,
        },
        replay: 'boot replay',
      })
      .mockResolvedValueOnce({
        session: {
          sessionId: 'supervisor-session-1',
          backend: 'local',
          kind: 'agent',
          cwd: 'C:/repo',
          persistOnDisconnect: true,
          createdAt: 501,
        },
        replay: 'restored replay',
      });

    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      const created = await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
        shell: 'powershell.exe',
        args: ['-NoLogo'],
      });

      expect(created.session.sessionId).toBe('supervisor-session-1');
      expect(sessionTestDoubles.supervisorCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
          options: expect.objectContaining({
            cwd: 'C:/repo',
            kind: 'agent',
            persistOnDisconnect: true,
          }),
        })
      );

      const attached = await manager.attach(1, { sessionId: 'supervisor-session-1' });
      expect(attached.replay).toBe('boot replay');
      expect(sessionTestDoubles.supervisorAttachSession).toHaveBeenNthCalledWith(
        1,
        'supervisor-session-1'
      );

      await manager.detach(1, 'supervisor-session-1');
      expect(sessionTestDoubles.supervisorDetachSession).toHaveBeenCalledWith(
        'supervisor-session-1'
      );

      const restored = await manager.attach(2, {
        sessionId: 'supervisor-session-1',
        cwd: 'C:/repo',
      });
      expect(restored.replay).toBe('restored replay');
      expect(sessionTestDoubles.supervisorAttachSession).toHaveBeenNthCalledWith(
        2,
        'supervisor-session-1'
      );
      expect(manager.list(2)).toEqual([
        expect.objectContaining({
          sessionId: 'supervisor-session-1',
          cwd: 'C:/repo',
          kind: 'agent',
        }),
      ]);
    } finally {
      platform.mockRestore();
    }
  });

  it('forwards supervisor runtime data and exit events through the registered callbacks', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      const opened = await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      const onData = sessionTestDoubles.supervisorOnData.mock.calls[0]?.[0] as
        | ((event: { sessionId: string; data: string }) => void)
        | undefined;
      const onExit = sessionTestDoubles.supervisorOnExit.mock.calls[0]?.[0] as
        | ((event: { sessionId: string; exitCode: number; signal?: number }) => void)
        | undefined;

      onData?.({ sessionId: opened.session.sessionId, data: 'supervisor output' });
      onExit?.({ sessionId: opened.session.sessionId, exitCode: 23, signal: 9 });

      expect(getWindowSendCalls(1)).toContainEqual([
        IPC_CHANNELS.SESSION_DATA,
        { sessionId: opened.session.sessionId, data: 'supervisor output' },
      ]);
      expect(getWindowSendCalls(1)).toContainEqual([
        IPC_CHANNELS.SESSION_EXIT,
        { sessionId: opened.session.sessionId, exitCode: 23, signal: 9 },
      ]);
      expect(manager.list(1)).toEqual([]);
    } finally {
      platform.mockRestore();
    }
  });

  it('ignores supervisor runtime data for unknown sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      const onData = sessionTestDoubles.supervisorOnData.mock.calls[0]?.[0] as
        | ((event: { sessionId: string; data: string }) => void)
        | undefined;

      onData?.({ sessionId: 'missing-supervisor-session', data: 'ignored' });

      expect(getWindowSendCalls(1)).toEqual([]);
    } finally {
      platform.mockRestore();
    }
  });

  it('ignores supervisor runtime exit callbacks for sessions that no longer exist', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      const onExit = sessionTestDoubles.supervisorOnExit.mock.calls[0]?.[0] as
        | ((event: { sessionId: string; exitCode: number; signal?: number }) => void)
        | undefined;

      onExit?.({ sessionId: 'missing-supervisor-session', exitCode: 9 });

      expect(getWindowSendCalls(1)).toEqual([]);
    } finally {
      platform.mockRestore();
    }
  });

  it('kills supervisor-backed sessions and falls back to false when supervisor activity checks fail', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      const opened = await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      sessionTestDoubles.supervisorGetSessionActivity.mockRejectedValueOnce(
        new Error('activity failed')
      );

      await expect(manager.getActivity(opened.session.sessionId)).resolves.toBe(false);
      await manager.kill(opened.session.sessionId);

      expect(sessionTestDoubles.supervisorKillSession).toHaveBeenCalledWith(
        opened.session.sessionId
      );
      expect(getWindowSendCalls(1)).toContainEqual([
        IPC_CHANNELS.SESSION_EXIT,
        { sessionId: opened.session.sessionId, exitCode: 0 },
      ]);
      expect(manager.list(1)).toEqual([]);
    } finally {
      platform.mockRestore();
    }
  });

  it('returns the existing replay and emits reconnecting state when attaching a disconnected recoverable remote session', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-1', '/workspace');
    const attachResult: SessionAttachResult = {
      session: makeRemoteDescriptor(),
      replay: 'cached output',
    };

    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce(attachResult);

    await manager.attach(1, { sessionId: 'remote-1', cwd: remotePath });

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: false,
      recoverable: true,
    });

    const result = await manager.attach(2, { sessionId: 'remote-1' });

    expect(result.replay).toBe('cached output');
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-1', state: 'reconnecting' },
    ]);
  });

  it('returns the existing replay and emits dead state when attaching a disconnected non-recoverable remote session', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-1', '/workspace');
    const attachResult: SessionAttachResult = {
      session: makeRemoteDescriptor(),
      replay: 'cached output',
    };

    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce(attachResult);

    await manager.attach(1, { sessionId: 'remote-1', cwd: remotePath });

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: false,
      recoverable: false,
    });

    const result = await manager.attach(2, { sessionId: 'remote-1' });

    expect(result.replay).toBe('cached output');
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-1', state: 'dead' },
    ]);
  });

  it('creates remote sessions and proxies write, resize, activity, and kill operations', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-2', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-2',
      cwd: '/workspace',
      persistOnDisconnect: false,
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:createAndAttach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:getActivity') {
          return true;
        }
        return undefined;
      }
    );

    const opened = await manager.create(1, {
      cwd: remotePath,
      kind: 'terminal',
      persistOnDisconnect: false,
    });

    expect(opened).toEqual({
      session: remoteDescriptor,
      replay: 'boot',
    });
    expect(sessionTestDoubles.remoteConnectionManager.call).toHaveBeenCalledWith(
      'conn-2',
      'session:createAndAttach',
      {
        options: expect.objectContaining({
          cwd: '/workspace',
          persistOnDisconnect: false,
        }),
      }
    );

    const attached = await manager.attach(2, { sessionId: 'remote-2' });
    expect(attached.replay).toBe('boot');

    manager.write('remote-2', 'pwd\n');
    manager.resize('remote-2', 120, 40);
    await flushAsyncWork();

    expect(sessionTestDoubles.remoteConnectionManager.call).toHaveBeenCalledWith(
      'conn-2',
      'session:write',
      { sessionId: 'remote-2', data: 'pwd\n' }
    );
    expect(sessionTestDoubles.remoteConnectionManager.call).toHaveBeenCalledWith(
      'conn-2',
      'session:resize',
      { sessionId: 'remote-2', cols: 120, rows: 40 }
    );
    await expect(manager.getActivity('remote-2')).resolves.toBe(true);

    await manager.kill('remote-2');

    expect(sessionTestDoubles.remoteConnectionManager.call).toHaveBeenCalledWith(
      'conn-2',
      'session:kill',
      { sessionId: 'remote-2' }
    );
    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-2', state: 'dead' },
    ]);
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId: 'remote-2', exitCode: 0 },
    ]);
    expect(manager.list(1)).toEqual([]);
    expect(manager.list(2)).toEqual([]);
  });

  it('ignores empty remote data payloads and unknown remote exit events', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-ignore', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-ignore',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: remoteDescriptor,
      replay: 'boot',
    });

    await manager.attach(1, {
      sessionId: 'remote-ignore',
      cwd: remotePath,
    });

    const sendCountBefore = getWindowSendCalls(1).length;

    sessionTestDoubles.remoteDataListeners.get('conn-ignore')?.({
      sessionId: 'remote-ignore',
      data: '',
    });
    sessionTestDoubles.remoteExitListeners.get('conn-ignore')?.({
      sessionId: 'missing-remote-session',
      exitCode: 9,
    });

    expect(getWindowSendCalls(1)).toHaveLength(sendCountBefore);
    expect(manager.list(1)).toEqual([
      expect.objectContaining({
        sessionId: 'remote-ignore',
      }),
    ]);
  });

  it('reuses a pending remote subscription setup across concurrent attach calls', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    let resolveDataListener: (() => void) | undefined;

    sessionTestDoubles.remoteConnectionManager.addEventListener
      .mockImplementationOnce(
        async (connectionId: string, event: string, listener: (payload: unknown) => void) => {
          if (event === 'remote:session:data') {
            sessionTestDoubles.remoteDataListeners.set(connectionId, listener);
          }
          await new Promise<void>((resolve) => {
            resolveDataListener = resolve;
          });
          return vi.fn();
        }
      )
      .mockImplementationOnce(
        async (connectionId: string, event: string, listener: (payload: unknown) => void) => {
          if (event === 'remote:session:exit') {
            sessionTestDoubles.remoteExitListeners.set(connectionId, listener);
          }
          return vi.fn();
        }
      );

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method, payload) => {
        if (method === 'session:attach') {
          return {
            session: makeRemoteDescriptor({
              sessionId: String(Reflect.get(payload as object, 'sessionId')),
              cwd: '/workspace',
            }),
            replay: '',
          };
        }
        return undefined;
      }
    );

    const attachOne = manager.attach(1, {
      sessionId: 'remote-pending-a',
      cwd: toRemoteVirtualPath('conn-pending', '/workspace'),
    });
    await Promise.resolve();
    const attachTwo = manager.attach(2, {
      sessionId: 'remote-pending-b',
      cwd: toRemoteVirtualPath('conn-pending', '/workspace'),
    });
    await Promise.resolve();

    resolveDataListener?.();

    await expect(Promise.all([attachOne, attachTwo])).resolves.toEqual([
      {
        session: expect.objectContaining({
          sessionId: 'remote-pending-a',
        }),
        replay: '',
      },
      {
        session: expect.objectContaining({
          sessionId: 'remote-pending-b',
        }),
        replay: '',
      },
    ]);
    expect(sessionTestDoubles.remoteConnectionManager.addEventListener).toHaveBeenCalledTimes(2);
    expect(sessionTestDoubles.remoteConnectionManager.onDidDisconnect).toHaveBeenCalledTimes(1);
    expect(sessionTestDoubles.remoteConnectionManager.onDidStatusChange).toHaveBeenCalledTimes(1);
  });

  it('cleans up stale remote subscriptions when setup finishes after the connection is gone', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const offData = vi.fn();
    const offExit = vi.fn();

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: false,
      recoverable: true,
    });
    sessionTestDoubles.remoteConnectionManager.addEventListener
      .mockImplementationOnce(async () => offData)
      .mockImplementationOnce(async () => offExit);
    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: makeRemoteDescriptor({
        sessionId: 'remote-stale-subscription',
        cwd: '/workspace',
      }),
      replay: '',
    });

    await manager.attach(1, {
      sessionId: 'remote-stale-subscription',
      cwd: toRemoteVirtualPath('conn-stale', '/workspace'),
    });

    expect(offData).toHaveBeenCalledTimes(1);
    expect(offExit).toHaveBeenCalledTimes(1);

    sessionTestDoubles.remoteDisconnectListeners.get('conn-stale')?.();
  });

  it('suppresses stale remote subscription cleanup failures when setup is discarded', async () => {
    createWindow(1);
    const manager = new SessionManager();

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: false,
      recoverable: true,
    });
    sessionTestDoubles.remoteConnectionManager.addEventListener
      .mockImplementationOnce(async () =>
        vi.fn(() => {
          throw new Error('stale data cleanup failed');
        })
      )
      .mockImplementationOnce(async () =>
        vi.fn(() => {
          throw new Error('stale exit cleanup failed');
        })
      );
    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: makeRemoteDescriptor({
        sessionId: 'remote-stale-throwing-subscription',
        cwd: '/workspace',
      }),
      replay: '',
    });

    await expect(
      manager.attach(1, {
        sessionId: 'remote-stale-throwing-subscription',
        cwd: toRemoteVirtualPath('conn-stale-throwing', '/workspace'),
      })
    ).resolves.toEqual({
      session: expect.objectContaining({
        sessionId: 'remote-stale-throwing-subscription',
      }),
      replay: '',
    });
  });

  it('cleans up the remote data listener when exit listener subscription setup fails', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-subscribe-fail', '/workspace');
    const offData = vi.fn();

    sessionTestDoubles.remoteConnectionManager.addEventListener
      .mockImplementationOnce(async (connectionId, event, listener) => {
        if (event === 'remote:session:data') {
          sessionTestDoubles.remoteDataListeners.set(connectionId, listener);
        }
        return offData;
      })
      .mockImplementationOnce(async () => {
        throw new Error('exit listener failed');
      });

    await expect(
      manager.attach(1, {
        sessionId: 'remote-subscribe-fail',
        cwd: remotePath,
      })
    ).rejects.toThrow('exit listener failed');

    expect(offData).toHaveBeenCalledTimes(1);
  });

  it('suppresses data listener disposal failures when exit listener setup fails', async () => {
    createWindow(1);
    const manager = new SessionManager();

    sessionTestDoubles.remoteConnectionManager.addEventListener
      .mockImplementationOnce(async () =>
        vi.fn(() => {
          throw new Error('dispose data failed');
        })
      )
      .mockImplementationOnce(async () => {
        throw new Error('exit listener failed');
      });

    await expect(
      manager.attach(1, {
        sessionId: 'remote-subscribe-cleanup-fail',
        cwd: toRemoteVirtualPath('conn-subscribe-cleanup-fail', '/workspace'),
      })
    ).rejects.toThrow('exit listener failed');
  });

  it('falls back when remote write, resize, activity, and detach operations fail', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-5', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-5',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (
          method === 'session:write' ||
          method === 'session:resize' ||
          method === 'session:detach'
        ) {
          throw new Error(`${method} failed`);
        }
        if (method === 'session:getActivity') {
          throw new Error('activity failed');
        }
        return undefined;
      }
    );

    await manager.attach(1, { sessionId: 'remote-5', cwd: remotePath });

    manager.write('remote-5', 'pwd\n');
    manager.resize('remote-5', 120, 40);
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-5', state: 'reconnecting' },
    ]);
    await expect(manager.getActivity('remote-5')).resolves.toBe(false);

    manager.write('remote-5', 'ignored\n');
    manager.resize('remote-5', 80, 24);
    await flushAsyncWork();

    expect(
      sessionTestDoubles.remoteConnectionManager.call.mock.calls.filter(
        ([, method]) => method === 'session:write'
      )
    ).toHaveLength(1);
    expect(
      sessionTestDoubles.remoteConnectionManager.call.mock.calls.filter(
        ([, method]) => method === 'session:resize'
      )
    ).toHaveLength(1);

    await manager.detach(1, 'remote-5');
    expect(manager.list(1)).toEqual([]);
  });

  it('falls back to cached remote replay when a reattach attempt fails after the connection drops', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-7', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-7',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call
      .mockResolvedValueOnce({
        session: remoteDescriptor,
        replay: 'cached replay',
      })
      .mockRejectedValueOnce(new Error('attach failed'));

    await manager.attach(1, {
      sessionId: 'remote-7',
      cwd: remotePath,
    });

    sessionTestDoubles.remoteConnectionManager.getStatus
      .mockReturnValueOnce({
        connected: true,
        recoverable: true,
      })
      .mockReturnValue({
        connected: false,
        recoverable: false,
      });

    const result = await manager.attach(2, {
      sessionId: 'remote-7',
    });

    expect(result).toEqual({
      session: expect.objectContaining({
        sessionId: 'remote-7',
        runtimeState: 'dead',
      }),
      replay: 'cached replay',
    });
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-7', state: 'dead' },
    ]);
  });

  it('rethrows remote attach failures when the connection is still reported as healthy', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-healthy-fail', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-healthy-fail',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call
      .mockResolvedValueOnce({
        session: remoteDescriptor,
        replay: 'cached replay',
      })
      .mockRejectedValueOnce(new Error('attach failed while connected'));

    await manager.attach(1, {
      sessionId: 'remote-healthy-fail',
      cwd: remotePath,
    });

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: true,
      recoverable: true,
    });

    await expect(
      manager.attach(2, {
        sessionId: 'remote-healthy-fail',
      })
    ).rejects.toThrow('attach failed while connected');
  });

  it('emits dead state when supervisor-backed write and resize operations fail', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    try {
      const opened = await manager.create(1, {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      });

      sessionTestDoubles.supervisorWriteSession.mockRejectedValueOnce(new Error('write failed'));
      sessionTestDoubles.supervisorResizeSession.mockRejectedValueOnce(new Error('resize failed'));

      manager.write(opened.session.sessionId, 'dir\r');
      manager.resize(opened.session.sessionId, 120, 40);
      await flushAsyncWork();

      const deadStates = getWindowSendCalls(1).filter(
        (call) =>
          call[0] === IPC_CHANNELS.SESSION_STATE &&
          call[1]?.sessionId === opened.session.sessionId &&
          call[1]?.state === 'dead'
      );
      expect(deadStates).toHaveLength(2);
    } finally {
      platform.mockRestore();
    }
  });

  it('warns when abandoning a persistent agent session record fails', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      sessionTestDoubles.persistentAbandonSession.mockRejectedValueOnce(
        new Error('abandon failed')
      );

      const opened = await manager.create(1, {
        cwd: '/repo-a',
        kind: 'agent',
        persistOnDisconnect: false,
        metadata: {
          uiSessionId: 'ui-session-1',
        },
      });
      const pty = sessionTestDoubles.ptyInstances[0];

      pty.emitExit(opened.session.sessionId, 0);
      await flushAsyncWork();

      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to abandon persistent agent session record:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns when remote recovery cannot re-subscribe after a disconnect', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remotePath = toRemoteVirtualPath('conn-recover-warn', '/workspace');

    try {
      sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
        session: makeRemoteDescriptor({
          sessionId: 'remote-recover-warn',
          cwd: '/workspace',
        }),
        replay: '',
      });

      await manager.attach(1, {
        sessionId: 'remote-recover-warn',
        cwd: remotePath,
      });

      sessionTestDoubles.remoteDisconnectListeners.get('conn-recover-warn')?.();
      sessionTestDoubles.remoteConnectionManager.addEventListener.mockRejectedValueOnce(
        new Error('re-subscribe failed')
      );

      sessionTestDoubles.remoteStatusListeners.get('conn-recover-warn')?.({
        connected: true,
        recoverable: true,
      });
      await (Reflect.get(manager, 'remoteRecoveryPromises') as Map<string, Promise<void>>).get(
        'conn-recover-warn'
      );
      await flushAsyncWork();

      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to recover remote sessions:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('no-ops when processing a remote status change for a connection with no sessions', async () => {
    const manager = new SessionManager();
    const processRemoteStatusChange = getPrivateMethod<
      [string, { connected: boolean; recoverable?: boolean; phase?: string }],
      Promise<void>
    >(manager, 'processRemoteStatusChange');

    await expect(
      processRemoteStatusChange('missing-connection', { connected: true, recoverable: true })
    ).resolves.toBeUndefined();
  });

  it('replays remote deltas across reconnect and removes dead sessions missing from resume list', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-3', '/workspace');
    const firstDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-3',
      cwd: '/workspace',
    });
    const missingDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-missing',
      cwd: '/workspace/missing',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method, payload) => {
        if (method === 'session:attach' && payload && typeof payload === 'object') {
          const sessionId = Reflect.get(payload, 'sessionId');
          if (sessionId === 'remote-3') {
            return { session: firstDescriptor, replay: 'hello' };
          }
          if (sessionId === 'remote-missing') {
            return { session: missingDescriptor, replay: 'stale' };
          }
        }
        if (method === 'session:list') {
          return [firstDescriptor];
        }
        if (method === 'session:resume') {
          return { session: firstDescriptor, replay: 'hello world!' };
        }
        return undefined;
      }
    );

    await manager.attach(1, { sessionId: 'remote-3', cwd: remotePath });
    await manager.attach(2, {
      sessionId: 'remote-missing',
      cwd: toRemoteVirtualPath('conn-3', '/workspace/missing'),
    });

    sessionTestDoubles.remoteDataListeners.get('conn-3')?.({
      sessionId: 'remote-3',
      data: ' world',
    });

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_DATA,
      { sessionId: 'remote-3', data: ' world' },
    ]);

    sessionTestDoubles.remoteStatusListeners.get('conn-3')?.({
      connected: false,
      recoverable: true,
    });
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-3', state: 'reconnecting' },
    ]);

    sessionTestDoubles.remoteStatusListeners.get('conn-3')?.({
      connected: true,
      recoverable: true,
    });
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_DATA,
      { sessionId: 'remote-3', data: '!' },
    ]);
    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-3', state: 'live' },
    ]);
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-missing', state: 'dead' },
    ]);
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId: 'remote-missing', exitCode: 1 },
    ]);
  });

  it('skips stale remote sessions before resume starts when the tracked record changed', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const processRemoteStatusChange = getPrivateMethod<
      [string, { connected: boolean; recoverable?: boolean; phase?: string }],
      Promise<void>
    >(manager, 'processRemoteStatusChange');
    const remotePath = toRemoteVirtualPath('conn-stale-before-resume', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-stale-before-resume',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:list') {
          const sessions = getManagedSessions(manager);
          const current = sessions.get('remote-stale-before-resume');
          if (current) {
            sessions.set('remote-stale-before-resume', {
              ...current,
              attachedWindowIds: new Set(current.attachedWindowIds),
            });
          }
          return [remoteDescriptor];
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-stale-before-resume',
      cwd: remotePath,
    });

    await processRemoteStatusChange('conn-stale-before-resume', {
      connected: true,
      recoverable: true,
    });

    expect(
      sessionTestDoubles.remoteConnectionManager.call.mock.calls.filter(
        ([, method]) => method === 'session:resume'
      )
    ).toHaveLength(0);
  });

  it('skips stale remote sessions after resume settles when the record was removed in the meantime', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const processRemoteStatusChange = getPrivateMethod<
      [string, { connected: boolean; recoverable?: boolean; phase?: string }],
      Promise<void>
    >(manager, 'processRemoteStatusChange');
    const remotePath = toRemoteVirtualPath('conn-stale-after-resume', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-stale-after-resume',
      cwd: '/workspace',
    });
    let resolveResume: ((value: SessionAttachResult) => void) | undefined;

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:list') {
          return [remoteDescriptor];
        }
        if (method === 'session:resume') {
          return new Promise<SessionAttachResult>((resolve) => {
            resolveResume = resolve;
          });
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-stale-after-resume',
      cwd: remotePath,
    });

    const recoveryPromise = processRemoteStatusChange('conn-stale-after-resume', {
      connected: true,
      recoverable: true,
    });
    await flushAsyncWork();
    getManagedSessions(manager).delete('remote-stale-after-resume');
    resolveResume?.({
      session: remoteDescriptor,
      replay: 'boot resumed',
    });

    await recoveryPromise;

    expect(manager.list(1)).toEqual([]);
  });

  it('skips stale remote sessions after resume failures when the record was already removed', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const processRemoteStatusChange = getPrivateMethod<
      [string, { connected: boolean; recoverable?: boolean; phase?: string }],
      Promise<void>
    >(manager, 'processRemoteStatusChange');
    const remotePath = toRemoteVirtualPath('conn-stale-resume-fail', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-stale-resume-fail',
      cwd: '/workspace',
    });
    let rejectResume: ((reason?: unknown) => void) | undefined;

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:list') {
          return [remoteDescriptor];
        }
        if (method === 'session:resume') {
          return new Promise<never>((_, reject) => {
            rejectResume = reject;
          });
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-stale-resume-fail',
      cwd: remotePath,
    });

    const recoveryPromise = processRemoteStatusChange('conn-stale-resume-fail', {
      connected: true,
      recoverable: true,
    });
    await flushAsyncWork();
    getManagedSessions(manager).delete('remote-stale-resume-fail');
    rejectResume?.(new Error('resume failed after removal'));

    await recoveryPromise;

    expect(manager.list(1)).toEqual([]);
  });

  it('keeps remote sessions in reconnecting state when resume inventory cannot be fetched', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-list-fail', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-list-fail',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:list') {
          throw new Error('list failed');
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-list-fail',
      cwd: remotePath,
    });

    sessionTestDoubles.remoteStatusListeners.get('conn-list-fail')?.({
      connected: true,
      recoverable: true,
    });
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-list-fail', state: 'reconnecting' },
    ]);
    expect(manager.list(1)).toEqual([
      expect.objectContaining({
        sessionId: 'remote-list-fail',
        runtimeState: 'reconnecting',
      }),
    ]);
  });

  it('marks remote sessions reconnecting when resume fails after the connection drops again', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-resume-fail', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-resume-fail',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: 'boot' };
        }
        if (method === 'session:list') {
          return [remoteDescriptor];
        }
        if (method === 'session:resume') {
          throw new Error('resume failed');
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-resume-fail',
      cwd: remotePath,
    });

    sessionTestDoubles.remoteConnectionManager.getStatus.mockReturnValue({
      connected: false,
      recoverable: true,
    });

    sessionTestDoubles.remoteStatusListeners.get('conn-resume-fail')?.({
      connected: true,
      recoverable: true,
    });
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-resume-fail', state: 'reconnecting' },
    ]);
    expect(manager.list(1)).toEqual([
      expect.objectContaining({
        sessionId: 'remote-resume-fail',
        runtimeState: 'reconnecting',
      }),
    ]);
  });

  it('forwards remote exit events and removes the session from all attached windows', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-exit', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-exit',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return {
            session: remoteDescriptor,
            replay: 'boot',
          };
        }
        return undefined;
      }
    );

    await manager.attach(1, { sessionId: 'remote-exit', cwd: remotePath });
    await manager.attach(2, { sessionId: 'remote-exit' });

    sessionTestDoubles.remoteExitListeners.get('conn-exit')?.({
      sessionId: 'remote-exit',
      exitCode: 17,
      signal: 15,
    });

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-exit', state: 'dead' },
    ]);
    expect(getWindowSendCalls(2)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId: 'remote-exit', exitCode: 17, signal: 15 },
    ]);
    expect(manager.list(1)).toEqual([]);
    expect(manager.list(2)).toEqual([]);
  });

  it('marks remote sessions dead on non-recoverable status changes and skips destroyed windows', async () => {
    const _firstWindow = createWindow(1);
    const secondWindow = createWindow(2);
    const manager = new SessionManager();
    const remotePath = toRemoteVirtualPath('conn-dead-status', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-dead-status',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method) => {
        if (method === 'session:attach') {
          return { session: remoteDescriptor, replay: '' };
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-dead-status',
      cwd: remotePath,
    });
    await manager.attach(2, {
      sessionId: 'remote-dead-status',
    });

    secondWindow.isDestroyed = () => true;
    secondWindow.webContents.isDestroyed = () => true;

    sessionTestDoubles.remoteStatusListeners.get('conn-dead-status')?.({
      connected: false,
      recoverable: false,
    });
    await flushAsyncWork();

    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_STATE,
      { sessionId: 'remote-dead-status', state: 'dead' },
    ]);
    expect(getWindowSendCalls(1)).toContainEqual([
      IPC_CHANNELS.SESSION_EXIT,
      { sessionId: 'remote-dead-status', exitCode: 1 },
    ]);
    expect(getWindowSendCalls(2)).toEqual([]);
    expect(manager.list(1)).toEqual([]);
  });

  it('skips disconnected-state processing when remote records change before iteration and ignores stale dead markers', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const processRemoteStatusChange = getPrivateMethod<
      [string, { connected: boolean; recoverable?: boolean; phase?: string }],
      Promise<void>
    >(manager, 'processRemoteStatusChange');
    const markRemoteSessionDead = getPrivateMethod<[SessionRecordView], void>(
      manager,
      'markRemoteSessionDead'
    );
    const remotePath = toRemoteVirtualPath('conn-stale-disconnected', '/workspace');
    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-stale-disconnected',
      cwd: '/workspace',
    });

    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: remoteDescriptor,
      replay: '',
    });

    await manager.attach(1, {
      sessionId: 'remote-stale-disconnected',
      cwd: remotePath,
    });

    const sessions = getManagedSessions(manager);
    const current = sessions.get('remote-stale-disconnected');
    expect(current).toBeDefined();

    const originalGet = sessions.get.bind(sessions);
    Object.defineProperty(sessions, 'get', {
      value(sessionId: string) {
        if (sessionId === 'remote-stale-disconnected') {
          sessions.delete(sessionId);
          return undefined;
        }
        return originalGet(sessionId);
      },
      configurable: true,
    });

    await processRemoteStatusChange('conn-stale-disconnected', {
      connected: false,
      recoverable: false,
    });

    Object.defineProperty(sessions, 'get', {
      value: originalGet,
      configurable: true,
    });

    sessions.set('remote-stale-disconnected', {
      ...(current as SessionRecordView),
      attachedWindowIds: new Set(current?.attachedWindowIds),
    });
    markRemoteSessionDead(current as SessionRecordView);

    expect(manager.list(1)).toEqual([
      expect.objectContaining({
        sessionId: 'remote-stale-disconnected',
      }),
    ]);
  });

  it('skips destroyed webContents and warns when a window send throws during event delivery', async () => {
    const windowOne = createWindow(1);
    const windowTwo = createWindow(2);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const opened = await manager.create(1, { cwd: '/repo-a' });
      await manager.attach(2, { sessionId: opened.session.sessionId });

      windowOne.webContents.send = vi.fn(() => {
        throw new Error('send failed');
      });
      windowTwo.webContents.isDestroyed = () => true;

      await manager.kill(opened.session.sessionId);

      expect(windowOne.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_EXIT, {
        sessionId: opened.session.sessionId,
        exitCode: 0,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to emit session event to window:',
        expect.any(Error)
      );
      expect(getWindowSendCalls(2)).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('suspends session delivery after a disposed-frame send failure until the window reattaches', async () => {
    const windowOne = createWindow(1);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const opened = await manager.create(1, { cwd: '/repo-a' });
      const emitData = getPrivateMethod<[string, string, Set<number>?], void>(manager, 'emitData');
      const sessions = getManagedSessions(manager);
      const session = sessions.get(opened.session.sessionId);
      if (!session) {
        throw new Error('Expected managed session to exist');
      }

      windowOne.webContents.send = vi.fn(() => {
        throw new Error('Render frame was disposed before WebFrameMain could be accessed');
      });

      emitData(opened.session.sessionId, 'first payload');
      emitData(opened.session.sessionId, 'second payload');

      expect(windowOne.webContents.send).toHaveBeenCalledTimes(1);
      expect(session.attachedWindowIds.has(1)).toBe(true);
      expect(Reflect.get(manager, 'suspendedWindowIds') as Set<number>).toEqual(new Set([1]));
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('kills matching local sessions by workdir and cleans remote listeners on disconnect', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const localA = await manager.create(1, { cwd: '/Repo' });
    const localB = await manager.create(2, { cwd: '/Repo/sub' });
    const localC = await manager.create(1, { cwd: '/Elsewhere' });
    const pty = sessionTestDoubles.ptyInstances[0];

    await manager.killByWorkdir('/Repo');

    expect(pty?.destroy).toHaveBeenCalledWith(localA.session.sessionId);
    expect(pty?.destroy).toHaveBeenCalledWith(localB.session.sessionId);
    expect(pty?.destroy).not.toHaveBeenCalledWith(localC.session.sessionId);

    const remoteDescriptor = makeRemoteDescriptor({
      sessionId: 'remote-4',
      cwd: '/workspace',
    });
    sessionTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({
      session: remoteDescriptor,
      replay: '',
    });

    await manager.attach(1, {
      sessionId: 'remote-4',
      cwd: toRemoteVirtualPath('conn-4', '/workspace'),
    });
    expect(sessionTestDoubles.remoteDataListeners.has('conn-4')).toBe(true);
    expect(sessionTestDoubles.remoteExitListeners.has('conn-4')).toBe(true);

    sessionTestDoubles.remoteDisconnectListeners.get('conn-4')?.();

    expect(sessionTestDoubles.remoteOffCallbacks.some((off) => off.mock.calls.length > 0)).toBe(
      true
    );
    expect(sessionTestDoubles.remoteDataListeners.has('conn-4')).toBe(false);
    expect(sessionTestDoubles.remoteExitListeners.has('conn-4')).toBe(false);
  });

  it('releases remote lifecycle subscriptions after the last session on a connection is removed', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();

    sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
      async (_connectionId, method, payload) => {
        if (method === 'session:attach' && payload && typeof payload === 'object') {
          const sessionId = Reflect.get(payload, 'sessionId');
          return {
            session: makeRemoteDescriptor({
              sessionId: String(sessionId),
              cwd: '/workspace',
            }),
            replay: '',
          };
        }
        return undefined;
      }
    );

    await manager.attach(1, {
      sessionId: 'remote-a',
      cwd: toRemoteVirtualPath('conn-6', '/workspace'),
    });
    await manager.attach(2, {
      sessionId: 'remote-b',
      cwd: toRemoteVirtualPath('conn-6', '/workspace'),
    });

    expect(sessionTestDoubles.remoteDisconnectListeners.has('conn-6')).toBe(true);
    expect(sessionTestDoubles.remoteStatusListeners.has('conn-6')).toBe(true);

    await manager.detach(1, 'remote-a');

    expect(sessionTestDoubles.remoteDisconnectListeners.has('conn-6')).toBe(true);
    expect(sessionTestDoubles.remoteStatusListeners.has('conn-6')).toBe(true);

    await manager.detach(2, 'remote-b');

    expect(sessionTestDoubles.remoteDataListeners.has('conn-6')).toBe(false);
    expect(sessionTestDoubles.remoteExitListeners.has('conn-6')).toBe(false);
    expect(sessionTestDoubles.remoteDisconnectListeners.has('conn-6')).toBe(false);
    expect(sessionTestDoubles.remoteStatusListeners.has('conn-6')).toBe(false);
  });

  it('warns when remote lifecycle subscription cleanup fails after the last session detaches', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      sessionTestDoubles.remoteConnectionManager.onDidDisconnect.mockImplementationOnce(() =>
        vi.fn(() => {
          throw new Error('disconnect cleanup failed');
        })
      );
      sessionTestDoubles.remoteConnectionManager.onDidStatusChange.mockImplementationOnce(() =>
        vi.fn(() => {
          throw new Error('status cleanup failed');
        })
      );
      sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
        async (_connectionId, method) => {
          if (method === 'session:attach') {
            return {
              session: makeRemoteDescriptor({
                sessionId: 'remote-cleanup',
                cwd: '/workspace',
              }),
              replay: '',
            };
          }
          return undefined;
        }
      );

      await manager.attach(1, {
        sessionId: 'remote-cleanup',
        cwd: toRemoteVirtualPath('conn-8', '/workspace'),
      });
      await manager.detach(1, 'remote-cleanup');

      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to dispose remote disconnect listener:',
        expect.any(Error)
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to dispose remote status listener:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns when remote subscription cleanup cannot dispose data or exit listeners', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      sessionTestDoubles.remoteConnectionManager.addEventListener
        .mockImplementationOnce(async () =>
          vi.fn(() => {
            throw new Error('data cleanup failed');
          })
        )
        .mockImplementationOnce(async () =>
          vi.fn(() => {
            throw new Error('exit cleanup failed');
          })
        );
      sessionTestDoubles.remoteConnectionManager.call.mockImplementation(
        async (_connectionId, method) => {
          if (method === 'session:attach') {
            return {
              session: makeRemoteDescriptor({
                sessionId: 'remote-off-cleanup',
                cwd: '/workspace',
              }),
              replay: '',
            };
          }
          return undefined;
        }
      );

      await manager.attach(1, {
        sessionId: 'remote-off-cleanup',
        cwd: toRemoteVirtualPath('conn-off-cleanup', '/workspace'),
      });
      await manager.detach(1, 'remote-off-cleanup');

      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to dispose remote data listener:',
        expect.any(Error)
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[session] Failed to dispose remote exit listener:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('handles replay helper edge cases and ignores runtime state updates for non-remote sessions', async () => {
    createWindow(1);
    const manager = new SessionManager();
    const getReplayDelta = getPrivateMethod<[string | undefined, string], string>(
      manager,
      'getReplayDelta'
    );
    const getReplayOverlap = getPrivateMethod<[string, string], number>(
      manager,
      'getReplayOverlap'
    );
    const setSessionRuntimeState = getPrivateMethod<
      [string, 'live' | 'reconnecting' | 'dead'],
      void
    >(manager, 'setSessionRuntimeState');

    expect(getReplayDelta(undefined, 'alpha')).toBe('alpha');
    expect(getReplayDelta('alpha', '')).toBe('');
    expect(getReplayOverlap('', 'alpha')).toBe(0);
    expect(getReplayOverlap('xxababab', 'ababaca')).toBe(4);
    expect(getReplayOverlap('ababaa', 'ababa')).toBe(1);
    expect(getReplayOverlap('ababa', 'ababa')).toBe(5);

    const opened = await manager.create(1, { cwd: '/repo-helper' });
    setSessionRuntimeState(opened.session.sessionId, 'dead');
    setSessionRuntimeState('missing-session', 'dead');

    expect(manager.list(1)).toEqual([
      expect.objectContaining({
        sessionId: opened.session.sessionId,
        runtimeState: 'live',
      }),
    ]);
  });
});
