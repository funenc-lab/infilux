import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractRepoName,
  findHostDirname,
  generateClonePath,
  getDefaultBaseDir,
  isValidGitUrl,
  parseGitUrl,
} from '../gitClone';

describe('gitClone utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the Infilux default clone base directory when HOME is available', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          HOME: '/Users/tester',
          platform: 'darwin',
        },
      },
    });

    expect(getDefaultBaseDir()).toBe('/Users/tester/infilux/repos');
  });

  it('falls back to a tilde-based Infilux path when HOME is not available', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          HOME: '',
          platform: 'linux',
        },
      },
    });

    expect(getDefaultBaseDir()).toBe('~/infilux/repos');
  });

  it('parses https and ssh git urls into structured parts', () => {
    expect(parseGitUrl('https://github.com/openai/codex.git')).toEqual({
      protocol: 'https',
      host: 'github.com',
      owner: 'openai',
      repo: 'codex',
      pathSegments: ['openai', 'codex'],
    });
    expect(parseGitUrl('git@github.com:openai/codex.git')).toEqual({
      protocol: 'ssh',
      host: 'github.com',
      owner: 'openai',
      repo: 'codex',
      pathSegments: ['openai', 'codex'],
    });
    expect(parseGitUrl('ssh://git@gitlab.example.com:2222/team/platform/codex.git')).toEqual({
      protocol: 'ssh',
      host: 'gitlab.example.com',
      owner: 'team',
      repo: 'codex',
      pathSegments: ['team', 'platform', 'codex'],
    });
  });

  it('falls back to an empty owner when an https path starts with an extra slash', () => {
    expect(parseGitUrl('https://github.com//codex.git')).toEqual({
      protocol: 'https',
      host: 'github.com',
      owner: '',
      repo: 'codex',
      pathSegments: ['', 'codex'],
    });
  });

  it('falls back to empty https owner and repo parts when the parsed https path contains empty segments', () => {
    const originalMatch = String.prototype.match;
    const matchSpy = vi.spyOn(String.prototype, 'match').mockImplementation(function (
      this: string,
      pattern
    ) {
      if (pattern instanceof RegExp && pattern.source.startsWith('^https?:')) {
        return [
          'https://github.com/openai/codex.git',
          'github.com',
          '/',
        ] as unknown as RegExpMatchArray;
      }

      return originalMatch.call(String(this), pattern);
    });

    expect(parseGitUrl('https://github.com/openai/codex.git')).toEqual({
      protocol: 'https',
      host: 'github.com',
      owner: '',
      repo: '',
      pathSegments: ['', ''],
    });

    matchSpy.mockRestore();
  });

  it('rejects invalid git urls and exposes validation helpers', () => {
    expect(parseGitUrl('not-a-git-url')).toBeNull();
    expect(isValidGitUrl('not-a-git-url')).toBe(false);
    expect(isValidGitUrl('https://github.com/openai/codex.git')).toBe(true);
    expect(extractRepoName('not-a-git-url')).toBe('repository');
    expect(extractRepoName('git@github.com:openai/codex.git')).toBe('codex');
  });

  it('returns null when url parsing throws unexpectedly', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(parseGitUrl('https://github.com/openai/codex.git')).toBeNull();

    matchSpy.mockRestore();
  });

  it('falls back to empty ssh owner and repo parts when the parsed ssh path contains empty segments', () => {
    const originalMatch = String.prototype.match;
    const matchSpy = vi.spyOn(String.prototype, 'match').mockImplementation(function (
      this: string,
      pattern
    ) {
      if (pattern instanceof RegExp && pattern.source.startsWith('^https?:')) {
        return null;
      }

      if (pattern instanceof RegExp && pattern.source.includes('(?:ssh:\\/\\/)?')) {
        return [
          'git@github.com:openai/codex.git',
          'github.com',
          '/',
        ] as unknown as RegExpMatchArray;
      }

      return originalMatch.call(String(this), pattern);
    });

    expect(parseGitUrl('git@github.com:openai/codex.git')).toEqual({
      protocol: 'ssh',
      host: 'github.com',
      owner: '',
      repo: '',
      pathSegments: ['', ''],
    });

    matchSpy.mockRestore();
  });

  it('resolves host directory mappings using exact and wildcard matches', () => {
    const mappings = [
      { pattern: 'github.com', dirname: 'github' },
      { pattern: '*.example.com', dirname: 'example-hosts' },
    ];

    expect(findHostDirname('github.com', mappings)).toBe('github');
    expect(findHostDirname('gitlab.example.com', mappings)).toBe('example-hosts');
    expect(findHostDirname('source.internal', mappings)).toBe('source.internal');
  });

  it('generates organized clone paths using host mappings and nested owner paths', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          HOME: '/Users/tester',
          platform: 'darwin',
        },
      },
    });

    expect(
      generateClonePath(
        'ssh://git@gitlab.example.com/team/platform/codex.git',
        '/workspace/repos',
        [{ pattern: '*.example.com', dirname: 'example-hosts' }],
        true
      )
    ).toEqual({
      targetDir: '/workspace/repos/example-hosts/team/platform',
      repoName: 'codex',
      fullPath: '/workspace/repos/example-hosts/team/platform/codex',
    });
  });

  it('generates flat clone paths and falls back to the default base dir when baseDir is missing', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          HOME: '',
          platform: 'win32',
        },
      },
    });

    expect(generateClonePath('https://github.com/openai/codex.git', '', [], false)).toEqual({
      targetDir: '~\\infilux\\repos',
      repoName: 'codex',
      fullPath: '~\\infilux\\repos\\codex',
    });
  });

  it('returns an explicit error payload when the git url is invalid', () => {
    expect(generateClonePath('invalid', '/workspace/repos', [], true)).toEqual({
      targetDir: '',
      repoName: '',
      fullPath: '',
      error: 'Invalid Git URL format',
    });
  });
});
