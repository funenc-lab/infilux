import { describe, expect, it } from 'vitest';
import {
  customProtocolUriToPath,
  fileUriToPath,
  toCustomProtocolFileBaseUrl,
  toCustomProtocolFileUrl,
} from '../fileUrl';
import {
  getDisplayPath,
  getDisplayPathBasename,
  getPathBasename,
  isWslUncPath,
  joinPath,
  normalizePath,
  recoverPrefixedAbsolutePath,
  trimTrailingPathSeparators,
} from '../path';
import {
  isRemoteVirtualPath,
  normalizeRemotePath,
  parseRemoteVirtualPath,
  toRemoteVirtualPath,
} from '../remotePath';
import {
  buildRepositoryId,
  buildWorkspaceId,
  createLocalWorkspaceHandle,
  createRemoteWorkspaceHandle,
  deriveRepositoryDescriptor,
  isRemoteWorkspaceId,
  normalizeWorkspaceKey,
  normalizeWorkspacePath,
  parseWorkspaceId,
} from '../workspace';

describe('shared path utilities', () => {
  it('normalizes and joins filesystem paths', () => {
    expect(normalizePath('C:\\repo\\src\\file.ts')).toBe('C:/repo/src/file.ts');
    expect(joinPath('/repo/', 'src', '/file.ts')).toBe('/repo/src/file.ts');
    expect(trimTrailingPathSeparators('/repo///')).toBe('/repo');
    expect(trimTrailingPathSeparators('////')).toBe('////');
    expect(trimTrailingPathSeparators('C:\\')).toBe('C:\\');
  });

  it('detects WSL paths and resolves display basenames for local and remote paths', () => {
    const remotePath = toRemoteVirtualPath('conn:1', 'C:\\repo\\file.ts');

    expect(isWslUncPath('\\\\wsl.localhost\\Ubuntu\\home\\user')).toBe(true);
    expect(isWslUncPath('/repo/file.ts')).toBe(false);
    expect(getPathBasename('')).toBe('');
    expect(getPathBasename('/')).toBe('/');
    expect(getPathBasename('/repo/src/file.ts/')).toBe('file.ts');
    expect(getDisplayPath('/repo/src/file.ts')).toBe('/repo/src/file.ts');
    expect(getDisplayPath(remotePath)).toBe('C:/repo/file.ts');
    expect(getDisplayPath('/__enso_remote__/broken')).toBe('/__enso_remote__/broken');
    expect(getDisplayPathBasename(remotePath)).toBe('file.ts');
  });

  it('recovers absolute paths that were accidentally prefixed by a repository root', () => {
    expect(
      recoverPrefixedAbsolutePath(
        '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/penpad/apps');

    expect(
      recoverPrefixedAbsolutePath(
        '/Users/tanzv/Development/Git/EnsoAI/C:/External/repo/src/index.ts',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('C:/External/repo/src/index.ts');

    expect(
      recoverPrefixedAbsolutePath(
        '/Users/tanzv/Development/Git/EnsoAI/src/renderer/App.tsx',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Git/EnsoAI/src/renderer/App.tsx');
  });
});

describe('shared remote path utilities', () => {
  it('encodes and parses remote virtual paths', () => {
    const virtualPath = toRemoteVirtualPath('conn:alpha', 'C:\\repo\\src\\main.ts');

    expect(isRemoteVirtualPath(virtualPath)).toBe(true);
    expect(parseRemoteVirtualPath(virtualPath)).toEqual({
      connectionId: 'conn:alpha',
      remotePath: 'C:/repo/src/main.ts',
    });
    expect(normalizeRemotePath('C:\\repo\\src\\')).toBe('C:/repo/src');
  });

  it('rejects malformed remote virtual paths', () => {
    expect(() => parseRemoteVirtualPath('/repo/file.ts')).toThrow('Not a remote virtual path');
    expect(() => parseRemoteVirtualPath('/__enso_remote__/conn-only')).toThrow(
      'Malformed remote virtual path'
    );
  });
});

describe('shared workspace utilities', () => {
  it('normalizes workspace paths and keys per platform', () => {
    expect(normalizeWorkspacePath('c:\\Repo\\', 'win32')).toBe('C:/Repo');
    expect(normalizeWorkspacePath('c:\\', 'win32')).toBe('C:/');
    expect(normalizeWorkspaceKey('C:/Repo', 'win32')).toBe('c:/repo');
    expect(normalizeWorkspaceKey('/Users/Test/Repo/', 'darwin')).toBe('/users/test/repo');
    expect(normalizeWorkspaceKey('/srv/repo/', 'linux')).toBe('/srv/repo');
  });

  it('builds and parses local and remote workspace ids', () => {
    const localId = buildWorkspaceId('local', '/repo/app');
    const remoteId = buildWorkspaceId('remote', 'C:\\Repo', {
      connectionId: 'conn-1',
      platform: 'win32',
    });

    expect(localId).toBe('local:/repo/app');
    expect(remoteId).toBe('remote:conn-1:c:/repo');
    expect(buildRepositoryId('local', '/repo/app')).toBe(localId);
    expect(isRemoteWorkspaceId(localId)).toBe(false);
    expect(isRemoteWorkspaceId(remoteId)).toBe(true);
    expect(parseWorkspaceId(localId)).toEqual({ kind: 'local', path: '/repo/app' });
    expect(parseWorkspaceId(remoteId)).toEqual({
      kind: 'remote',
      connectionId: 'conn-1',
      path: 'c:/repo',
    });
    expect(() => buildWorkspaceId('remote', '/repo/app')).toThrow(
      'Remote workspace id requires connectionId'
    );
    expect(() => parseWorkspaceId('remote:missing')).toThrow('Invalid remote workspace id');
    expect(() => parseWorkspaceId('unexpected')).toThrow('Unsupported workspace id');
  });

  it('creates workspace handles and repository descriptors', () => {
    expect(createLocalWorkspaceHandle('/repo/app')).toEqual({
      id: 'local:/repo/app',
      kind: 'local',
      rootPath: '/repo/app',
      platform: 'linux',
    });

    expect(createLocalWorkspaceHandle('/repo/app', 'linux')).toEqual({
      id: 'local:/repo/app',
      kind: 'local',
      rootPath: '/repo/app',
      platform: 'linux',
    });

    expect(createRemoteWorkspaceHandle({ id: 'remote-1' }, '/srv/repo', 'linux')).toEqual({
      id: 'remote:remote-1:/srv/repo',
      kind: 'remote',
      rootPath: '/srv/repo',
      connectionId: 'remote-1',
      platform: 'linux',
    });

    expect(createRemoteWorkspaceHandle({ id: 'remote-2' }, '/srv/default')).toEqual({
      id: 'remote:remote-2:/srv/default',
      kind: 'remote',
      rootPath: '/srv/default',
      connectionId: 'remote-2',
      platform: 'linux',
    });

    expect(
      deriveRepositoryDescriptor({
        name: 'Repo',
        path: 'c:\\Repo\\',
        kind: 'remote',
        connectionId: 'remote-1',
        groupId: 'group-1',
        platform: 'win32',
      })
    ).toEqual({
      id: 'remote:remote-1:c:/repo',
      name: 'Repo',
      path: 'C:/Repo',
      kind: 'remote',
      connectionId: 'remote-1',
      groupId: 'group-1',
    });

    expect(
      deriveRepositoryDescriptor({
        name: 'Local Repo',
        path: '/srv/local/repo/',
      })
    ).toEqual({
      id: 'local:/srv/local/repo',
      name: 'Local Repo',
      path: '/srv/local/repo',
      kind: 'local',
      connectionId: undefined,
      groupId: undefined,
    });
  });
});

describe('shared file URL utilities', () => {
  it('creates custom protocol URLs for local and UNC paths', () => {
    expect(toCustomProtocolFileUrl('/Users/test/My File.txt', 'local-file')).toBe(
      'local-file:///Users/test/My%20File.txt'
    );
    expect(toCustomProtocolFileUrl('relative/path.txt', 'local-file')).toBe(
      'local-file:///relative/path.txt'
    );
    expect(toCustomProtocolFileUrl('\\\\wsl.localhost\\Ubuntu\\home\\user', 'local-file')).toBe(
      'local-file://wsl.localhost/Ubuntu/home/user'
    );
    expect(toCustomProtocolFileUrl('//server', 'local-file')).toBe('local-file://server/');
    expect(toCustomProtocolFileBaseUrl('/Users/test/repo', 'local-file').toString()).toBe(
      'local-file:///Users/test/repo/'
    );
  });

  it('converts file and custom protocol URIs back to filesystem paths', () => {
    expect(fileUriToPath('file:///Users/test/My%20File.txt', 'darwin')).toBe(
      '/Users/test/My File.txt'
    );
    expect(fileUriToPath('file:///C:/Repo/File.txt', 'win32')).toBe('C:\\Repo\\File.txt');
    expect(fileUriToPath('file://c/Repo/File.txt', 'win32')).toBe('c:\\Repo\\File.txt');
    expect(fileUriToPath('file://server/share/file.txt', 'win32')).toBe(
      '\\\\server\\share\\file.txt'
    );
    expect(fileUriToPath('file:////server/share/file.txt', 'win32')).toBe(
      '\\\\server\\share\\file.txt'
    );
    expect(fileUriToPath('file://wsl.localhost/Ubuntu/home/user', 'linux')).toBe(
      '//wsl.localhost/Ubuntu/home/user'
    );
    expect(customProtocolUriToPath('local-file:///Users/test/repo', 'local-file', 'darwin')).toBe(
      '/Users/test/repo'
    );
    expect(customProtocolUriToPath('local-file:///%E0%A4%A', 'local-file', 'darwin')).toBeNull();
    expect(customProtocolUriToPath('https://example.com/file', 'local-file', 'darwin')).toBeNull();
    expect(fileUriToPath('not-a-file-uri', 'linux')).toBeNull();
  });
});
