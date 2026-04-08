import { EventEmitter } from 'node:events';
import { type ConnectionProfile, type FileEntry, IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remoteConnectionManagerTestDoubles = vi.hoisted(() => {
  let uuidCounter = 0;

  const randomUUID = vi.fn(() => {
    uuidCounter += 1;
    return `uuid-${uuidCounter}`;
  });

  const stat = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const rename = vi.fn();
  const unlink = vi.fn();
  const mkdir = vi.fn();
  const appendFile = vi.fn();

  const appGetPath = vi.fn((name: string) => {
    switch (name) {
      case 'userData':
        return '/tmp/app-data';
      case 'temp':
        return '/tmp/temp';
      case 'home':
        return '/Users/tester';
      default:
        return `/tmp/${name}`;
    }
  });

  class MockBrowserWindow {
    destroyed = false;
    webContents = {
      send: vi.fn(),
      isDestroyed: () => false,
    };

    isDestroyed(): boolean {
      return this.destroyed;
    }

    static windows: MockBrowserWindow[] = [];

    static getAllWindows(): MockBrowserWindow[] {
      return MockBrowserWindow.windows;
    }
  }

  const createWindow = () => {
    const window = new MockBrowserWindow();
    MockBrowserWindow.windows.push(window);
    return window;
  };

  const killProcessTree = vi.fn();
  const getEnvForCommand = vi.fn(() => ({}));
  const readSharedSettings = vi.fn(() => ({}));
  const readSharedSessionState = vi.fn(() => ({}));
  const getRemoteServerSource = vi.fn(() => 'module.exports = {};');
  const parseHostVerificationPrompt = vi.fn(() => null);
  const ensureRemoteRuntimeAsset = vi.fn();
  const getRemoteRuntimeAsset = vi.fn();

  class MockRemoteAuthBroker {
    clearSecrets = vi.fn();
    respond = vi.fn(() => true);
    dispose = vi.fn(async () => {});

    static instances: MockRemoteAuthBroker[] = [];

    constructor() {
      MockRemoteAuthBroker.instances.push(this);
    }
  }

  const reset = () => {
    uuidCounter = 0;
    randomUUID.mockClear();
    stat.mockReset();
    readFile.mockReset();
    writeFile.mockReset();
    rename.mockReset();
    unlink.mockReset();
    mkdir.mockReset();
    appendFile.mockReset();
    appGetPath.mockClear();
    killProcessTree.mockReset();
    getEnvForCommand.mockReset();
    readSharedSettings.mockReset();
    readSharedSessionState.mockReset();
    getRemoteServerSource.mockReset();
    parseHostVerificationPrompt.mockReset();
    ensureRemoteRuntimeAsset.mockReset();
    getRemoteRuntimeAsset.mockReset();

    MockBrowserWindow.windows.length = 0;
    MockRemoteAuthBroker.instances.length = 0;

    stat.mockRejectedValue(new Error('missing'));
    readFile.mockResolvedValue('[]');
    writeFile.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);
    appendFile.mockResolvedValue(undefined);
    getEnvForCommand.mockReturnValue({});
    readSharedSettings.mockReturnValue({});
    readSharedSessionState.mockReturnValue({});
    getRemoteServerSource.mockReturnValue('module.exports = {};');
    parseHostVerificationPrompt.mockReturnValue(null);
    ensureRemoteRuntimeAsset.mockResolvedValue(undefined);
    getRemoteRuntimeAsset.mockReturnValue({
      archiveName: 'runtime.tar.gz',
      localPath: '/tmp/runtime.tar.gz',
      asset: { archiveName: 'runtime.tar.gz' },
    });
  };

  return {
    randomUUID,
    stat,
    readFile,
    writeFile,
    rename,
    unlink,
    mkdir,
    appendFile,
    appGetPath,
    MockBrowserWindow,
    MockRemoteAuthBroker,
    createWindow,
    killProcessTree,
    getEnvForCommand,
    readSharedSettings,
    readSharedSessionState,
    getRemoteServerSource,
    parseHostVerificationPrompt,
    ensureRemoteRuntimeAsset,
    getRemoteRuntimeAsset,
    reset,
  };
});

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: remoteConnectionManagerTestDoubles.randomUUID,
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    appendFile: remoteConnectionManagerTestDoubles.appendFile,
    mkdir: remoteConnectionManagerTestDoubles.mkdir,
    readFile: remoteConnectionManagerTestDoubles.readFile,
    rename: remoteConnectionManagerTestDoubles.rename,
    stat: remoteConnectionManagerTestDoubles.stat,
    unlink: remoteConnectionManagerTestDoubles.unlink,
    writeFile: remoteConnectionManagerTestDoubles.writeFile,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: remoteConnectionManagerTestDoubles.appGetPath,
  },
  BrowserWindow: remoteConnectionManagerTestDoubles.MockBrowserWindow,
}));

vi.mock('node-pty', () => ({}));

vi.mock('../../utils/processUtils', () => ({
  killProcessTree: remoteConnectionManagerTestDoubles.killProcessTree,
}));

vi.mock('../../utils/shell', () => ({
  getEnvForCommand: remoteConnectionManagerTestDoubles.getEnvForCommand,
}));

vi.mock('../SharedSessionState', () => ({
  readSharedSessionState: remoteConnectionManagerTestDoubles.readSharedSessionState,
  readSharedSettings: remoteConnectionManagerTestDoubles.readSharedSettings,
}));

vi.mock('../RemoteAuthBroker', () => ({
  RemoteAuthBroker: remoteConnectionManagerTestDoubles.MockRemoteAuthBroker,
}));

vi.mock('../RemoteHelperSource', () => ({
  REMOTE_SERVER_VERSION: '9.9.9',
  getRemoteServerSource: remoteConnectionManagerTestDoubles.getRemoteServerSource,
}));

vi.mock('../RemoteHostVerification', () => ({
  parseHostVerificationPrompt: remoteConnectionManagerTestDoubles.parseHostVerificationPrompt,
}));

vi.mock('../RemoteRuntimeAssets', () => ({
  MANAGED_REMOTE_NODE_VERSION: '20.18.0',
  MANAGED_REMOTE_RUNTIME_DIR: '.infilux/remote-runtime',
  ensureRemoteRuntimeAsset: remoteConnectionManagerTestDoubles.ensureRemoteRuntimeAsset,
  getRemoteRuntimeAsset: remoteConnectionManagerTestDoubles.getRemoteRuntimeAsset,
}));

function createProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: 'profile-1',
    name: 'Primary',
    sshTarget: 'dev@example.com',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function getLatestAuthBrokerInstance() {
  return remoteConnectionManagerTestDoubles.MockRemoteAuthBroker.instances.at(-1);
}

function getPrivate<T>(target: object, key: string): T {
  return Reflect.get(target, key) as T;
}

function setPrivate(target: object, key: string, value: unknown): void {
  Reflect.set(target, key, value);
}

function createFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: {
      destroyed: boolean;
      writable: boolean;
      end: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
    };
    stdout: {
      setEncoding: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
    stderr: {
      setEncoding: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
  };

  proc.stdin = {
    destroyed: false,
    writable: true,
    end: vi.fn(),
    write: vi.fn((_: string, __: BufferEncoding, callback?: (error?: Error | null) => void) => {
      callback?.(null);
      return true;
    }),
  };
  proc.stdout = {
    setEncoding: vi.fn(),
    on: vi.fn(),
  };
  proc.stderr = {
    setEncoding: vi.fn(),
    on: vi.fn(),
  };

  return proc;
}

describe('RemoteConnectionManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:00:00Z'));
    remoteConnectionManagerTestDoubles.reset();
    process.env.HOME = '/Users/tester';
    process.env.USERPROFILE = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads stored profiles, removes legacy platform hints, and flushes sanitized content', async () => {
    remoteConnectionManagerTestDoubles.stat.mockResolvedValueOnce({} as never);
    remoteConnectionManagerTestDoubles.readFile.mockResolvedValueOnce(
      JSON.stringify([
        {
          ...createProfile({
            id: 'profile-b',
            name: 'Bravo',
            sshTarget: 'bravo@example.com',
          }),
          platformHint: 'linux',
        },
        createProfile({
          id: 'profile-a',
          name: 'Alpha',
          sshTarget: 'alpha@example.com',
        }),
      ])
    );

    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();

    await expect(manager.loadProfiles()).resolves.toEqual([
      createProfile({
        id: 'profile-a',
        name: 'Alpha',
        sshTarget: 'alpha@example.com',
      }),
      createProfile({
        id: 'profile-b',
        name: 'Bravo',
        sshTarget: 'bravo@example.com',
      }),
    ]);

    expect(remoteConnectionManagerTestDoubles.mkdir).toHaveBeenCalledWith('/tmp/app-data', {
      recursive: true,
    });
    expect(remoteConnectionManagerTestDoubles.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/app-data/remote-connections.json.'),
      expect.stringContaining('"name": "Alpha"'),
      'utf8'
    );
    expect(remoteConnectionManagerTestDoubles.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/app-data/remote-connections.json.'),
      expect.not.stringContaining('platformHint'),
      'utf8'
    );
    expect(remoteConnectionManagerTestDoubles.rename).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/app-data/remote-connections.json.'),
      '/tmp/app-data/remote-connections.json'
    );
  }, 15000);

  it('saves trimmed profiles, falls back to helperInstallDir, and clears cached auth secrets', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();

    const saved = await manager.saveProfile({
      name: '  Dev Box  ',
      sshTarget: '  devbox@example.com  ',
      helperInstallDir: '  /opt/infilux/runtime  ',
    });

    expect(saved).toMatchObject({
      id: 'uuid-1',
      name: 'Dev Box',
      sshTarget: 'devbox@example.com',
      helperInstallDir: '/opt/infilux/runtime',
      runtimeInstallDir: '/opt/infilux/runtime',
    });
    expect(saved.createdAt).toBe(new Date('2026-03-29T12:00:00Z').getTime());
    expect(saved.updatedAt).toBe(new Date('2026-03-29T12:00:00Z').getTime());

    expect(getLatestAuthBrokerInstance()?.clearSecrets).toHaveBeenCalledWith('uuid-1');
    expect(remoteConnectionManagerTestDoubles.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/app-data/remote-connections.json.'),
      expect.stringContaining('"sshTarget": "devbox@example.com"'),
      'utf8'
    );
  });

  it('rejects invalid SSH targets before persisting profiles', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();

    await expect(
      manager.saveProfile({
        name: 'Broken',
        sshTarget: '-invalid target',
      })
    ).rejects.toThrow('Invalid SSH target');

    expect(remoteConnectionManagerTestDoubles.writeFile).not.toHaveBeenCalled();
  });

  it('deletes profiles, ignores disconnect failures, and clears all cached state buckets', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile();

    setPrivate(manager, 'loaded', true);
    getPrivate<Map<string, ConnectionProfile>>(manager, 'profiles').set(profile.id, profile);
    getPrivate<Map<string, unknown>>(manager, 'resolvedHosts').set(profile.id, { host: 'example' });
    getPrivate<Map<string, unknown>>(manager, 'runtimes').set(profile.id, { platform: 'linux' });
    getPrivate<Map<string, unknown>>(manager, 'runtimeVerifications').set(profile.id, {
      version: '9.9.9',
    });
    getPrivate<Map<string, Promise<void>>>(manager, 'pendingRuntimeVerifications').set(
      profile.id,
      Promise.resolve()
    );
    getPrivate<Map<string, unknown>>(manager, 'volatileStatuses').set(profile.id, {
      connectionId: profile.id,
    });
    getPrivate<Map<string, unknown>>(manager, 'diagnostics').set(profile.id, {
      totalDurationMs: 42,
    });
    getPrivate<Map<string, Set<() => void>>>(manager, 'disconnectListeners').set(
      profile.id,
      new Set([() => {}])
    );
    getPrivate<Map<string, Set<(status: unknown) => void>>>(manager, 'localStatusListeners').set(
      profile.id,
      new Set([() => {}])
    );

    vi.spyOn(manager, 'disconnect').mockRejectedValueOnce(new Error('disconnect failed'));

    await manager.deleteProfile(profile.id);

    expect(getPrivate<Map<string, ConnectionProfile>>(manager, 'profiles').has(profile.id)).toBe(
      false
    );
    expect(getPrivate<Map<string, unknown>>(manager, 'resolvedHosts').has(profile.id)).toBe(false);
    expect(getPrivate<Map<string, unknown>>(manager, 'runtimes').has(profile.id)).toBe(false);
    expect(getPrivate<Map<string, unknown>>(manager, 'runtimeVerifications').has(profile.id)).toBe(
      false
    );
    expect(
      getPrivate<Map<string, Promise<void>>>(manager, 'pendingRuntimeVerifications').has(profile.id)
    ).toBe(false);
    expect(getPrivate<Map<string, unknown>>(manager, 'volatileStatuses').has(profile.id)).toBe(
      false
    );
    expect(getPrivate<Map<string, unknown>>(manager, 'diagnostics').has(profile.id)).toBe(false);
    expect(getPrivate<Map<string, unknown>>(manager, 'disconnectListeners').has(profile.id)).toBe(
      false
    );
    expect(getPrivate<Map<string, unknown>>(manager, 'localStatusListeners').has(profile.id)).toBe(
      false
    );
    expect(getLatestAuthBrokerInstance()?.clearSecrets).toHaveBeenCalledWith(profile.id);
    expect(remoteConnectionManagerTestDoubles.rename).toHaveBeenCalled();
  });

  it('returns default statuses and merges stored diagnostics into snapshots', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();

    const defaultStatus = manager.getStatus('missing');
    expect(defaultStatus).toMatchObject({
      connectionId: 'missing',
      connected: false,
      phase: 'idle',
    });

    getPrivate<Map<string, unknown>>(manager, 'volatileStatuses').set('profile-1', {
      connectionId: 'profile-1',
      connected: false,
      phase: 'failed',
      lastCheckedAt: 123,
      error: 'boom',
    });
    getPrivate<Map<string, unknown>>(manager, 'diagnostics').set('profile-1', {
      totalDurationMs: 25,
      phaseDurationsMs: { failed: 25 },
      stepDurationsMs: {},
    });

    expect(manager.getStatus('profile-1')).toEqual({
      connectionId: 'profile-1',
      connected: false,
      phase: 'failed',
      lastCheckedAt: 123,
      error: 'boom',
      diagnostics: {
        totalDurationMs: 25,
        phaseDurationsMs: { failed: 25 },
        stepDurationsMs: {},
      },
    });
  });

  it('broadcasts local status changes on disconnect and stops notifying removed listeners', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const window = remoteConnectionManagerTestDoubles.createWindow();
    const listener = vi.fn();

    const off = manager.onDidStatusChange('profile-1', listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectionId: 'profile-1',
        connected: false,
        phase: 'idle',
      })
    );

    await manager.disconnect('profile-1');

    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.REMOTE_STATUS_CHANGED,
      expect.objectContaining({
        connectionId: 'profile-1',
        status: expect.objectContaining({
          connectionId: 'profile-1',
          connected: false,
          phase: 'idle',
        }),
      })
    );
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    await manager.disconnect('profile-1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reuses pending connection attempts for the same profile', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile();

    setPrivate(manager, 'loaded', true);

    let resolveConnection!: (status: {
      connectionId: string;
      connected: boolean;
      phase: string;
    }) => void;
    const connectionPromise = new Promise<{
      connectionId: string;
      connected: boolean;
      phase: string;
    }>((resolve) => {
      resolveConnection = resolve;
    });
    getPrivate<Map<string, Promise<unknown>>>(manager, 'pendingConnections').set(
      profile.id,
      connectionPromise
    );

    const first = manager.connect(profile);
    const second = manager.connect(profile);

    expect(
      getPrivate<Map<string, Promise<unknown>>>(manager, 'pendingConnections').get(profile.id)
    ).toBe(connectionPromise);
    resolveConnection({
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
    });

    await expect(first).resolves.toEqual({
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
    });
    await expect(second).resolves.toEqual({
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
    });
    expect(getPrivate<Map<string, Promise<unknown>>>(manager, 'pendingConnections').size).toBe(1);
  });

  it('returns existing server status without reconnecting when a server is already attached', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile();
    const status = {
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
      lastCheckedAt: 99,
    };

    getPrivate<Map<string, unknown>>(manager, 'servers').set(profile.id, { status });

    await expect(manager.connect(profile)).resolves.toBe(status);
  });

  it('normalizes remote paths for directory listing and exposes runtime roots and runtime info', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile();
    const runtime = {
      platform: 'linux',
      arch: 'x64',
      homeDir: '/home/dev',
      gitVersion: '2.47.0',
      libc: 'glibc',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    };

    const connect = vi.spyOn(manager, 'connect').mockResolvedValue({
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
      lastCheckedAt: 1,
    } as never);
    const call = vi
      .spyOn(manager, 'call')
      .mockResolvedValue([
        { name: 'project', path: '/srv/project', isDirectory: true },
      ] as FileEntry[]);
    setPrivate(manager, 'resolveRuntime', vi.fn().mockResolvedValue(runtime));

    await expect(manager.browseRoots(profile)).resolves.toEqual(['/', '/home/dev']);
    await expect(manager.listDirectory(profile, 'C:\\Users\\dev\\workspace\\')).resolves.toEqual([
      { name: 'project', path: '/srv/project', isDirectory: true },
    ]);
    await expect(manager.getRuntimeInfo(profile)).resolves.toEqual({
      profile,
      sshTarget: profile.sshTarget,
      platform: 'linux',
      homeDir: '/home/dev',
      nodeVersion: '20.18.0',
      gitVersion: '2.47.0',
      libc: 'glibc',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    });

    expect(connect).toHaveBeenCalledWith(profile);
    expect(call).toHaveBeenCalledWith(profile.id, 'fs:list', {
      path: 'C:/Users/dev/workspace',
    });
  });

  it('returns failure summaries when runtime resolution fails for connection tests and runtime status', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile({ helperInstallDir: '/custom/runtime-root' });

    setPrivate(manager, 'resolveRuntime', vi.fn().mockRejectedValue(new Error('ssh probe failed')));

    await expect(manager.testConnection(profile)).resolves.toEqual({
      success: false,
      error: 'ssh probe failed',
    });
    await expect(manager.getRuntimeStatus(profile)).resolves.toEqual(
      expect.objectContaining({
        connectionId: profile.id,
        installed: false,
        installDir: '/custom/runtime-root',
        connected: false,
        verificationState: 'failed',
        error: 'ssh probe failed',
      })
    );
  });

  it('returns verified runtime status details when cached verification metadata exists', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile({ runtimeInstallDir: '/remote/runtime' });
    const runtime = {
      platform: 'linux',
      arch: 'x64',
      homeDir: '/home/dev',
      gitVersion: '2.47.0',
      libc: 'glibc',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    };

    getPrivate<Map<string, unknown>>(manager, 'volatileStatuses').set(profile.id, {
      connectionId: profile.id,
      connected: true,
      phase: 'connected',
      verificationState: 'pending',
      ptySupported: false,
      ptyError: 'old error',
      lastCheckedAt: 1,
    });
    getPrivate<Map<string, unknown>>(manager, 'runtimeVerifications').set(profile.id, {
      version: '9.9.9',
      installDir: '/remote/runtime',
      verifiedAt: 123,
      result: {
        platform: 'linux',
        arch: 'x64',
        nodeVersion: '20.18.0',
        manifest: {},
        helperSourceSha256: 'abc',
        ptySupported: true,
      },
    });
    setPrivate(manager, 'resolveRuntime', vi.fn().mockResolvedValue(runtime));
    setPrivate(
      manager,
      'listInstalledRuntimeVersions',
      vi.fn().mockResolvedValue(['9.8.0', '9.9.9'])
    );

    await expect(manager.getRuntimeStatus(profile)).resolves.toEqual(
      expect.objectContaining({
        connectionId: profile.id,
        installed: true,
        installDir: '/remote/runtime',
        installedVersions: ['9.8.0', '9.9.9'],
        connected: true,
        verificationState: 'verified',
        ptySupported: true,
        ptyError: undefined,
      })
    );
  });

  it('builds managed runtime paths with the Infilux remote filenames', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile({ runtimeInstallDir: '/remote/runtime' });
    const runtime = {
      platform: 'linux',
      arch: 'x64',
      homeDir: '/home/dev',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    };
    type RuntimeInstallTestInput = typeof runtime;

    const getRuntimeInstallPaths = getPrivate<
      (
        profile: ConnectionProfile,
        runtime: RuntimeInstallTestInput
      ) => {
        serverPath: string;
        manifestPath: string;
      }
    >(manager, 'getRuntimeInstallPaths');

    expect(getRuntimeInstallPaths.call(manager, profile, runtime)).toMatchObject({
      serverPath: '/remote/runtime/9.9.9/infilux-remote-server.cjs',
      manifestPath: '/remote/runtime/9.9.9/infilux-remote-runtime-manifest.json',
    });
  });

  it('runs install and update runtime orchestration and refreshes runtime status', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile({ runtimeInstallDir: '/remote/runtime' });
    const runtime = {
      platform: 'linux',
      arch: 'x64',
      homeDir: '/home/dev',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    };
    const status = {
      connectionId: profile.id,
      installed: true,
      installDir: '/remote/runtime',
      installedVersions: ['9.9.9'],
      currentVersion: '9.9.9',
      runtimeVersion: '20.18.0',
      serverVersion: '9.9.9',
      connected: false,
      verificationState: 'verified',
      lastCheckedAt: 1,
    };

    getPrivate<Map<string, unknown>>(manager, 'runtimeVerifications').set(profile.id, {
      version: '9.9.9',
      installDir: '/remote/runtime',
      verifiedAt: 10,
    });
    getPrivate<Map<string, Promise<void>>>(manager, 'pendingRuntimeVerifications').set(
      profile.id,
      Promise.resolve()
    );

    const disconnect = vi.spyOn(manager, 'disconnect').mockResolvedValue(undefined);
    const getRuntimeStatus = vi
      .spyOn(manager, 'getRuntimeStatus')
      .mockResolvedValue(status as never);
    const stopRemoteDaemon = vi.fn().mockResolvedValue(undefined);
    const installManagedRuntime = vi.fn().mockResolvedValue(undefined);
    const verifyManagedRuntime = vi.fn().mockResolvedValue({
      platform: 'linux',
      arch: 'x64',
      nodeVersion: '20.18.0',
      manifest: {},
      helperSourceSha256: 'abc',
      ptySupported: true,
    });
    const cleanupOldRuntimeVersionsOnHost = vi.fn().mockResolvedValue(undefined);

    setPrivate(manager, 'resolveRuntime', vi.fn().mockResolvedValue(runtime));
    setPrivate(manager, 'stopRemoteDaemon', stopRemoteDaemon);
    setPrivate(manager, 'installManagedRuntime', installManagedRuntime);
    setPrivate(manager, 'verifyManagedRuntime', verifyManagedRuntime);
    setPrivate(manager, 'cleanupOldRuntimeVersionsOnHost', cleanupOldRuntimeVersionsOnHost);

    await expect(manager.installRuntime(profile)).resolves.toBe(status);
    expect(disconnect).toHaveBeenCalledWith(profile.id);
    expect(stopRemoteDaemon).toHaveBeenCalledTimes(1);
    expect(installManagedRuntime).toHaveBeenCalledTimes(1);
    expect(verifyManagedRuntime).toHaveBeenCalledTimes(1);
    expect(cleanupOldRuntimeVersionsOnHost).not.toHaveBeenCalled();
    expect(
      getPrivate<Map<string, unknown>>(manager, 'runtimeVerifications').get(profile.id)
    ).toEqual(
      expect.objectContaining({
        installDir: '/remote/runtime',
        result: expect.objectContaining({
          ptySupported: true,
        }),
      })
    );
    expect(
      getPrivate<Map<string, Promise<void>>>(manager, 'pendingRuntimeVerifications').has(profile.id)
    ).toBe(false);

    verifyManagedRuntime.mockClear();
    stopRemoteDaemon.mockClear();
    installManagedRuntime.mockClear();
    cleanupOldRuntimeVersionsOnHost.mockClear();

    await expect(manager.updateRuntime(profile)).resolves.toBe(status);
    expect(stopRemoteDaemon).toHaveBeenCalledTimes(1);
    expect(installManagedRuntime).toHaveBeenCalledTimes(1);
    expect(verifyManagedRuntime).toHaveBeenCalledTimes(1);
    expect(cleanupOldRuntimeVersionsOnHost).toHaveBeenCalledTimes(1);
    expect(getRuntimeStatus).toHaveBeenCalledTimes(2);
  });

  it('deletes installed runtime versions after stopping the remote daemon', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const profile = createProfile({ runtimeInstallDir: '/remote/runtime' });
    const runtime = {
      platform: 'linux',
      arch: 'x64',
      homeDir: '/home/dev',
      resolvedHost: {
        host: 'example.com',
        port: 22,
      },
    };
    const status = {
      connectionId: profile.id,
      installed: false,
      installDir: '/remote/runtime',
      installedVersions: [],
      currentVersion: '9.9.9',
      runtimeVersion: '20.18.0',
      serverVersion: '9.9.9',
      connected: false,
      verificationState: 'summary',
      lastCheckedAt: 1,
    };

    const disconnect = vi.spyOn(manager, 'disconnect').mockResolvedValue(undefined);
    const getRuntimeStatus = vi
      .spyOn(manager, 'getRuntimeStatus')
      .mockResolvedValue(status as never);
    const stopRemoteDaemon = vi.fn().mockResolvedValue(undefined);
    const deleteInstalledRuntimeVersions = vi.fn().mockResolvedValue(undefined);

    setPrivate(manager, 'resolveRuntime', vi.fn().mockResolvedValue(runtime));
    setPrivate(manager, 'stopRemoteDaemon', stopRemoteDaemon);
    setPrivate(manager, 'deleteInstalledRuntimeVersions', deleteInstalledRuntimeVersions);

    await expect(manager.deleteRuntime(profile)).resolves.toBe(status);

    expect(disconnect).toHaveBeenCalledWith(profile.id);
    expect(stopRemoteDaemon).toHaveBeenCalledTimes(1);
    expect(deleteInstalledRuntimeVersions).toHaveBeenCalledTimes(1);
    expect(getRuntimeStatus).toHaveBeenCalledWith(profile);
  });

  it('routes RPC calls through an attached server process and removes event listeners on dispose', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const proc = createFakeProc();
    const listener = vi.fn();
    const server = {
      connectionId: 'profile-1',
      profile: createProfile(),
      proc,
      nextRequestId: 1,
      pending: new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
      >(),
      buffer: '',
      closed: false,
      stderrTail: [],
      stdoutNoiseTail: [],
      status: {
        connectionId: 'profile-1',
        connected: true,
        phase: 'connected',
        lastCheckedAt: 1,
      },
    };

    getPrivate<Map<string, unknown>>(manager, 'servers').set('profile-1', server);

    const callPromise = manager.call('profile-1', 'fs:list', { path: '/srv/project' });
    expect(proc.stdin.write).toHaveBeenCalledWith(
      `${JSON.stringify({ id: 1, method: 'fs:list', params: { path: '/srv/project' } })}\n`,
      'utf8',
      expect.any(Function)
    );
    server.pending.get(1)?.resolve([{ name: 'project' }]);
    await expect(callPromise).resolves.toEqual([{ name: 'project' }]);

    const off = await manager.addEventListener('profile-1', 'remote:session:data', listener);
    proc.emit('remote:session:data', { chunk: 'hello' });
    expect(listener).toHaveBeenCalledWith({ chunk: 'hello' });

    off();
    proc.emit('remote:session:data', { chunk: 'bye' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shuts down attached servers, rejects pending RPC calls, and notifies disconnect listeners', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const proc = createFakeProc();
    const reject = vi.fn();
    const listener = vi.fn();
    const server = {
      connectionId: 'profile-1',
      profile: createProfile(),
      proc,
      nextRequestId: 3,
      pending: new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
      >([[2, { resolve: vi.fn(), reject }]]),
      buffer: '',
      closed: false,
      stderrTail: ['warning'],
      stdoutNoiseTail: [],
      status: {
        connectionId: 'profile-1',
        connected: true,
        phase: 'connected',
        lastCheckedAt: 1,
      },
    };

    getPrivate<Map<string, unknown>>(manager, 'servers').set('profile-1', server);
    getPrivate<Map<string, Set<() => void>>>(manager, 'disconnectListeners').set(
      'profile-1',
      new Set([listener])
    );

    await manager.disconnect('profile-1');

    expect(server.closed).toBe(true);
    expect(proc.stdin.end).toHaveBeenCalledTimes(1);
    expect(proc.listenerCount('exit')).toBeGreaterThan(0);
    expect(proc.listenerCount('close')).toBeGreaterThan(0);
    expect(reject).toHaveBeenCalledWith(expect.any(Error));
    expect(reject.mock.calls[0]?.[0]?.message).toContain('Remote server disconnected');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getPrivate<Map<string, unknown>>(manager, 'servers').has('profile-1')).toBe(false);
    expect(getPrivate<Map<string, unknown>>(manager, 'volatileStatuses').get('profile-1')).toEqual(
      expect.objectContaining({
        connectionId: 'profile-1',
        connected: false,
        phase: 'idle',
      })
    );
  });

  it('forwards helper aliases and auth responses through their primary handlers', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();
    const runtimeStatus = {
      connectionId: 'profile-1',
      installed: true,
      installDir: '/runtime',
      installedVersions: ['9.9.9'],
      currentVersion: '9.9.9',
      runtimeVersion: '20.18.0',
      serverVersion: '9.9.9',
      connected: true,
      verificationState: 'verified',
      lastCheckedAt: 1,
    };

    vi.spyOn(manager, 'getRuntimeStatus').mockResolvedValue(runtimeStatus as never);
    vi.spyOn(manager, 'installRuntime').mockResolvedValue(runtimeStatus as never);
    vi.spyOn(manager, 'updateRuntime').mockResolvedValue(runtimeStatus as never);
    vi.spyOn(manager, 'deleteRuntime').mockResolvedValue(runtimeStatus as never);

    await expect(manager.getHelperStatus('profile-1')).resolves.toBe(runtimeStatus);
    await expect(manager.installHelperManually('profile-1')).resolves.toBe(runtimeStatus);
    await expect(manager.updateHelper('profile-1')).resolves.toBe(runtimeStatus);
    await expect(manager.deleteHelper('profile-1')).resolves.toBe(runtimeStatus);
    expect(manager.respondAuthPrompt({ promptId: 'prompt-1', accepted: true })).toBe(true);
    expect(getLatestAuthBrokerInstance()?.respond).toHaveBeenCalledWith({
      promptId: 'prompt-1',
      accepted: true,
    });
  });

  it('clears timers, disconnects active servers, and disposes the auth broker during cleanup', async () => {
    const { RemoteConnectionManager } = await import('../RemoteConnectionManager');
    const manager = new RemoteConnectionManager();

    const timer = setTimeout(() => undefined, 5_000);
    getPrivate<Map<string, ReturnType<typeof setTimeout>>>(manager, 'reconnectTimers').set(
      'profile-1',
      timer
    );
    getPrivate<Map<string, unknown>>(manager, 'servers').set('profile-1', {}).set('profile-2', {});

    const disconnect = vi.spyOn(manager, 'disconnect').mockResolvedValue(undefined);

    await manager.cleanup();

    expect(getPrivate<Map<string, unknown>>(manager, 'reconnectTimers').size).toBe(0);
    expect(getPrivate<Map<string, unknown>>(manager, 'pendingConnections').size).toBe(0);
    expect(getPrivate<Map<string, unknown>>(manager, 'reconnectPromises').size).toBe(0);
    expect(getPrivate<Map<string, unknown>>(manager, 'reconnectAttempts').size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenNthCalledWith(1, 'profile-1');
    expect(disconnect).toHaveBeenNthCalledWith(2, 'profile-2');
    expect(getLatestAuthBrokerInstance()?.dispose).toHaveBeenCalledTimes(1);
  }, 15000);
});
