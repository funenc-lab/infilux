import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

describe('settings rehydrate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies persisted side effects during explicit rehydrate', async () => {
    const getTerminalThemeAccent = vi.fn(() => '#ff79c6');
    const isTerminalThemeDark = vi.fn(() => true);
    const resolveThemeVariables = vi.fn(() => ({
      '--background': 'oklch(0.19 0.014 245)',
      '--primary': '#ff7a00',
      '--ring': '#ff7a00',
    }));
    const updateRendererLogging = vi.fn();
    const cleanupLegacyFields = vi.fn().mockResolvedValue(undefined);
    const classListToggle = vi.fn();
    const styleSetProperty = vi.fn();
    const matchMediaAddEventListener = vi.fn();
    const setLanguage = vi.fn();
    const setProxy = vi.fn();
    const startWebInspector = vi.fn().mockResolvedValue(undefined);
    const setAutoFetchEnabled = vi.fn();
    const detectShell = vi.fn().mockResolvedValue([]);
    const localStorageMock = createLocalStorageMock();

    vi.doMock('@/lib/ghosttyTheme', () => ({
      getTerminalThemeAccent,
      isTerminalThemeDark,
    }));
    vi.doMock('@/lib/appTheme', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/appTheme')>();
      return {
        ...actual,
        resolveThemeVariables,
      };
    });
    vi.doMock('@/utils/logging', () => ({
      updateRendererLogging,
    }));
    vi.doMock('../migration', async () => {
      const actual = await vi.importActual<typeof import('../migration')>('../migration');
      return {
        ...actual,
        cleanupLegacyFields,
      };
    });

    vi.stubGlobal('document', {
      documentElement: {
        lang: '',
        classList: { toggle: classListToggle },
        style: { setProperty: styleSetProperty },
      },
    });
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: matchMediaAddEventListener,
      })),
      electronAPI: {
        settings: {
          read: vi.fn().mockResolvedValue({
            'enso-settings': {
              state: {
                language: 'zh',
                theme: 'sync-terminal',
                colorPreset: 'graphite-ink',
                customAccentColor: '#ff7a00',
                terminalAccentSync: false,
                terminalTheme: 'Dracula',
                terminalFontFamily: 'Fira Code',
                terminalFontSize: 16,
                loggingEnabled: true,
                logLevel: 'debug',
                proxySettings: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
                webInspectorEnabled: true,
                gitAutoFetchEnabled: true,
              },
            },
          }),
          write: vi.fn(),
        },
        app: {
          setLanguage,
          setProxy,
        },
        webInspector: {
          start: startWebInspector,
        },
        git: {
          setAutoFetchEnabled,
        },
        shell: {
          detect: detectShell,
        },
        env: {
          platform: 'darwin',
        },
        updater: {
          setAutoUpdateEnabled: vi.fn(),
        },
      },
    });

    const { useSettingsStore } = await import('../index');
    vi.clearAllMocks();

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();

    expect(getTerminalThemeAccent).toHaveBeenCalledWith('Dracula');
    expect(resolveThemeVariables).toHaveBeenCalledWith({
      mode: 'light',
      preset: 'graphite-ink',
      customAccentColor: '#ff79c6',
      customTheme: null,
    });
    expect(styleSetProperty).toHaveBeenCalledWith(
      '--font-family-sans',
      '"PingFang SC", "Hiragino Sans GB", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif'
    );
    expect(styleSetProperty).toHaveBeenCalledWith('--app-font-size-base', '14px');
    expect(styleSetProperty).toHaveBeenCalledWith('--font-family-mono', 'Fira Code');
    expect(styleSetProperty).not.toHaveBeenCalledWith('--font-size-base', '16px');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(setLanguage).toHaveBeenCalledWith('zh');
    expect(updateRendererLogging).toHaveBeenCalledWith(true, 'debug');
    expect(setProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        httpProxy: 'http://127.0.0.1:7890',
      })
    );
    expect(startWebInspector).toHaveBeenCalledTimes(1);
    expect(setAutoFetchEnabled).toHaveBeenCalledWith(true);
    expect(cleanupLegacyFields).toHaveBeenCalledTimes(1);
    expect(classListToggle).toHaveBeenCalledWith('dark', false);
    expect(useSettingsStore.getState().theme).toBe('system');
    expect(useSettingsStore.getState().terminalAccentSync).toBe(true);
  });

  it('auto-detects powershell7 only once on Windows first rehydrate', async () => {
    const cleanupLegacyFields = vi.fn().mockResolvedValue(undefined);
    const localStorageMock = createLocalStorageMock();
    const resolveThemeVariables = vi.fn(() => ({
      '--background': 'oklch(0.985 0.006 210)',
      '--primary': 'oklch(0.56 0.11 200)',
      '--ring': 'oklch(0.66 0.11 202)',
    }));

    vi.doMock('../migration', async () => {
      const actual = await vi.importActual<typeof import('../migration')>('../migration');
      return {
        ...actual,
        cleanupLegacyFields,
      };
    });
    vi.doMock('@/lib/appTheme', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/appTheme')>();
      return {
        ...actual,
        resolveThemeVariables,
      };
    });

    vi.stubGlobal('document', {
      documentElement: {
        lang: '',
        classList: { toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    });
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
      })),
      electronAPI: {
        settings: {
          read: vi.fn().mockResolvedValue({
            'enso-settings': {
              state: {
                language: 'en',
                theme: 'system',
                colorPreset: 'midnight-oled',
                terminalTheme: 'Dracula',
                terminalFontFamily: 'Fira Code',
                terminalFontSize: 14,
              },
            },
          }),
          write: vi.fn(),
        },
        app: {
          setLanguage: vi.fn(),
          setProxy: vi.fn(),
        },
        webInspector: {
          start: vi.fn().mockResolvedValue(undefined),
        },
        git: {
          setAutoFetchEnabled: vi.fn(),
        },
        shell: {
          detect: vi.fn().mockResolvedValue([{ id: 'powershell7', available: true }]),
        },
        env: {
          platform: 'win32',
        },
        updater: {
          setAutoUpdateEnabled: vi.fn(),
        },
      },
    });

    const { useSettingsStore } = await import('../index');
    vi.clearAllMocks();
    localStorageMock.removeItem('enso-shell-auto-detected');

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();
    await Promise.resolve();

    expect(resolveThemeVariables).toHaveBeenCalledWith({
      mode: 'light',
      preset: 'midnight-oled',
      customAccentColor: '',
      customTheme: null,
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith('enso-shell-auto-detected', 'true');
    expect(window.electronAPI.shell.detect).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().shellConfig.shellType).toBe('powershell7');

    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('true');

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();

    expect(window.electronAPI.shell.detect).not.toHaveBeenCalled();
  });

  it('registers the system theme listener only once across repeated rehydrates', async () => {
    const localStorageMock = createLocalStorageMock();
    const matchMediaAddEventListener = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        lang: '',
        classList: { toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    });
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: matchMediaAddEventListener,
      })),
      electronAPI: {
        settings: {
          read: vi.fn().mockResolvedValue({
            'enso-settings': {
              state: {
                language: 'en',
                theme: 'system',
                colorPreset: 'graphite-ink',
                terminalTheme: 'Dracula',
                terminalFontFamily: 'Fira Code',
                terminalFontSize: 14,
              },
            },
          }),
          write: vi.fn(),
        },
        app: {
          setLanguage: vi.fn(),
          setProxy: vi.fn(),
        },
        webInspector: {
          start: vi.fn().mockResolvedValue({ success: true }),
          stop: vi.fn().mockResolvedValue(undefined),
        },
        git: {
          setAutoFetchEnabled: vi.fn(),
        },
        shell: {
          detect: vi.fn().mockResolvedValue([]),
        },
        env: {
          platform: 'darwin',
        },
        updater: {
          setAutoUpdateEnabled: vi.fn(),
        },
        log: {
          updateConfig: vi.fn(),
        },
      },
    });

    const { useSettingsStore } = await import('../index');

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();
    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();

    expect(matchMediaAddEventListener).toHaveBeenCalledTimes(1);
  });
});
