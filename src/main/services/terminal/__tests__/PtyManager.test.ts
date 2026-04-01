import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DataListener = (data: string) => void;
type ExitListener = (event: { exitCode: number; signal?: number }) => void;

interface FakePty {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  onData: (listener: DataListener) => { dispose(): void };
  onExit: (listener: ExitListener) => { dispose(): void };
  emitData: (data: string) => void;
  emitExit: (event: { exitCode: number; signal?: number }) => void;
  dataListenerCount: () => number;
  exitListenerCount: () => number;
}

const ptyManagerTestDoubles = vi.hoisted(() => {
  const execSync = vi.fn();
  const spawn = vi.fn();
  const existsSync = vi.fn();
  const readdirSync = vi.fn();
  const homedir = vi.fn();
  const killProcessTree = vi.fn();
  const getProxyEnvVars = vi.fn();
  const detectShell = vi.fn();
  const resolveShellConfig = vi.fn();
  const pidtree = vi.fn();
  const pidusage = vi.fn();
  const ptys: FakePty[] = [];

  function createPty(pid = 1000 + ptys.length): FakePty {
    const dataListeners = new Set<DataListener>();
    const exitListeners = new Set<ExitListener>();

    return {
      pid,
      write: vi.fn(),
      resize: vi.fn(),
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
      emitExit(event: { exitCode: number; signal?: number }) {
        for (const listener of Array.from(exitListeners)) {
          listener(event);
        }
      },
      dataListenerCount() {
        return dataListeners.size;
      },
      exitListenerCount() {
        return exitListeners.size;
      },
    };
  }

  function reset() {
    execSync.mockReset();
    spawn.mockReset();
    existsSync.mockReset();
    readdirSync.mockReset();
    homedir.mockReset();
    killProcessTree.mockReset();
    getProxyEnvVars.mockReset();
    detectShell.mockReset();
    resolveShellConfig.mockReset();
    pidtree.mockReset();
    pidusage.mockReset();
    ptys.length = 0;

    homedir.mockReturnValue('/Users/tester');
    getProxyEnvVars.mockReturnValue({ HTTPS_PROXY: 'http://proxy.local:7890' });
    detectShell.mockReturnValue('/bin/zsh');
    resolveShellConfig.mockReturnValue({ shell: '/bin/bash', args: ['-l'] });
    pidtree.mockResolvedValue([1001, 1002]);
    pidusage.mockResolvedValue({
      1001: { cpu: 0.5 },
      1002: { cpu: 4.5 },
    });
    existsSync.mockImplementation((target: string) => {
      if (
        target === '/bin/zsh' ||
        target === '/usr/bin/zsh' ||
        target === '/bin/bash' ||
        target === '/bin/sh'
      ) {
        return true;
      }
      if (target === '/Users/tester/.nvm/versions/node') {
        return true;
      }
      if (target === '/Users/tester/.nvm/versions/node/current/bin') {
        return true;
      }
      return false;
    });
    readdirSync.mockReturnValue(['v18.20.0', 'v20.5.1', 'v20']);
    spawn.mockImplementation(() => {
      const pty = createPty();
      ptys.push(pty);
      return pty;
    });
  }

  return {
    execSync,
    spawn,
    existsSync,
    readdirSync,
    homedir,
    killProcessTree,
    getProxyEnvVars,
    detectShell,
    resolveShellConfig,
    pidtree,
    pidusage,
    ptys,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  execSync: ptyManagerTestDoubles.execSync,
}));

vi.mock('node-pty', () => ({
  spawn: ptyManagerTestDoubles.spawn,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: ptyManagerTestDoubles.existsSync,
    readdirSync: ptyManagerTestDoubles.readdirSync,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: ptyManagerTestDoubles.homedir,
  };
});

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: ptyManagerTestDoubles.killProcessTree,
}));

vi.mock('../../proxy/ProxyConfig', () => ({
  getProxyEnvVars: ptyManagerTestDoubles.getProxyEnvVars,
}));

vi.mock('../ShellDetector', () => ({
  detectShell: ptyManagerTestDoubles.detectShell,
  shellDetector: {
    resolveShellConfig: ptyManagerTestDoubles.resolveShellConfig,
  },
}));

vi.mock('pidtree', () => ({
  default: ptyManagerTestDoubles.pidtree,
}));

vi.mock('pidusage', () => ({
  default: ptyManagerTestDoubles.pidusage,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

describe('PtyManager utilities', () => {
  beforeEach(() => {
    setPlatform('darwin');
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));
    ptyManagerTestDoubles.reset();
    process.env.HOME = '/Users/tester';
    process.env.USERPROFILE = '';
    process.env.PATH = '/usr/bin:/bin';
    process.env.SHELL = '/bin/zsh';
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = '';
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('finds login shells, adjusts sh args, and builds enhanced paths with cached nvm entries', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const module = await import('../PtyManager');

    expect(module.findLoginShell()).toEqual({
      shell: '/bin/zsh',
      args: ['-i', '-l', '-c'],
    });

    process.env.SHELL = '/bin/sh';
    vi.resetModules();
    ptyManagerTestDoubles.reset();
    const shModule = await import('../PtyManager');
    expect(shModule.findLoginShell()).toEqual({
      shell: '/bin/sh',
      args: ['-i', '-c'],
    });

    process.env.SHELL = '/missing/shell';
    vi.resetModules();
    ptyManagerTestDoubles.reset();
    ptyManagerTestDoubles.existsSync.mockImplementation((target: string) => target === '/bin/bash');
    const fallbackModule = await import('../PtyManager');
    expect(fallbackModule.findLoginShell()).toEqual({
      shell: '/bin/bash',
      args: ['-i', '-l', '-c'],
    });

    vi.resetModules();
    ptyManagerTestDoubles.reset();
    const pathModule = await import('../PtyManager');
    const enhancedPath = pathModule.getEnhancedPath().split(':');
    expect(enhancedPath).toEqual(
      expect.arrayContaining([
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/Users/tester/.nvm/versions/node/current/bin',
        '/Users/tester/.nvm/versions/node/v20.5.1/bin',
        '/Users/tester/.nvm/versions/node/v20/bin',
        '/Users/tester/.nvm/versions/node/v18.20.0/bin',
      ])
    );
    expect(ptyManagerTestDoubles.readdirSync).toHaveBeenCalledTimes(1);

    pathModule.getEnhancedPath();
    expect(ptyManagerTestDoubles.readdirSync).toHaveBeenCalledTimes(1);

    pathModule.clearPathCache();
    expect(logSpy).toHaveBeenCalledWith('[PtyManager] PATH cache cleared');
    pathModule.getEnhancedPath();
    expect(ptyManagerTestDoubles.readdirSync).toHaveBeenCalledTimes(2);
  });

  it('creates PTY sessions, falls back to available shells, and cleans up on exit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ptyManagerTestDoubles.detectShell.mockReturnValue('/missing/shell');
    ptyManagerTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/bin/zsh' || target === '/bin/bash' || target === '/bin/sh'
    );
    const { PtyManager } = await import('../PtyManager');
    const manager = new PtyManager();
    const onData = vi.fn();
    const onExit = vi.fn();

    const id = manager.create(
      {
        cwd: '/repo',
        spawnCwd: '/repo/.real',
        env: { CUSTOM_ENV: '1' },
        initialCommand: 'echo hello',
        cols: 100,
        rows: 40,
      },
      onData,
      onExit,
      'session-1'
    );

    expect(id).toBe('session-1');
    expect(warnSpy).toHaveBeenCalledWith(
      '[pty] Shell not found: /missing/shell. Falling back to /bin/zsh'
    );
    expect(ptyManagerTestDoubles.spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-c', 'echo hello; exec /bin/zsh'],
      expect.objectContaining({
        name: 'xterm-256color',
        cols: 100,
        rows: 40,
        cwd: '/repo/.real',
        env: expect.objectContaining({
          CUSTOM_ENV: '1',
          PATH: expect.stringContaining('/opt/homebrew/bin'),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
        }),
      })
    );

    const pty = ptyManagerTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing PTY instance');
    }

    manager.write(id, 'pwd\n');
    manager.resize(id, 120, 50);
    expect(pty.write).toHaveBeenCalledWith('pwd\n');
    expect(pty.resize).toHaveBeenCalledWith(120, 50);

    pty.emitData('hello');
    expect(onData).toHaveBeenCalledWith('hello');
    expect(pty.dataListenerCount()).toBe(1);
    expect(pty.exitListenerCount()).toBe(1);

    expect(() => manager.create({}, vi.fn(), undefined, 'session-1')).toThrow(
      'PTY session already exists: session-1'
    );

    pty.emitExit({ exitCode: 130, signal: 9 });
    expect(onExit).toHaveBeenCalledWith(130, 9);
    expect(pty.dataListenerCount()).toBe(0);
    expect(pty.exitListenerCount()).toBe(0);

    manager.write(id, 'ignored');
    manager.resize(id, 80, 24);
    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.resize).toHaveBeenCalledTimes(1);
  });

  it('supports shellConfig resolution, spawn fallback, targeted destroy helpers, and destroyAllAndWait', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    ptyManagerTestDoubles.resolveShellConfig.mockReturnValue({
      shell: '/bad/bash',
      args: ['-l'],
    });
    ptyManagerTestDoubles.existsSync.mockImplementation(
      (target: string) =>
        target === '/bad/bash' ||
        target === '/bin/zsh' ||
        target === '/bin/bash' ||
        target === '/bin/sh'
    );
    const createdPtys: FakePty[] = [];
    ptyManagerTestDoubles.spawn.mockImplementation((shell: string) => {
      if (shell === '/bad/bash' && createdPtys.length === 0) {
        throw new Error('spawn failed');
      }
      const pty = {
        pid: 2000 + createdPtys.length,
        write: vi.fn(),
        resize: vi.fn(),
        onData(listener: DataListener) {
          const listeners = new Set([listener]);
          return {
            dispose() {
              listeners.clear();
            },
          };
        },
        onExit(listener: ExitListener) {
          const listeners = new Set([listener]);
          return {
            dispose() {
              listeners.clear();
            },
          };
        },
        emitData() {},
        emitExit() {},
        dataListenerCount() {
          return 0;
        },
        exitListenerCount() {
          return 0;
        },
      } satisfies FakePty;
      createdPtys.push(pty);
      return pty;
    });

    const { PtyManager } = await import('../PtyManager');
    const manager = new PtyManager();

    const id = manager.create(
      {
        cwd: '/repo/project',
        shellConfig: { shellType: 'bash' } as never,
      },
      vi.fn()
    );
    expect(id).toBe('pty-1');
    expect(warnSpy).toHaveBeenCalledWith(
      '[pty] Failed to spawn /bad/bash. Falling back to /bin/zsh'
    );
    expect(ptyManagerTestDoubles.spawn).toHaveBeenNthCalledWith(
      2,
      '/bin/zsh',
      ['-l'],
      expect.any(Object)
    );

    const internals = manager as unknown as {
      sessions: Map<string, { cwd: string; ownerId: number | null; pty: FakePty }>;
      destroyAndWait: (id: string, timeout?: number) => Promise<void>;
    };
    internals.sessions.get('pty-1')!.ownerId = 7;

    manager.create({ cwd: '/repo/project/nested' }, vi.fn(), undefined, 'pty-2');
    manager.create({ cwd: '/elsewhere' }, vi.fn(), undefined, 'pty-3');
    internals.sessions.get('pty-2')!.ownerId = 7;
    internals.sessions.get('pty-3')!.ownerId = 9;

    manager.destroyByOwner(7);
    expect(ptyManagerTestDoubles.killProcessTree).toHaveBeenCalledTimes(2);

    manager.destroyByWorkdir('/elsewhere');
    expect(ptyManagerTestDoubles.killProcessTree).toHaveBeenCalledTimes(3);

    const managerForAll = new PtyManager();
    managerForAll.create({ cwd: '/a' }, vi.fn(), undefined, 'one');
    managerForAll.create({ cwd: '/b' }, vi.fn(), undefined, 'two');
    const waitSpy = vi.spyOn(managerForAll, 'destroyAndWait').mockResolvedValue(undefined);
    await managerForAll.destroyAllAndWait(25);
    expect(logSpy).toHaveBeenCalledWith('[pty] Destroying 2 PTY sessions...');
    expect(logSpy).toHaveBeenCalledWith('[pty] All PTY sessions destroyed');
    expect(waitSpy).toHaveBeenCalledTimes(2);
    expect(waitSpy).toHaveBeenCalledWith('one', 25);
    expect(waitSpy).toHaveBeenCalledWith('two', 25);
  });

  it('uses an explicit fallback command when direct executable launch fails', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ptyManagerTestDoubles.spawn.mockImplementation((shell: string) => {
      if (shell === 'codex') {
        throw new Error('command not found');
      }
      const pty = {
        pid: 3000,
        write: vi.fn(),
        resize: vi.fn(),
        onData(listener: DataListener) {
          const listeners = new Set([listener]);
          return {
            dispose() {
              listeners.clear();
            },
          };
        },
        onExit(listener: ExitListener) {
          const listeners = new Set([listener]);
          return {
            dispose() {
              listeners.clear();
            },
          };
        },
        emitData() {},
        emitExit() {},
        dataListenerCount() {
          return 0;
        },
        exitListenerCount() {
          return 0;
        },
      } satisfies FakePty;
      ptyManagerTestDoubles.ptys.push(pty);
      return pty;
    });

    const { PtyManager } = await import('../PtyManager');
    const manager = new PtyManager();

    manager.create(
      {
        cwd: '/repo/project',
        kind: 'agent',
        shell: 'codex',
        args: ['--sandbox', 'workspace-write'],
        fallbackShell: '/bin/zsh',
        fallbackArgs: ['-l', '-c', 'codex --sandbox workspace-write'],
      } as never,
      vi.fn()
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[pty] Failed to spawn codex. Falling back to explicit command /bin/zsh'
    );
    expect(ptyManagerTestDoubles.spawn).toHaveBeenNthCalledWith(
      1,
      'codex',
      ['--sandbox', 'workspace-write'],
      expect.any(Object)
    );
    expect(ptyManagerTestDoubles.spawn).toHaveBeenNthCalledWith(
      2,
      '/bin/zsh',
      ['-l', '-c', 'codex --sandbox workspace-write'],
      expect.any(Object)
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      '[agent-startup][main][pty-1] spawn-start +0ms (0ms total)'
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      '[agent-startup][main][pty-1] spawned-fallback-explicit +0ms (0ms total)'
    );
    expect(manager).toBeTruthy();
  });

  it('resolves destroyAndWait on exit or timeout and does not call the original exit handler during cleanup', async () => {
    const { PtyManager } = await import('../PtyManager');
    const manager = new PtyManager();
    const onExit = vi.fn();
    const id = manager.create({ cwd: '/repo' }, vi.fn(), onExit, 'wait-1');
    const pty = ptyManagerTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing PTY instance');
    }

    const waitPromise = manager.destroyAndWait(id, 50);
    expect(ptyManagerTestDoubles.killProcessTree).toHaveBeenCalledWith(pty);
    pty.emitExit({ exitCode: 0 });
    await expect(waitPromise).resolves.toBeUndefined();
    expect(onExit).not.toHaveBeenCalled();

    const timedManager = new PtyManager();
    timedManager.create({ cwd: '/repo' }, vi.fn(), vi.fn(), 'wait-2');
    const timedPty = ptyManagerTestDoubles.ptys[1];
    if (!timedPty) {
      throw new Error('Missing timed PTY instance');
    }
    const timeoutPromise = timedManager.destroyAndWait('wait-2', 20);
    await vi.advanceTimersByTimeAsync(25);
    await expect(timeoutPromise).resolves.toBeUndefined();
    expect(ptyManagerTestDoubles.killProcessTree).toHaveBeenCalledWith(timedPty);
  });

  it('caches process activity checks, reuses in-flight work, and handles missing sessions safely', async () => {
    const { PtyManager } = await import('../PtyManager');
    const manager = new PtyManager();
    manager.create({ cwd: '/repo' }, vi.fn(), undefined, 'activity');
    const pty = ptyManagerTestDoubles.ptys[0];
    if (!pty) {
      throw new Error('Missing activity PTY instance');
    }

    let resolvePidtree!: (value: number[]) => void;
    let hasPidtreeResolver = false;
    ptyManagerTestDoubles.pidtree.mockImplementationOnce(
      () =>
        new Promise<number[]>((resolve) => {
          resolvePidtree = resolve;
          hasPidtreeResolver = true;
        })
    );
    ptyManagerTestDoubles.pidusage.mockResolvedValueOnce({
      1000: { cpu: 0 },
      1001: { cpu: 5 },
    });

    const first = manager.getProcessActivity('activity');
    const second = manager.getProcessActivity('activity');
    if (!hasPidtreeResolver) {
      throw new Error('Missing pidtree resolver');
    }
    resolvePidtree([pty.pid, pty.pid + 1]);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(ptyManagerTestDoubles.pidtree).toHaveBeenCalledTimes(1);
    expect(ptyManagerTestDoubles.pidusage).toHaveBeenCalledTimes(1);

    await expect(manager.getProcessActivity('activity')).resolves.toBe(true);
    expect(ptyManagerTestDoubles.pidtree).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2100);
    ptyManagerTestDoubles.pidtree.mockResolvedValueOnce([pty.pid]);
    ptyManagerTestDoubles.pidusage.mockResolvedValueOnce({
      [pty.pid]: { cpu: 0.1 },
    });
    await expect(manager.getProcessActivity('activity')).resolves.toBe(false);
    expect(ptyManagerTestDoubles.pidtree).toHaveBeenCalledTimes(2);

    pty.pid = 0;
    await expect(manager.getProcessActivity('activity')).resolves.toBe(false);
    await expect(manager.getProcessActivity('missing')).resolves.toBe(false);
  });

  it('reads Windows registry values, expands PATH variables, and builds Windows initial commands', async () => {
    setPlatform('win32');
    vi.resetModules();
    ptyManagerTestDoubles.reset();
    process.env.PATH = 'C:\\ProcessPath';

    ptyManagerTestDoubles.execSync.mockImplementation((command: string) => {
      if (command.includes('HKCU\\Environment" /v Path')) {
        return 'Path    REG_EXPAND_SZ    %USERPROFILE%\\bin';
      }
      if (
        command.includes(
          'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path'
        )
      ) {
        return 'Path    REG_EXPAND_SZ    %SystemRoot%\\System32;%NVM_SYMLINK%';
      }
      if (command.includes('HKCU\\Environment" 2>nul')) {
        return `
            USERPROFILE    REG_SZ    C:\\Users\\Tester
            NVM_SYMLINK    REG_SZ    C:\\Users\\Tester\\AppData\\Roaming\\nvm\\nodejs
        `;
      }
      if (
        command.includes(
          'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" 2>nul'
        )
      ) {
        return '    SystemRoot    REG_SZ    C:\\Windows';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const module = await import('../PtyManager');
    const enhancedPath = module.getEnhancedPath();
    expect(enhancedPath).toContain('C:\\Windows\\System32');
    expect(enhancedPath).toContain('C:\\Users\\Tester\\AppData\\Roaming\\nvm\\nodejs');
    expect(enhancedPath).toContain('C:\\Users\\Tester\\bin');
    expect(enhancedPath).not.toContain('%SystemRoot%');
    expect(enhancedPath).not.toContain('%NVM_SYMLINK%');
    expect(ptyManagerTestDoubles.execSync).toHaveBeenCalledTimes(4);

    module.getEnhancedPath();
    expect(ptyManagerTestDoubles.execSync).toHaveBeenCalledTimes(4);

    const manager = new module.PtyManager();
    manager.create(
      {
        shell: 'powershell.exe',
        initialCommand: 'Get-Location',
      },
      vi.fn(),
      undefined,
      'ps'
    );
    manager.create(
      {
        shell: 'cmd.exe',
        initialCommand: 'dir',
      },
      vi.fn(),
      undefined,
      'cmd'
    );

    expect(ptyManagerTestDoubles.spawn).toHaveBeenNthCalledWith(
      1,
      'powershell.exe',
      ['-NoExit', '-Command', 'Get-Location'],
      expect.objectContaining({
        env: expect.objectContaining({
          HTTPS_PROXY: 'http://proxy.local:7890',
          TERM: 'xterm-256color',
        }),
      })
    );
    expect(ptyManagerTestDoubles.spawn).toHaveBeenNthCalledWith(
      2,
      'cmd.exe',
      ['/k', 'dir'],
      expect.any(Object)
    );
  });

  it('returns fallback PATH on registry failures, throws when fallback spawn is impossible, and handles activity errors and stale requests', async () => {
    setPlatform('win32');
    vi.resetModules();
    ptyManagerTestDoubles.reset();
    process.env.PATH = 'C:\\FallbackPath';
    ptyManagerTestDoubles.execSync.mockImplementation(() => {
      throw new Error('registry unavailable');
    });

    let module = await import('../PtyManager');
    expect(module.getEnhancedPath()).toBe('C:\\FallbackPath');

    setPlatform('darwin');
    vi.resetModules();
    ptyManagerTestDoubles.reset();
    ptyManagerTestDoubles.detectShell.mockReturnValue('/bin/sh');
    ptyManagerTestDoubles.existsSync.mockImplementation((target: string) => target === '/bin/sh');
    ptyManagerTestDoubles.spawn.mockImplementation(() => {
      throw new Error('spawn exploded');
    });

    module = await import('../PtyManager');
    const manager = new module.PtyManager();
    expect(() => manager.create({ cwd: '/repo' }, vi.fn())).toThrow('spawn exploded');

    vi.resetModules();
    ptyManagerTestDoubles.reset();
    module = await import('../PtyManager');
    const activityManager = new module.PtyManager();
    activityManager.create({ cwd: '/repo' }, vi.fn(), undefined, 'activity-error');
    ptyManagerTestDoubles.pidtree.mockRejectedValueOnce(new Error('pidtree failed'));
    await expect(activityManager.getProcessActivity('activity-error')).resolves.toBe(false);

    const emptyPidManager = new module.PtyManager();
    emptyPidManager.create({ cwd: '/repo' }, vi.fn(), undefined, 'activity-empty');
    ptyManagerTestDoubles.pidtree.mockResolvedValueOnce([]);
    await expect(emptyPidManager.getProcessActivity('activity-empty')).resolves.toBe(false);

    const staleManager = new module.PtyManager();
    staleManager.create({ cwd: '/repo' }, vi.fn(), undefined, 'stale');
    const stalePty = ptyManagerTestDoubles.ptys[1];
    if (!stalePty) {
      throw new Error('Missing stale PTY instance');
    }

    let resolvePidtree!: (value: number[]) => void;
    let hasPidtreeResolver = false;
    ptyManagerTestDoubles.pidtree.mockImplementationOnce(
      () =>
        new Promise<number[]>((resolve) => {
          resolvePidtree = resolve;
          hasPidtreeResolver = true;
        })
    );
    ptyManagerTestDoubles.pidusage.mockResolvedValueOnce({
      [stalePty.pid]: { cpu: 5 },
    });

    const stalePromise = staleManager.getProcessActivity('stale');
    staleManager.destroy('stale');
    if (!hasPidtreeResolver) {
      throw new Error('Missing stale pidtree resolver');
    }
    resolvePidtree([stalePty.pid]);
    await expect(stalePromise).resolves.toBe(true);

    staleManager.destroy('missing');
    staleManager.destroyAll();
    await expect(staleManager.destroyAllAndWait()).resolves.toBeUndefined();
  });
});
