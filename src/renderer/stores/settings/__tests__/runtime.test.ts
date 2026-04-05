import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import type { SettingsState } from '../types';

type RuntimeSettingsStoreApi = Pick<StoreApi<SettingsState>, 'getState' | 'setState' | 'subscribe'>;
type RuntimeSetStateArg =
  | SettingsState
  | Partial<SettingsState>
  | ((state: SettingsState) => SettingsState | Partial<SettingsState>);

function createRuntimeState(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    theme: 'system',
    terminalAccentSync: false,
    colorPreset: 'graphite-ink',
    customAccentColor: '',
    activeThemeSelection: {
      kind: 'preset',
      presetId: 'graphite-ink',
    },
    customThemes: [],
    fontFamily: '"Test Sans", sans-serif',
    fontSize: 14,
    terminalFontFamily: 'Fira Code',
    language: 'en',
    terminalTheme: 'Dracula',
    loggingEnabled: false,
    logLevel: 'info',
    logRetentionDays: 7,
    proxySettings: {
      enabled: false,
      httpProxy: '',
      httpsProxy: '',
      noProxy: '',
    },
    webInspectorEnabled: false,
    gitAutoFetchEnabled: false,
    setShellConfig: vi.fn(),
    ...overrides,
  } as unknown as SettingsState;
}

function createRuntimeStore(state: SettingsState) {
  let currentState = state;
  const getState: RuntimeSettingsStoreApi['getState'] = () => currentState;
  const setState = ((partial: RuntimeSetStateArg, replace?: boolean) => {
    const nextState = typeof partial === 'function' ? partial(currentState) : partial;

    currentState = (
      replace
        ? nextState
        : {
            ...currentState,
            ...nextState,
          }
    ) as SettingsState;
  }) as RuntimeSettingsStoreApi['setState'];
  const subscribeMock = vi.fn(
    (listener: (state: SettingsState, previousState: SettingsState) => void) => {
      void listener;
      return () => {};
    }
  );
  const subscribe = subscribeMock as RuntimeSettingsStoreApi['subscribe'];

  return {
    store: {
      getState,
      setState,
      subscribe,
    } as RuntimeSettingsStoreApi,
    getCurrentState: () => currentState,
    subscribeMock,
  };
}

describe('settings runtime helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies dataset theme metadata and refreshes system theme state from the media query listener', async () => {
    let prefersDark = false;
    let themeChangeHandler: (() => void) | undefined;

    const resolveThemeVariables = vi.fn(() => ({
      '--background': 'oklch(0.19 0.014 245)',
    }));
    const updateRendererLogging = vi.fn();
    const cleanupLegacyFields = vi.fn().mockResolvedValue(undefined);
    const classListToggle = vi.fn();
    const styleSetProperty = vi.fn();
    const setLanguage = vi.fn();

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
        dataset: {},
        classList: { toggle: classListToggle },
        style: { setProperty: styleSetProperty },
      },
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({
        get matches() {
          return prefersDark;
        },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'change') {
            themeChangeHandler = handler;
          }
        }),
      })),
      electronAPI: {
        app: {
          setLanguage,
          setProxy: vi.fn(),
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

    const state = createRuntimeState();
    const { store } = createRuntimeStore(state);
    const { finishSettingsRuntimeHydration } = await import('../runtime');

    finishSettingsRuntimeHydration(store, state);

    expect(document.documentElement.dataset.themeMode).toBe('light');
    expect(document.documentElement.dataset.themeSource).toBe('system');
    expect(document.documentElement.dataset.themePreset).toBe('graphite-ink');
    expect(classListToggle).toHaveBeenCalledWith('dark', false);
    expect(styleSetProperty).toHaveBeenCalledWith('--font-family-sans', '"Test Sans", sans-serif');
    expect(setLanguage).toHaveBeenCalledWith('en');

    prefersDark = true;
    themeChangeHandler?.();

    expect(document.documentElement.dataset.themeMode).toBe('dark');
    expect(classListToggle).toHaveBeenLastCalledWith('dark', true);
    expect(resolveThemeVariables).toHaveBeenLastCalledWith({
      mode: 'dark',
      preset: 'graphite-ink',
      customAccentColor: '',
      customTheme: null,
    });
  });

  it('tolerates missing web inspector APIs and warns when cleanup or shell auto-detection fails', async () => {
    const resolveThemeVariables = vi.fn(() => ({
      '--background': 'oklch(0.19 0.014 245)',
    }));
    const updateRendererLogging = vi.fn();
    const cleanupLegacyFields = vi.fn().mockRejectedValue(new Error('cleanup failed'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const localStorageGetItem = vi.fn(() => null);
    const localStorageSetItem = vi.fn();
    const detectShell = vi.fn().mockRejectedValue(new Error('detect failed'));

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
        dataset: {},
        classList: { toggle: vi.fn() },
        style: { setProperty: vi.fn() },
      },
    });
    vi.stubGlobal('localStorage', {
      getItem: localStorageGetItem,
      setItem: localStorageSetItem,
    });
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
      })),
      electronAPI: {
        app: {
          setLanguage: vi.fn(),
          setProxy: vi.fn(),
        },
        git: {
          setAutoFetchEnabled: vi.fn(),
        },
        shell: {
          detect: detectShell,
        },
        env: {
          platform: 'win32',
        },
        updater: {
          setAutoUpdateEnabled: vi.fn(),
        },
        log: {
          updateConfig: vi.fn(),
        },
      },
    });

    const state = createRuntimeState({
      webInspectorEnabled: true,
      gitAutoFetchEnabled: true,
    });
    const { store } = createRuntimeStore(state);
    const { finishSettingsRuntimeHydration } = await import('../runtime');

    finishSettingsRuntimeHydration(store, state);
    await Promise.resolve();
    await Promise.resolve();

    expect(localStorageGetItem).toHaveBeenCalledWith('enso-shell-auto-detected');
    expect(localStorageSetItem).toHaveBeenCalledWith('enso-shell-auto-detected', 'true');
    expect(detectShell).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to cleanup legacy fields:',
      expect.objectContaining({ message: 'cleanup failed' })
    );
    expect(consoleWarn).toHaveBeenCalledWith(
      'Shell auto-detection failed:',
      expect.objectContaining({ message: 'detect failed' })
    );
  });

  it('installs runtime subscriptions only once across repeated initialization', async () => {
    const { store, subscribeMock } = createRuntimeStore(createRuntimeState());
    const { initializeSettingsRuntime } = await import('../runtime');

    initializeSettingsRuntime(store);
    initializeSettingsRuntime(store);

    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });
});
