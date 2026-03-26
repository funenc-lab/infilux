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
  writeSharedSettings: settingsTestDoubles.writeSharedSettings,
  writeSharedSettingsToSession: settingsTestDoubles.writeSharedSettingsToSession,
}));

vi.mock('../claudeProvider', () => ({
  toggleClaudeProviderWatcher: settingsTestDoubles.toggleClaudeProviderWatcher,
}));

describe('main settings handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    settingsTestDoubles.handlers.clear();
    settingsTestDoubles.setBeforeQuitHandler(undefined);
    vi.clearAllMocks();
    settingsTestDoubles.readSharedSettings.mockReset();
    settingsTestDoubles.readSharedSettings.mockReturnValue({});
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

    const { registerSettingsHandlers } = await import('../settings');
    registerSettingsHandlers();

    const applyImportHandler = settingsTestDoubles.handlers.get(
      IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY
    );

    const result = await applyImportHandler?.({}, '/Volumes/OldMac/.ensoai/settings.json');

    expect(result).toEqual({
      imported: true,
      sourcePath: '/Volumes/OldMac/.ensoai/settings.json',
      diffCount: 2,
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
});
