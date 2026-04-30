import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeProcess = EventEmitter & {
  stderr: EventEmitter;
  stdout: EventEmitter;
};

const searchServiceTestDoubles = vi.hoisted(() => {
  const spawn = vi.fn();
  const killProcessTree = vi.fn();
  const processes: FakeProcess[] = [];

  function createProcess(): FakeProcess {
    const proc = new EventEmitter() as FakeProcess;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
  }

  function reset() {
    spawn.mockReset();
    killProcessTree.mockReset();
    processes.length = 0;

    spawn.mockImplementation(() => {
      const proc = createProcess();
      processes.push(proc);
      return proc;
    });
  }

  return {
    spawn,
    killProcessTree,
    processes,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  spawn: searchServiceTestDoubles.spawn,
}));

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: searchServiceTestDoubles.killProcessTree,
}));

vi.mock('@vscode/ripgrep', () => ({
  rgPath: '/mock/node_modules/@vscode/ripgrep/bin/rg',
}));

describe('SearchService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    searchServiceTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists files through ripgrep and ranks fuzzy file matches', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const emptyQueryPromise = service.searchFiles({
      rootPath: '/repo',
      query: '   ',
      maxResults: 2,
    });

    const filesProc = searchServiceTestDoubles.processes[0];
    if (!filesProc) {
      throw new Error('Missing search process');
    }
    filesProc.stdout.emit('data', '/repo/src/index.ts\n/repo/README.md\n');
    filesProc.emit('close', 0);

    await expect(emptyQueryPromise).resolves.toEqual([
      {
        path: '/repo/README.md',
        name: 'README.md',
        relativePath: 'README.md',
        score: 0,
      },
      {
        path: '/repo/src/index.ts',
        name: 'index.ts',
        relativePath: 'src/index.ts',
        score: 0,
      },
    ]);

    const fuzzyPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'ind',
      maxResults: 5,
    });

    await expect(fuzzyPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/src/index.ts',
        name: 'index.ts',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenCalledTimes(1);
  });

  it('includes derived directory entries when requested', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const directoryPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'components',
      maxResults: 5,
      includeDirectories: true,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing directory search process');
    }
    proc.stdout.emit(
      'data',
      '/repo/src/index.ts\n/repo/src/components/Button.tsx\n/repo/src/components/forms/Input.tsx\n'
    );
    proc.emit('close', 0);

    const results = await directoryPromise;
    expect(results[0]).toEqual(
      expect.objectContaining({
        kind: 'directory',
        name: 'components',
        path: '/repo/src/components',
        relativePath: 'src/components',
      })
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'file',
          path: '/repo/src/components/Button.tsx',
        }),
        expect.objectContaining({
          kind: 'file',
          path: '/repo/src/components/forms/Input.tsx',
        }),
      ])
    );
  });

  it('falls back to the PATH ripgrep binary when the bundled binary is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const fallbackPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'App',
      maxResults: 5,
    });

    const missingBundledProc = searchServiceTestDoubles.processes[0];
    if (!missingBundledProc) {
      throw new Error('Missing bundled ripgrep process');
    }
    missingBundledProc.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pathRipgrepProc = searchServiceTestDoubles.processes[1];
    if (!pathRipgrepProc) {
      throw new Error('Missing PATH ripgrep process');
    }
    pathRipgrepProc.stdout.emit('data', '/repo/src/App.tsx\n');
    pathRipgrepProc.emit('close', 0);

    await expect(fallbackPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/src/App.tsx',
        relativePath: 'src/App.tsx',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(
      1,
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.any(Array)
    );
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(2, 'rg', expect.any(Array));
    expect(errorSpy).toHaveBeenCalledWith(
      '[SearchService] ripgrep --files spawn error:',
      'spawn ENOENT'
    );
  });

  it('falls back to the PATH ripgrep binary when the bundled content search binary is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const fallbackPromise = service.searchContent({
      rootPath: '/repo',
      query: 'Design Principles',
      maxResults: 5,
    });

    const missingBundledProc = searchServiceTestDoubles.processes[0];
    if (!missingBundledProc) {
      throw new Error('Missing bundled ripgrep process');
    }
    missingBundledProc.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pathRipgrepProc = searchServiceTestDoubles.processes[1];
    if (!pathRipgrepProc) {
      throw new Error('Missing PATH ripgrep process');
    }
    pathRipgrepProc.stdout.emit(
      'data',
      `${JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/repo/.impeccable.md' },
          line_number: 12,
          lines: { text: '### Design Principles\n' },
          submatches: [{ start: 4, end: 21 }],
        },
      })}\n`
    );
    pathRipgrepProc.emit('close', 0);

    await expect(fallbackPromise).resolves.toEqual({
      matches: [
        {
          path: '/repo/.impeccable.md',
          relativePath: '.impeccable.md',
          line: 12,
          column: 4,
          matchLength: 17,
          content: '### Design Principles',
        },
      ],
      totalMatches: 1,
      totalFiles: 1,
      truncated: false,
    });
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(
      1,
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.any(Array)
    );
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(2, 'rg', expect.any(Array));
    expect(errorSpy).toHaveBeenCalledWith(
      '[SearchService] ripgrep content spawn error:',
      'spawn ENOENT'
    );
  });

  it('passes --no-ignore to ripgrep file listing when gitignore filtering is disabled', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const promise = service.searchFiles({
      rootPath: '/repo',
      query: 'generated',
      maxResults: 5,
      useGitignore: false,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing file search process');
    }
    proc.stdout.emit('data', '/repo/generated/output.ts\n');
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/generated/output.ts',
        relativePath: 'generated/output.ts',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenCalledWith(
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.arrayContaining(['--files', '--no-ignore', '/repo'])
    );
  });

  it('includes hidden files in file and content search scope while preserving explicit exclusions', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const fileSearchPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'impeccable',
      maxResults: 5,
    });

    const fileProc = searchServiceTestDoubles.processes[0];
    if (!fileProc) {
      throw new Error('Missing hidden file listing process');
    }
    fileProc.stdout.emit('data', '/repo/.impeccable.md\n');
    fileProc.emit('close', 0);

    await expect(fileSearchPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/.impeccable.md',
        relativePath: '.impeccable.md',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(
      1,
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.arrayContaining(['--files', '--hidden', '--glob', '!.git/**'])
    );

    const contentSearchPromise = service.searchContent({
      rootPath: '/repo',
      query: 'Design Principles',
      maxResults: 5,
    });

    const contentProc = searchServiceTestDoubles.processes[1];
    if (!contentProc) {
      throw new Error('Missing hidden content search process');
    }
    contentProc.stdout.emit(
      'data',
      `${JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/repo/.impeccable.md' },
          line_number: 12,
          lines: { text: '### Design Principles\n' },
          submatches: [{ start: 4, end: 21 }],
        },
      })}\n`
    );
    contentProc.emit('close', 0);

    await expect(contentSearchPromise).resolves.toEqual({
      matches: [
        expect.objectContaining({
          path: '/repo/.impeccable.md',
          relativePath: '.impeccable.md',
          content: '### Design Principles',
        }),
      ],
      totalMatches: 1,
      totalFiles: 1,
      truncated: false,
    });
    expect(searchServiceTestDoubles.spawn).toHaveBeenNthCalledWith(
      2,
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.arrayContaining(['--json', '--hidden', '--glob', '!.git/**'])
    );
  });

  it('reuses a short-lived file listing cache for repeated file queries', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const firstPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'app',
      maxResults: 5,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing cache warmup search process');
    }
    proc.stdout.emit('data', '/repo/src/App.tsx\n/repo/src/Button.tsx\n');
    proc.emit('close', 0);

    await expect(firstPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/src/App.tsx',
      }),
    ]);

    const secondResults = await service.searchFiles({
      rootPath: '/repo',
      query: 'btn',
      maxResults: 5,
    });

    expect(secondResults).toEqual([
      expect.objectContaining({
        path: '/repo/src/Button.tsx',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenCalledTimes(1);
  });

  it('does not cache cancelled file listings', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const cancelledPromise = service.searchFiles({
      requestId: 'cancel-cache',
      rootPath: '/repo',
      query: 'app',
      maxResults: 5,
    });
    expect(service.cancelSearch('cancel-cache')).toBe(true);
    await expect(cancelledPromise).resolves.toEqual([]);

    const nextPromise = service.searchFiles({
      rootPath: '/repo',
      query: 'app',
      maxResults: 5,
    });
    const proc = searchServiceTestDoubles.processes[1];
    if (!proc) {
      throw new Error('Missing follow-up file search process');
    }
    proc.stdout.emit('data', '/repo/src/App.tsx\n');
    proc.emit('close', 0);

    await expect(nextPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/src/App.tsx',
      }),
    ]);
    expect(searchServiceTestDoubles.spawn).toHaveBeenCalledTimes(2);
  });

  it('parses ripgrep JSON content matches and respects truncation', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const promise = service.searchContent({
      rootPath: '/repo',
      query: 'needle',
      maxResults: 1,
      wholeWord: true,
      regex: false,
      filePattern: '*.ts',
      useGitignore: false,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing content search process');
    }

    proc.stdout.emit(
      'data',
      `${JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/repo/src/a.ts' },
          line_number: 10,
          lines: { text: 'const needle = true;\n' },
          submatches: [{ start: 6, end: 12 }],
        },
      })}\n`
    );
    proc.stdout.emit(
      'data',
      `${JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/repo/src/b.ts' },
          line_number: 12,
          lines: { text: 'needle again\n' },
          submatches: [{ start: 0, end: 6 }],
        },
      })}\n`
    );
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual({
      matches: [
        {
          path: '/repo/src/a.ts',
          relativePath: 'src/a.ts',
          line: 10,
          column: 6,
          matchLength: 6,
          content: 'const needle = true;',
        },
      ],
      totalMatches: 2,
      totalFiles: 2,
      truncated: true,
    });

    expect(searchServiceTestDoubles.spawn).toHaveBeenCalledWith(
      '/mock/node_modules/@vscode/ripgrep/bin/rg',
      expect.arrayContaining(['--json', '--no-ignore', '-i', '-w', '-F', '--glob', '*.ts'])
    );
  });

  it('returns early for empty content queries and parses buffered close results', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    await expect(
      service.searchContent({
        rootPath: '/repo',
        query: '   ',
      })
    ).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: false,
    });
    expect(searchServiceTestDoubles.processes).toHaveLength(0);

    const bufferedClosePromise = service.searchContent({
      rootPath: '/repo',
      query: 'needle',
      caseSensitive: true,
      regex: true,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing buffered close search process');
    }

    proc.stderr.emit('data', 'rg syntax warning');
    proc.stdout.emit(
      'data',
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/repo/src/final.ts' },
          line_number: 4,
          lines: { text: 'needle tail\n' },
          submatches: [{ start: 0, end: 6 }],
        },
      })
    );
    proc.emit('close', 2);

    await expect(bufferedClosePromise).resolves.toEqual({
      matches: [
        {
          path: '/repo/src/final.ts',
          relativePath: 'src/final.ts',
          line: 4,
          column: 0,
          matchLength: 6,
          content: 'needle tail',
        },
      ],
      totalMatches: 1,
      totalFiles: 1,
      truncated: false,
    });

    expect(errorSpy).toHaveBeenCalledWith('[SearchService] ripgrep error:', 'rg syntax warning');
  });

  it('returns an error payload for invalid ripgrep content queries', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const promise = service.searchContent({
      rootPath: '/repo',
      query: '[',
      regex: true,
    });

    const proc = searchServiceTestDoubles.processes[0];
    if (!proc) {
      throw new Error('Missing invalid regex search process');
    }
    proc.stderr.emit('data', 'regex parse error');
    proc.emit('close', 2);

    await expect(promise).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: false,
      error: 'Invalid search expression',
    });
    expect(errorSpy).toHaveBeenCalledWith('[SearchService] ripgrep error:', 'regex parse error');
  });

  it('returns empty content results on spawn error and kills timed out searches', async () => {
    vi.useFakeTimers();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const spawnErrorPromise = service.searchContent({
      rootPath: '/repo',
      query: 'needle',
    });
    const errorProc = searchServiceTestDoubles.processes[0];
    if (!errorProc) {
      throw new Error('Missing error search process');
    }
    errorProc.emit('error', new Error('spawn failed'));
    await vi.advanceTimersByTimeAsync(0);

    const fallbackErrorProc = searchServiceTestDoubles.processes[1];
    if (!fallbackErrorProc) {
      throw new Error('Missing fallback error search process');
    }
    fallbackErrorProc.emit('error', new Error('fallback spawn failed'));

    await expect(spawnErrorPromise).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: false,
    });

    const timeoutPromise = service.searchFiles({
      rootPath: '/repo',
      query: '',
    });
    const timeoutProc = searchServiceTestDoubles.processes[2];
    if (!timeoutProc) {
      throw new Error('Missing timeout search process');
    }

    await vi.advanceTimersByTimeAsync(10000);

    await expect(timeoutPromise).resolves.toEqual([]);
    expect(timeoutProc.listenerCount('close')).toBe(0);
    expect(timeoutProc.listenerCount('error')).toBe(0);
    expect(timeoutProc.stdout.listenerCount('data')).toBe(0);

    expect(errorSpy).toHaveBeenCalled();
  });

  it('cancels active ripgrep searches by request id', async () => {
    const { SearchService } = await import('../SearchService');
    const service = new SearchService();

    const filePromise = service.searchFiles({
      requestId: 'files-1',
      rootPath: '/repo',
      query: 'component',
    });
    const fileProc = searchServiceTestDoubles.processes[0];
    if (!fileProc) {
      throw new Error('Missing cancellable file search process');
    }

    expect(service.cancelSearch('files-1')).toBe(true);
    await expect(filePromise).resolves.toEqual([]);
    expect(searchServiceTestDoubles.killProcessTree).toHaveBeenCalledWith(fileProc);
    expect(fileProc.listenerCount('close')).toBe(0);
    expect(fileProc.listenerCount('error')).toBe(0);
    expect(fileProc.stdout.listenerCount('data')).toBe(0);

    const contentPromise = service.searchContent({
      requestId: 'content-1',
      rootPath: '/repo',
      query: 'needle',
    });
    const contentProc = searchServiceTestDoubles.processes[1];
    if (!contentProc) {
      throw new Error('Missing cancellable content search process');
    }

    expect(service.cancelSearch('content-1')).toBe(true);
    await expect(contentPromise).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: true,
    });
    expect(searchServiceTestDoubles.killProcessTree).toHaveBeenCalledWith(contentProc);
    expect(contentProc.listenerCount('close')).toBe(0);
    expect(contentProc.listenerCount('error')).toBe(0);
    expect(contentProc.stdout.listenerCount('data')).toBe(0);
    expect(contentProc.stderr.listenerCount('data')).toBe(0);

    expect(service.cancelSearch('content-1')).toBe(false);
  });
});
