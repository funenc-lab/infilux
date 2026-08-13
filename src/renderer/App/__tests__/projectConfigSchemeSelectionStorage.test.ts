import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

async function loadStorageModule(options?: {
  platform?: string;
  initialStorage?: Record<string, string>;
}) {
  vi.resetModules();

  const localStorageMock = createLocalStorageMock(options?.initialStorage);
  vi.stubGlobal('localStorage', localStorageMock);

  if (options?.platform) {
    vi.stubGlobal('navigator', { platform: options.platform });
  }

  const module = await import('../storage');
  return {
    ...module,
    localStorageMock,
  };
}

describe('project config scheme selection storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads and writes repository scheme selections using normalized paths', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        'enso-project-config-scheme-selections': JSON.stringify({
          '/repo/main': {
            schemeId: 'scheme-alpha',
            updatedAt: 1,
          },
        }),
      },
    });

    expect(env.getProjectConfigSchemeSelection('/Repo/Main')).toEqual({
      schemeId: 'scheme-alpha',
      updatedAt: 1,
    });

    env.saveProjectConfigSchemeSelection('/Repo/Main', {
      schemeId: 'scheme-beta',
      updatedAt: 2,
    });

    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.PROJECT_CONFIG_SCHEME_SELECTIONS,
      JSON.stringify({
        '/repo/main': {
          schemeId: 'scheme-beta',
          updatedAt: 2,
        },
      })
    );
  });

  it('reads and writes worktree scheme selections with parent repository paths', async () => {
    const env = await loadStorageModule({ platform: 'MacIntel' });

    env.saveWorktreeConfigSchemeSelection('/Repo/Main', '/Repo/Main/worktrees/Feature', {
      schemeId: 'scheme-alpha',
      updatedAt: 3,
    });

    expect(env.getWorktreeConfigSchemeSelection('/Repo/Main/worktrees/Feature')).toEqual({
      repoPath: '/repo/main',
      schemeId: 'scheme-alpha',
      updatedAt: 3,
    });
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      env.STORAGE_KEYS.WORKTREE_CONFIG_SCHEME_SELECTIONS,
      JSON.stringify({
        '/repo/main/worktrees/feature': {
          repoPath: '/repo/main',
          schemeId: 'scheme-alpha',
          updatedAt: 3,
        },
      })
    );
  });

  it('ignores worktree scheme selections stored for a different repository', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        'enso-worktree-config-scheme-selections': JSON.stringify({
          '/repo/main/worktrees/feature': {
            repoPath: '/repo/other',
            schemeId: 'scheme-alpha',
            updatedAt: 3,
          },
        }),
      },
    });

    expect(
      env.getWorktreeConfigSchemeSelection('/Repo/Main/worktrees/Feature', '/Repo/Main')
    ).toBeNull();
    expect(env.getWorktreeConfigSchemeSelection('/Repo/Main/worktrees/Feature')).toEqual({
      repoPath: '/repo/other',
      schemeId: 'scheme-alpha',
      updatedAt: 3,
    });
  });

  it('clears selections and ignores invalid persisted values', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        'enso-project-config-scheme-selections': JSON.stringify({
          '/repo/main': {
            schemeId: '',
            updatedAt: 'invalid',
          },
        }),
        'enso-worktree-config-scheme-selections': '{invalid',
      },
    });

    expect(env.getProjectConfigSchemeSelection('/repo/main')).toBeNull();
    expect(env.getWorktreeConfigSchemeSelection('/repo/main/worktrees/feature')).toBeNull();

    env.saveProjectConfigSchemeSelection('/repo/main', null);
    env.saveWorktreeConfigSchemeSelection('/repo/main', '/repo/main/worktrees/feature', null);

    expect(env.getProjectConfigSchemeSelection('/repo/main')).toBeNull();
    expect(env.getWorktreeConfigSchemeSelection('/repo/main/worktrees/feature')).toBeNull();
  });

  it('removes every repository and worktree selection that references a deleted scheme', async () => {
    const env = await loadStorageModule({ platform: 'MacIntel' });

    env.saveProjectConfigSchemeSelection('/Repo/Alpha', {
      schemeId: 'scheme-shared',
      updatedAt: 1,
    });
    env.saveProjectConfigSchemeSelection('/Repo/Beta', {
      schemeId: 'scheme-other',
      updatedAt: 2,
    });
    env.saveWorktreeConfigSchemeSelection('/Repo/Alpha', '/Repo/Alpha/worktrees/one', {
      schemeId: 'scheme-shared',
      updatedAt: 3,
    });
    env.saveWorktreeConfigSchemeSelection('/Repo/Beta', '/Repo/Beta/worktrees/two', {
      schemeId: 'scheme-other',
      updatedAt: 4,
    });

    expect(env.removeProjectConfigSchemeReferences('scheme-shared')).toEqual({
      repositorySelections: 1,
      worktreeSelections: 1,
    });
    expect(env.getProjectConfigSchemeSelection('/Repo/Alpha')).toBeNull();
    expect(env.getProjectConfigSchemeSelection('/Repo/Beta')).toEqual({
      schemeId: 'scheme-other',
      updatedAt: 2,
    });
    expect(env.getWorktreeConfigSchemeSelection('/Repo/Alpha/worktrees/one')).toBeNull();
    expect(env.getWorktreeConfigSchemeSelection('/Repo/Beta/worktrees/two')).toEqual({
      repoPath: '/repo/beta',
      schemeId: 'scheme-other',
      updatedAt: 4,
    });
  });

  it('preserves meaningful legacy initialization settings as direct repository overrides', async () => {
    const env = await loadStorageModule({
      platform: 'MacIntel',
      initialStorage: {
        'enso-repository-settings': JSON.stringify({
          '/repo/defaults': {
            autoInitWorktree: false,
            initScript: '',
            hidden: false,
          },
          '/repo/initialized': {
            autoInitWorktree: true,
            initScript: 'pnpm install',
            hidden: false,
          },
        }),
      },
    });

    expect(env.getRepositoryWorktreeInitializationOverride('/Repo/Defaults')).toBeNull();
    expect(env.getRepositoryWorktreeInitializationOverride('/Repo/Initialized')).toEqual({
      autoInitWorktree: true,
      initScript: 'pnpm install',
    });
  });

  it('persists an explicit repository initialization override', async () => {
    const env = await loadStorageModule({ platform: 'MacIntel' });

    env.saveRepositorySettings('/Repo/Main', {
      hidden: false,
      autoInitWorktree: false,
      initScript: '',
      worktreeInitializationOverride: {
        autoInitWorktree: false,
        initScript: '',
      },
    });

    expect(env.getRepositoryWorktreeInitializationOverride('/Repo/Main')).toEqual({
      autoInitWorktree: false,
      initScript: '',
    });
  });
});
