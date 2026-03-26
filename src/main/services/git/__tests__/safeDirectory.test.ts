import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('safeDirectory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('returns the original env for non-WSL paths or non-Windows platforms', async () => {
    setPlatform('linux');

    const { withSafeDirectoryEnv } = await import('../safeDirectory');
    const baseEnv = { PATH: '/usr/bin' };

    expect(withSafeDirectoryEnv(baseEnv, '/repo')).toBe(baseEnv);

    setPlatform('win32');
    const nonWslEnv = withSafeDirectoryEnv(baseEnv, 'C:\\repo\\project');
    expect(nonWslEnv).toBe(baseEnv);
  });

  it('injects safe.directory entries for WSL UNC paths and appends existing config slots', async () => {
    setPlatform('win32');

    const { withSafeDirectoryEnv } = await import('../safeDirectory');

    const injected = withSafeDirectoryEnv(
      { PATH: 'C:\\bin' },
      '\\\\wsl$\\Ubuntu\\home\\tester\\repo\\'
    );
    expect(injected).toEqual({
      PATH: 'C:\\bin',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: '//wsl$/Ubuntu/home/tester/repo',
    });

    const appended = withSafeDirectoryEnv(
      {
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'user.name',
        GIT_CONFIG_VALUE_0: 'tester',
      },
      '//wsl.localhost/Ubuntu/home/tester/repo/'
    );

    expect(appended.GIT_CONFIG_COUNT).toBe('3');
    expect(appended.GIT_CONFIG_KEY_2).toBe('safe.directory');
    expect(appended.GIT_CONFIG_VALUE_2).toBe('//wsl.localhost/Ubuntu/home/tester/repo');
  });

  it('ignores invalid config counts and empty normalized paths', async () => {
    setPlatform('win32');

    const { withSafeDirectoryEnv } = await import('../safeDirectory');

    const result = withSafeDirectoryEnv(
      {
        GIT_CONFIG_COUNT: '-3',
      },
      '//wsl$/Ubuntu/'
    );

    expect(result.GIT_CONFIG_COUNT).toBe('1');
    expect(result.GIT_CONFIG_KEY_0).toBe('safe.directory');
    expect(result.GIT_CONFIG_VALUE_0).toBe('//wsl$/Ubuntu');
  });
});
