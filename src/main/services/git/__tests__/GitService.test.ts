import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gitServiceTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn<(targetPath: string) => boolean>(() => false);
  const lstat = vi.fn();
  const unlink = vi.fn();
  const stat = vi.fn();
  const rm = vi.fn();
  const readFile = vi.fn();
  const toGitPath = vi.fn((_: string, targetPath: string) => targetPath);
  const createGitEnv = vi.fn(() => ({ PATH: '/usr/bin' }));
  const createSimpleGit = vi.fn();
  const isWslGitRepository = vi.fn(() => false);
  const normalizeGitRelativePath = vi.fn((targetPath: string) => targetPath);
  const spawnGit = vi.fn();
  const execAsync = vi.fn();

  return {
    existsSync,
    lstat,
    unlink,
    stat,
    rm,
    readFile,
    toGitPath,
    createGitEnv,
    createSimpleGit,
    isWslGitRepository,
    normalizeGitRelativePath,
    spawnGit,
    execAsync,
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: gitServiceTestDoubles.existsSync,
    promises: {
      ...actual.promises,
      lstat: gitServiceTestDoubles.lstat,
      unlink: gitServiceTestDoubles.unlink,
      stat: gitServiceTestDoubles.stat,
      rm: gitServiceTestDoubles.rm,
      readFile: gitServiceTestDoubles.readFile,
    },
  };
});

vi.mock('../runtime', () => ({
  createGitEnv: gitServiceTestDoubles.createGitEnv,
  createSimpleGit: gitServiceTestDoubles.createSimpleGit,
  isWslGitRepository: gitServiceTestDoubles.isWslGitRepository,
  normalizeGitRelativePath: gitServiceTestDoubles.normalizeGitRelativePath,
  spawnGit: gitServiceTestDoubles.spawnGit,
  toGitPath: gitServiceTestDoubles.toGitPath,
}));

vi.mock('node:util', async () => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    promisify: vi.fn(() => gitServiceTestDoubles.execAsync),
  };
});

import { GitService } from '../GitService';

function createGitProcessDouble() {
  const processEvents = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  let killed = false;

  return {
    stdout,
    stderr,
    get killed() {
      return killed;
    },
    kill: vi.fn((_: NodeJS.Signals | number | undefined) => {
      killed = true;
      return true;
    }),
    on: processEvents.on.bind(processEvents),
    once: processEvents.once.bind(processEvents),
    emit: processEvents.emit.bind(processEvents),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

type ProgressHandler = (event: { method: string; stage: string; progress: number }) => void;

describe('GitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitServiceTestDoubles.existsSync.mockReturnValue(false);
    gitServiceTestDoubles.lstat.mockResolvedValue(null);
    gitServiceTestDoubles.unlink.mockResolvedValue(undefined);
    gitServiceTestDoubles.stat.mockResolvedValue(null);
    gitServiceTestDoubles.rm.mockResolvedValue(undefined);
    gitServiceTestDoubles.readFile.mockResolvedValue(Buffer.from(''));
    gitServiceTestDoubles.toGitPath.mockImplementation((_, targetPath: string) => targetPath);
    gitServiceTestDoubles.createGitEnv.mockReturnValue({ PATH: '/usr/bin' });
    gitServiceTestDoubles.isWslGitRepository.mockReturnValue(false);
    gitServiceTestDoubles.normalizeGitRelativePath.mockImplementation(
      (targetPath: string) => targetPath
    );
    gitServiceTestDoubles.execAsync.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('parses porcelain v2 status output into branch metadata and file buckets', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    const proc = createGitProcessDouble();
    gitServiceTestDoubles.spawnGit.mockReturnValue(proc);

    const service = new GitService('/repo');
    const statusPromise = service.getStatus();
    await flushMicrotasks();

    proc.stdout.emit(
      'data',
      Buffer.from(
        [
          '# branch.head main',
          '# branch.upstream origin/main',
          '# branch.ab +2 -1',
          '1 MM N... 100644 100644 100644 abcdef1 abcdef2 src/file.ts',
          '1 .D N... 100644 100644 100644 abcdef1 abcdef2 removed.ts',
          '? new.txt',
          'u UU N... 100644 100644 100644 100644 abcdef1 abcdef2 conflict.ts',
          '2 R. N... 100644 100644 100644 100644 abcdef1 abcdef2 old-name.ts',
          'renamed.ts',
          '! ignored.log',
          '',
        ].join('\0')
      )
    );
    proc.emit('close', 0);

    await expect(statusPromise).resolves.toEqual({
      isClean: false,
      current: 'main',
      tracking: 'origin/main',
      ahead: 2,
      behind: 1,
      staged: ['src/file.ts', 'conflict.ts', 'renamed.ts'],
      modified: ['src/file.ts'],
      deleted: ['removed.ts'],
      untracked: ['new.txt'],
      conflicted: ['conflict.ts'],
      truncated: false,
      truncatedLimit: undefined,
    });

    expect(gitServiceTestDoubles.spawnGit).toHaveBeenCalledWith(
      '/repo',
      ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'],
      { cwd: '/repo', env: { PATH: '/usr/bin' } }
    );
  });

  it('parses file changes from porcelain v2 output and reports skipped directories', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    const proc = createGitProcessDouble();
    gitServiceTestDoubles.spawnGit.mockReturnValue(proc);

    const service = new GitService('/repo');
    const changesPromise = service.getFileChanges();
    await flushMicrotasks();

    proc.stdout.emit(
      'data',
      Buffer.from(
        [
          '# branch.head main',
          '? new.txt',
          '? node_modules/ignored.js',
          '1 MM N... 100644 100644 100644 abcdef1 abcdef2 src/file.ts',
          '1 .D N... 100644 100644 100644 abcdef1 abcdef2 removed.ts',
          'u UU N... 100644 100644 100644 100644 abcdef1 abcdef2 conflict.ts',
          '2 R. N... 100644 100644 100644 100644 abcdef1 abcdef2 old-name.ts',
          'renamed.ts',
          '! ignored.log',
          '',
        ].join('\0')
      )
    );
    proc.emit('close', 0);

    await expect(changesPromise).resolves.toEqual({
      changes: [
        { path: 'new.txt', status: 'U', staged: false },
        { path: 'src/file.ts', status: 'M', staged: true },
        { path: 'src/file.ts', status: 'M', staged: false },
        { path: 'removed.ts', status: 'D', staged: false },
        { path: 'conflict.ts', status: 'X', staged: true },
        { path: 'conflict.ts', status: 'X', staged: false },
        { path: 'renamed.ts', status: 'R', staged: true, originalPath: 'old-name.ts' },
      ],
      skippedDirs: ['node_modules'],
      truncated: false,
      truncatedLimit: undefined,
    });
  });

  it('parses tracked and untracked diff stats and falls back safely for empty output or git errors', async () => {
    const diff = vi
      .fn()
      .mockResolvedValueOnce('10\t5\tsrc/app.ts\n')
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('missing HEAD'))
      .mockResolvedValueOnce('4\t0\tstaged.ts\n')
      .mockResolvedValueOnce('0\t2\tunstaged.ts\n');
    const raw = vi
      .fn()
      .mockResolvedValueOnce('notes.md\0')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('draft.md\0');

    gitServiceTestDoubles.createSimpleGit.mockReturnValue({
      diff,
      raw,
    });
    gitServiceTestDoubles.readFile
      .mockResolvedValueOnce(Buffer.from('one\ntwo\nthree\n'))
      .mockResolvedValueOnce(Buffer.from('alpha\nbeta\n'));

    const service = new GitService('/repo');

    await expect(service.getDiffStats()).resolves.toEqual({
      insertions: 13,
      deletions: 5,
    });
    await expect(service.getDiffStats()).resolves.toEqual({
      insertions: 0,
      deletions: 0,
    });
    await expect(service.getDiffStats()).resolves.toEqual({
      insertions: 6,
      deletions: 2,
    });

    expect(diff).toHaveBeenNthCalledWith(1, ['--numstat', 'HEAD', '--']);
    expect(diff).toHaveBeenNthCalledWith(2, ['--numstat', 'HEAD', '--']);
    expect(diff).toHaveBeenNthCalledWith(3, ['--numstat', 'HEAD', '--']);
    expect(diff).toHaveBeenNthCalledWith(4, ['--cached', '--numstat', '--']);
    expect(diff).toHaveBeenNthCalledWith(5, ['--numstat', '--']);
    expect(raw).toHaveBeenNthCalledWith(1, ['ls-files', '--others', '--exclude-standard', '-z']);
    expect(raw).toHaveBeenNthCalledWith(2, ['ls-files', '--others', '--exclude-standard', '-z']);
    expect(raw).toHaveBeenNthCalledWith(3, ['ls-files', '--others', '--exclude-standard', '-z']);
  });

  it('validates clone targets and forwards clone progress updates', async () => {
    const clone = vi.fn().mockResolvedValue(undefined);
    let capturedProgress: ProgressHandler | null = null;

    gitServiceTestDoubles.createSimpleGit.mockImplementation(
      (_baseDir: string, options?: { progress?: ProgressHandler }) => {
        capturedProgress = options?.progress ?? null;
        return { clone };
      }
    );

    await expect(GitService.clone('not-a-git-url', '/tmp/repo')).rejects.toThrow(
      'Invalid Git URL format'
    );

    gitServiceTestDoubles.existsSync.mockReturnValueOnce(true);
    await expect(
      GitService.clone('https://github.com/openai/infilux.git', '/tmp/repo')
    ).rejects.toThrow('Target directory already exists');

    const onProgress = vi.fn();
    await GitService.clone(
      'https://github.com/openai/infilux.git',
      '/tmp/worktrees/repo',
      onProgress
    );

    expect(gitServiceTestDoubles.createSimpleGit).toHaveBeenLastCalledWith('/tmp/worktrees', {
      progress: expect.any(Function),
    });
    expect(gitServiceTestDoubles.toGitPath).toHaveBeenCalledWith(
      '/tmp/worktrees',
      '/tmp/worktrees/repo'
    );
    expect(clone).toHaveBeenCalledWith(
      'https://github.com/openai/infilux.git',
      '/tmp/worktrees/repo',
      ['--progress']
    );

    expect(capturedProgress).not.toBeNull();
    if (capturedProgress === null) {
      throw new Error('Expected clone progress handler to be registered');
    }

    const progressHandler: ProgressHandler = capturedProgress;

    progressHandler({ method: 'fetch', stage: 'receiving', progress: 10 });
    progressHandler({ method: 'clone', stage: 'receiving', progress: 42 });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'receiving',
      progress: 42,
    });
  });

  it('validates supported git URL formats and extracts repository names', () => {
    expect(GitService.isValidGitUrl('https://github.com/openai/infilux.git')).toBe(true);
    expect(GitService.isValidGitUrl('https://git.example.com:8443/group/repo')).toBe(true);
    expect(GitService.isValidGitUrl('git@github.com:openai/infilux.git')).toBe(true);
    expect(GitService.isValidGitUrl('ssh://git@github.com:22/openai/infilux.git')).toBe(true);
    expect(GitService.isValidGitUrl('file:///tmp/repo')).toBe(false);
    expect(GitService.isValidGitUrl('not-a-git-url')).toBe(false);

    expect(GitService.extractRepoName('https://github.com/openai/infilux.git')).toBe('infilux');
    expect(GitService.extractRepoName('git@gitlab.com:group/subgroup/repo.git')).toBe('repo');
    expect(GitService.extractRepoName('https://git.example.com/group/repo')).toBe('repo');
  });

  it('marks merged branches from gh output and falls back to symbolic-ref for empty repositories', async () => {
    const branch = vi
      .fn()
      .mockResolvedValueOnce({
        branches: {
          main: { current: true, commit: 'a1', label: 'main' },
          'feature/demo': { current: false, commit: 'b2', label: 'feature/demo' },
          'remotes/origin/feature/demo': {
            current: false,
            commit: 'b2',
            label: 'origin/feature/demo',
          },
        },
      })
      .mockResolvedValueOnce({ branches: {} });
    const raw = vi
      .fn()
      .mockResolvedValueOnce('refs/remotes/origin/main\n')
      .mockResolvedValueOnce('main\n');

    gitServiceTestDoubles.createSimpleGit.mockReturnValue({ branch, raw });
    gitServiceTestDoubles.execAsync.mockResolvedValueOnce({
      stdout: JSON.stringify([{ headRefName: 'feature/demo' }]),
      stderr: '',
    });

    const service = new GitService('/repo');

    await expect(service.getBranches()).resolves.toEqual([
      { name: 'main', current: true, commit: 'a1', label: 'main', merged: false },
      {
        name: 'feature/demo',
        current: false,
        commit: 'b2',
        label: 'feature/demo',
        merged: true,
      },
      {
        name: 'remotes/origin/feature/demo',
        current: false,
        commit: 'b2',
        label: 'origin/feature/demo',
        merged: true,
      },
    ]);

    await expect(service.getBranches()).resolves.toEqual([
      {
        name: 'main',
        current: true,
        commit: '',
        label: '(no commits yet)',
      },
    ]);

    expect(gitServiceTestDoubles.execAsync).toHaveBeenCalledWith(
      'gh pr list --state merged --json headRefName --limit 200',
      {
        cwd: '/repo',
        env: { PATH: '/usr/bin' },
        timeout: 5000,
      }
    );
  });

  it('fetches pull requests and wraps fetch failures with the PR number', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network unavailable'));

    gitServiceTestDoubles.createSimpleGit.mockReturnValue({
      fetch,
    });

    const service = new GitService('/repo');

    await expect(service.fetchPullRequest(17, 'pr-17')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(1, ['origin', 'pull/17/head:pr-17']);

    await expect(service.fetchPullRequest(23, 'pr-23')).rejects.toThrow(
      'Failed to fetch PR #23: network unavailable'
    );
    expect(fetch).toHaveBeenNthCalledWith(2, ['origin', 'pull/23/head:pr-23']);
  });

  it('reports gh CLI installation and authentication states', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    gitServiceTestDoubles.execAsync
      .mockRejectedValueOnce(new Error('missing gh'))
      .mockResolvedValueOnce({ stdout: 'gh version 2.0.0', stderr: '' })
      .mockRejectedValueOnce(new Error('auth missing'))
      .mockResolvedValueOnce({ stdout: 'gh version 2.0.0', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'logged in', stderr: '' });

    const service = new GitService('/repo');

    await expect(service.getGhCliStatus()).resolves.toEqual({
      installed: false,
      authenticated: false,
      error: 'gh CLI not installed',
    });
    await expect(service.getGhCliStatus()).resolves.toEqual({
      installed: true,
      authenticated: false,
      error: 'gh CLI not authenticated',
    });
    await expect(service.getGhCliStatus()).resolves.toEqual({
      installed: true,
      authenticated: true,
    });
  });

  it('maps pull request fields and wraps listing errors', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    gitServiceTestDoubles.execAsync
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            number: 7,
            title: 'Add tests',
            headRefName: 'feature/add-tests',
            state: 'OPEN',
            author: { login: 'alice' },
            updatedAt: '2026-03-29T07:00:00.000Z',
            isDraft: true,
          },
        ]),
        stderr: '',
      })
      .mockRejectedValueOnce(new Error('gh pr list failed'));

    const service = new GitService('/repo');

    await expect(service.listPullRequests()).resolves.toEqual([
      {
        number: 7,
        title: 'Add tests',
        headRefName: 'feature/add-tests',
        state: 'OPEN',
        author: 'alice',
        updatedAt: '2026-03-29T07:00:00.000Z',
        isDraft: true,
      },
    ]);

    await expect(service.listPullRequests()).rejects.toThrow(
      'Failed to list PRs: gh pr list failed'
    );
  });

  it('parses submodule status, enriches initialized entries, and tolerates status lookup failures', async () => {
    const raw = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      switch (key) {
        case 'submodule status --recursive':
          return [
            ' abc123 libs/core (heads/main)',
            '+def456 libs/outdated (heads/release)',
            'Ufedcba libs/conflict (heads/fix)',
            '-012345 libs/pending (heads/main)',
          ].join('\n');
        case 'config -f .gitmodules submodule.libs/core.url':
          return 'https://example.com/core.git\n';
        case 'config -f .gitmodules submodule.libs/core.branch':
          return 'main\n';
        case 'config -f .gitmodules submodule.libs/outdated.url':
          return 'https://example.com/outdated.git\n';
        case 'config -f .gitmodules submodule.libs/outdated.branch':
          return 'release\n';
        case 'config -f .gitmodules submodule.libs/conflict.url':
          return 'https://example.com/conflict.git\n';
        case 'config -f .gitmodules submodule.libs/conflict.branch':
          throw new Error('branch missing');
        case 'config -f .gitmodules submodule.libs/pending.url':
          return 'https://example.com/pending.git\n';
        case 'config -f .gitmodules submodule.libs/pending.branch':
          return 'main\n';
        default:
          throw new Error(`Unexpected raw call: ${key}`);
      }
    });

    const mainGit = { raw };
    const coreSubGit = {
      status: vi.fn().mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        ahead: 1,
        behind: 0,
        staged: ['a.ts'],
        modified: ['b.ts'],
        deleted: [],
        not_added: ['c.ts'],
        isClean: () => false,
      }),
    };
    const outdatedSubGit = {
      status: vi.fn().mockResolvedValue({
        current: 'release',
        tracking: 'origin/release',
        ahead: 0,
        behind: 2,
        staged: [],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => true,
      }),
    };
    const conflictSubGit = {
      status: vi.fn().mockRejectedValue(new Error('status failed')),
    };

    gitServiceTestDoubles.createSimpleGit
      .mockReturnValueOnce(mainGit)
      .mockReturnValueOnce(coreSubGit)
      .mockReturnValueOnce(outdatedSubGit)
      .mockReturnValueOnce(conflictSubGit);

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const service = new GitService('/repo');

    await expect(service.listSubmodules()).resolves.toEqual([
      {
        name: 'core',
        path: 'libs/core',
        url: 'https://example.com/core.git',
        branch: 'main',
        head: 'abc123',
        status: 'clean',
        initialized: true,
        tracking: 'origin/main',
        ahead: 1,
        behind: 0,
        hasChanges: true,
        stagedCount: 1,
        unstagedCount: 2,
      },
      {
        name: 'outdated',
        path: 'libs/outdated',
        url: 'https://example.com/outdated.git',
        branch: 'release',
        head: 'def456',
        status: 'outdated',
        initialized: true,
        tracking: 'origin/release',
        ahead: 0,
        behind: 2,
        hasChanges: false,
        stagedCount: 0,
        unstagedCount: 0,
      },
      {
        name: 'conflict',
        path: 'libs/conflict',
        url: 'https://example.com/conflict.git',
        branch: undefined,
        head: 'fedcba',
        status: 'modified',
        initialized: true,
        tracking: undefined,
        ahead: 0,
        behind: 0,
        hasChanges: false,
        stagedCount: 0,
        unstagedCount: 0,
      },
      {
        name: 'pending',
        path: 'libs/pending',
        url: 'https://example.com/pending.git',
        branch: 'main',
        head: '012345',
        status: 'uninitialized',
        initialized: false,
        tracking: undefined,
        ahead: 0,
        behind: 0,
        hasChanges: false,
        stagedCount: 0,
        unstagedCount: 0,
      },
    ]);

    expect(debugSpy).toHaveBeenCalledWith(
      'Failed to get status for submodule libs/conflict:',
      expect.any(Error)
    );

    debugSpy.mockRestore();
  });

  it('runs blame inside the matching submodule and reuses cached commit metadata', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    const proc = createGitProcessDouble();
    gitServiceTestDoubles.spawnGit.mockReturnValue(proc);

    const service = new GitService('/repo');
    vi.spyOn(service, 'listSubmodules').mockResolvedValue([
      {
        name: 'nested',
        path: 'packages/app',
        url: 'https://example.com/app.git',
        head: 'abc123',
        status: 'clean',
        initialized: true,
        ahead: 0,
        behind: 0,
        hasChanges: false,
        stagedCount: 0,
        unstagedCount: 0,
      },
    ]);

    const blamePromise = service.blame('packages/app/src/index.ts');
    await flushMicrotasks();

    expect(gitServiceTestDoubles.spawnGit).toHaveBeenCalledWith('/repo/packages/app', [
      'blame',
      '--porcelain',
      '--',
      'src/index.ts',
    ]);

    const commitHash = '0123456789abcdef0123456789abcdef01234567';
    proc.stdout.emit(
      'data',
      Buffer.from(
        [
          `${commitHash} 1 1 1`,
          'author Example Author',
          'author-time 1711843200',
          'summary Initial commit',
          '\tconst first = 1;',
          `${commitHash} 2 2 1`,
          '\tconst second = 2;',
          '',
        ].join('\n')
      )
    );
    proc.emit('close', 0);

    await expect(blamePromise).resolves.toEqual([
      {
        hash: commitHash,
        author: 'Example Author',
        date: '2024-03-31T00:00:00.000Z',
        message: 'Initial commit',
        lineNumber: 1,
      },
      {
        hash: commitHash,
        author: 'Example Author',
        date: '2024-03-31T00:00:00.000Z',
        message: 'Initial commit',
        lineNumber: 2,
      },
    ]);
  });

  it('rejects blame when git exits with a non-zero status', async () => {
    gitServiceTestDoubles.createSimpleGit.mockReturnValue({});
    const proc = createGitProcessDouble();
    gitServiceTestDoubles.spawnGit.mockReturnValue(proc);

    const service = new GitService('/repo');
    vi.spyOn(service, 'listSubmodules').mockResolvedValue([]);

    const blamePromise = service.blame('src/index.ts');
    await flushMicrotasks();

    proc.stderr.emit('data', Buffer.from('fatal: no such path'));
    proc.emit('close', 128);

    await expect(blamePromise).rejects.toThrow('git blame failed: fatal: no such path');
  });

  it('discards tracked files via checkout and deletes untracked files from disk', async () => {
    const status = vi.fn().mockResolvedValue({
      not_added: ['new.txt'],
    });
    const checkout = vi.fn().mockResolvedValue(undefined);

    gitServiceTestDoubles.createSimpleGit.mockReturnValue({
      status,
      checkout,
    });

    const service = new GitService('/repo');

    await expect(service.discard(['tracked.ts', 'new.txt'])).resolves.toBeUndefined();

    expect(gitServiceTestDoubles.unlink).toHaveBeenCalledWith('/repo/new.txt');
    expect(checkout).toHaveBeenCalledWith(['--', 'tracked.ts']);
  });
});
