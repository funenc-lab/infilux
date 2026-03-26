import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeTestDoubles = vi.hoisted(() => {
  const HOME_PATH = '/tmp/home';
  const RUNTIME_DIR = `${HOME_PATH}/.infilux/local-supervisor`;
  const INFO_PATH = `${RUNTIME_DIR}/local-supervisor-daemon.json`;
  const SOURCE_PATH = `${RUNTIME_DIR}/local-supervisor-daemon.js`;

  type MethodHandler = (params: unknown) => unknown;

  class FakeSocket {
    destroyed = false;
    writes: string[] = [];
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    setEncoding = vi.fn((_encoding: string) => {});

    write = vi.fn((chunk: string) => {
      this.writes.push(chunk);
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        const message = JSON.parse(line) as {
          id: number;
          method: string;
          params?: Record<string, unknown>;
        };
        handleClientMessage(this, message);
      }
      return true;
    });

    destroy = vi.fn(() => {
      this.destroyed = true;
    });

    on(event: string, listener: (...args: unknown[]) => void): this {
      const current = this.listeners.get(event) ?? new Set();
      current.add(listener);
      this.listeners.set(event, current);
      return this;
    }

    emit(event: string, ...args: unknown[]): boolean {
      const current = this.listeners.get(event);
      if (!current || current.size === 0) {
        return false;
      }
      for (const listener of [...current]) {
        listener(...args);
      }
      return true;
    }

    removeAllListeners(): this {
      this.listeners.clear();
      return this;
    }
  }

  const files = new Map<string, string>();
  const methodHandlers = new Map<string, MethodHandler>();
  const methodCalls: Array<{ method: string; params: unknown }> = [];
  const sockets: FakeSocket[] = [];
  const subscriptionSockets: FakeSocket[] = [];

  const appGetPath = vi.fn((name: string) => (name === 'home' ? HOME_PATH : `/tmp/${name}`));
  const spawn = vi.fn();
  const mkdirSync = vi.fn();
  const readFileSync = vi.fn((path: string) => {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return value;
  });
  const writeFileSync = vi.fn((path: string, content: string) => {
    files.set(path, content);
  });
  const stat = vi.fn(async (path: string) => {
    if (!files.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return {
      isFile: () => true,
    };
  });
  const rm = vi.fn(async (path: string) => {
    files.delete(path);
  });
  const createConnection = vi.fn((_options: { host: string; port: number }) => {
    const socket = new FakeSocket();
    sockets.push(socket);
    queueMicrotask(() => {
      socket.emit('connect');
    });
    return socket;
  });
  const getLocalSupervisorSource = vi.fn(() => 'supervisor-source-v1');

  function emitJson(socket: FakeSocket, payload: unknown): void {
    socket.emit('data', `${JSON.stringify(payload)}\n`);
  }

  function readDaemonInfo(): { token: string } | null {
    const raw = files.get(INFO_PATH);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as { token: string };
  }

  function handleClientMessage(
    socket: FakeSocket,
    message: { id: number; method: string; params?: Record<string, unknown> }
  ): void {
    if (message.method === 'daemon:auth') {
      const info = readDaemonInfo();
      const ok = Boolean(info && message.params?.token === info.token);
      if (ok && message.params?.subscribe) {
        subscriptionSockets.push(socket);
      }
      emitJson(socket, {
        id: message.id,
        result: { ok },
      });
      return;
    }

    methodCalls.push({
      method: message.method,
      params: message.params,
    });
    const handler = methodHandlers.get(message.method);
    const result = handler ? handler(message.params) : undefined;
    emitJson(socket, {
      id: message.id,
      result,
    });
  }

  function setDaemonInfo(
    overrides: Partial<{
      host: string;
      port: number;
      pid: number;
      token: string;
      runtimeVersion: string;
    }> = {}
  ): void {
    files.set(
      INFO_PATH,
      JSON.stringify({
        host: '127.0.0.1',
        port: 4312,
        pid: 9001,
        token: 'daemon-token',
        runtimeVersion: '0.1.0',
        ...overrides,
      })
    );
  }

  function emitSubscriptionEvent(event: string, payload: unknown): void {
    const socket = subscriptionSockets[subscriptionSockets.length - 1];
    if (!socket) {
      throw new Error('Missing subscription socket');
    }
    emitJson(socket, {
      type: 'event',
      event,
      payload,
    });
  }

  function closeSubscription(): void {
    const socket = subscriptionSockets[subscriptionSockets.length - 1];
    if (!socket) {
      throw new Error('Missing subscription socket');
    }
    socket.emit('close');
  }

  function reset(): void {
    files.clear();
    methodHandlers.clear();
    methodCalls.length = 0;
    sockets.length = 0;
    subscriptionSockets.length = 0;
    appGetPath.mockClear();
    spawn.mockReset();
    spawn.mockReturnValue({
      unref: vi.fn(),
    });
    mkdirSync.mockClear();
    readFileSync.mockClear();
    writeFileSync.mockClear();
    stat.mockClear();
    rm.mockClear();
    createConnection.mockClear();
    getLocalSupervisorSource.mockClear();

    methodHandlers.set('daemon:ping', () => ({
      ok: true,
      runtimeVersion: '0.1.0',
    }));
    methodHandlers.set('session:create', (params) => ({
      session: {
        sessionId: (params as { sessionId: string }).sessionId,
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 100,
      },
    }));
    methodHandlers.set('session:attach', (params) => ({
      session: {
        sessionId: (params as { sessionId: string }).sessionId,
        backend: 'local',
        kind: 'agent',
        cwd: 'C:/repo',
        persistOnDisconnect: true,
        createdAt: 100,
      },
      replay: 'replay-output',
    }));
    methodHandlers.set('session:has', () => true);
    methodHandlers.set('session:getActivity', () => true);
    methodHandlers.set('session:detach', () => undefined);
    methodHandlers.set('session:kill', () => undefined);
    methodHandlers.set('session:write', () => undefined);
    methodHandlers.set('session:resize', () => undefined);
  }

  return {
    HOME_PATH,
    INFO_PATH,
    SOURCE_PATH,
    appGetPath,
    spawn,
    mkdirSync,
    readFileSync,
    writeFileSync,
    stat,
    rm,
    createConnection,
    getLocalSupervisorSource,
    files,
    methodCalls,
    setDaemonInfo,
    emitSubscriptionEvent,
    closeSubscription,
    reset,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: runtimeTestDoubles.appGetPath,
  },
}));

vi.mock('node:child_process', () => ({
  spawn: runtimeTestDoubles.spawn,
}));

vi.mock('node:fs', () => ({
  mkdirSync: runtimeTestDoubles.mkdirSync,
  readFileSync: runtimeTestDoubles.readFileSync,
  writeFileSync: runtimeTestDoubles.writeFileSync,
}));

vi.mock('node:fs/promises', () => ({
  rm: runtimeTestDoubles.rm,
  stat: runtimeTestDoubles.stat,
}));

vi.mock('node:net', () => ({
  default: {
    createConnection: runtimeTestDoubles.createConnection,
  },
}));

vi.mock('../LocalSupervisorSource', () => ({
  getLocalSupervisorSource: runtimeTestDoubles.getLocalSupervisorSource,
  LOCAL_SUPERVISOR_RUNTIME_VERSION: '0.1.0',
}));

describe('LocalSupervisorRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    runtimeTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates sessions through the daemon and dispatches subscription events', async () => {
    runtimeTestDoubles.setDaemonInfo();
    const { LocalSupervisorRuntime } = await import('../LocalSupervisorRuntime');
    const runtime = new LocalSupervisorRuntime();
    const onData = vi.fn();
    const onExit = vi.fn();
    const onDisconnect = vi.fn();
    runtime.onData(onData);
    runtime.onExit(onExit);
    runtime.onDisconnect(onDisconnect);

    const created = await runtime.createSession({
      sessionId: 'supervisor-1',
      options: {
        cwd: 'C:/repo',
        kind: 'agent',
        persistOnDisconnect: true,
      },
    });

    expect(created).toEqual({
      session: expect.objectContaining({
        sessionId: 'supervisor-1',
        cwd: 'C:/repo',
        kind: 'agent',
      }),
    });
    expect(
      runtimeTestDoubles.methodCalls.filter((call) => call.method === 'session:create')
    ).toEqual([
      {
        method: 'session:create',
        params: {
          sessionId: 'supervisor-1',
          options: {
            cwd: 'C:/repo',
            kind: 'agent',
            persistOnDisconnect: true,
          },
        },
      },
    ]);

    const attached = await runtime.attachSession('supervisor-1');
    expect(attached.replay).toBe('replay-output');
    expect(
      runtimeTestDoubles.methodCalls.filter((call) => call.method === 'session:attach')
    ).toHaveLength(1);

    runtimeTestDoubles.emitSubscriptionEvent('session:data', {
      sessionId: 'supervisor-1',
      data: 'hello',
    });
    runtimeTestDoubles.emitSubscriptionEvent('session:exit', {
      sessionId: 'supervisor-1',
      exitCode: 0,
    });
    runtimeTestDoubles.closeSubscription();

    expect(onData).toHaveBeenCalledWith({
      sessionId: 'supervisor-1',
      data: 'hello',
    });
    expect(onExit).toHaveBeenCalledWith({
      sessionId: 'supervisor-1',
      exitCode: 0,
    });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('writes the daemon source and starts a detached daemon when the info file is missing', async () => {
    const { LocalSupervisorRuntime } = await import('../LocalSupervisorRuntime');
    const runtime = new LocalSupervisorRuntime();

    runtimeTestDoubles.spawn.mockImplementationOnce(() => {
      runtimeTestDoubles.setDaemonInfo();
      return {
        unref: vi.fn(),
      };
    });

    const hasSessionPromise = runtime.hasSession('supervisor-2');
    await vi.runAllTimersAsync();

    await expect(hasSessionPromise).resolves.toBe(true);
    expect(runtimeTestDoubles.writeFileSync).toHaveBeenCalledWith(
      runtimeTestDoubles.SOURCE_PATH,
      'supervisor-source-v1',
      expect.objectContaining({
        encoding: 'utf8',
        mode: 0o700,
      })
    );
    expect(runtimeTestDoubles.spawn).toHaveBeenCalledWith(
      process.execPath,
      [runtimeTestDoubles.SOURCE_PATH, '--daemon'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
    );
  });
});
