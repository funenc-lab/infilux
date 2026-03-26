import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GitInstanceMock = {
  workdir: string;
  init: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  getLog: ReturnType<typeof vi.fn>;
  getBranches: ReturnType<typeof vi.fn>;
  createBranch: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
  getDiff: ReturnType<typeof vi.fn>;
  getFileChanges: ReturnType<typeof vi.fn>;
  getFileDiff: ReturnType<typeof vi.fn>;
  stage: ReturnType<typeof vi.fn>;
  unstage: ReturnType<typeof vi.fn>;
  discard: ReturnType<typeof vi.fn>;
  showCommit: ReturnType<typeof vi.fn>;
  getCommitFiles: ReturnType<typeof vi.fn>;
  getCommitDiff: ReturnType<typeof vi.fn>;
  getDiffStats: ReturnType<typeof vi.fn>;
  getGhCliStatus: ReturnType<typeof vi.fn>;
  listPullRequests: ReturnType<typeof vi.fn>;
  fetchPullRequest: ReturnType<typeof vi.fn>;
  blame: ReturnType<typeof vi.fn>;
  revert: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  listSubmodules: ReturnType<typeof vi.fn>;
  initSubmodules: ReturnType<typeof vi.fn>;
  updateSubmodules: ReturnType<typeof vi.fn>;
  syncSubmodules: ReturnType<typeof vi.fn>;
  fetchSubmodule: ReturnType<typeof vi.fn>;
  pullSubmodule: ReturnType<typeof vi.fn>;
  pushSubmodule: ReturnType<typeof vi.fn>;
  commitSubmodule: ReturnType<typeof vi.fn>;
  stageSubmodule: ReturnType<typeof vi.fn>;
  unstageSubmodule: ReturnType<typeof vi.fn>;
  discardSubmodule: ReturnType<typeof vi.fn>;
  getSubmoduleChanges: ReturnType<typeof vi.fn>;
  getSubmoduleFileDiff: ReturnType<typeof vi.fn>;
  getSubmoduleBranches: ReturnType<typeof vi.fn>;
  checkoutSubmoduleBranch: ReturnType<typeof vi.fn>;
};

const gitTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const gitInstances = new Map<string, GitInstanceMock>();

  function createGitInstance(workdir: string): GitInstanceMock {
    return {
      workdir,
      init: vi.fn(async () => undefined),
      getStatus: vi.fn(async () => ({ workdir, type: 'status' })),
      getLog: vi.fn(async (...args: unknown[]) => ({ workdir, type: 'log', args })),
      getBranches: vi.fn(async () => [{ name: 'main' }]),
      createBranch: vi.fn(async () => undefined),
      checkout: vi.fn(async () => undefined),
      commit: vi.fn(async (...args: unknown[]) => ({ workdir, type: 'commit', args })),
      push: vi.fn(async () => undefined),
      pull: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      getDiff: vi.fn(async (...args: unknown[]) => ({ workdir, type: 'diff', args })),
      getFileChanges: vi.fn(async () => [{ path: 'src/app.ts' }]),
      getFileDiff: vi.fn(async (...args: unknown[]) => ({ workdir, type: 'file-diff', args })),
      stage: vi.fn(async () => undefined),
      unstage: vi.fn(async () => undefined),
      discard: vi.fn(async () => undefined),
      showCommit: vi.fn(async (hash: string) => ({ hash })),
      getCommitFiles: vi.fn(async (...args: unknown[]) => ({
        workdir,
        type: 'commit-files',
        args,
      })),
      getCommitDiff: vi.fn(async (...args: unknown[]) => ({ workdir, type: 'commit-diff', args })),
      getDiffStats: vi.fn(async () => ({ files: 1 })),
      getGhCliStatus: vi.fn(async () => ({ installed: true, authenticated: true })),
      listPullRequests: vi.fn(async () => [{ number: 1 }]),
      fetchPullRequest: vi.fn(async () => ({ success: true })),
      blame: vi.fn(async () => [{ lineNumber: 1 }]),
      revert: vi.fn(async () => undefined),
      reset: vi.fn(async () => undefined),
      listSubmodules: vi.fn(async () => [{ path: 'packages/core' }]),
      initSubmodules: vi.fn(async () => undefined),
      updateSubmodules: vi.fn(async () => undefined),
      syncSubmodules: vi.fn(async () => undefined),
      fetchSubmodule: vi.fn(async () => undefined),
      pullSubmodule: vi.fn(async () => undefined),
      pushSubmodule: vi.fn(async () => undefined),
      commitSubmodule: vi.fn(async () => ({ hash: 'submodule-commit' })),
      stageSubmodule: vi.fn(async () => undefined),
      unstageSubmodule: vi.fn(async () => undefined),
      discardSubmodule: vi.fn(async () => undefined),
      getSubmoduleChanges: vi.fn(async () => [{ path: 'packages/core/index.ts' }]),
      getSubmoduleFileDiff: vi.fn(async () => ({ patch: 'diff' })),
      getSubmoduleBranches: vi.fn(async () => [{ name: 'main' }]),
      checkoutSubmoduleBranch: vi.fn(async () => undefined),
    };
  }

  const getGitInstance = vi.fn((workdir: string) => {
    const existing = gitInstances.get(workdir);
    if (existing) {
      return existing;
    }
    const created = createGitInstance(workdir);
    gitInstances.set(workdir, created);
    return created;
  });

  const existsSync = vi.fn((inputPath: string) => {
    return !inputPath.includes('missing') && !inputPath.includes('not-git/.git');
  });
  const statSync = vi.fn(() => ({ isDirectory: () => true }));
  const isRemoteVirtualPath = vi.fn((workdir: string) => workdir.startsWith('/__remote__/'));
  const createUnsupportedRemoteFeatureError = vi.fn(
    (feature: string) => new Error(`unsupported:${feature}`)
  );
  const remoteRepositoryBackend = {
    getStatus: vi.fn(async (workdir: string) => ({ workdir, remote: 'status' })),
    getLog: vi.fn(async (...args: unknown[]) => ({ remote: 'log', args })),
    getBranches: vi.fn(async () => [{ name: 'remote-main' }]),
    createBranch: vi.fn(async () => undefined),
    checkout: vi.fn(async () => undefined),
    commit: vi.fn(async () => ({ hash: 'remote-commit' })),
    push: vi.fn(async () => undefined),
    pull: vi.fn(async () => undefined),
    fetch: vi.fn(async () => undefined),
    getDiff: vi.fn(async () => ({ patch: 'remote-diff' })),
    getFileChanges: vi.fn(async () => [{ path: 'remote.ts' }]),
    getFileDiff: vi.fn(async () => ({ patch: 'remote-file-diff' })),
    showCommit: vi.fn(async () => ({ hash: 'remote-show' })),
    getCommitFiles: vi.fn(async () => [{ path: 'remote-file.ts' }]),
    getCommitDiff: vi.fn(async () => ({ patch: 'remote-commit-diff' })),
    getDiffStats: vi.fn(async () => ({ files: 2 })),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
  };
  const generateCommitMessage = vi.fn(async () => ({ success: true, message: 'Generated commit' }));
  const generateBranchName = vi.fn(async () => ({
    success: true,
    branchName: 'feature/generated',
  }));
  const startCodeReview = vi.fn();
  const stopCodeReview = vi.fn();
  const setAutoFetchEnabled = vi.fn();
  const clone = vi.fn(
    async (
      _remoteUrl: string,
      _targetPath: string,
      onProgress: (progress: { stage: string; progress: number }) => void
    ) => {
      onProgress({ stage: 'receiving', progress: 55 });
    }
  );
  const isValidGitUrl = vi.fn((url: string) => url.startsWith('https://'));
  const extractRepoName = vi.fn(
    (url: string) =>
      url
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') ?? ''
  );

  return {
    handlers,
    gitInstances,
    getGitInstance,
    existsSync,
    statSync,
    isRemoteVirtualPath,
    createUnsupportedRemoteFeatureError,
    remoteRepositoryBackend,
    generateCommitMessage,
    generateBranchName,
    startCodeReview,
    stopCodeReview,
    setAutoFetchEnabled,
    clone,
    isValidGitUrl,
    extractRepoName,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      gitTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: gitTestDoubles.existsSync,
  statSync: gitTestDoubles.statSync,
}));

vi.mock('../../services/ai', () => ({
  generateBranchName: gitTestDoubles.generateBranchName,
  generateCommitMessage: gitTestDoubles.generateCommitMessage,
  startCodeReview: gitTestDoubles.startCodeReview,
  stopCodeReview: gitTestDoubles.stopCodeReview,
}));

vi.mock('../../services/git/GitAutoFetchService', () => ({
  gitAutoFetchService: {
    setEnabled: gitTestDoubles.setAutoFetchEnabled,
  },
}));

vi.mock('../../services/git/GitService', () => ({
  GitService: class {
    static clone = gitTestDoubles.clone;
    static isValidGitUrl = gitTestDoubles.isValidGitUrl;
    static extractRepoName = gitTestDoubles.extractRepoName;

    constructor(workdir: string) {
      Object.assign(this, gitTestDoubles.getGitInstance(workdir));
    }
  },
}));

vi.mock('../../services/remote/RemoteI18n', () => ({
  createUnsupportedRemoteFeatureError: gitTestDoubles.createUnsupportedRemoteFeatureError,
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: gitTestDoubles.isRemoteVirtualPath,
}));

vi.mock('../../services/remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend: gitTestDoubles.remoteRepositoryBackend,
}));

function getHandler(channel: string) {
  const handler = gitTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

function createEvent(options?: { destroyed?: boolean }) {
  const send = vi.fn();
  const sender = {
    isDestroyed: vi.fn(() => options?.destroyed ?? false),
    send,
  };
  return { sender };
}

describe('git IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    gitTestDoubles.handlers.clear();
    gitTestDoubles.gitInstances.clear();
    gitTestDoubles.existsSync.mockImplementation(
      (inputPath: string) => !inputPath.includes('missing') && !inputPath.includes('not-git/.git')
    );
    gitTestDoubles.statSync.mockReturnValue({ isDirectory: () => true });
    gitTestDoubles.isRemoteVirtualPath.mockImplementation((workdir: string) =>
      workdir.startsWith('/__remote__/')
    );
    gitTestDoubles.createUnsupportedRemoteFeatureError.mockImplementation(
      (feature: string) => new Error(`unsupported:${feature}`)
    );
    gitTestDoubles.clone.mockImplementation(
      async (
        _remoteUrl: string,
        _targetPath: string,
        onProgress: (progress: { stage: string; progress: number }) => void
      ) => {
        onProgress({ stage: 'receiving', progress: 55 });
      }
    );
  });

  afterEach(async () => {
    const gitModule = await import('../git');
    gitModule.clearAllGitServices();
  });

  it('delegates local git handlers through a cached GitService instance', async () => {
    const gitModule = await import('../git');
    gitModule.clearAllGitServices();
    gitModule.registerAuthorizedWorkdir('/repo/local');
    gitModule.registerGitHandlers();

    await getHandler(IPC_CHANNELS.GIT_STATUS)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_LOG)({}, '/repo/local', 10, 2, 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_BRANCH_LIST)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_BRANCH_CREATE)({}, '/repo/local', 'feature/x', 'main');
    await getHandler(IPC_CHANNELS.GIT_BRANCH_CHECKOUT)({}, '/repo/local', 'feature/x');
    await getHandler(IPC_CHANNELS.GIT_COMMIT)({}, '/repo/local', 'commit message', ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_PUSH)({}, '/repo/local', 'origin', 'main', true);
    await getHandler(IPC_CHANNELS.GIT_PULL)({}, '/repo/local', 'origin', 'main');
    await getHandler(IPC_CHANNELS.GIT_FETCH)({}, '/repo/local', 'origin');
    await getHandler(IPC_CHANNELS.GIT_DIFF)({}, '/repo/local', { staged: true });
    await getHandler(IPC_CHANNELS.GIT_FILE_CHANGES)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_FILE_DIFF)({}, '/repo/local', 'src/app.ts', true);
    await getHandler(IPC_CHANNELS.GIT_STAGE)({}, '/repo/local', ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_UNSTAGE)({}, '/repo/local', ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_DISCARD)({}, '/repo/local', ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_COMMIT_SHOW)({}, '/repo/local', 'abc123');
    await getHandler(IPC_CHANNELS.GIT_COMMIT_FILES)({}, '/repo/local', 'abc123', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_COMMIT_DIFF)(
      {},
      '/repo/local',
      'abc123',
      'src/app.ts',
      'M',
      'packages/core'
    );
    await getHandler(IPC_CHANNELS.GIT_DIFF_STATS)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_GH_STATUS)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_PR_LIST)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_PR_FETCH)({}, '/repo/local', 7, 'pr-7');
    await getHandler(IPC_CHANNELS.GIT_BLAME)({}, '/repo/local', 'src/app.ts');
    await getHandler(IPC_CHANNELS.GIT_REVERT)({}, '/repo/local', 'def456');
    await getHandler(IPC_CHANNELS.GIT_RESET)({}, '/repo/local', 'def456', 'hard');
    await getHandler(IPC_CHANNELS.GIT_AUTO_FETCH_SET_ENABLED)({}, true);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_LIST)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_INIT)({}, '/repo/local', true);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_UPDATE)({}, '/repo/local', true);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_SYNC)({}, '/repo/local');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_FETCH)({}, '/repo/local', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_PULL)({}, '/repo/local', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_PUSH)({}, '/repo/local', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_COMMIT)(
      {},
      '/repo/local',
      'packages/core',
      'submodule commit'
    );
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_STAGE)({}, '/repo/local', 'packages/core', [
      'index.ts',
    ]);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_UNSTAGE)({}, '/repo/local', 'packages/core', [
      'index.ts',
    ]);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_DISCARD)({}, '/repo/local', 'packages/core', [
      'index.ts',
    ]);
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_CHANGES)({}, '/repo/local', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_FILE_DIFF)(
      {},
      '/repo/local',
      'packages/core',
      'index.ts',
      false
    );
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_BRANCHES)({}, '/repo/local', 'packages/core');
    await getHandler(IPC_CHANNELS.GIT_SUBMODULE_CHECKOUT)(
      {},
      '/repo/local',
      'packages/core',
      'main'
    );

    const git = gitTestDoubles.gitInstances.get('/repo/local');
    expect(gitTestDoubles.getGitInstance).toHaveBeenCalledTimes(1);
    expect(git?.getLog).toHaveBeenCalledWith(10, 2, 'packages/core');
    expect(git?.commit).toHaveBeenCalledWith('commit message', ['src/app.ts']);
    expect(git?.getCommitDiff).toHaveBeenCalledWith('abc123', 'src/app.ts', 'M', 'packages/core');
    expect(git?.reset).toHaveBeenCalledWith('def456', 'hard');
    expect(git?.commitSubmodule).toHaveBeenCalledWith('packages/core', 'submodule commit');
    expect(gitTestDoubles.setAutoFetchEnabled).toHaveBeenCalledWith(true);

    gitModule.unregisterAuthorizedWorkdir('/repo/local');
    await getHandler(IPC_CHANNELS.GIT_STATUS)({}, '/repo/local');
    expect(gitTestDoubles.getGitInstance).toHaveBeenCalledTimes(2);
  });

  it('supports git init, fallback validation, AI helpers, clone progress and code review events', async () => {
    const gitModule = await import('../git');
    gitModule.clearAllGitServices();
    gitModule.registerGitHandlers();

    await getHandler(IPC_CHANNELS.GIT_INIT)({}, '/repo/init');
    const initInstance = gitTestDoubles.gitInstances.get('/repo/init');
    expect(initInstance?.init).toHaveBeenCalledTimes(1);

    await getHandler(IPC_CHANNELS.GIT_STATUS)({}, '/repo/fallback');
    expect(gitTestDoubles.existsSync).toHaveBeenCalledWith('/repo/fallback/.git');

    await expect(getHandler(IPC_CHANNELS.GIT_STATUS)({}, '/repo/missing')).rejects.toThrow(
      'Invalid workdir: path does not exist or is not a directory'
    );
    await expect(getHandler(IPC_CHANNELS.GIT_STATUS)({}, '/repo/not-git')).rejects.toThrow(
      'Invalid workdir: not a git repository'
    );

    const commitMsgResult = await getHandler(IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG)(
      {},
      '/repo/init',
      {
        maxDiffLines: 200,
        timeout: 5_000,
        provider: 'openai',
        model: 'gpt-test',
        reasoningEffort: 'medium',
        prompt: 'Summarize',
      }
    );
    const branchNameResult = await getHandler(IPC_CHANNELS.GIT_GENERATE_BRANCH_NAME)(
      {},
      '/repo/init',
      {
        prompt: 'Create branch',
        provider: 'openai',
        model: 'gpt-test',
        reasoningEffort: 'high',
      }
    );
    const validateSuccess = await getHandler(IPC_CHANNELS.GIT_VALIDATE_URL)(
      {},
      'https://example.com/demo.git'
    );
    const validateFailure = await getHandler(IPC_CHANNELS.GIT_VALIDATE_URL)({}, 'ssh://invalid');

    expect(commitMsgResult).toEqual({ success: true, message: 'Generated commit' });
    expect(branchNameResult).toEqual({ success: true, branchName: 'feature/generated' });
    expect(validateSuccess).toEqual({ valid: true, repoName: 'demo' });
    expect(validateFailure).toEqual({ valid: false, repoName: undefined });

    const cloneEvent = createEvent();
    const cloneResult = await getHandler(IPC_CHANNELS.GIT_CLONE)(
      cloneEvent,
      'https://example.com/demo.git',
      '/repo/clone'
    );
    expect(cloneResult).toEqual({ success: true, path: '/repo/clone' });
    expect(cloneEvent.sender.send).toHaveBeenCalledWith(IPC_CHANNELS.GIT_CLONE_PROGRESS, {
      stage: 'receiving',
      progress: 55,
    });

    gitTestDoubles.clone.mockRejectedValueOnce(new Error('clone failed'));
    const cloneErrorResult = await getHandler(IPC_CHANNELS.GIT_CLONE)(
      createEvent(),
      'https://example.com/demo.git',
      '/repo/clone-fail'
    );
    expect(cloneErrorResult).toEqual({
      success: false,
      path: '/repo/clone-fail',
      error: 'clone failed',
    });

    const reviewEvent = createEvent();
    const startResult = await getHandler(IPC_CHANNELS.GIT_CODE_REVIEW_START)(
      reviewEvent,
      '/repo/init',
      {
        provider: 'claude-code',
        model: 'sonnet',
        reasoningEffort: 'medium',
        language: '中文',
        reviewId: 'review-1',
        sessionId: 'session-1',
        prompt: 'Review',
      }
    );

    expect(startResult).toEqual({ success: true, sessionId: 'session-1' });
    const reviewCall = gitTestDoubles.startCodeReview.mock.calls[0]?.[0] as
      | {
          onChunk: (chunk: string) => void;
          onComplete: () => void;
          onError: (error: string) => void;
        }
      | undefined;
    reviewCall?.onChunk('chunk-1');
    reviewCall?.onError('failed');
    reviewCall?.onComplete();
    expect(reviewEvent.sender.send).toHaveBeenCalledTimes(3);

    const destroyedReviewEvent = createEvent({ destroyed: true });
    await getHandler(IPC_CHANNELS.GIT_CODE_REVIEW_START)(destroyedReviewEvent, '/repo/init', {
      provider: 'claude-code',
      model: 'sonnet',
      reviewId: 'review-2',
    });
    const destroyedCall = gitTestDoubles.startCodeReview.mock.calls[1]?.[0] as
      | {
          onChunk: (chunk: string) => void;
          onComplete: () => void;
          onError: (error: string) => void;
        }
      | undefined;
    destroyedCall?.onChunk('ignored');
    destroyedCall?.onError('ignored');
    destroyedCall?.onComplete();
    expect(destroyedReviewEvent.sender.send).not.toHaveBeenCalled();

    await getHandler(IPC_CHANNELS.GIT_CODE_REVIEW_STOP)({}, 'review-1');
    expect(gitTestDoubles.stopCodeReview).toHaveBeenCalledWith('review-1');
  });

  it('delegates supported remote handlers and rejects unsupported remote features', async () => {
    const gitModule = await import('../git');
    gitModule.clearAllGitServices();
    gitModule.registerGitHandlers();

    const remoteWorkdir = '/__remote__/repo';

    await getHandler(IPC_CHANNELS.GIT_STATUS)({}, remoteWorkdir);
    await getHandler(IPC_CHANNELS.GIT_LOG)({}, remoteWorkdir, 20, 0);
    await getHandler(IPC_CHANNELS.GIT_BRANCH_LIST)({}, remoteWorkdir);
    await getHandler(IPC_CHANNELS.GIT_BRANCH_CREATE)({}, remoteWorkdir, 'feature/remote', 'main');
    await getHandler(IPC_CHANNELS.GIT_BRANCH_CHECKOUT)({}, remoteWorkdir, 'feature/remote');
    await getHandler(IPC_CHANNELS.GIT_COMMIT)({}, remoteWorkdir, 'remote commit');
    await getHandler(IPC_CHANNELS.GIT_PUSH)({}, remoteWorkdir, 'origin', 'main', true);
    await getHandler(IPC_CHANNELS.GIT_PULL)({}, remoteWorkdir, 'origin', 'main');
    await getHandler(IPC_CHANNELS.GIT_FETCH)({}, remoteWorkdir, 'origin');
    await getHandler(IPC_CHANNELS.GIT_DIFF)({}, remoteWorkdir, { staged: true });
    await getHandler(IPC_CHANNELS.GIT_FILE_CHANGES)({}, remoteWorkdir);
    await getHandler(IPC_CHANNELS.GIT_FILE_DIFF)({}, remoteWorkdir, 'src/app.ts', false);
    await getHandler(IPC_CHANNELS.GIT_STAGE)({}, remoteWorkdir, ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_UNSTAGE)({}, remoteWorkdir, ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_DISCARD)({}, remoteWorkdir, ['src/app.ts']);
    await getHandler(IPC_CHANNELS.GIT_COMMIT_SHOW)({}, remoteWorkdir, 'abc123');
    await getHandler(IPC_CHANNELS.GIT_COMMIT_FILES)({}, remoteWorkdir, 'abc123');
    await getHandler(IPC_CHANNELS.GIT_COMMIT_DIFF)({}, remoteWorkdir, 'abc123', 'src/app.ts');
    await getHandler(IPC_CHANNELS.GIT_DIFF_STATS)({}, remoteWorkdir);

    expect(gitTestDoubles.remoteRepositoryBackend.getStatus).toHaveBeenCalledWith(remoteWorkdir);
    expect(gitTestDoubles.remoteRepositoryBackend.commit).toHaveBeenCalledWith(
      remoteWorkdir,
      'remote commit'
    );
    expect(gitTestDoubles.remoteRepositoryBackend.getCommitDiff).toHaveBeenCalledWith(
      remoteWorkdir,
      'abc123',
      'src/app.ts'
    );

    await expect(
      getHandler(IPC_CHANNELS.GIT_LOG)({}, remoteWorkdir, 20, 0, 'packages/core')
    ).rejects.toThrow('unsupported:submoduleHistory');
    await expect(
      getHandler(IPC_CHANNELS.GIT_COMMIT)({}, remoteWorkdir, 'remote commit', ['src/app.ts'])
    ).rejects.toThrow('unsupported:partialCommit');
    await expect(
      getHandler(IPC_CHANNELS.GIT_COMMIT_FILES)({}, remoteWorkdir, 'abc123', 'packages/core')
    ).rejects.toThrow('unsupported:submoduleCommitFiles');
    await expect(
      getHandler(IPC_CHANNELS.GIT_COMMIT_DIFF)(
        {},
        remoteWorkdir,
        'abc123',
        'src/app.ts',
        'M',
        undefined
      )
    ).rejects.toThrow('unsupported:commitDiffVariants');
    await expect(getHandler(IPC_CHANNELS.GIT_INIT)({}, remoteWorkdir)).rejects.toThrow(
      'unsupported:gitInit'
    );
    await expect(
      getHandler(IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG)({}, remoteWorkdir, {
        maxDiffLines: 100,
        timeout: 1000,
        provider: 'claude-code',
        model: 'sonnet',
      })
    ).rejects.toThrow('unsupported:aiCommitMessageGeneration');
    await expect(
      getHandler(IPC_CHANNELS.GIT_GENERATE_BRANCH_NAME)({}, remoteWorkdir, {
        prompt: 'branch',
        provider: 'claude-code',
        model: 'sonnet',
      })
    ).rejects.toThrow('unsupported:aiBranchNameGeneration');
    await expect(
      getHandler(IPC_CHANNELS.GIT_CODE_REVIEW_START)(createEvent(), remoteWorkdir, {
        provider: 'claude-code',
        model: 'sonnet',
        reviewId: 'review-remote',
      })
    ).rejects.toThrow('unsupported:codeReview');
    await expect(getHandler(IPC_CHANNELS.GIT_GH_STATUS)({}, remoteWorkdir)).rejects.toThrow(
      'unsupported:githubCliIntegration'
    );
    await expect(getHandler(IPC_CHANNELS.GIT_PR_LIST)({}, remoteWorkdir)).rejects.toThrow(
      'unsupported:pullRequestListing'
    );
    await expect(
      getHandler(IPC_CHANNELS.GIT_PR_FETCH)({}, remoteWorkdir, 1, 'pr-1')
    ).rejects.toThrow('unsupported:pullRequestFetch');
    await expect(
      getHandler(IPC_CHANNELS.GIT_BLAME)({}, remoteWorkdir, 'src/app.ts')
    ).rejects.toThrow('Git blame, revert, and reset are not supported for remote repositories yet');
    await expect(getHandler(IPC_CHANNELS.GIT_REVERT)({}, remoteWorkdir, 'abc123')).rejects.toThrow(
      'Git blame, revert, and reset are not supported for remote repositories yet'
    );
    await expect(
      getHandler(IPC_CHANNELS.GIT_RESET)({}, remoteWorkdir, 'abc123', 'mixed')
    ).rejects.toThrow('Git blame, revert, and reset are not supported for remote repositories yet');
    await expect(getHandler(IPC_CHANNELS.GIT_SUBMODULE_LIST)({}, remoteWorkdir)).rejects.toThrow(
      'unsupported:submodules'
    );
  });
});
