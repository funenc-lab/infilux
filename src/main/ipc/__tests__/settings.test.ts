import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let beforeQuitHandler: (() => void) | undefined;

  return {
    handlers,
    getBeforeQuitHandler: () => beforeQuitHandler,
    setBeforeQuitHandler: (handler: (() => void) | undefined) => {
      beforeQuitHandler = handler;
    },
    readSharedSettings: vi.fn(),
    getSharedLocalStorageSnapshot: vi.fn(),
    writeSharedSettings: vi.fn(),
    writeSharedSettingsToSession: vi.fn(),
    toggleClaudeProviderWatcher: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: {
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'before-quit') {
        settingsTestDoubles.setBeforeQuitHandler(handler);
      }
    }),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      settingsTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: settingsTestDoubles.existsSync,
  readFileSync: settingsTestDoubles.readFileSync,
}));

vi.mock('../../services/SharedSessionState', () => ({
  readSharedSettings: settingsTestDoubles.readSharedSettings,
  getSharedLocalStorageSnapshot: settingsTestDoubles.getSharedLocalStorageSnapshot,
  writeSharedSettings: settingsTestDoubles.writeSharedSettings,
  writeSharedSettingsToSession: settingsTestDoubles.writeSharedSettingsToSession,
}));

vi.mock('../claudeProvider', () => ({
  toggleClaudeProviderWatcher: settingsTestDoubles.toggleClaudeProviderWatcher,
}));

describe('main settings handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../../services/settings/legacyImport');
    vi.useFakeTimers();
    settingsTestDoubles.handlers.clear();
    settingsTestDoubles.setBeforeQuitHandler(undefined);
    vi.clearAllMocks();
    settingsTestDoubles.readSharedSettings.mockReset();
    settingsTestDoubles.readSharedSettings.mockReturnValue({});
    settingsTestDoubles.getSharedLocalStorageSnapshot.mockReset();
    settingsTestDoubles.getSharedLocalStorageSnapshot.mockReturnValue({});
    settingsTestDoubles.writeSharedSettings.mockReset();
    settingsTestDoubles.writeSharedSettingsToSession.mockReset();
    settingsTestDoubles.toggleClaudeProviderWatcher.mockReset();
    settingsTestDoubles.existsSync.mockReset();
    settingsTestDoubles.readFileSync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces writes and persists only the latest payload', async () => {
    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);
    const first = { version: 1, claudeCodeIntegration: { enableProviderWatcher: true } };
    const second = { version: 2, claudeCodeIntegration: { enableProviderWatcher: true } };

    await writeHandler?.({}, first);
    await writeHandler?.({}, second);

    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(499);
    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith(second);
    expect(settingsTestDoubles.writeSharedSettingsToSession).toHaveBeenCalledWith(second);
  });

  it('flushes the latest dirty payload on max-wait timeout even if debounce keeps getting reset', async () => {
    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);

    for (let seq = 1; seq <= 12; seq += 1) {
      await writeHandler?.({}, { seq, claudeCodeIntegration: { enableProviderWatcher: true } });
      await vi.advanceTimersByTimeAsync(400);
    }

    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith({
      seq: 12,
      claudeCodeIntegration: { enableProviderWatcher: true },
    });
  });

  it('forces a flush on before-quit and toggles Claude provider watcher only when the value changes', async () => {
    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);

    await writeHandler?.({}, { claudeCodeIntegration: { enableProviderWatcher: false } });
    expect(settingsTestDoubles.toggleClaudeProviderWatcher).toHaveBeenCalledWith(false);

    await writeHandler?.({}, { claudeCodeIntegration: { enableProviderWatcher: false } });
    expect(settingsTestDoubles.toggleClaudeProviderWatcher).toHaveBeenCalledTimes(1);

    settingsTestDoubles.getBeforeQuitHandler()?.();

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith({
      claudeCodeIntegration: { enableProviderWatcher: false },
    });
  });

  it('reads shared settings once and returns the cached value on subsequent reads', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({ theme: 'dark' });

    const { readSettings } = await import('../settings');

    expect(readSettings()).toEqual({ theme: 'dark' });
    expect(readSettings()).toEqual({ theme: 'dark' });
    expect(settingsTestDoubles.readSharedSettings).toHaveBeenCalledTimes(1);
  });

  it('returns null when shared settings cannot be read', async () => {
    settingsTestDoubles.readSharedSettings.mockImplementation(() => {
      throw new Error('corrupted settings');
    });

    const { readSettings } = await import('../settings');

    expect(readSettings()).toBeNull();
  });

  it('returns true when flushSettings is called without pending dirty state', async () => {
    const { flushSettings } = await import('../settings');

    expect(flushSettings()).toBe(true);
    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();
    expect(settingsTestDoubles.writeSharedSettingsToSession).not.toHaveBeenCalled();
  });

  it('registers the settings read handler and returns cached settings from shared state', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'light',
        },
      },
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const readHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_READ);

    expect(await readHandler?.({})).toEqual({
      'enso-settings': {
        state: {
          theme: 'light',
        },
      },
    });
    expect(await readHandler?.({})).toEqual({
      'enso-settings': {
        state: {
          theme: 'light',
        },
      },
    });
    expect(settingsTestDoubles.readSharedSettings).toHaveBeenCalledTimes(1);
  });

  it('treats non-boolean nested provider watcher values as undefined and skips toggling', async () => {
    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);

    await expect(
      writeHandler?.(
        {},
        {
          'enso-settings': {
            state: {
              claudeCodeIntegration: {
                enableProviderWatcher: 'invalid',
              },
            },
          },
        }
      )
    ).resolves.toBe(true);

    expect(settingsTestDoubles.toggleClaudeProviderWatcher).not.toHaveBeenCalled();
  });

  it('returns false when preparing a settings write throws before timers are scheduled', async () => {
    settingsTestDoubles.toggleClaudeProviderWatcher.mockImplementationOnce(() => {
      throw new Error('watcher toggle failed');
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);

    await expect(
      writeHandler?.({}, { claudeCodeIntegration: { enableProviderWatcher: false } })
    ).resolves.toBe(false);

    await vi.advanceTimersByTimeAsync(6000);

    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();
    expect(settingsTestDoubles.writeSharedSettingsToSession).not.toHaveBeenCalled();
  });

  it('flushes from the max-wait timer callback when repeated writes keep resetting debounce', async () => {
    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);

    for (let seq = 1; seq <= 11; seq += 1) {
      await writeHandler?.({}, { seq, claudeCodeIntegration: { enableProviderWatcher: true } });
      await vi.advanceTimersByTimeAsync(460);
    }

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith({
      seq: 11,
      claudeCodeIntegration: { enableProviderWatcher: true },
    });
    expect(settingsTestDoubles.writeSharedSettingsToSession).toHaveBeenCalledWith({
      seq: 11,
      claudeCodeIntegration: { enableProviderWatcher: true },
    });
  });

  it('returns a legacy import preview and reports file read failures', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
          language: 'en',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'zh',
          },
        },
      })
    );

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const previewHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_PREVIEW
    );

    expect(await previewHandler?.({}, '/tmp/importable-settings.json')).toEqual({
      sourcePath: '/tmp/importable-settings.json',
      importable: true,
      diffCount: 2,
      diffs: [
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
      ],
      truncated: false,
      error: undefined,
    });

    settingsTestDoubles.readFileSync.mockImplementationOnce(() => {
      throw new Error('unreadable');
    });

    expect(await previewHandler?.({}, '/tmp/broken-settings.json')).toEqual({
      sourcePath: '/tmp/broken-settings.json',
      importable: false,
      diffCount: 0,
      diffs: [],
      truncated: false,
      error: 'Failed to read the selected settings file.',
    });
  });

  it('treats legacy localStorage repository data as importable even when the settings slice already matches', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'dark',
          language: 'en',
        },
      },
    });
    settingsTestDoubles.getSharedLocalStorageSnapshot.mockReturnValue({
      'enso-repositories': '[]',
    });
    settingsTestDoubles.readFileSync.mockImplementation((targetPath: string) => {
      if (targetPath === '/tmp/importable-settings.json') {
        return JSON.stringify({
          'enso-settings': {
            state: {
              theme: 'dark',
              language: 'en',
            },
          },
        });
      }

      if (targetPath === '/tmp/session-state.json') {
        return JSON.stringify({
          localStorage: {
            'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
            'enso-selected-repo': '/repo/demo',
          },
        });
      }

      throw new Error(`Unexpected read path: ${targetPath}`);
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const previewHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_PREVIEW
    );

    expect(await previewHandler?.({}, '/tmp/importable-settings.json')).toEqual({
      sourcePath: '/tmp/importable-settings.json',
      importable: true,
      diffCount: 2,
      diffs: [
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
      ],
      truncated: false,
      error: undefined,
    });
  });

  it('applies legacy localStorage repository data even when the settings slice already matches', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'dark',
          language: 'en',
        },
      },
    });
    settingsTestDoubles.getSharedLocalStorageSnapshot.mockReturnValue({
      'enso-repositories': '[]',
    });
    settingsTestDoubles.readFileSync.mockImplementation((targetPath: string) => {
      if (targetPath === '/tmp/importable-settings.json') {
        return JSON.stringify({
          'enso-settings': {
            state: {
              theme: 'dark',
              language: 'en',
            },
          },
        });
      }

      if (targetPath === '/tmp/session-state.json') {
        return JSON.stringify({
          localStorage: {
            'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
            'enso-selected-repo': '/repo/demo',
          },
        });
      }

      throw new Error(`Unexpected read path: ${targetPath}`);
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    expect(await applyImportHandler?.({}, '/tmp/importable-settings.json')).toEqual({
      imported: true,
      sourcePath: '/tmp/importable-settings.json',
      diffCount: 2,
      legacyLocalStorageSnapshot: {
        'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
        'enso-selected-repo': '/repo/demo',
      },
    });
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith({
      'enso-settings': {
        state: {
          theme: 'dark',
          language: 'en',
        },
      },
    });
  });

  it('clears pending write timers when an imported settings payload is persisted immediately', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
          },
        },
      })
    );

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const writeHandler = settingsTestDoubles.handlers.get(IPC_CHANNELS.SETTINGS_WRITE);
    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    await writeHandler?.(
      {},
      { pending: true, claudeCodeIntegration: { enableProviderWatcher: true } }
    );
    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();

    await expect(applyImportHandler?.({}, '/tmp/import-now.json')).resolves.toEqual({
      imported: true,
      sourcePath: '/tmp/import-now.json',
      diffCount: 1,
      legacyLocalStorageSnapshot: undefined,
    });

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenLastCalledWith({
      pending: true,
      claudeCodeIntegration: {
        enableProviderWatcher: true,
      },
      'enso-settings': {
        state: {
          theme: 'dark',
        },
      },
    });

    await vi.advanceTimersByTimeAsync(6000);

    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledTimes(1);
  });

  it('merges legacy LevelDB and session-state localStorage snapshots during preview', async () => {
    vi.doMock('../../services/settings/legacyImport', async () => {
      const actual = await vi.importActual<typeof import('../../services/settings/legacyImport')>(
        '../../services/settings/legacyImport'
      );

      return {
        ...actual,
        readLegacyImportLocalStorageSnapshot: vi.fn(() => ({
          'enso-selected-repo': '/repo/session',
        })),
        readLegacyElectronLocalStorageSnapshot: vi.fn(() => ({
          'enso-repositories':
            '[{"path":"/repo/leveldb","name":"leveldb","id":"local:/repo/leveldb"}]',
        })),
      };
    });

    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
          },
        },
      })
    );

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const previewHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_PREVIEW
    );

    await expect(previewHandler?.({}, '/tmp/legacy-merged.json')).resolves.toEqual({
      sourcePath: '/tmp/legacy-merged.json',
      importable: true,
      diffCount: 3,
      diffs: [
        {
          path: 'theme',
          currentValue: '"system"',
          importedValue: '"dark"',
        },
        {
          path: 'localStorage.enso-repositories',
          currentValue: 'Not set',
          importedValue:
            '"[{\\"path\\":\\"/repo/leveldb\\",\\"name\\":\\"leveldb\\",\\"id\\":\\"local:/repo/leveldb\\"}]"',
        },
        {
          path: 'localStorage.enso-selected-repo',
          currentValue: 'Not set',
          importedValue: '"/repo/session"',
        },
      ],
      truncated: false,
      error: undefined,
    });
  });

  it('falls back to the LevelDB localStorage snapshot when no session-state snapshot exists', async () => {
    vi.doMock('../../services/settings/legacyImport', async () => {
      const actual = await vi.importActual<typeof import('../../services/settings/legacyImport')>(
        '../../services/settings/legacyImport'
      );

      return {
        ...actual,
        readLegacyImportLocalStorageSnapshot: vi.fn(() => null),
        readLegacyElectronLocalStorageSnapshot: vi.fn(() => ({
          'enso-repositories':
            '[{"path":"/repo/leveldb-only","name":"leveldb-only","id":"local:/repo/leveldb-only"}]',
        })),
      };
    });

    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
          },
        },
      })
    );

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const previewHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_PREVIEW
    );

    await expect(previewHandler?.({}, '/tmp/legacy-leveldb-only.json')).resolves.toEqual({
      sourcePath: '/tmp/legacy-leveldb-only.json',
      importable: true,
      diffCount: 2,
      diffs: [
        {
          path: 'theme',
          currentValue: '"system"',
          importedValue: '"dark"',
        },
        {
          path: 'localStorage.enso-repositories',
          currentValue: 'Not set',
          importedValue:
            '"[{\\"path\\":\\"/repo/leveldb-only\\",\\"name\\":\\"leveldb-only\\",\\"id\\":\\"local:/repo/leveldb-only\\"}]"',
        },
      ],
      truncated: false,
      error: undefined,
    });
  });

  it('auto-detects a legacy settings file from typical locations and previews it', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = '/Users/tester';
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.existsSync.mockImplementation(
      (candidatePath: string) => candidatePath === '/Users/tester/.ensoai/settings.json'
    );
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
          },
        },
      })
    );

    try {
      const { registerSettingsHandlers } = await import('../settings');
      registerSettingsHandlers();

      const previewHandler = settingsTestDoubles.handlers.get(
        IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_AUTO_PREVIEW
      );

      expect(await previewHandler?.({})).toEqual({
        sourcePath: '/Users/tester/.ensoai/settings.json',
        importable: true,
        diffCount: 1,
        diffs: [
          {
            path: 'theme',
            currentValue: '"system"',
            importedValue: '"dark"',
          },
        ],
        truncated: false,
        error: undefined,
      });
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('reports a clear error when automatic legacy settings discovery finds nothing', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = '/Users/tester';
    settingsTestDoubles.existsSync.mockReturnValue(false);

    try {
      const { registerSettingsHandlers } = await import('../settings');
      registerSettingsHandlers();

      const previewHandler = settingsTestDoubles.handlers.get(
        IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_AUTO_PREVIEW
      );

      expect(await previewHandler?.({})).toEqual({
        sourcePath: '',
        importable: false,
        diffCount: 0,
        diffs: [],
        truncated: false,
        error: 'No EnsoAI settings file was found in the typical legacy locations.',
      });
      expect(settingsTestDoubles.readFileSync).not.toHaveBeenCalled();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('applies an imported EnsoAI settings file immediately and toggles the provider watcher when the imported value changes', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          claudeCodeIntegration: {
            enableProviderWatcher: true,
          },
          theme: 'system',
        },
      },
      other: {
        keep: true,
      },
    });
    settingsTestDoubles.readFileSync.mockImplementation((target: string) => {
      if (target === '/Volumes/OldMac/.ensoai/settings.json') {
        return JSON.stringify({
          'enso-settings': {
            state: {
              claudeCodeIntegration: {
                enableProviderWatcher: false,
              },
              theme: 'dark',
            },
          },
        });
      }

      if (target === '/Volumes/OldMac/.ensoai/session-state.json') {
        return JSON.stringify({
          localStorage: {
            'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
            'enso-selected-repo': '/repo/demo',
          },
        });
      }

      throw new Error(`Unexpected read path: ${target}`);
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    const result = await applyImportHandler?.({}, '/Volumes/OldMac/.ensoai/settings.json');

    expect(result).toEqual({
      imported: true,
      sourcePath: '/Volumes/OldMac/.ensoai/settings.json',
      diffCount: 4,
      legacyLocalStorageSnapshot: {
        'enso-repositories': '[{"path":"/repo/demo","name":"demo","id":"local:/repo/demo"}]',
        'enso-selected-repo': '/repo/demo',
      },
    });
    expect(settingsTestDoubles.toggleClaudeProviderWatcher).toHaveBeenCalledWith(false);
    expect(settingsTestDoubles.writeSharedSettings).toHaveBeenCalledWith({
      'enso-settings': {
        state: {
          claudeCodeIntegration: {
            enableProviderWatcher: false,
          },
          theme: 'dark',
        },
      },
      other: {
        keep: true,
      },
    });
    expect(settingsTestDoubles.writeSharedSettingsToSession).toHaveBeenCalledWith({
      'enso-settings': {
        state: {
          claudeCodeIntegration: {
            enableProviderWatcher: false,
          },
          theme: 'dark',
        },
      },
      other: {
        keep: true,
      },
    });
  });

  it('rejects non-importable legacy settings payloads without persisting', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'dark',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(JSON.stringify({ invalid: true }));

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    expect(await applyImportHandler?.({}, '/tmp/not-importable.json')).toEqual({
      imported: false,
      sourcePath: '/tmp/not-importable.json',
      diffCount: 0,
      error: 'Selected file does not contain persisted EnsoAI settings.',
    });
    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();
    expect(settingsTestDoubles.toggleClaudeProviderWatcher).not.toHaveBeenCalled();
  });

  it('reports persistence and parsing failures for legacy settings apply', async () => {
    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          claudeCodeIntegration: {
            enableProviderWatcher: true,
          },
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            claudeCodeIntegration: {
              enableProviderWatcher: false,
            },
            theme: 'dark',
          },
        },
      })
    );
    settingsTestDoubles.writeSharedSettings.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    expect(await applyImportHandler?.({}, '/tmp/persist-fail.json')).toEqual({
      imported: false,
      sourcePath: '/tmp/persist-fail.json',
      diffCount: 2,
      error: 'Failed to persist imported settings.',
    });
    expect(settingsTestDoubles.toggleClaudeProviderWatcher).toHaveBeenCalledWith(false);
    expect(settingsTestDoubles.writeSharedSettingsToSession).not.toHaveBeenCalled();

    settingsTestDoubles.readFileSync.mockImplementationOnce(() => {
      throw new Error('parse failed');
    });

    expect(await applyImportHandler?.({}, '/tmp/read-fail.json')).toEqual({
      imported: false,
      sourcePath: '/tmp/read-fail.json',
      diffCount: 0,
      error: 'Failed to read the selected settings file.',
    });
  });

  it('returns a non-importable response when the preview is importable but the payload builder returns null', async () => {
    vi.doMock('../../services/settings/legacyImport', async () => {
      const actual = await vi.importActual<typeof import('../../services/settings/legacyImport')>(
        '../../services/settings/legacyImport'
      );

      return {
        ...actual,
        buildLegacySettingsImportPayload: vi.fn(() => null),
      };
    });

    settingsTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'system',
        },
      },
    });
    settingsTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        'enso-settings': {
          state: {
            theme: 'dark',
          },
        },
      })
    );

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    await expect(applyImportHandler?.({}, '/tmp/payload-null.json')).resolves.toEqual({
      imported: false,
      sourcePath: '/tmp/payload-null.json',
      diffCount: 0,
      error: 'Selected file does not contain persisted EnsoAI settings.',
    });

    expect(settingsTestDoubles.writeSharedSettings).not.toHaveBeenCalled();
    expect(settingsTestDoubles.writeSharedSettingsToSession).not.toHaveBeenCalled();
  });
});
