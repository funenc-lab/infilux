import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecCallback = (error: Error | null, stdout: string, stderr?: string) => void;
type SpawnListener = (...args: unknown[]) => void;

interface FakeChildProcess {
  stderr: {
    on: ReturnType<typeof vi.fn>;
  };
  on: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitClose: (code: number) => void;
  emitError: (error: Error) => void;
  emitStderr: (value: string) => void;
}

const cliInstallerTestDoubles = vi.hoisted(() => {
  const exec = vi.fn();
  const spawn = vi.fn();
  const existsSync = vi.fn();
  const mkdirSync = vi.fn();
  const unlinkSync = vi.fn();
  const writeFileSync = vi.fn();
  const homedir = vi.fn();
  const appGetPath = vi.fn();
  const appGetAppPath = vi.fn();
  const spawned: FakeChildProcess[] = [];

  function createChildProcess(): FakeChildProcess {
    const stderrListeners = new Map<string, SpawnListener>();
    const listeners = new Map<string, SpawnListener>();

    return {
      stderr: {
        on: vi.fn((event: string, listener: SpawnListener) => {
          stderrListeners.set(event, listener);
        }),
      },
      on: vi.fn((event: string, listener: SpawnListener) => {
        listeners.set(event, listener);
      }),
      unref: vi.fn(),
      kill: vi.fn(),
      emitClose(code: number) {
        listeners.get('close')?.(code);
      },
      emitError(error: Error) {
        listeners.get('error')?.(error);
      },
      emitStderr(value: string) {
        stderrListeners.get('data')?.(Buffer.from(value));
      },
    };
  }

  function mockExecImplementation(impl: (command: string, callback: ExecCallback) => void) {
    exec.mockImplementation(
      (command: string, callbackOrOptions: unknown, maybeCallback?: ExecCallback) => {
        const callback =
          typeof callbackOrOptions === 'function'
            ? (callbackOrOptions as ExecCallback)
            : maybeCallback;
        if (!callback) {
          throw new Error('Missing exec callback');
        }
        impl(command, callback);
        return {} as never;
      }
    );
  }

  function reset() {
    exec.mockReset();
    spawn.mockReset();
    existsSync.mockReset();
    mkdirSync.mockReset();
    unlinkSync.mockReset();
    writeFileSync.mockReset();
    homedir.mockReset();
    homedir.mockReturnValue('/Users/tester');
    appGetPath.mockReset();
    appGetPath.mockImplementation((name: string) => {
      if (name === 'temp') {
        return '/tmp';
      }
      if (name === 'exe') {
        return '/Applications/Infilux.app/Contents/MacOS/Infilux';
      }
      return `/mock/${name}`;
    });
    appGetAppPath.mockReset();
    appGetAppPath.mockReturnValue('/Applications/Infilux.app/Contents/Resources/app.asar');
    spawned.length = 0;

    mockExecImplementation((_command, callback) => {
      callback(null, '', '');
    });

    spawn.mockImplementation(() => {
      const child = createChildProcess();
      spawned.push(child);
      return child;
    });
  }

  return {
    exec,
    spawn,
    existsSync,
    mkdirSync,
    unlinkSync,
    writeFileSync,
    homedir,
    appGetPath,
    appGetAppPath,
    spawned,
    createChildProcess,
    mockExecImplementation,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  exec: cliInstallerTestDoubles.exec,
  spawn: cliInstallerTestDoubles.spawn,
}));

vi.mock('node:fs', () => ({
  existsSync: cliInstallerTestDoubles.existsSync,
  mkdirSync: cliInstallerTestDoubles.mkdirSync,
  unlinkSync: cliInstallerTestDoubles.unlinkSync,
  writeFileSync: cliInstallerTestDoubles.writeFileSync,
}));

vi.mock('node:os', () => ({
  homedir: cliInstallerTestDoubles.homedir,
}));

vi.mock('electron', () => ({
  app: {
    getPath: cliInstallerTestDoubles.appGetPath,
    getAppPath: cliInstallerTestDoubles.appGetAppPath,
  },
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

describe('CliInstaller', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    cliInstallerTestDoubles.reset();
    delete process.env.LOCALAPPDATA;
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('installs and uninstalls the Windows CLI shim and updates PATH', async () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';

    const cliPath = join(process.env.LOCALAPPDATA, 'Programs', 'infilux', 'infilux.cmd');
    const cliDir = join(process.env.LOCALAPPDATA, 'Programs', 'infilux');

    cliInstallerTestDoubles.existsSync.mockImplementation((target: string) => target === cliPath);
    cliInstallerTestDoubles.mockExecImplementation((command, callback) => {
      if (command.includes("GetEnvironmentVariable('PATH', 'User')")) {
        callback(null, 'C:\\Existing\\Bin', '');
        return;
      }
      callback(null, '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');

    cliInstallerTestDoubles.existsSync.mockImplementation(() => false);
    expect(await cliInstaller.checkInstalled()).toEqual({
      installed: false,
      path: null,
    });

    expect(await cliInstaller.install()).toEqual({
      installed: true,
      path: cliPath,
    });

    cliInstallerTestDoubles.existsSync.mockImplementation((target: string) => target === cliPath);
    expect(await cliInstaller.uninstall()).toEqual({
      installed: false,
      path: null,
    });

    expect(cliInstallerTestDoubles.mkdirSync).toHaveBeenCalledWith(cliDir, { recursive: true });
    expect(cliInstallerTestDoubles.writeFileSync).toHaveBeenCalledWith(
      cliPath,
      expect.stringContaining('/Applications/Infilux.app/Contents/MacOS/Infilux'),
      { encoding: 'utf-8' }
    );
    expect(cliInstallerTestDoubles.unlinkSync).toHaveBeenCalledWith(cliPath);
    expect(cliInstallerTestDoubles.exec).toHaveBeenCalledWith(
      expect.stringContaining("GetEnvironmentVariable('PATH', 'User')"),
      expect.any(Function)
    );
    expect(cliInstallerTestDoubles.exec).toHaveBeenCalledWith(
      expect.stringContaining("SetEnvironmentVariable('PATH'"),
      expect.any(Function)
    );
  });

  it('installs the macOS CLI shim via osascript and cleans up the temp file', async () => {
    setPlatform('darwin');
    cliInstallerTestDoubles.existsSync.mockReturnValue(false);

    const { cliInstaller } = await import('../CliInstaller');
    const installPromise = cliInstaller.install();

    const child = cliInstallerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing spawned child process');
    }
    child.emitClose(0);

    await expect(installPromise).resolves.toEqual({
      installed: true,
      path: '/usr/local/bin/infilux',
    });

    expect(cliInstallerTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/tmp/infilux-cli-script',
      expect.stringContaining('open -a "/Applications/Infilux.app"'),
      { mode: 0o755 }
    );
    expect(cliInstallerTestDoubles.spawn).toHaveBeenCalledWith(
      'osascript',
      [expect.stringMatching(/^-e$/), expect.stringContaining("cp '/tmp/infilux-cli-script'")],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    expect(cliInstallerTestDoubles.unlinkSync).toHaveBeenCalledWith('/tmp/infilux-cli-script');
  });

  it('returns the macOS install error and falls back to the default app bundle path', async () => {
    setPlatform('darwin');
    cliInstallerTestDoubles.existsSync.mockReturnValue(false);
    cliInstallerTestDoubles.appGetAppPath.mockReturnValue('/Users/tester/dev/infilux');

    const { cliInstaller } = await import('../CliInstaller');
    const installPromise = cliInstaller.install();

    const child = cliInstallerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing spawned child process');
    }

    child.emitStderr('permission denied');
    child.emitClose(1);

    await expect(installPromise).resolves.toEqual({
      installed: false,
      path: null,
      error: 'permission denied',
    });

    expect(cliInstallerTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/tmp/infilux-cli-script',
      expect.stringContaining('open -a "/Applications/Infilux.app"'),
      { mode: 0o755 }
    );
  });

  it('installs the Linux CLI shim through a terminal emulator and polls for success', async () => {
    vi.useFakeTimers();
    setPlatform('linux');

    let successMarkerExists = false;
    vi.spyOn(Date, 'now').mockReturnValue(42);
    cliInstallerTestDoubles.existsSync.mockImplementation((target: string) => {
      if (target === '/tmp/infilux-cli-install-success-42') {
        return successMarkerExists;
      }
      return false;
    });
    cliInstallerTestDoubles.mockExecImplementation((command, callback) => {
      if (command === 'which xfce4-terminal') {
        callback(null, '/usr/bin/xfce4-terminal\n', '');
        return;
      }
      callback(new Error(`Unexpected command: ${command}`), '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');
    const installPromise = cliInstaller.install();

    successMarkerExists = true;
    await vi.advanceTimersByTimeAsync(500);

    await expect(installPromise).resolves.toEqual({
      installed: true,
      path: '/usr/local/bin/infilux',
    });

    expect(cliInstallerTestDoubles.writeFileSync).toHaveBeenCalledWith(
      '/tmp/infilux-cli-script',
      expect.stringContaining(
        '"/Applications/Infilux.app/Contents/MacOS/Infilux" --open-path="$TARGET_PATH"'
      ),
      { mode: 0o755 }
    );
    expect(cliInstallerTestDoubles.spawn).toHaveBeenCalledWith(
      'xfce4-terminal',
      expect.any(Array),
      {
        stdio: 'ignore',
        detached: true,
      }
    );
    expect(cliInstallerTestDoubles.spawned[0]?.unref).toHaveBeenCalledTimes(1);
    expect(cliInstallerTestDoubles.unlinkSync).toHaveBeenCalledWith(
      '/tmp/infilux-cli-install-success-42'
    );
  });

  it('falls back to pkexec on Linux and ignores temp cleanup failures', async () => {
    setPlatform('linux');
    cliInstallerTestDoubles.existsSync.mockReturnValue(false);
    cliInstallerTestDoubles.unlinkSync.mockImplementation((target: string) => {
      if (target === '/tmp/infilux-cli-script') {
        throw new Error('cleanup failed');
      }
    });
    cliInstallerTestDoubles.mockExecImplementation((_command, callback) => {
      callback(new Error('missing terminal'), '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');
    const installPromise = cliInstaller.install();
    await vi.waitFor(() => {
      expect(cliInstallerTestDoubles.spawned[0]).toBeDefined();
    });

    const child = cliInstallerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing spawned child process');
    }
    child.emitClose(0);

    await expect(installPromise).resolves.toEqual({
      installed: true,
      path: '/usr/local/bin/infilux',
    });

    expect(cliInstallerTestDoubles.spawn).toHaveBeenCalledWith(
      'pkexec',
      [
        'sh',
        '-c',
        expect.stringContaining("cp '/tmp/infilux-cli-script' '/usr/local/bin/infilux'"),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  });

  it('returns an error when Linux uninstall times out in the terminal flow', async () => {
    vi.useFakeTimers();
    setPlatform('linux');
    cliInstallerTestDoubles.existsSync.mockImplementation((target: string) => {
      if (target === '/usr/local/bin/infilux') {
        return true;
      }
      if (target.startsWith('/tmp/infilux-cli-install-success-')) {
        return false;
      }
      return false;
    });
    cliInstallerTestDoubles.mockExecImplementation((command, callback) => {
      if (command === 'which xfce4-terminal') {
        callback(null, '/usr/bin/xfce4-terminal\n', '');
        return;
      }
      callback(new Error(`Unexpected command: ${command}`), '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');
    const uninstallPromise = cliInstaller.uninstall();
    await vi.advanceTimersByTimeAsync(60000);

    await expect(uninstallPromise).resolves.toEqual({
      installed: true,
      path: '/usr/local/bin/infilux',
      error: '安装超时或已取消',
    });
  });

  it('uses the homedir fallback on Windows and skips PATH updates when already present', async () => {
    setPlatform('win32');

    const cliPath = join('/Users/tester', 'AppData', 'Local', 'Programs', 'infilux', 'infilux.cmd');
    const cliDir = join('/Users/tester', 'AppData', 'Local', 'Programs', 'infilux');

    cliInstallerTestDoubles.existsSync.mockImplementation(
      (target: string) => target === cliPath || target === cliDir
    );
    cliInstallerTestDoubles.mockExecImplementation((command, callback) => {
      if (command.includes("GetEnvironmentVariable('PATH', 'User')")) {
        callback(null, `${cliDir};C:\\Existing\\Bin`, '');
        return;
      }
      callback(null, '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');

    expect(await cliInstaller.checkInstalled()).toEqual({
      installed: true,
      path: cliPath,
    });

    await expect(cliInstaller.install()).resolves.toEqual({
      installed: true,
      path: cliPath,
    });

    expect(cliInstallerTestDoubles.homedir).toHaveBeenCalledTimes(2);
    expect(cliInstallerTestDoubles.mkdirSync).not.toHaveBeenCalled();
    expect(cliInstallerTestDoubles.exec).toHaveBeenCalledTimes(1);
  });

  it('returns success when Windows uninstall cannot update the PATH', async () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';

    const cliPath = join(process.env.LOCALAPPDATA, 'Programs', 'infilux', 'infilux.cmd');

    cliInstallerTestDoubles.existsSync.mockImplementation((target: string) => target === cliPath);
    cliInstallerTestDoubles.mockExecImplementation((command, callback) => {
      if (command.includes("SetEnvironmentVariable('PATH'")) {
        callback(new Error('registry denied'), '', '');
        return;
      }
      callback(null, '', '');
    });

    const { cliInstaller } = await import('../CliInstaller');

    await expect(cliInstaller.uninstall()).resolves.toEqual({
      installed: false,
      path: null,
    });

    expect(cliInstallerTestDoubles.unlinkSync).toHaveBeenCalledWith(cliPath);
  });
});
