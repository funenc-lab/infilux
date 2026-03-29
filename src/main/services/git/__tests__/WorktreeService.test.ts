import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const worktreeServiceTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn<(targetPath: string) => boolean>(() => false);
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const rm = vi.fn();
  const createSimpleGit = vi.fn();
  const toGitPath = vi.fn((_: string, inputPath: string) => inputPath);
  const fromGitPath = vi.fn((_: string, inputPath: string) => inputPath);
  const gitShow = vi.fn();
  const execAsync = vi.fn();
  const detectEncoding = vi.fn(() => ({ encoding: 'utf-8' }));
  const encode = vi.fn((content: string) => Buffer.from(content, 'utf8'));

  return {
    existsSync,
    readFile,
    writeFile,
    rm,
    createSimpleGit,
    toGitPath,
    fromGitPath,
    gitShow,
    execAsync,
    detectEncoding,
    encode,
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: worktreeServiceTestDoubles.existsSync,
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: worktreeServiceTestDoubles.readFile,
    writeFile: worktreeServiceTestDoubles.writeFile,
    rm: worktreeServiceTestDoubles.rm,
  };
});

vi.mock('../runtime', () => ({
  createSimpleGit: worktreeServiceTestDoubles.createSimpleGit,
  fromGitPath: worktreeServiceTestDoubles.fromGitPath,
  toGitPath: worktreeServiceTestDoubles.toGitPath,
}));

vi.mock('../encoding', () => ({
  gitShow: worktreeServiceTestDoubles.gitShow,
}));

vi.mock('node:util', async () => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    promisify: vi.fn(() => worktreeServiceTestDoubles.execAsync),
  };
});

vi.mock('jschardet', () => ({
  default: {
    detect: worktreeServiceTestDoubles.detectEncoding,
  },
}));

vi.mock('iconv-lite', () => ({
  default: {
    encode: worktreeServiceTestDoubles.encode,
  },
}));

import { WorktreeService } from '../WorktreeService';

type GitDouble = {
  raw: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  rebase: ReturnType<typeof vi.fn>;
  stash: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  branch: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};

function createGitDouble(overrides: Partial<GitDouble> = {}): GitDouble {
  return {
    raw: vi.fn(),
    status: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn(),
    rebase: vi.fn(),
    stash: vi.fn(),
    log: vi.fn(),
    commit: vi.fn(),
    branch: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('WorktreeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    worktreeServiceTestDoubles.existsSync.mockReturnValue(false);
    worktreeServiceTestDoubles.readFile.mockResolvedValue(Buffer.from('current content'));
    worktreeServiceTestDoubles.writeFile.mockResolvedValue(undefined);
    worktreeServiceTestDoubles.rm.mockResolvedValue(undefined);
    worktreeServiceTestDoubles.toGitPath.mockImplementation((_, inputPath: string) => inputPath);
    worktreeServiceTestDoubles.fromGitPath.mockImplementation((_, inputPath: string) => inputPath);
    worktreeServiceTestDoubles.gitShow.mockResolvedValue('');
    worktreeServiceTestDoubles.execAsync.mockResolvedValue({ stdout: '', stderr: '' });
    worktreeServiceTestDoubles.detectEncoding.mockReturnValue({ encoding: 'utf-8' });
    worktreeServiceTestDoubles.encode.mockImplementation((content: string) =>
      Buffer.from(content, 'utf8')
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses porcelain worktree output and resolves main worktree and branch names', async () => {
    const repoGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValue(
          [
            'worktree /repo/main',
            'HEAD abc123',
            'branch refs/heads/main',
            '',
            'worktree /repo/feature-a',
            'HEAD def456',
            'branch refs/heads/feature-a',
            'locked',
            'prunable',
            '',
          ].join('\n')
        ),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockReturnValue(repoGit);

    const service = new WorktreeService('/repo');

    await expect(service.list()).resolves.toEqual([
      {
        path: '/repo/main',
        head: 'abc123',
        branch: 'main',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      },
      {
        path: '/repo/feature-a',
        head: 'def456',
        branch: 'feature-a',
        isMainWorktree: false,
        isLocked: true,
        prunable: true,
      },
    ]);

    await expect(service.getMainWorktreePath()).resolves.toBe('/repo/main');
    await expect(service.getWorktreeBranch('/repo/feature-a')).resolves.toBe('feature-a');
  });

  it('throws when the main worktree or branch lookup cannot be resolved', async () => {
    const repoGit = createGitDouble();
    worktreeServiceTestDoubles.createSimpleGit.mockReturnValue(repoGit);

    const service = new WorktreeService('/repo');
    const listSpy = vi.spyOn(service, 'list');

    listSpy.mockResolvedValueOnce([
      {
        path: '/repo/feature-a',
        isMainWorktree: false,
        isLocked: false,
        prunable: false,
      } as never,
    ]);
    await expect(service.getMainWorktreePath()).rejects.toThrow('No main worktree found');

    listSpy.mockResolvedValueOnce([
      {
        path: '/repo/feature-a',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      } as never,
    ]);
    await expect(service.getWorktreeBranch('/repo/feature-a')).rejects.toThrow(
      'No branch found for worktree: /repo/feature-a'
    );
  });

  it('validates repository commits before adding a worktree and forwards branch options', async () => {
    const repoGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValueOnce('abc123')
        .mockResolvedValueOnce('added')
        .mockRejectedValueOnce(new Error('fatal: ambiguous argument HEAD')),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockReturnValue(repoGit);

    const service = new WorktreeService('/repo');

    await expect(
      service.add({
        path: '/repo/worktrees/feature-a',
        branch: 'main',
        newBranch: 'feature-a',
      })
    ).resolves.toBeUndefined();

    expect(repoGit.raw).toHaveBeenNthCalledWith(1, ['rev-parse', 'HEAD']);
    expect(repoGit.raw).toHaveBeenNthCalledWith(2, [
      'worktree',
      'add',
      '-b',
      'feature-a',
      '/repo/worktrees/feature-a',
      'main',
    ]);

    await expect(
      service.add({
        path: '/repo/worktrees/empty',
      })
    ).rejects.toThrow(
      'Cannot create worktree: repository has no commits. Please create an initial commit first.'
    );
  });

  it('removes worktrees, prunes stale entries, and deletes branches when requested', async () => {
    const repoGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockReturnValue(repoGit);

    const service = new WorktreeService('/repo');

    await expect(
      service.remove({
        path: '/repo/worktrees/feature-a',
        force: true,
        deleteBranch: true,
        branch: 'feature-a',
      })
    ).resolves.toBeUndefined();

    expect(repoGit.raw).toHaveBeenNthCalledWith(1, ['worktree', 'prune']);
    expect(repoGit.raw).toHaveBeenNthCalledWith(2, [
      'worktree',
      'remove',
      '--force',
      '/repo/worktrees/feature-a',
    ]);
    expect(repoGit.raw).toHaveBeenNthCalledWith(3, ['branch', '-D', 'feature-a']);
  });

  it('falls back to manual deletion for locked worktrees and surfaces a helpful error when cleanup fails', async () => {
    vi.useFakeTimers();

    const repoGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockReturnValue(repoGit);
    worktreeServiceTestDoubles.existsSync.mockReturnValue(true);
    worktreeServiceTestDoubles.rm.mockRejectedValueOnce(new Error('still locked'));

    const service = new WorktreeService('/repo');

    const removalPromise = service.remove({
      path: '/repo/worktrees/locked',
      force: false,
    });
    const rejectionAssertion = expect(removalPromise).rejects.toThrow(
      'Failed to remove worktree directory: /repo/worktrees/locked. Please close any programs using this directory and try again.'
    );

    await vi.advanceTimersByTimeAsync(500);
    await rejectionAssertion;
  });

  it('returns a validation error when merging with dirty worktree changes and auto stash is disabled', async () => {
    const repoGit = createGitDouble();
    const worktreeGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => false,
      }),
    });
    const mainGit = createGitDouble();

    worktreeServiceTestDoubles.createSimpleGit.mockImplementation((workdir: string) => {
      if (workdir === '/repo/main') return mainGit;
      if (workdir === '/repo/worktrees/feature-a') return worktreeGit;
      return repoGit;
    });

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');
    vi.spyOn(service, 'getWorktreeBranch').mockResolvedValue('feature-a');

    await expect(
      service.merge({
        worktreePath: '/repo/worktrees/feature-a',
        targetBranch: 'main',
        autoStash: false,
        strategy: 'merge',
      })
    ).resolves.toEqual({
      success: false,
      merged: false,
      error: 'Worktree has uncommitted changes. Please commit or stash them first.',
    });
  });

  it('rebases successfully and restores stashes in LIFO order when both worktrees are dirty', async () => {
    const repoGit = createGitDouble();
    const worktreeGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => false,
      }),
      stash: vi.fn().mockResolvedValue(undefined),
    });
    const mainGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => false,
        current: 'main',
      }),
      stash: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      rebase: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue({
        latest: { hash: 'merge-commit-hash' },
      }),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockImplementation((workdir: string) => {
      if (workdir === '/repo/main') return mainGit;
      if (workdir === '/repo/worktrees/feature-a') return worktreeGit;
      return repoGit;
    });

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');
    vi.spyOn(service, 'getWorktreeBranch').mockResolvedValue('feature-a');

    await expect(
      service.merge({
        worktreePath: '/repo/worktrees/feature-a',
        targetBranch: 'main',
        strategy: 'rebase',
      })
    ).resolves.toEqual({
      success: true,
      merged: true,
      commitHash: 'merge-commit-hash',
      mainStashStatus: 'applied',
      worktreeStashStatus: 'applied',
    });

    expect(worktreeGit.stash).toHaveBeenNthCalledWith(1, ['push', '-m', 'Auto stash before merge']);
    expect(mainGit.stash).toHaveBeenNthCalledWith(1, ['push', '-m', 'Auto stash before merge']);
    expect(mainGit.stash).toHaveBeenNthCalledWith(2, ['pop']);
    expect(worktreeGit.stash).toHaveBeenNthCalledWith(2, ['pop']);
    expect(mainGit.rebase).toHaveBeenCalledWith(['feature-a']);
  });

  it('returns merge conflicts without restoring stashes when the merge operation fails with conflicts', async () => {
    const repoGit = createGitDouble();
    const worktreeGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => true,
      }),
    });
    const mainGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => true,
        current: 'main',
      }),
      checkout: vi.fn().mockResolvedValue(undefined),
      merge: vi.fn().mockRejectedValue(new Error('merge conflict')),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockImplementation((workdir: string) => {
      if (workdir === '/repo/main') return mainGit;
      if (workdir === '/repo/worktrees/feature-a') return worktreeGit;
      return repoGit;
    });

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');
    vi.spyOn(service, 'getWorktreeBranch').mockResolvedValue('feature-a');
    vi.spyOn(service, 'getConflicts').mockResolvedValue([
      { file: 'src/conflict.ts', type: 'content' },
    ]);

    await expect(
      service.merge({
        worktreePath: '/repo/worktrees/feature-a',
        targetBranch: 'main',
        strategy: 'merge',
      })
    ).resolves.toEqual({
      success: false,
      merged: false,
      conflicts: [{ file: 'src/conflict.ts', type: 'content' }],
      mainStashStatus: 'none',
      worktreeStashStatus: 'none',
    });
  });

  it('returns stashed metadata when a rebase stops on conflicts after auto stashing both worktrees', async () => {
    const repoGit = createGitDouble();
    const worktreeGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => false,
      }),
      stash: vi.fn().mockResolvedValue(undefined),
    });
    const mainGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => false,
        current: 'main',
      }),
      stash: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      rebase: vi.fn().mockRejectedValue(new Error('rebase conflict')),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockImplementation((workdir: string) => {
      if (workdir === '/repo/main') return mainGit;
      if (workdir === '/repo/worktrees/feature-a') return worktreeGit;
      return repoGit;
    });

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');
    vi.spyOn(service, 'getWorktreeBranch').mockResolvedValue('feature-a');
    vi.spyOn(service, 'getConflicts').mockResolvedValue([
      { file: 'src/conflict.ts', type: 'content' },
    ]);

    await expect(
      service.merge({
        worktreePath: '/repo/worktrees/feature-a',
        targetBranch: 'main',
        strategy: 'rebase',
      })
    ).resolves.toEqual({
      success: false,
      merged: false,
      conflicts: [{ file: 'src/conflict.ts', type: 'content' }],
      mainStashStatus: 'stashed',
      worktreeStashStatus: 'stashed',
      mainWorktreePath: '/repo/main',
      worktreePath: '/repo/worktrees/feature-a',
    });
  });

  it('squash merges, commits manually, and reports cleanup warnings when deleting the merged worktree', async () => {
    const repoGit = createGitDouble();
    const worktreeGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => true,
      }),
    });
    const mainGit = createGitDouble({
      status: vi.fn().mockResolvedValue({
        isClean: () => true,
        current: 'main',
      }),
      checkout: vi.fn().mockResolvedValue(undefined),
      merge: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue({
        latest: { hash: 'squash-commit-hash' },
      }),
      raw: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('branch is protected')),
    });

    worktreeServiceTestDoubles.createSimpleGit.mockImplementation((workdir: string) => {
      if (workdir === '/repo/main') return mainGit;
      if (workdir === '/repo/worktrees/feature-a') return worktreeGit;
      return repoGit;
    });

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');
    vi.spyOn(service, 'getWorktreeBranch').mockResolvedValue('feature-a');

    await expect(
      service.merge({
        worktreePath: '/repo/worktrees/feature-a',
        targetBranch: 'main',
        strategy: 'squash',
        message: 'Squash feature-a',
        deleteWorktreeAfterMerge: true,
        deleteBranchAfterMerge: true,
      })
    ).resolves.toEqual({
      success: true,
      merged: true,
      commitHash: 'squash-commit-hash',
      warnings: ["Failed to delete branch 'feature-a': branch is protected"],
      mainStashStatus: 'none',
      worktreeStashStatus: 'none',
    });

    expect(mainGit.merge).toHaveBeenCalledWith(['--squash', '-m', 'Squash feature-a', 'feature-a']);
    expect(mainGit.commit).toHaveBeenCalledWith('Squash feature-a');
    expect(mainGit.raw).toHaveBeenNthCalledWith(1, ['worktree', 'prune']);
    expect(mainGit.raw).toHaveBeenNthCalledWith(2, [
      'worktree',
      'remove',
      '--force',
      '/repo/worktrees/feature-a',
    ]);
    expect(mainGit.raw).toHaveBeenNthCalledWith(3, ['branch', '-D', 'feature-a']);
  });

  it('reports merge state, conflict content, and conflict resolution using detected file encoding', async () => {
    const repoGit = createGitDouble();
    const mergeGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValueOnce('merge-head-hash')
        .mockResolvedValueOnce('merge-head-hash'),
      status: vi.fn().mockResolvedValue({
        current: 'main',
        conflicted: ['src/conflict.ts'],
      }),
      branch: vi.fn().mockResolvedValue({
        all: ['remotes/origin/feature-a'],
      }),
    });
    const resolveGit = createGitDouble({
      raw: vi.fn().mockResolvedValue(undefined),
    });

    worktreeServiceTestDoubles.createSimpleGit
      .mockReturnValueOnce(repoGit)
      .mockReturnValueOnce(mergeGit)
      .mockReturnValueOnce(mergeGit)
      .mockReturnValueOnce(resolveGit);

    worktreeServiceTestDoubles.gitShow
      .mockResolvedValueOnce('ours')
      .mockResolvedValueOnce('theirs')
      .mockResolvedValueOnce('base');
    worktreeServiceTestDoubles.readFile.mockResolvedValueOnce(Buffer.from('legacy bytes'));
    worktreeServiceTestDoubles.detectEncoding.mockReturnValueOnce({ encoding: 'gbk' });
    worktreeServiceTestDoubles.encode.mockReturnValueOnce(Buffer.from('encoded-content'));

    const service = new WorktreeService('/repo');

    await expect(service.getMergeState('/repo/main')).resolves.toEqual({
      inProgress: true,
      targetBranch: 'main',
      sourceBranch: 'feature-a',
      conflicts: [{ file: 'src/conflict.ts', type: 'content' }],
    });

    await expect(service.getConflictContent('/repo/main', 'src/conflict.ts')).resolves.toEqual({
      file: 'src/conflict.ts',
      ours: 'ours',
      theirs: 'theirs',
      base: 'base',
    });

    await expect(
      service.resolveConflict('/repo/main', {
        file: 'src/conflict.ts',
        content: 'resolved content',
      })
    ).resolves.toBeUndefined();

    expect(worktreeServiceTestDoubles.gitShow).toHaveBeenNthCalledWith(
      1,
      '/repo/main',
      ':2:src/conflict.ts'
    );
    expect(worktreeServiceTestDoubles.gitShow).toHaveBeenNthCalledWith(
      2,
      '/repo/main',
      ':3:src/conflict.ts'
    );
    expect(worktreeServiceTestDoubles.gitShow).toHaveBeenNthCalledWith(
      3,
      '/repo/main',
      ':1:src/conflict.ts'
    );
    expect(worktreeServiceTestDoubles.writeFile).toHaveBeenCalledWith(
      '/repo/main/src/conflict.ts',
      Buffer.from('encoded-content')
    );
    expect(resolveGit.raw).toHaveBeenCalledWith(['add', '--', 'src/conflict.ts']);
  });

  it('aborts rebases before merge abort fallback and finally resets hard when no operation is active', async () => {
    const repoGit = createGitDouble();
    const rebaseGit = createGitDouble({
      rebase: vi.fn().mockResolvedValue(undefined),
    });
    const mergeGit = createGitDouble({
      merge: vi.fn().mockResolvedValue(undefined),
    });
    const resetGit = createGitDouble({
      reset: vi.fn().mockResolvedValue(undefined),
    });

    worktreeServiceTestDoubles.createSimpleGit
      .mockReturnValueOnce(repoGit)
      .mockReturnValueOnce(rebaseGit)
      .mockReturnValueOnce(mergeGit)
      .mockReturnValueOnce(resetGit);

    worktreeServiceTestDoubles.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const service = new WorktreeService('/repo');

    await expect(service.abortMerge('/repo/main')).resolves.toBeUndefined();
    await expect(service.abortMerge('/repo/main')).resolves.toBeUndefined();
    await expect(service.abortMerge('/repo/main')).resolves.toBeUndefined();

    expect(rebaseGit.rebase).toHaveBeenCalledWith(['--abort']);
    expect(mergeGit.merge).toHaveBeenCalledWith(['--abort']);
    expect(resetGit.reset).toHaveBeenCalledWith(['--hard', 'HEAD']);
  });

  it('blocks continueMerge on unresolved conflicts and returns warnings for branch cleanup failures', async () => {
    const repoGit = createGitDouble();
    const blockedGit = createGitDouble();
    const continueGit = createGitDouble({
      commit: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue({
        latest: { hash: 'continued-merge-hash' },
      }),
      raw: vi.fn().mockRejectedValue(new Error('branch is checked out elsewhere')),
    });

    worktreeServiceTestDoubles.createSimpleGit
      .mockReturnValueOnce(repoGit)
      .mockReturnValueOnce(blockedGit)
      .mockReturnValueOnce(continueGit);

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getConflicts')
      .mockResolvedValueOnce([{ file: 'src/conflict.ts', type: 'content' }])
      .mockResolvedValueOnce([]);

    await expect(service.continueMerge('/repo/main')).resolves.toEqual({
      success: false,
      merged: false,
      conflicts: [{ file: 'src/conflict.ts', type: 'content' }],
      error: 'There are still unresolved conflicts',
    });

    await expect(
      service.continueMerge('/repo/main', 'Merge feature-a', {
        deleteBranchAfterMerge: true,
        sourceBranch: 'feature-a',
      })
    ).resolves.toEqual({
      success: true,
      merged: true,
      commitHash: 'continued-merge-hash',
      warnings: ["Failed to delete branch 'feature-a': branch is checked out elsewhere"],
    });
  });

  it('continues a merge with the default message and cleans up the current worktree through the main worktree git', async () => {
    const repoGit = createGitDouble();
    const currentWorktreeGit = createGitDouble({
      commit: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue({
        latest: { hash: 'default-merge-hash' },
      }),
    });
    const cleanupGit = createGitDouble({
      raw: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    });

    worktreeServiceTestDoubles.createSimpleGit
      .mockReturnValueOnce(repoGit)
      .mockReturnValueOnce(currentWorktreeGit)
      .mockReturnValueOnce(cleanupGit);

    const service = new WorktreeService('/repo');
    vi.spyOn(service, 'getConflicts').mockResolvedValue([]);
    vi.spyOn(service, 'getMainWorktreePath').mockResolvedValue('/repo/main');

    await expect(
      service.continueMerge('/repo/worktrees/feature-a', undefined, {
        deleteWorktreeAfterMerge: true,
        worktreePath: '/repo/worktrees/feature-a',
        deleteBranchAfterMerge: true,
        sourceBranch: 'feature-a',
      })
    ).resolves.toEqual({
      success: true,
      merged: true,
      commitHash: 'default-merge-hash',
      warnings: undefined,
    });

    expect(currentWorktreeGit.commit).toHaveBeenCalledWith('Merge commit');
    expect(cleanupGit.raw).toHaveBeenNthCalledWith(1, ['worktree', 'prune']);
    expect(cleanupGit.raw).toHaveBeenNthCalledWith(2, [
      'worktree',
      'remove',
      '--force',
      '/repo/worktrees/feature-a',
    ]);
    expect(cleanupGit.raw).toHaveBeenNthCalledWith(3, ['branch', '-D', 'feature-a']);
  });
});
