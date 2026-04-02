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
  const supervisorOnData = vi.fn();
  const supervisorOnExit = vi.fn();
  const supervisorOnDisconnect = vi.fn();
  const persistentAbandonSession = vi.fn();
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
    supervisorOnData,
    supervisorOnExit,
    supervisorOnDisconnect,
    persistentAbandonSession,
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

import { SessionManager } from '../SessionManager';

function createWindow(id: number) {
  return new sessionTestDoubles.MockBrowserWindow(id);
}

function getWindowSendCalls(id: number) {
  return sessionTestDoubles.windowRegistry.get(id)?.webContents.send.mock.calls ?? [];
}

function makeRemoteDescriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
  return {
    sessionId: 'remote-1',
    backend: 'remote',
    kind: 'terminal',
    cwd: '/workspace',
    persistOnDisconnect: true,
    createdAt: 1,
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
    sessionTestDoubles.supervisorOnData.mockReset();
    sessionTestDoubles.supervisorOnData.mockReturnValue(() => {});
    sessionTestDoubles.supervisorOnExit.mockReset();
    sessionTestDoubles.supervisorOnExit.mockReturnValue(() => {});
    sessionTestDoubles.supervisorOnDisconnect.mockReset();
    sessionTestDoubles.supervisorOnDisconnect.mockReturnValue(() => {});
    sessionTestDoubles.persistentAbandonSession.mockReset();
    sessionTestDoubles.persistentAbandonSession.mockResolvedValue([]);
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

  it('kills matching local sessions by workdir and cleans remote listeners on disconnect', async () => {
    createWindow(1);
    createWindow(2);
    const manager = new SessionManager();
    const localA = await manager.create(1, { cwd: '/Repo' });
    const localB = await manager.create(2, { cwd: '/Repo/sub' });
    const localC = await manager.create(1, { cwd: '/Elsewhere' });
    const pty = sessionTestDoubles.ptyInstances[0];

    await manager.killByWorkdir('/repo');

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
});
