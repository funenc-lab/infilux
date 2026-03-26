import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkGitTestDoubles = vi.hoisted(() => {
  const execAsync = vi.fn();
  const promisify = vi.fn(() => execAsync);

  function reset() {
    execAsync.mockReset();
    promisify.mockReset();
    promisify.mockReturnValue(execAsync);
  }

  return {
    execAsync,
    promisify,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: checkGitTestDoubles.promisify,
}));

describe('checkGit', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    checkGitTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects whether git is installed', async () => {
    checkGitTestDoubles.execAsync.mockResolvedValueOnce({ stdout: 'git version 2.48.1' });
    checkGitTestDoubles.execAsync.mockRejectedValueOnce(new Error('missing'));

    const { checkGitInstalled } = await import('../checkGit');

    await expect(checkGitInstalled()).resolves.toBe(true);
    await expect(checkGitInstalled()).resolves.toBe(false);
    expect(checkGitTestDoubles.execAsync).toHaveBeenCalledWith('git --version');
  });

  it('parses the git version and handles invalid output', async () => {
    checkGitTestDoubles.execAsync
      .mockResolvedValueOnce({ stdout: 'git version 2.39.3\n' })
      .mockResolvedValueOnce({ stdout: 'git version unknown\n' })
      .mockRejectedValueOnce(new Error('missing'));

    const { getGitVersion } = await import('../checkGit');

    await expect(getGitVersion()).resolves.toBe('2.39.3');
    await expect(getGitVersion()).resolves.toBeNull();
    await expect(getGitVersion()).resolves.toBeNull();
  });
});
