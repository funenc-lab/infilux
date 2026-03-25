import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbSegments,
  resolveBreadcrumbGitRoot,
  resolveFileListGitRoot,
  resolveFileListPath,
} from '../breadcrumbPathUtils';

describe('breadcrumbPathUtils', () => {
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

  it('recovers duplicated root-prefixed absolute paths before listing files', () => {
    expect(
      resolveFileListPath(
        '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/penpad/apps');
  });
});
