import { EventEmitter } from 'node:events';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (error: Error | null, stdout: string, stderr?: string) => void;

class FakeTunnel extends EventEmitter {
  public process?: { pid?: number };
  public stop = vi.fn();

  constructor(pid?: number) {
    super();
    if (pid !== undefined) {
      this.process = { pid };
    }
  }
}

const cloudflaredTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn();
  const mkdirSync = vi.fn();
  const execFile = vi.fn();
  const install = vi.fn();
  const use = vi.fn();
  const quick = vi.fn();
  const withToken = vi.fn();
  const getPath = vi.fn();
  const killProcessTree = vi.fn();
  const tunnels: FakeTunnel[] = [];

  function mockExecFileImplementation(
    impl: (file: string, args: string[], callback: ExecFileCallback) => void
  ) {
    execFile.mockImplementation((file: string, args: string[], callback?: ExecFileCallback) => {
      if (!callback) {
        throw new Error('Missing execFile callback');
      }
      impl(file, args, callback);
      return {} as never;
    });
    Object.assign(execFile, {
      [promisify.custom]: (file: string, args: string[]) =>
        new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          impl(file, args, (error, stdout, stderr = '') => {
            if (error) {
              reject(Object.assign(error, { stdout, stderr }));
              return;
            }
            resolve({ stdout, stderr });
          });
        }),
    });
  }

  function createTunnel(pid?: number) {
    const tunnel = new FakeTunnel(pid);
    tunnels.push(tunnel);
    return tunnel;
  }

  function reset() {
    existsSync.mockReset();
    mkdirSync.mockReset();
    execFile.mockReset();
    install.mockReset();
    use.mockReset();
    quick.mockReset();
    withToken.mockReset();
    getPath.mockReset();
    killProcessTree.mockReset();
    tunnels.length = 0;

    getPath.mockReturnValue('/tmp/app-data');
    existsSync.mockReturnValue(true);
    mockExecFileImplementation((_file: string, _args: string[], callback: ExecFileCallback) => {
      callback(null, 'cloudflared version 2026.3.0\n', '');
    });
    install.mockResolvedValue(undefined);
    quick.mockImplementation(() => createTunnel(4321));
    withToken.mockImplementation(() => createTunnel());
  }

  return {
    existsSync,
    mkdirSync,
    execFile,
    install,
    use,
    quick,
    withToken,
    getPath,
    killProcessTree,
    tunnels,
    reset,
    mockExecFileImplementation,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: cloudflaredTestDoubles.existsSync,
      mkdirSync: cloudflaredTestDoubles.mkdirSync,
    },
    existsSync: cloudflaredTestDoubles.existsSync,
    mkdirSync: cloudflaredTestDoubles.mkdirSync,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: cloudflaredTestDoubles.execFile,
  };
});

vi.mock('cloudflared', () => ({
  install: cloudflaredTestDoubles.install,
  use: cloudflaredTestDoubles.use,
  Tunnel: {
    quick: cloudflaredTestDoubles.quick,
    withToken: cloudflaredTestDoubles.withToken,
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: cloudflaredTestDoubles.getPath,
  },
}));

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: cloudflaredTestDoubles.killProcessTree,
}));

describe('CloudflaredManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cloudflaredTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks installation state, parses versions, and configures the custom binary path', async () => {
    const expectedBinary = path.join(
      '/tmp/app-data',
      'bin',
      process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );

    let module = await import('../CloudflaredManager');
    expect(cloudflaredTestDoubles.getPath).toHaveBeenCalledWith('userData');
    expect(cloudflaredTestDoubles.use).toHaveBeenCalledWith(expectedBinary);
    await expect(module.cloudflaredManager.checkInstalled()).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
    });

    vi.resetModules();
    cloudflaredTestDoubles.reset();
    cloudflaredTestDoubles.existsSync.mockReturnValue(false);
    module = await import('../CloudflaredManager');
    await expect(module.cloudflaredManager.checkInstalled()).resolves.toEqual({
      installed: false,
    });

    vi.resetModules();
    cloudflaredTestDoubles.reset();
    cloudflaredTestDoubles.mockExecFileImplementation(
      (_file: string, _args: string[], callback: ExecFileCallback) => {
        callback(new Error('missing'), '', '');
      }
    );
    module = await import('../CloudflaredManager');
    await expect(module.cloudflaredManager.checkInstalled()).resolves.toEqual({
      installed: false,
    });
  });

  it('installs binaries, creates the bin directory, emits status, and surfaces install failures', async () => {
    const expectedBinary = path.join(
      '/tmp/app-data',
      'bin',
      process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );
    const expectedBinDir = path.dirname(expectedBinary);
    cloudflaredTestDoubles.existsSync.mockImplementation((target: string) => {
      if (target === expectedBinDir) {
        return false;
      }
      return true;
    });

    const { cloudflaredManager } = await import('../CloudflaredManager');
    const statuses: Array<Record<string, unknown>> = [];
    cloudflaredManager.on('statusChanged', (status) => {
      statuses.push({ ...status });
    });

    await expect(cloudflaredManager.install()).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
    });
    expect(cloudflaredTestDoubles.mkdirSync).toHaveBeenCalledWith(expectedBinDir, {
      recursive: true,
    });
    expect(cloudflaredTestDoubles.install).toHaveBeenCalledWith(expectedBinary);
    expect(statuses).toContainEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
    });

    cloudflaredTestDoubles.install.mockRejectedValueOnce(new Error('download failed'));
    await expect(cloudflaredManager.install()).resolves.toEqual({
      installed: false,
      error: 'download failed',
    });
  });

  it('starts quick tunnels, reuses active tunnels, and reacts to url and error events', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cloudflaredManager } = await import('../CloudflaredManager');
    const statuses: Array<Record<string, unknown>> = [];
    cloudflaredManager.on('statusChanged', (status) => {
      statuses.push({ ...status });
    });

    const startStatus = await cloudflaredManager.start({
      mode: 'quick',
      port: 3006,
      protocol: 'http2',
    });
    expect(startStatus).toEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
    });
    expect(cloudflaredTestDoubles.quick).toHaveBeenCalledWith('http://localhost:3006', {
      '--protocol': 'http2',
    });

    await expect(
      cloudflaredManager.start({
        mode: 'quick',
        port: 3006,
      })
    ).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
    });
    expect(cloudflaredTestDoubles.quick).toHaveBeenCalledTimes(1);

    const tunnel = cloudflaredTestDoubles.tunnels[0];
    if (!tunnel) {
      throw new Error('Missing quick tunnel');
    }

    tunnel.emit('stdout', 'hello');
    tunnel.emit('stderr', 'warning');
    tunnel.emit('disconnected', { id: 'c1', ip: '1.1.1.1', location: 'SJC' });
    tunnel.emit('url', 'https://cf-3006.example.com');
    expect(cloudflaredManager.getStatus()).toEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
      url: 'https://cf-3006.example.com',
    });

    tunnel.emit('error', new Error('tunnel lost'));
    expect(errorSpy).toHaveBeenCalledWith('[cloudflared] Error:', 'tunnel lost');
    expect(cloudflaredManager.getStatus()).toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
      error: 'tunnel lost',
    });
    expect(logSpy).toHaveBeenCalledWith('[cloudflared]', 'hello');
    expect(errorSpy).toHaveBeenCalledWith('[cloudflared]', 'warning');
    expect(statuses).toContainEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
      url: 'https://cf-3006.example.com',
    });
  });

  it('starts auth tunnels, marks connected state, and falls back to tunnel.stop during cleanup', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { cloudflaredManager } = await import('../CloudflaredManager');

    await expect(
      cloudflaredManager.start({
        mode: 'auth',
        port: 3007,
        token: 'cf-token',
      })
    ).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
    });
    expect(cloudflaredTestDoubles.withToken).toHaveBeenCalledWith('cf-token', {});

    const tunnel = cloudflaredTestDoubles.tunnels[0];
    if (!tunnel) {
      throw new Error('Missing auth tunnel');
    }

    tunnel.emit('connected', { id: 'c2', ip: '2.2.2.2', location: 'HKG' });
    expect(cloudflaredManager.getStatus()).toEqual({
      installed: true,
      version: '2026.3.0',
      running: true,
      url: 'Connected',
    });
    expect(logSpy).toHaveBeenCalledWith('[cloudflared] Connected:', {
      id: 'c2',
      ip: '2.2.2.2',
      location: 'HKG',
    });

    cloudflaredManager.cleanup();
    expect(tunnel.stop).toHaveBeenCalledTimes(1);
    expect(cloudflaredTestDoubles.killProcessTree).not.toHaveBeenCalled();
  });

  it('handles missing installs, invalid configs, and tunnel factory failures', async () => {
    cloudflaredTestDoubles.existsSync.mockReturnValue(false);
    let module = await import('../CloudflaredManager');
    await expect(
      module.cloudflaredManager.start({
        mode: 'quick',
        port: 3008,
      })
    ).resolves.toEqual({
      installed: false,
      running: false,
      error: 'Cloudflared not installed',
    });

    vi.resetModules();
    cloudflaredTestDoubles.reset();
    module = await import('../CloudflaredManager');
    await expect(
      module.cloudflaredManager.start({
        mode: 'auth',
        port: 3009,
      })
    ).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
      error: 'Invalid tunnel configuration',
    });

    vi.resetModules();
    cloudflaredTestDoubles.reset();
    cloudflaredTestDoubles.quick.mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });
    module = await import('../CloudflaredManager');
    await expect(
      module.cloudflaredManager.start({
        mode: 'quick',
        port: 3010,
      })
    ).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
      error: 'spawn failed',
    });
  });

  it('handles exit events and stop requests for active tunnels', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { cloudflaredManager } = await import('../CloudflaredManager');

    await cloudflaredManager.start({
      mode: 'quick',
      port: 3011,
    });
    const firstTunnel = cloudflaredTestDoubles.tunnels[0];
    if (!firstTunnel) {
      throw new Error('Missing first tunnel');
    }
    firstTunnel.emit('exit', 0, null);
    expect(cloudflaredManager.getStatus()).toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
      error: undefined,
    });

    await cloudflaredManager.start({
      mode: 'quick',
      port: 3012,
    });
    const secondTunnel = cloudflaredTestDoubles.tunnels[1];
    if (!secondTunnel) {
      throw new Error('Missing second tunnel');
    }
    secondTunnel.emit('exit', 7, 'SIGTERM');
    expect(cloudflaredManager.getStatus()).toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
      error: 'Process exited with code 7',
    });

    await cloudflaredManager.start({
      mode: 'quick',
      port: 3013,
    });
    await expect(cloudflaredManager.stop()).resolves.toEqual({
      installed: true,
      version: '2026.3.0',
      running: false,
    });
    expect(cloudflaredTestDoubles.killProcessTree).toHaveBeenCalledWith(4321);
    expect(logSpy).toHaveBeenCalledWith('[cloudflared] Exit code:', 7, 'signal:', 'SIGTERM');
  });
});
