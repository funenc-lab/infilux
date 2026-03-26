import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathValidatorTestDoubles = vi.hoisted(() => {
  const lstat = vi.fn();

  function reset() {
    lstat.mockReset();
  }

  return {
    lstat,
    reset,
  };
});

vi.mock('node:fs/promises', () => ({
  lstat: pathValidatorTestDoubles.lstat,
}));

describe('PathValidator', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    pathValidatorTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns existence and directory state for valid paths', async () => {
    pathValidatorTestDoubles.lstat
      .mockResolvedValueOnce({ isDirectory: () => true })
      .mockResolvedValueOnce({ isDirectory: () => false });

    const { validateLocalPath } = await import('../PathValidator');

    expect(await validateLocalPath('/repo')).toEqual({
      exists: true,
      isDirectory: true,
    });
    expect(await validateLocalPath('/file.txt')).toEqual({
      exists: true,
      isDirectory: false,
    });
  });

  it('returns false flags when lstat throws', async () => {
    pathValidatorTestDoubles.lstat.mockRejectedValueOnce(new Error('ENOENT'));

    const { validateLocalPath } = await import('../PathValidator');

    expect(await validateLocalPath('/missing')).toEqual({
      exists: false,
      isDirectory: false,
    });
  });
});
