import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const processUtilsTestDoubles = vi.hoisted(() => {
  const spawnSync = vi.fn();
  const pidtree = vi.fn();

  function reset() {
    spawnSync.mockReset();
    pidtree.mockReset();
    spawnSync.mockReturnValue({ stdout: '' });
    pidtree.mockResolvedValue([]);
  }

  return {
    spawnSync,
    pidtree,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  spawnSync: processUtilsTestDoubles.spawnSync,
}));

vi.mock('pidtree', () => ({
  default: processUtilsTestDoubles.pidtree,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

describe('process utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    processUtilsTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('kills process trees on Unix, including descendants and fallback paths', async () => {
    setPlatform('darwin');
    processUtilsTestDoubles.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'pgrep' && args[1] === '100') {
        return { stdout: '200\n201\n' };
      }
      return { stdout: '' };
    });
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { killProcessTree, killProcessTreeAsync } = await import('../processUtils');

    const target = {
      pid: 100,
      kill: vi.fn(),
    };
    killProcessTree(target, 'SIGTERM');

    expect(processUtilsTestDoubles.spawnSync).toHaveBeenCalledWith('pgrep', ['-P', '100'], {
      encoding: 'utf-8',
    });
    expect(processKillSpy).toHaveBeenCalledWith(200, 'SIGTERM');
    expect(processKillSpy).toHaveBeenCalledWith(201, 'SIGTERM');
    expect(target.kill).toHaveBeenCalledWith('SIGTERM');

    const failingTarget = {
      pid: 101,
      kill: vi.fn(() => {
        throw new Error('kill failed');
      }),
    };
    killProcessTree(failingTarget, 'SIGTERM');
    expect(processKillSpy).toHaveBeenCalledWith(101, 'SIGTERM');

    await killProcessTreeAsync(300, 'SIGTERM');
    expect(processUtilsTestDoubles.pidtree).toHaveBeenCalledWith(300);
    expect(processKillSpy).toHaveBeenCalledWith(300, 'SIGTERM');

    processUtilsTestDoubles.pidtree.mockRejectedValueOnce(new Error('gone'));
    await killProcessTreeAsync(
      {
        pid: 400,
        kill: vi.fn(),
      },
      'SIGTERM'
    );
  });

  it('handles missing pids and Windows taskkill flow', async () => {
    setPlatform('win32');

    const { killProcessTree, killProcessTreeAsync } = await import('../processUtils');

    const noPidTarget = {
      kill: vi.fn(),
    };
    killProcessTree(noPidTarget, 'SIGTERM');
    await killProcessTreeAsync(noPidTarget, 'SIGTERM');

    expect(noPidTarget.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(noPidTarget.kill).toHaveBeenNthCalledWith(2, 'SIGTERM');

    killProcessTree(123);
    await killProcessTreeAsync(456);

    expect(processUtilsTestDoubles.spawnSync).toHaveBeenNthCalledWith(
      1,
      'taskkill',
      ['/pid', '123', '/t', '/f'],
      { stdio: 'ignore' }
    );
    expect(processUtilsTestDoubles.spawnSync).toHaveBeenNthCalledWith(
      2,
      'taskkill',
      ['/pid', '456', '/t', '/f'],
      { stdio: 'ignore' }
    );
  });

  it('ignores Unix errors when direct kills, child lookups, and async fallbacks fail', async () => {
    setPlatform('darwin');
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (pid === 500 || pid === 600) {
        throw new Error('already exited');
      }
      return true;
    });

    processUtilsTestDoubles.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'pgrep' && args[1] === '500') {
        throw new Error('pgrep missing');
      }
      return { stdout: '' };
    });
    processUtilsTestDoubles.pidtree.mockResolvedValue([601, 602]);

    const { killProcessTree, killProcessTreeAsync } = await import('../processUtils');

    expect(() =>
      killProcessTree(
        {
          kill: vi.fn(() => {
            throw new Error('missing pid kill');
          }),
        },
        'SIGTERM'
      )
    ).not.toThrow();

    expect(() => killProcessTree(500, 'SIGTERM')).not.toThrow();
    expect(processKillSpy).toHaveBeenCalledWith(500, 'SIGTERM');

    await expect(
      killProcessTreeAsync(
        {
          kill: vi.fn(() => {
            throw new Error('missing pid kill');
          }),
        },
        'SIGTERM'
      )
    ).resolves.toBeUndefined();

    const asyncTarget = {
      pid: 600,
      kill: vi.fn(() => {
        throw new Error('target kill failed');
      }),
    };

    await expect(killProcessTreeAsync(asyncTarget, 'SIGTERM')).resolves.toBeUndefined();
    expect(processKillSpy).toHaveBeenCalledWith(601, 'SIGTERM');
    expect(processKillSpy).toHaveBeenCalledWith(602, 'SIGTERM');
    expect(processKillSpy).toHaveBeenCalledWith(600, 'SIGTERM');
  });
});
