import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shellDetectorTestDoubles = vi.hoisted(() => {
  const exec = vi.fn();
  const existsSync = vi.fn();

  function reset() {
    exec.mockReset();
    existsSync.mockReset();
  }

  return {
    exec,
    existsSync,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  exec: shellDetectorTestDoubles.exec,
}));

vi.mock('node:fs', () => ({
  existsSync: shellDetectorTestDoubles.existsSync,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalShell = process.env.SHELL;

interface ShellDetectorInternals {
  inferExecArgs: (shellPath: string, customArgs?: string[]) => string[];
  isWslAvailable: () => Promise<boolean>;
}

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

function mockExecSuccess(stdout = '') {
  shellDetectorTestDoubles.exec.mockImplementation(
    (
      _command: string,
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void
    ) => {
      callback(null, stdout);
      return {} as never;
    }
  );
}

function mockExecFailure(message = 'failed') {
  shellDetectorTestDoubles.exec.mockImplementation(
    (
      _command: string,
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void
    ) => {
      callback(new Error(message), '');
      return {} as never;
    }
  );
}

describe('ShellDetector', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    shellDetectorTestDoubles.reset();
    process.env.SHELL = '/bin/zsh';
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
    vi.restoreAllMocks();
  });

  it('detects Unix shells, caches results, and resolves configs', async () => {
    setPlatform('darwin');
    const existingPaths = new Set(['/bin/zsh', '/bin/bash', '/bin/sh']);
    shellDetectorTestDoubles.existsSync.mockImplementation((target: string) =>
      existingPaths.has(target)
    );

    const { detectShell, shellDetector } = await import('../ShellDetector');

    expect(await shellDetector.detectShells()).toEqual([
      {
        id: 'system',
        name: 'System Default (zsh)',
        path: '/bin/zsh',
        args: ['-i', '-l'],
        available: true,
      },
      {
        id: 'zsh',
        name: 'Zsh',
        path: '/bin/zsh',
        args: ['-i', '-l'],
        available: true,
      },
      {
        id: 'bash',
        name: 'Bash',
        path: '/bin/bash',
        args: ['-i', '-l'],
        available: true,
      },
      {
        id: 'fish',
        name: 'Fish',
        path: '/usr/bin/fish',
        args: ['-i', '-l'],
        available: false,
      },
      {
        id: 'nushell',
        name: 'Nushell',
        path: '/usr/local/bin/nu',
        args: ['-l', '-i'],
        available: false,
      },
      {
        id: 'sh',
        name: 'Sh',
        path: '/bin/sh',
        args: [],
        available: true,
      },
    ]);

    shellDetectorTestDoubles.existsSync.mockImplementation(() => false);
    expect(await shellDetector.detectShells()).toHaveLength(6);

    expect(
      shellDetector.resolveShellConfig({
        shellType: 'custom',
        customShellPath: '/custom/bin/unknown',
        customShellArgs: ['--login'],
      } as never)
    ).toEqual({
      shell: '/custom/bin/unknown',
      args: ['--login'],
    });
    shellDetectorTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/bin/zsh'
    );
    expect(
      shellDetector.resolveShellConfig({
        shellType: 'system',
      } as never)
    ).toEqual({
      shell: '/bin/zsh',
      args: ['-i', '-l'],
    });
    expect(
      shellDetector.resolveShellConfig({
        shellType: 'bash',
      } as never)
    ).toEqual({
      shell: '/bin/sh',
      args: [],
    });

    process.env.SHELL = '/bin/bash';
    shellDetectorTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/bin/bash'
    );
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'system',
      } as never)
    ).toEqual({
      shell: '/bin/bash',
      execArgs: ['-i', '-l', '-c'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
        customShellPath: '/custom/bin/fish',
      } as never)
    ).toEqual({
      shell: '/custom/bin/fish',
      execArgs: ['-l', '-c'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
        customShellPath: '/custom/bin/unknown',
        customShellArgs: ['--login'],
      } as never)
    ).toEqual({
      shell: '/custom/bin/unknown',
      execArgs: ['--login', '-c'],
    });

    process.env.SHELL = '/missing/shell';
    shellDetectorTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/bin/bash'
    );
    expect(shellDetector.getDefaultShell()).toBe('/bin/bash');
    expect(detectShell()).toBe('/bin/bash');

    shellDetector.clearCache();
    shellDetectorTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/bin/sh'
    );
    expect(await shellDetector.detectShells()).toHaveLength(6);
  });

  it('covers Unix fallback branches for system shell names, custom shells, and shell inference', async () => {
    setPlatform('darwin');
    process.env.SHELL = '/';
    shellDetectorTestDoubles.existsSync.mockReturnValue(false);

    const { shellDetector } = await import('../ShellDetector');
    const internals = shellDetector as unknown as ShellDetectorInternals;

    expect(await shellDetector.detectShells()).toEqual(
      expect.arrayContaining([
        {
          id: 'system',
          name: 'System Default (shell)',
          path: '/',
          args: ['-i', '-l'],
          available: false,
        },
      ])
    );

    expect(await internals.isWslAvailable()).toBe(false);
    expect(await internals.isWslAvailable()).toBe(false);

    expect(
      shellDetector.resolveShellConfig({
        shellType: 'custom',
      } as never)
    ).toEqual({
      shell: '/bin/sh',
      args: [],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
      } as never)
    ).toEqual({
      shell: '/bin/sh',
      execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'],
    });

    expect(internals.inferExecArgs('/opt/custom/powershell.exe')).toEqual([
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
    ]);
    expect(internals.inferExecArgs('/opt/custom/company-powershell-core')).toEqual([
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
    ]);
    expect(internals.inferExecArgs('/opt/custom/team-cmd-wrapper')).toEqual(['/c']);
    expect(internals.inferExecArgs('/opt/custom/bash')).toEqual(['-i', '-l', '-c']);
    expect(internals.inferExecArgs('/opt/custom/team-zsh-wrapper')).toEqual(['-i', '-l', '-c']);
    expect(internals.inferExecArgs('/opt/custom/fish')).toEqual(['-l', '-c']);
    expect(internals.inferExecArgs('/opt/custom/fish-wrapper')).toEqual(['-l', '-c']);
    expect(internals.inferExecArgs('/opt/custom/unknown')).toEqual(['-c']);
    expect(
      shellDetector.resolveShellConfig({
        shellType: 'unknown',
      } as never)
    ).toEqual({
      shell: '/bin/sh',
      args: [],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'unknown',
      } as never)
    ).toEqual({
      shell: '/bin/sh',
      execArgs: ['-c'],
    });

    process.env.SHELL = 'zsh';
    expect(shellDetector.getDefaultShell()).toBe('zsh');

    process.env.SHELL = '/missing/shell';
    expect(shellDetector.getDefaultShell()).toBe('/bin/sh');
  });

  it('detects Windows shells and resolves WSL and PowerShell fallbacks', async () => {
    setPlatform('win32');
    process.env.USERPROFILE = 'C:\\Users\\tester';
    shellDetectorTestDoubles.existsSync.mockImplementation(
      (target: string) => target === 'C:\\Program Files\\Git\\bin\\bash.exe'
    );
    mockExecSuccess('WSL 2');

    const { shellDetector } = await import('../ShellDetector');

    const shells = await shellDetector.detectShells();
    expect(shells).toEqual(
      expect.arrayContaining([
        {
          id: 'powershell7',
          name: 'PowerShell 7',
          path: 'pwsh.exe',
          args: ['-NoLogo'],
          available: true,
        },
        {
          id: 'gitbash',
          name: 'Git Bash',
          path: 'C:\\Program Files\\Git\\bin\\bash.exe',
          args: ['-i', '-l'],
          available: true,
        },
        {
          id: 'wsl',
          name: 'WSL',
          path: 'wsl.exe',
          args: [],
          available: true,
          isWsl: true,
        },
      ])
    );

    expect(
      shellDetector.resolveShellConfig({
        shellType: 'powershell7',
      } as never)
    ).toEqual({
      shell: 'pwsh.exe',
      args: ['-NoLogo'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'powershell7',
      } as never)
    ).toEqual({
      shell: 'pwsh.exe',
      execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
        customShellPath: 'cmd.exe',
      } as never)
    ).toEqual({
      shell: 'cmd.exe',
      execArgs: ['/c'],
    });
    expect(shellDetector.getDefaultShell()).toBe('pwsh.exe');

    shellDetector.clearCache();
    mockExecFailure();
    expect(await shellDetector.detectShells()).toHaveLength(5);
    expect(await shellDetector.detectShells()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'wsl',
        }),
      ])
    );
  });

  it('covers Windows fallback branches for custom shell defaults and cached WSL detection', async () => {
    setPlatform('win32');
    process.env.USERPROFILE = 'C:\\Users\\tester';
    shellDetectorTestDoubles.existsSync.mockReturnValue(false);
    mockExecFailure('wsl unavailable');

    const { shellDetector } = await import('../ShellDetector');
    const internals = shellDetector as unknown as ShellDetectorInternals;

    expect(await internals.isWslAvailable()).toBe(false);
    expect(await internals.isWslAvailable()).toBe(false);

    expect(
      shellDetector.resolveShellConfig({
        shellType: 'custom',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      args: [],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'custom',
        customShellPath: 'mystery-shell',
      } as never)
    ).toEqual({
      shell: 'mystery-shell',
      execArgs: ['/c'],
    });
    expect(
      shellDetector.resolveShellConfig({
        shellType: 'unknown',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      args: ['-NoLogo'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'unknown',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
    });

    const findAvailablePathSpy = vi
      .spyOn(shellDetector as never, 'findAvailablePath')
      .mockImplementation((...args: unknown[]) => {
        const [paths] = args as [string[]];
        if (paths[0] === 'pwsh.exe') {
          return null;
        }
        if (paths[0] === 'powershell.exe') {
          return 'powershell.exe';
        }
        return null;
      });
    expect(
      shellDetector.resolveShellConfig({
        shellType: 'powershell7',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      args: ['-NoLogo'],
    });
    expect(
      shellDetector.resolveShellForCommand({
        shellType: 'powershell7',
      } as never)
    ).toEqual({
      shell: 'powershell.exe',
      execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
    });
    findAvailablePathSpy.mockRestore();
  });
});
