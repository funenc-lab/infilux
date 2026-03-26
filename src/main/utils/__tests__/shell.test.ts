import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExitListener = (event: { exitCode: number }) => void;
type DataListener = (data: string) => void;

interface FakePty {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  onData: (listener: DataListener) => { dispose(): void };
  onExit: (listener: ExitListener) => { dispose(): void };
  emitData: (data: string) => void;
  emitExit: (event: { exitCode: number }) => void;
}

const shellUtilTestDoubles = vi.hoisted(() => {
  const spawn = vi.fn();
  const readSettings = vi.fn();
  const findLoginShell = vi.fn();
  const getEnhancedPath = vi.fn();
  const resolveShellForCommand = vi.fn();
  const killProcessTree = vi.fn();
  const ptys: FakePty[] = [];

  function createPty(pid: number): FakePty {
    const dataListeners = new Set<DataListener>();
    const exitListeners = new Set<ExitListener>();

    return {
      pid,
      kill: vi.fn(),
      onData(listener: DataListener) {
        dataListeners.add(listener);
        return {
          dispose() {
            dataListeners.delete(listener);
          },
        };
      },
      onExit(listener: ExitListener) {
        exitListeners.add(listener);
        return {
          dispose() {
            exitListeners.delete(listener);
          },
        };
      },
      emitData(data: string) {
        for (const listener of Array.from(dataListeners)) {
          listener(data);
        }
      },
      emitExit(event: { exitCode: number }) {
        for (const listener of Array.from(exitListeners)) {
          listener(event);
        }
      },
    };
  }

  function reset() {
    spawn.mockReset();
    readSettings.mockReset();
    readSettings.mockReturnValue({});
    findLoginShell.mockReset();
    findLoginShell.mockReturnValue({ shell: '/bin/login-shell', args: ['-l'] });
    getEnhancedPath.mockReset();
    getEnhancedPath.mockReturnValue('/enhanced/path');
    resolveShellForCommand.mockReset();
    resolveShellForCommand.mockReturnValue({ shell: '/bin/zsh', execArgs: ['-i', '-l', '-c'] });
    killProcessTree.mockReset();
    ptys.length = 0;

    spawn.mockImplementation(() => {
      const pty = createPty(1000 + ptys.length);
      ptys.push(pty);
      return pty;
    });
  }

  return {
    spawn,
    readSettings,
    findLoginShell,
    getEnhancedPath,
    resolveShellForCommand,
    killProcessTree,
    ptys,
    reset,
  };
});

vi.mock('node-pty', () => ({
  spawn: shellUtilTestDoubles.spawn,
}));

vi.mock('../../ipc/settings', () => ({
  readSettings: shellUtilTestDoubles.readSettings,
}));

vi.mock('../../services/terminal/PtyManager', () => ({
  findLoginShell: shellUtilTestDoubles.findLoginShell,
  getEnhancedPath: shellUtilTestDoubles.getEnhancedPath,
}));

vi.mock('../../services/terminal/ShellDetector', () => ({
  shellDetector: {
    resolveShellForCommand: shellUtilTestDoubles.resolveShellForCommand,
  },
}));

vi.mock('../processUtils', () => ({
  killProcessTree: shellUtilTestDoubles.killProcessTree,
}));

describe('shell utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    shellUtilTestDoubles.reset();
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = '';
    process.env.HOME = '/Users/tester';
    process.env.USERPROFILE = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('strips ANSI escapes and resolves shell and environment configuration', async () => {
    shellUtilTestDoubles.readSettings.mockReturnValue({
      'enso-settings': {
        state: {
          shellConfig: {
            shellType: 'zsh',
          },
        },
      },
    });

    const shellUtils = await import('../shell');

    expect(shellUtils.stripAnsi('\u001B[31mHello\u001B[0m')).toBe('Hello');
    expect(shellUtils.getShellForCommand()).toEqual({
      shell: '/bin/zsh',
      args: ['-i', '-l', '-c'],
    });
    expect(
      shellUtils.getEnvForCommand({
        CUSTOM_ENV: '1',
      })
    ).toEqual(
      expect.objectContaining({
        PATH: '/enhanced/path',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        CUSTOM_ENV: '1',
      })
    );

    shellUtilTestDoubles.readSettings.mockReturnValueOnce({});
    expect(shellUtils.getShellForCommand()).toEqual({
      shell: '/bin/login-shell',
      args: ['-l'],
    });
  });

  it('executes commands in a PTY and resolves cleaned output on success', async () => {
    shellUtilTestDoubles.readSettings.mockReturnValue({
      'enso-settings': {
        state: {
          shellConfig: {
            shellType: 'zsh',
          },
        },
      },
    });

    const shellUtils = await import('../shell');

    const promise = shellUtils.execInPty('echo test');
    const pty = shellUtilTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing spawned PTY');
    }

    expect(shellUtilTestDoubles.spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-i', '-l', '-c', 'echo test'],
      expect.objectContaining({
        cwd: '/Users/tester',
        cols: 80,
        rows: 24,
        env: expect.objectContaining({
          PATH: '/enhanced/path',
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        }),
      })
    );

    pty.emitData('\u001B[32mhello');
    pty.emitData(' world\u001B[0m\n');
    pty.emitExit({ exitCode: 0 });

    await expect(promise).resolves.toBe('hello world');
    expect(shellUtilTestDoubles.killProcessTree).not.toHaveBeenCalled();
  });

  it('rejects on command failure and supports the WSL shell command wrapper', async () => {
    shellUtilTestDoubles.readSettings.mockReturnValue({
      'enso-settings': {
        state: {
          shellConfig: {
            shellType: 'wsl',
          },
        },
      },
    });
    shellUtilTestDoubles.resolveShellForCommand.mockReturnValueOnce({
      shell: 'wsl.exe',
      execArgs: ['--', 'bash', '-ilc'],
    });

    const shellUtils = await import('../shell');
    const promise = shellUtils.execInPty('printf "hi"');
    const pty = shellUtilTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing spawned PTY');
    }

    expect(shellUtilTestDoubles.spawn).toHaveBeenCalledWith(
      'wsl.exe',
      ['-e', 'sh', '-lc', 'exec "$SHELL" -ilc "printf \\"hi\\""'],
      expect.any(Object)
    );

    pty.emitExit({ exitCode: 2 });
    await expect(promise).rejects.toThrow('Command exited with code 2');
  });

  it('kills timed out commands and can resolve partial output when requested', async () => {
    vi.useFakeTimers();
    const shellUtils = await import('../shell');

    const promise = shellUtils.execInPty('sleep 1', {
      timeout: 50,
      killOnTimeout: true,
    });
    const pty = shellUtilTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing spawned PTY');
    }

    pty.emitData('\u001B[33mpartial output\u001B[0m');
    await vi.advanceTimersByTimeAsync(60);

    await expect(promise).resolves.toBe('partial output');
    expect(shellUtilTestDoubles.killProcessTree).toHaveBeenCalledWith(pty);
  });

  it('cleans up tracked PTY sessions asynchronously and synchronously', async () => {
    vi.useFakeTimers();
    const shellUtils = await import('../shell');

    const pendingPromise = shellUtils.execInPty('long-running', {
      timeout: 5000,
    });
    const pty = shellUtilTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing spawned PTY');
    }

    shellUtilTestDoubles.killProcessTree.mockImplementationOnce((target: FakePty) => {
      target.emitExit({ exitCode: 0 });
    });
    await shellUtils.cleanupExecInPtys(100);
    await expect(pendingPromise).resolves.toBe('');
    expect(shellUtilTestDoubles.killProcessTree).toHaveBeenCalledWith(pty);

    const syncPromise = shellUtils.execInPty('still-running', {
      timeout: 5000,
      killOnTimeout: true,
    });
    const syncPty = shellUtilTestDoubles.ptys[1];
    if (!syncPty) {
      throw new Error('Missing second spawned PTY');
    }

    shellUtils.cleanupExecInPtysSync();
    expect(shellUtilTestDoubles.killProcessTree).toHaveBeenCalledWith(syncPty);

    await vi.advanceTimersByTimeAsync(5001);
    await expect(syncPromise).resolves.toBe('');
  });
});
