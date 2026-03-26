import { describe, expect, it } from 'vitest';
import {
  buildLegacySettingsImportPayload,
  buildLegacySettingsImportPreview,
  findLegacySettingsImportSourcePath,
  getLegacySettingsImportCandidatePaths,
  readElectronLocalStorageSnapshotFromLevelDbDirs,
  readLegacyElectronLocalStorageSnapshot,
  readLegacyImportLocalStorageSnapshot,
} from '../legacyImport';

describe('legacySettingsImport', () => {
  it('builds a nested diff preview for a valid EnsoAI settings document', () => {
    const preview = buildLegacySettingsImportPreview(
      {
        'enso-settings': {
          state: {
            theme: 'system',
            language: 'en',
            claudeCodeIntegration: {
              enableProviderWatcher: true,
            },
          },
        },
      },
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'zh',
            claudeCodeIntegration: {
              enableProviderWatcher: false,
            },
          },
        },
      },
      '/Volumes/OldMac/.ensoai/settings.json'
    );

    expect(preview.importable).toBe(true);
    expect(preview.diffCount).toBe(3);
    expect(preview.truncated).toBe(false);
    expect(preview.diffs).toEqual([
      {
        path: 'claudeCodeIntegration.enableProviderWatcher',
        currentValue: 'true',
        importedValue: 'false',
      },
      {
        path: 'language',
        currentValue: '"en"',
        importedValue: '"zh"',
      },
      {
        path: 'theme',
        currentValue: '"system"',
        importedValue: '"dark"',
      },
    ]);
  });

  it('returns a non-importable preview when the file does not contain persisted EnsoAI settings', () => {
    const preview = buildLegacySettingsImportPreview(
      {
        'enso-settings': {
          state: {
            theme: 'system',
          },
        },
      },
      {
        invalid: true,
      },
      'D:\\Users\\old\\.ensoai\\settings.json'
    );

    expect(preview.importable).toBe(false);
    expect(preview.diffCount).toBe(0);
    expect(preview.error).toBe('Selected file does not contain persisted EnsoAI settings.');
  });

  it('includes managed localStorage diffs in the import preview when the settings slice already matches', () => {
    const preview = buildLegacySettingsImportPreview(
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'en',
          },
        },
      },
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'en',
          },
        },
      },
      '/Volumes/OldMac/.ensoai/settings.json',
      {
        currentLocalStorageSnapshot: {
          'enso-repositories': '[]',
        },
        importedLocalStorageSnapshot: {
          'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
          'enso-selected-repo': '/repo/demo',
        },
      }
    );

    expect(preview.importable).toBe(true);
    expect(preview.diffCount).toBe(2);
    expect(preview.truncated).toBe(false);
    expect(preview.diffs).toEqual([
      {
        path: 'localStorage.enso-repositories',
        currentValue: '"[]"',
        importedValue:
          '"[{\\"path\\":\\"/repo/demo\\",\\"name\\":\\"demo\\",\\"id\\":\\"local:/repo/demo\\"}]"',
      },
      {
        path: 'localStorage.enso-selected-repo',
        currentValue: 'Not set',
        importedValue: '"/repo/demo"',
      },
    ]);
  });

  it('builds an apply payload that only replaces the persisted settings slice', () => {
    const payload = buildLegacySettingsImportPayload(
      {
        other: {
          keep: true,
        },
        'enso-settings': {
          state: {
            theme: 'system',
          },
        },
      },
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'zh',
          },
        },
        ignoredRootKey: true,
      }
    );

    expect(payload).toEqual({
      other: {
        keep: true,
      },
      'enso-settings': {
        state: {
          theme: 'dark',
          language: 'zh',
        },
      },
    });
  });

  it('builds prioritized legacy settings import candidates from home and Windows profile paths', () => {
    expect(
      getLegacySettingsImportCandidatePaths({
        homeDir: '/Users/tester',
        env: {
          HOME: '/Users/tester',
          USERPROFILE: 'C:\\Users\\tester',
          HOMEDRIVE: 'C:',
          HOMEPATH: '\\Users\\tester',
        },
      })
    ).toEqual(['/Users/tester/.ensoai/settings.json', 'C:\\Users\\tester\\.ensoai\\settings.json']);
  });

  it('returns the first existing legacy settings file from the candidate list', () => {
    const sourcePath = findLegacySettingsImportSourcePath({
      homeDir: '/Users/tester',
      env: {
        HOME: '/Users/tester',
        USERPROFILE: '/Volumes/OldMac/Users/tester',
      },
      fileExists: (candidatePath) =>
        candidatePath === '/Volumes/OldMac/Users/tester/.ensoai/settings.json',
    });

    expect(sourcePath).toBe('/Volumes/OldMac/Users/tester/.ensoai/settings.json');
  });

  it('returns null when no legacy settings file exists in the typical locations', () => {
    const sourcePath = findLegacySettingsImportSourcePath({
      homeDir: '/Users/tester',
      env: {
        HOME: '/Users/tester',
      },
      fileExists: () => false,
    });

    expect(sourcePath).toBeNull();
  });

  it('reads the sibling legacy session-state localStorage snapshot for sidebar migration', () => {
    const snapshot = readLegacyImportLocalStorageSnapshot(
      '/Volumes/OldMac/.ensoai/settings.json',
      (candidatePath) => {
        expect(candidatePath).toBe('/Volumes/OldMac/.ensoai/session-state.json');
        return JSON.stringify({
          localStorage: {
            'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
            'enso-selected-repo': '/repo/demo',
            ignored: 7,
          },
        });
      }
    );

    expect(snapshot).toEqual({
      'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
      'enso-selected-repo': '/repo/demo',
    });
  });

  it('falls back to legacy Electron localStorage leveldb when session-state does not contain repositories', () => {
    const snapshot = readLegacyElectronLocalStorageSnapshot('/Users/tester/.ensoai/settings.json', {
      listDirectories: (targetPath) => {
        if (targetPath === '/Users/tester/Library/Application Support') {
          return ['enso-ai', 'infilux'];
        }
        if (
          targetPath === '/Users/tester/Library/Application Support/enso-ai/Local Storage/leveldb'
        ) {
          return ['000003.log'];
        }
        return [];
      },
      readBinaryFile: (targetPath) => {
        expect(targetPath).toBe(
          '/Users/tester/Library/Application Support/enso-ai/Local Storage/leveldb/000003.log'
        );
        return Buffer.from(
          [
            'META:file://',
            '_file://',
            'enso-repositories',
            '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
            '_file://',
            'enso-selected-repo',
            '/repo/demo',
            '_file://',
            'enso-worktree-tabs',
            '{"/repo/demo":"chat"}',
          ].join('\x01'),
          'utf8'
        );
      },
    });

    expect(snapshot).toEqual({
      'enso-repositories':
        '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
      'enso-selected-repo': '/repo/demo',
      'enso-worktree-tabs': '{"/repo/demo":"chat"}',
    });
  });

  it('derives a minimal repository list from selected repo and worktree tabs when legacy leveldb has no explicit repository key', () => {
    const snapshot = readLegacyElectronLocalStorageSnapshot('/Users/tester/.ensoai/settings.json', {
      listDirectories: (targetPath) => {
        if (targetPath === '/Users/tester/Library/Application Support') {
          return ['enso-ai'];
        }
        if (
          targetPath === '/Users/tester/Library/Application Support/enso-ai/Local Storage/leveldb'
        ) {
          return ['000003.log'];
        }
        return [];
      },
      readBinaryFile: () =>
        Buffer.from(
          [
            'META:file://',
            '_file://',
            'enso-selected-repo',
            '/repo/demo',
            '_file://',
            'enso-worktree-tabs',
            '{"/repo/demo":"chat","/repo/demo/.worktrees/feature":"terminal","/Users/tester/ensoai/temporary/tmp":"chat"}',
          ].join('\x01'),
          'utf8'
        ),
    });

    expect(snapshot).toEqual({
      'enso-selected-repo': '/repo/demo',
      'enso-worktree-tabs':
        '{"/repo/demo":"chat","/repo/demo/.worktrees/feature":"terminal","/Users/tester/ensoai/temporary/tmp":"chat"}',
      'enso-repositories': '[{"name":"demo","path":"/repo/demo","kind":"local"}]',
    });
  });

  it('reads a repository snapshot directly from the current app leveldb directory', () => {
    const snapshot = readElectronLocalStorageSnapshotFromLevelDbDirs(['/tmp/infilux-dev/leveldb'], {
      listDirectories: (targetPath) => {
        if (targetPath === '/tmp/infilux-dev/leveldb') {
          return ['000004.log'];
        }
        return [];
      },
      readBinaryFile: (targetPath) => {
        expect(targetPath).toBe('/tmp/infilux-dev/leveldb/000004.log');
        return Buffer.from(
          [
            'META:http://localhost:5173',
            '_http://localhost:5173',
            'enso-repositories',
            '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
            '_http://localhost:5173',
            'enso-selected-repo',
            '/repo/demo',
          ].join('\x01'),
          'utf8'
        );
      },
    });

    expect(snapshot).toEqual({
      'enso-repositories':
        '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
      'enso-selected-repo': '/repo/demo',
    });
  });
});
