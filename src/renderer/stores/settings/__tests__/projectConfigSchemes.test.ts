import type { ProjectConfigScheme } from '@shared/types';
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

function createScheme(overrides: Partial<ProjectConfigScheme> = {}): ProjectConfigScheme {
  return {
    id: 'scheme-alpha',
    name: 'Alpha',
    description: '',
    claudePolicy: {
      allowedCapabilityIds: ['legacy-skill:planner'],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: [],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      updatedAt: 1,
    },
    promptPresetId: 'prompt-alpha',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function loadSettingsStore(settingsReadResult: Record<string, unknown> | null = null) {
  vi.resetModules();

  vi.doMock('@/lib/ghosttyTheme', () => ({
    getTerminalThemeAccent: vi.fn(() => '#ff79c6'),
    isTerminalThemeDark: vi.fn(() => true),
  }));
  vi.doMock('@/lib/appTheme', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/appTheme')>();
    return {
      ...actual,
      resolveThemeVariables: vi.fn(() => ({
        '--background': 'oklch(0.19 0.014 245)',
        '--primary': 'oklch(0.74 0.11 195)',
        '--ring': 'oklch(0.78 0.11 198)',
      })),
    };
  });
  vi.doMock('@/utils/logging', () => ({
    updateRendererLogging: vi.fn(),
  }));

  vi.stubGlobal('document', {
    documentElement: {
      lang: '',
      classList: { toggle: vi.fn() },
      style: { setProperty: vi.fn() },
    },
  });
  vi.stubGlobal('localStorage', createLocalStorageMock());
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
    })),
    electronAPI: {
      settings: {
        read: vi.fn().mockResolvedValue(settingsReadResult),
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
  await Promise.resolve();
  await Promise.resolve();
  return useSettingsStore;
}

describe('project config schemes settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts with no project config schemes and supports add update remove', async () => {
    const useSettingsStore = await loadSettingsStore();
    const state = useSettingsStore.getState();

    expect(state.projectConfigSchemes).toEqual([]);

    state.addProjectConfigScheme(createScheme());
    expect(useSettingsStore.getState().projectConfigSchemes).toHaveLength(1);

    useSettingsStore.getState().updateProjectConfigScheme('scheme-alpha', {
      name: 'Renamed',
      promptPresetId: 'prompt-beta',
    });
    expect(useSettingsStore.getState().projectConfigSchemes[0]).toEqual(
      expect.objectContaining({
        id: 'scheme-alpha',
        name: 'Renamed',
        promptPresetId: 'prompt-beta',
      })
    );

    useSettingsStore.getState().removeProjectConfigScheme('scheme-alpha');
    expect(useSettingsStore.getState().projectConfigSchemes).toEqual([]);
  });

  it('hydrates persisted project config schemes', async () => {
    const scheme = createScheme({ id: 'persisted-scheme', name: 'Persisted' });
    const useSettingsStore = await loadSettingsStore({
      'enso-settings': {
        state: {
          projectConfigSchemes: [scheme],
        },
      },
    });

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();

    expect(useSettingsStore.getState().projectConfigSchemes).toEqual([scheme]);
  });

  it('sanitizes malformed persisted project config schemes', async () => {
    const useSettingsStore = await loadSettingsStore({
      'enso-settings': {
        state: {
          projectConfigSchemes: [
            {
              id: 'persisted-scheme',
              name: 'Persisted',
              description: null,
              claudePolicy: {
                allowedCapabilityIds: ['legacy-skill:planner', '', 'legacy-skill:planner'],
                blockedCapabilityIds: 'invalid',
                allowedSharedMcpIds: ['shared-search'],
                blockedSharedMcpIds: [false, 'shared-danger'],
                allowedPersonalMcpIds: [],
                blockedPersonalMcpIds: ['personal-db'],
                updatedAt: Number.NaN,
              },
              promptPresetId: '',
              createdAt: 'invalid',
              updatedAt: 8,
            },
            {
              id: '',
              name: 'Invalid',
            },
          ],
        },
      },
    });

    await useSettingsStore.persist.rehydrate();
    await Promise.resolve();

    expect(useSettingsStore.getState().projectConfigSchemes).toEqual([
      {
        id: 'persisted-scheme',
        name: 'Persisted',
        description: '',
        claudePolicy: {
          allowedCapabilityIds: ['legacy-skill:planner'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: ['shared-search'],
          blockedSharedMcpIds: ['shared-danger'],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: ['personal-db'],
          updatedAt: 0,
        },
        promptPresetId: null,
        createdAt: 0,
        updatedAt: 8,
      },
    ]);
  });
});
