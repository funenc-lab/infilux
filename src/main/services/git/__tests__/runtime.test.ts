import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeSpawnResult = EventEmitter & {
  stderr: EventEmitter;
  stdout: EventEmitter;
};

const runtimeTestDoubles = vi.hoisted(() => {
  const getProxyEnvVars = vi.fn();
  const getEnhancedPath = vi.fn();
  const withSafeDirectoryEnv = vi.fn();
  const spawn = vi.fn();
  const env = vi.fn();
  const simpleGit = vi.fn();

  function createSpawnedProcess(): FakeSpawnResult {
    const proc = new EventEmitter() as FakeSpawnResult;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
  }

  function reset() {
    getProxyEnvVars.mockReset();
    getEnhancedPath.mockReset();
    withSafeDirectoryEnv.mockReset();
    spawn.mockReset();
    env.mockReset();
    simpleGit.mockReset();

    getProxyEnvVars.mockReturnValue({ HTTPS_PROXY: 'http://proxy:7890' });
    getEnhancedPath.mockReturnValue('/enhanced/bin');
    withSafeDirectoryEnv.mockImplementation((inputEnv: NodeJS.ProcessEnv) => inputEnv);
    spawn.mockImplementation(() => createSpawnedProcess());
    env.mockImplementation((inputEnv: NodeJS.ProcessEnv) => ({
      kind: 'simple-git-instance',
      env: inputEnv,
    }));
    simpleGit.mockImplementation((options: Record<string, unknown>) => ({
      options,
      env,
    }));
  }

  return {
    getProxyEnvVars,
    getEnhancedPath,
    withSafeDirectoryEnv,
    spawn,
    env,
    simpleGit,
    createSpawnedProcess,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  spawn: runtimeTestDoubles.spawn,
}));

vi.mock('../safeDirectory', () => ({
  withSafeDirectoryEnv: runtimeTestDoubles.withSafeDirectoryEnv,
}));

vi.mock('../../proxy/ProxyConfig', () => ({
  getProxyEnvVars: runtimeTestDoubles.getProxyEnvVars,
}));

vi.mock('../../terminal/PtyManager', () => ({
  getEnhancedPath: runtimeTestDoubles.getEnhancedPath,
}));

vi.mock('simple-git', () => ({
  default: runtimeTestDoubles.simpleGit,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('git runtime helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('converts WSL UNC paths between git and Windows forms on win32', async () => {
    setPlatform('win32');

    const runtime = await import('../runtime');

    const repoPath = '\\\\wsl$\\Ubuntu\\home\\tester\\repo';
    const gitPath = '\\\\wsl$\\Ubuntu\\home\\tester\\repo\\src\\index.ts';

    expect(runtime.isWslGitRepository(repoPath)).toBe(true);
    expect(runtime.toGitPath(repoPath, gitPath)).toBe('/home/tester/repo/src/index.ts');
    expect(runtime.fromGitPath(repoPath, '/home/tester/repo/src/index.ts')).toBe(
      '\\\\wsl$\\Ubuntu\\home\\tester\\repo\\src\\index.ts'
    );
    expect(runtime.normalizeGitRelativePath('src\\nested\\file.ts')).toBe('src/nested/file.ts');
  });

  it('creates simple-git instances and spawns git processes with WSL-aware options', async () => {
    setPlatform('win32');

    const runtime = await import('../runtime');

    runtimeTestDoubles.withSafeDirectoryEnv.mockImplementation(
      (inputEnv: NodeJS.ProcessEnv, workdir: string) => ({
        ...inputEnv,
        SAFE_DIRECTORY: workdir,
      })
    );

    const baseDir = '\\\\wsl$\\Ubuntu\\home\\tester\\repo';
    const env = runtime.createGitEnv(baseDir);

    expect(env.PATH).toBe('/enhanced/bin');
    expect(env.HTTPS_PROXY).toBe('http://proxy:7890');
    expect(env.SAFE_DIRECTORY).toBe(baseDir);

    const simpleGitInstance = runtime.createSimpleGit(baseDir);
    expect(runtimeTestDoubles.simpleGit).toHaveBeenCalledWith({
      baseDir,
      timeout: { block: 30000 },
      maxConcurrentProcesses: 3,
      binary: ['wsl.exe', 'git'],
      spawnOptions: {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    });
    expect(simpleGitInstance).toEqual(
      expect.objectContaining({
        kind: 'simple-git-instance',
      })
    );

    runtime.spawnGit(baseDir, ['show', '\\\\wsl$\\Ubuntu\\home\\tester\\repo\\README.md'], {
      cwd: baseDir,
      windowsHide: true,
    });

    expect(runtimeTestDoubles.spawn).toHaveBeenCalledWith(
      'wsl.exe',
      ['git', 'show', '/home/tester/repo/README.md'],
      expect.objectContaining({
        cwd: baseDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: expect.objectContaining({
          SAFE_DIRECTORY: baseDir,
        }),
      })
    );
  });

  it('falls back to standard git commands outside WSL repositories', async () => {
    setPlatform('linux');

    const runtime = await import('../runtime');

    expect(runtime.isWslGitRepository('/repo')).toBe(false);
    expect(runtime.toGitPath('/repo', '/repo/src/index.ts')).toBe('/repo/src/index.ts');
    expect(runtime.fromGitPath('/repo', '/repo/src/index.ts')).toBe('/repo/src/index.ts');

    runtime.createSimpleGit('/repo', {
      maxConcurrentProcesses: 8,
    });
    expect(runtimeTestDoubles.simpleGit).toHaveBeenCalledWith({
      baseDir: '/repo',
      timeout: { block: 30000 },
      maxConcurrentProcesses: 8,
      spawnOptions: {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    });

    runtime.spawnGit('/repo', ['status'], { cwd: '/repo' });
    expect(runtimeTestDoubles.spawn).toHaveBeenCalledWith(
      'git',
      ['status'],
      expect.objectContaining({
        cwd: '/repo',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });

  it('patches simple-git child_process spawn calls to inject compatible git stdio', async () => {
    const runtime = await import('../runtime');

    const originalSpawn = vi.fn();
    const fakeChildProcessModule = {
      spawn: originalSpawn,
    } as unknown as Parameters<typeof runtime.installGitSpawnCompatibilityPatch>[0];

    runtime.installGitSpawnCompatibilityPatch(fakeChildProcessModule);
    const patchedSpawn = fakeChildProcessModule.spawn;

    runtime.installGitSpawnCompatibilityPatch(fakeChildProcessModule);
    expect(fakeChildProcessModule.spawn).toBe(patchedSpawn);

    fakeChildProcessModule.spawn('git', ['status'], { cwd: '/repo' });
    expect(originalSpawn).toHaveBeenCalledWith(
      'git',
      ['status'],
      expect.objectContaining({
        cwd: '/repo',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );

    fakeChildProcessModule.spawn('git', ['status'], {
      cwd: '/repo',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(originalSpawn).toHaveBeenLastCalledWith(
      'git',
      ['status'],
      expect.objectContaining({
        cwd: '/repo',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );

    fakeChildProcessModule.spawn('bash', ['-lc', 'git status'], { cwd: '/repo' });
    expect(originalSpawn).toHaveBeenLastCalledWith('bash', ['-lc', 'git status'], { cwd: '/repo' });
  });
});
