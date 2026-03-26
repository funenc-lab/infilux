import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbResponse = {
  openError?: Error;
  row?: { value: string } | undefined;
  queryError?: Error;
  closeError?: Error;
};

const recentProjectsTestDoubles = vi.hoisted(() => {
  const access = vi.fn();
  const homedir = vi.fn();
  const fileUriToPath = vi.fn();
  const dbResponses = new Map<string, DbResponse>();
  const pendingGets = new Map<
    string,
    (error: Error | null, row?: { value: string } | undefined) => void
  >();
  const databasePaths: string[] = [];

  class Database {
    public configure = vi.fn();
    public get = vi.fn(
      (
        _sql: string,
        _params: string[],
        callback: (error: Error | null, row?: { value: string } | undefined) => void
      ) => {
        const response = dbResponses.get(this.path) ?? {};
        if (response.queryError || response.row !== undefined) {
          callback(response.queryError ?? null, response.row);
          return;
        }
        pendingGets.set(this.path, callback);
      }
    );
    public close = vi.fn((callback: (error: Error | null) => void) => {
      const response = dbResponses.get(this.path) ?? {};
      callback(response.closeError ?? null);
    });

    constructor(
      public path: string,
      _mode: number,
      callback: (error: Error | null) => void
    ) {
      databasePaths.push(path);
      const response = dbResponses.get(path) ?? {};
      queueMicrotask(() => {
        callback(response.openError ?? null);
      });
    }
  }

  function setDbResponse(path: string, response: DbResponse) {
    dbResponses.set(path, response);
  }

  function resolvePendingGet(path: string, response: DbResponse) {
    pendingGets.get(path)?.(response.queryError ?? null, response.row);
    pendingGets.delete(path);
  }

  function hasPendingGet(path: string) {
    return pendingGets.has(path);
  }

  function reset() {
    access.mockReset();
    homedir.mockReset();
    fileUriToPath.mockReset();
    homedir.mockReturnValue('/Users/tester');
    dbResponses.clear();
    pendingGets.clear();
    databasePaths.length = 0;
  }

  return {
    access,
    homedir,
    fileUriToPath,
    Database,
    OPEN_READONLY: 1,
    databasePaths,
    reset,
    setDbResponse,
    resolvePendingGet,
    hasPendingGet,
  };
});

vi.mock('node:fs/promises', () => ({
  access: recentProjectsTestDoubles.access,
}));

vi.mock('node:os', () => ({
  homedir: recentProjectsTestDoubles.homedir,
}));

vi.mock('@shared/utils/fileUrl', () => ({
  fileUriToPath: recentProjectsTestDoubles.fileUriToPath,
}));

vi.mock('sqlite3', () => ({
  default: {
    Database: recentProjectsTestDoubles.Database,
    OPEN_READONLY: recentProjectsTestDoubles.OPEN_READONLY,
  },
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalAppData = process.env.APPDATA;

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

function buildDbPath(platform: NodeJS.Platform, configDir: string): string {
  if (platform === 'darwin') {
    return `/Users/tester/Library/Application Support/${configDir}/User/globalStorage/state.vscdb`;
  }
  if (platform === 'win32') {
    return `/Users/tester/AppData/Roaming/${configDir}/User/globalStorage/state.vscdb`;
  }
  return `/Users/tester/.config/${configDir}/User/globalStorage/state.vscdb`;
}

describe('RecentProjectsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    recentProjectsTestDoubles.reset();
    delete process.env.APPDATA;
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = originalAppData;
    }
    vi.restoreAllMocks();
  });

  it('reads, filters, and deduplicates recent projects across editors on macOS', async () => {
    setPlatform('darwin');

    const codeDb = buildDbPath('darwin', 'Code');
    const cursorDb = buildDbPath('darwin', 'Cursor');
    const codiumDb = buildDbPath('darwin', 'VSCodium');
    const existingPaths = new Set([codeDb, cursorDb, codiumDb, '/repo/alpha', '/repo/beta']);

    recentProjectsTestDoubles.access.mockImplementation(async (target: string) => {
      if (!existingPaths.has(target)) {
        throw new Error('missing');
      }
    });
    recentProjectsTestDoubles.fileUriToPath.mockImplementation((uri: string) => {
      if (uri === 'file:///repo/alpha') return '/repo/alpha';
      if (uri === 'file:///repo/beta') return '/repo/beta';
      if (uri === 'file:///REPO/ALPHA') return '/REPO/ALPHA';
      if (uri === 'file:///repo/missing') return '/repo/missing';
      return null;
    });
    recentProjectsTestDoubles.setDbResponse(codeDb, {
      row: {
        value: JSON.stringify({
          entries: [
            { folderUri: 'file:///repo/alpha' },
            { folderUri: 'file:///repo/beta' },
            { folderUri: 'file:///repo/missing' },
            { folderUri: 123 },
          ],
        }),
      },
    });
    recentProjectsTestDoubles.setDbResponse(cursorDb, {
      row: {
        value: JSON.stringify({
          entries: [{ folderUri: 'file:///REPO/ALPHA' }],
        }),
      },
    });
    recentProjectsTestDoubles.setDbResponse(codiumDb, {
      row: { value: '' },
    });

    const { getRecentProjects } = await import('../RecentProjectsService');

    await expect(getRecentProjects()).resolves.toEqual([
      {
        path: '/repo/alpha',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
      {
        path: '/repo/beta',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
    ]);

    expect(recentProjectsTestDoubles.fileUriToPath).toHaveBeenCalledWith(
      'file:///repo/alpha',
      'darwin'
    );
  });

  it('handles invalid JSON, database failures, and close warnings on Windows fallback paths', async () => {
    setPlatform('win32');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const codeDb = buildDbPath('win32', 'Code');
    const cursorDb = buildDbPath('win32', 'Cursor');

    recentProjectsTestDoubles.access.mockImplementation(async (target: string) => {
      if (target !== codeDb && target !== cursorDb) {
        throw new Error('missing');
      }
    });
    recentProjectsTestDoubles.setDbResponse(codeDb, {
      row: {
        value: '{invalid-json',
      },
      closeError: new Error('close failed'),
    });
    recentProjectsTestDoubles.setDbResponse(cursorDb, {
      queryError: Object.assign(new Error('busy'), { code: 'SQLITE_BUSY' }),
    });

    const { getRecentProjects } = await import('../RecentProjectsService');

    await expect(getRecentProjects()).resolves.toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith(
      `[RecentProjects] Failed to close database ${codeDb}:`,
      expect.any(Error)
    );
    expect(warnSpy).toHaveBeenCalledWith('[RecentProjects] Invalid JSON in VS Code database');
    expect(warnSpy).toHaveBeenCalledWith(
      '[RecentProjects] Failed to read from Cursor: SQLITE_BUSY'
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(recentProjectsTestDoubles.databasePaths).toEqual(
      expect.arrayContaining([codeDb, cursorDb])
    );
  });

  it('deduplicates in-flight refreshes and serves stale cache while revalidating on Linux', async () => {
    setPlatform('linux');
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const codeDb = buildDbPath('linux', 'Code');
    const projectPath = '/repo/live';

    recentProjectsTestDoubles.access.mockImplementation(async (target: string) => {
      if (target !== codeDb && target !== projectPath && target !== '/repo/fresh') {
        throw new Error('missing');
      }
    });
    recentProjectsTestDoubles.fileUriToPath.mockImplementation((uri: string) => {
      if (uri === 'file:///repo/live') return '/repo/live';
      if (uri === 'file:///repo/fresh') return '/repo/fresh';
      return null;
    });

    const { getRecentProjects } = await import('../RecentProjectsService');

    const firstPromise = getRecentProjects();
    const secondPromise = getRecentProjects();
    await vi.waitFor(() => {
      expect(recentProjectsTestDoubles.hasPendingGet(codeDb)).toBe(true);
    });

    recentProjectsTestDoubles.resolvePendingGet(codeDb, {
      row: {
        value: JSON.stringify({
          entries: [{ folderUri: 'file:///repo/live' }],
        }),
      },
    });

    await expect(firstPromise).resolves.toEqual([
      {
        path: '/repo/live',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
    ]);
    await expect(secondPromise).resolves.toEqual([
      {
        path: '/repo/live',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
    ]);
    expect(recentProjectsTestDoubles.databasePaths).toEqual([codeDb]);

    await expect(getRecentProjects()).resolves.toEqual([
      {
        path: '/repo/live',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
    ]);

    now += 5 * 60 * 1000 + 1;
    const staleResultPromise = getRecentProjects();
    await vi.waitFor(() => {
      expect(recentProjectsTestDoubles.hasPendingGet(codeDb)).toBe(true);
    });

    recentProjectsTestDoubles.resolvePendingGet(codeDb, {
      row: {
        value: JSON.stringify({
          entries: [{ folderUri: 'file:///repo/fresh' }],
        }),
      },
    });

    await expect(staleResultPromise).resolves.toEqual([
      {
        path: '/repo/live',
        editorName: 'VS Code',
        editorBundleId: 'com.microsoft.VSCode',
      },
    ]);

    await vi.waitFor(async () => {
      await expect(getRecentProjects()).resolves.toEqual([
        {
          path: '/repo/fresh',
          editorName: 'VS Code',
          editorBundleId: 'com.microsoft.VSCode',
        },
      ]);
    });
  });
});
