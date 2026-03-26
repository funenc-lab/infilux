import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBreadcrumbSegments,
  resolveBreadcrumbGitRoot,
  resolveFileListGitRoot,
  resolveFileListPath,
} from '../breadcrumbPathUtils';

describe('breadcrumbPathUtils', () => {
  const originalNavigator = globalThis.navigator;

  const setNavigatorUserAgent = (userAgent: string) => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent },
    });
  };

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('builds breadcrumb paths relative to root for in-repo files', () => {
    expect(
      buildBreadcrumbSegments(
        '/Users/tanzv/Development/Git/EnsoAI/src/renderer/App.tsx',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toEqual([
      {
        name: 'src',
        path: '/Users/tanzv/Development/Git/EnsoAI/src',
        isLast: false,
      },
      {
        name: 'renderer',
        path: '/Users/tanzv/Development/Git/EnsoAI/src/renderer',
        isLast: false,
      },
      {
        name: 'App.tsx',
        path: '/Users/tanzv/Development/Git/EnsoAI/src/renderer/App.tsx',
        isLast: true,
      },
    ]);
  });

  it('returns no breadcrumb segments when the active path is missing or matches the root', () => {
    expect(buildBreadcrumbSegments(null, '/Users/tanzv/Development/Git/EnsoAI')).toEqual([]);

    expect(
      buildBreadcrumbSegments(
        '/Users/tanzv/Development/Git/EnsoAI',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toEqual([]);
  });

  it('keeps absolute paths absolute for files outside the root', () => {
    expect(
      buildBreadcrumbSegments(
        '/Users/tanzv/Development/Project/cvat/README.md',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toEqual([
      { name: 'Users', path: '/Users', isLast: false },
      { name: 'tanzv', path: '/Users/tanzv', isLast: false },
      { name: 'Development', path: '/Users/tanzv/Development', isLast: false },
      { name: 'Project', path: '/Users/tanzv/Development/Project', isLast: false },
      { name: 'cvat', path: '/Users/tanzv/Development/Project/cvat', isLast: false },
      { name: 'README.md', path: '/Users/tanzv/Development/Project/cvat/README.md', isLast: true },
    ]);
  });

  it('preserves UNC prefixes for absolute paths outside the root', () => {
    expect(
      buildBreadcrumbSegments(
        '//server/share/docs/readme.md',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toEqual([
      { name: 'server', path: '//server', isLast: false },
      { name: 'share', path: '//server/share', isLast: false },
      { name: 'docs', path: '//server/share/docs', isLast: false },
      { name: 'readme.md', path: '//server/share/docs/readme.md', isLast: true },
    ]);
  });

  it('recovers duplicated root-prefixed absolute paths before building external breadcrumbs', () => {
    expect(
      buildBreadcrumbSegments(
        '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps/studio/docs/agent/guide.md',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toEqual([
      { name: 'Users', path: '/Users', isLast: false },
      { name: 'tanzv', path: '/Users/tanzv', isLast: false },
      { name: 'Development', path: '/Users/tanzv/Development', isLast: false },
      { name: 'Git', path: '/Users/tanzv/Development/Git', isLast: false },
      { name: 'penpad', path: '/Users/tanzv/Development/Git/penpad', isLast: false },
      { name: 'apps', path: '/Users/tanzv/Development/Git/penpad/apps', isLast: false },
      { name: 'studio', path: '/Users/tanzv/Development/Git/penpad/apps/studio', isLast: false },
      {
        name: 'docs',
        path: '/Users/tanzv/Development/Git/penpad/apps/studio/docs',
        isLast: false,
      },
      {
        name: 'agent',
        path: '/Users/tanzv/Development/Git/penpad/apps/studio/docs/agent',
        isLast: false,
      },
      {
        name: 'guide.md',
        path: '/Users/tanzv/Development/Git/penpad/apps/studio/docs/agent/guide.md',
        isLast: true,
      },
    ]);
  });

  it('only reuses gitRoot for targets inside the root path', () => {
    expect(
      resolveBreadcrumbGitRoot(
        '/Users/tanzv/Development/Git/EnsoAI/src',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/EnsoAI');

    expect(
      resolveBreadcrumbGitRoot(
        '/Users/tanzv/Development/Project/cvat',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBeUndefined();
  });

  it('returns undefined file list gitRoot for absolute paths outside the current root', () => {
    expect(
      resolveFileListGitRoot(
        '/Users/tanzv/Development/Project/cvat/src',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBeUndefined();
  });

  it('returns rootPath file list gitRoot for directories inside the current root', () => {
    expect(
      resolveFileListGitRoot(
        '/Users/tanzv/Development/Git/EnsoAI/src/renderer',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/EnsoAI');
  });

  it('compares macOS paths case-insensitively without depending on process.platform', () => {
    setNavigatorUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');

    expect(
      resolveFileListGitRoot(
        '/users/tanzv/development/git/ensoai/src/renderer',
        '/Users/Tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/Tanzv/Development/Git/EnsoAI');
  });

  it('keeps path comparisons case-sensitive on non-mac and non-windows user agents', () => {
    setNavigatorUserAgent('Mozilla/5.0 (X11; Linux x86_64)');

    expect(
      resolveFileListGitRoot(
        '/users/tanzv/development/git/ensoai/src/renderer',
        '/Users/Tanzv/Development/Git/EnsoAI'
      )
    ).toBeUndefined();
  });

  it('compares Windows paths case-insensitively even when navigator is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined,
    });

    expect(resolveFileListGitRoot('c:\\repo\\src', 'C:\\Repo')).toBe('C:\\Repo');
  });

  it('recovers duplicated root-prefixed absolute paths before listing files', () => {
    expect(
      resolveFileListPath(
        '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/penpad/apps');
  });

  it('recovers nested Windows absolute paths that were prefixed by the current root', () => {
    expect(
      resolveFileListPath(
        '/Users/tanzv/Development/Git/EnsoAI/C:/External/repo/src/index.ts',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('C:/External/repo/src/index.ts');
  });

  it('returns the original path when no root is provided and handles undefined targets', () => {
    expect(resolveFileListPath(undefined, '/Users/tanzv/Development/Git/EnsoAI')).toBeUndefined();
    expect(resolveFileListPath('/tmp/outside.txt', undefined)).toBe('/tmp/outside.txt');
    expect(
      resolveFileListGitRoot(undefined, '/Users/tanzv/Development/Git/EnsoAI')
    ).toBeUndefined();
    expect(resolveFileListGitRoot('/tmp/outside.txt', undefined)).toBeUndefined();
  });
});
