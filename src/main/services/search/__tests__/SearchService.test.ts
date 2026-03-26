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

vi.mock('../../utils/processUtils', () => ({
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

    const fuzzyProc = searchServiceTestDoubles.processes[1];
    if (!fuzzyProc) {
      throw new Error('Missing fuzzy search process');
    }
    fuzzyProc.stdout.emit('data', '/repo/src/index.ts\n/repo/docs/guide.md\n');
    fuzzyProc.emit('close', 0);

    await expect(fuzzyPromise).resolves.toEqual([
      expect.objectContaining({
        path: '/repo/src/index.ts',
        name: 'index.ts',
      }),
    ]);
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
    const timeoutProc = searchServiceTestDoubles.processes[1];
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
});
