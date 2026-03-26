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

async function loadSettingsStore(options?: {
  terminalAccent?: (theme: string) => string;
  isDarkTerminalTheme?: (theme: string) => boolean;
  matchDark?: boolean;
  settingsReadResult?: Record<string, unknown> | null;
  webInspectorStartResult?: { success: boolean; error?: string };
}) {
  vi.resetModules();

  const getTerminalThemeAccent = vi.fn(
    options?.terminalAccent ?? ((theme: string) => (theme === 'Nord' ? '#88c0d0' : '#ff79c6'))
  );
  const isTerminalThemeDark = vi.fn(
    options?.isDarkTerminalTheme ?? ((theme: string) => theme === 'Nord')
  );
  const resolveThemeVariables = vi.fn(() => ({
    '--background': 'oklch(0.19 0.014 245)',
    '--primary': 'oklch(0.74 0.11 195)',
    '--ring': 'oklch(0.78 0.11 198)',
  }));
  const updateRendererLogging = vi.fn();
  const classListToggle = vi.fn();
  const styleSetProperty = vi.fn();
  const mediaQueryAddEventListener = vi.fn();
  const settingsRead = vi.fn().mockResolvedValue(options?.settingsReadResult ?? null);
  const settingsWrite = vi.fn();
  const setLanguage = vi.fn();
  const setProxy = vi.fn();
  const setAutoFetchEnabled = vi.fn();
  const setAutoUpdateEnabled = vi.fn();
  const shellDetect = vi.fn().mockResolvedValue([]);
  const logUpdateConfig = vi.fn();
  const webInspectorStart = vi
    .fn()
    .mockResolvedValue(options?.webInspectorStartResult ?? { success: true });
  const webInspectorStop = vi.fn().mockResolvedValue(undefined);
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
      matches: options?.matchDark ?? false,
      addEventListener: mediaQueryAddEventListener,
    })),
    electronAPI: {
      settings: {
        read: settingsRead,
        write: settingsWrite,
      },
      app: {
        setLanguage,
        setProxy,
      },
      webInspector: {
        start: webInspectorStart,
        stop: webInspectorStop,
      },
      git: {
        setAutoFetchEnabled,
      },
      shell: {
        detect: shellDetect,
      },
      env: {
        platform: 'darwin',
      },
      updater: {
        setAutoUpdateEnabled,
      },
      log: {
        updateConfig: logUpdateConfig,
      },
    },
  });

  const { useSettingsStore } = await import('../index');
  await Promise.resolve();
  await Promise.resolve();
  vi.clearAllMocks();

  return {
    useSettingsStore,
    getTerminalThemeAccent,
    isTerminalThemeDark,
    resolveThemeVariables,
    updateRendererLogging,
    classListToggle,
    styleSetProperty,
    mediaQueryAddEventListener,
    settingsRead,
    settingsWrite,
    setLanguage,
    setProxy,
    setAutoFetchEnabled,
    setAutoUpdateEnabled,
    shellDetect,
    logUpdateConfig,
    webInspectorStart,
    webInspectorStop,
    localStorageMock,
  };
}

describe('settings store setters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies theme, terminal, proxy, logging, and web inspector side effects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadSettingsStore({
      matchDark: true,
      webInspectorStartResult: { success: false, error: 'port busy' },
    });
    const store = env.useSettingsStore.getState();

    store.setTheme('light');
    expect(env.classListToggle).toHaveBeenCalledWith('dark', false);

    store.setTheme('system');
    expect(env.classListToggle).toHaveBeenCalledWith('dark', true);

    store.setTheme('sync-terminal');
    expect(env.getTerminalThemeAccent).toHaveBeenCalledWith('Dracula');
    expect(env.resolveThemeVariables).toHaveBeenLastCalledWith({
      mode: 'light',
      preset: 'graphite-ink',
      customAccentColor: '#ff79c6',
      customTheme: null,
    });

    store.setTerminalTheme('Nord');
    expect(env.getTerminalThemeAccent).toHaveBeenCalledWith('Nord');
    expect(env.resolveThemeVariables).toHaveBeenLastCalledWith({
      mode: 'dark',
      preset: 'graphite-ink',
      customAccentColor: '#88c0d0',
      customTheme: null,
    });

    vi.clearAllMocks();
    store.setTheme('dark');
    vi.clearAllMocks();
    store.setColorPreset('warm-graphite');
    expect(env.resolveThemeVariables).toHaveBeenCalledWith({
      mode: 'dark',
      preset: 'warm-graphite',
      customAccentColor: '',
      customTheme: null,
    });
    expect(env.useSettingsStore.getState().colorPreset).toBe('warm-graphite');

    vi.clearAllMocks();
    store.setCustomAccentColor('#ff7a00');
    expect(env.resolveThemeVariables).toHaveBeenCalledWith({
      mode: 'dark',
      preset: 'warm-graphite',
      customAccentColor: '#ff7a00',
      customTheme: null,
    });
    expect(env.useSettingsStore.getState().customAccentColor).toBe('#ff7a00');

    store.setTerminalFontFamily('Fira Code');
    store.setTerminalFontSize(16);
    expect(env.styleSetProperty).toHaveBeenCalledWith('--font-family-mono', 'Fira Code');
    expect(env.styleSetProperty).toHaveBeenCalledWith('--font-size-base', '16px');

    store.setLanguage('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(env.setLanguage).toHaveBeenCalledWith('zh');

    store.setProxySettings({ enabled: true, server: 'http://127.0.0.1:7890' });
    expect(env.setProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        server: 'http://127.0.0.1:7890',
      })
    );

    store.setGitAutoFetchEnabled(false);
    expect(env.setAutoFetchEnabled).toHaveBeenCalledWith(false);

    store.setAutoUpdateEnabled(false);
    expect(env.setAutoUpdateEnabled).toHaveBeenCalledWith(false);

    store.setLoggingEnabled(true);
    expect(env.logUpdateConfig).toHaveBeenCalledWith({
      enabled: true,
      level: 'info',
      retentionDays: 7,
    });
    expect(env.updateRendererLogging).toHaveBeenCalledWith(true, 'info');

    store.setLogLevel('debug');
    expect(env.logUpdateConfig).toHaveBeenCalledWith({
      enabled: true,
      level: 'debug',
      retentionDays: 7,
    });
    expect(env.updateRendererLogging).toHaveBeenCalledWith(true, 'debug');

    store.setLogRetentionDays(14);
    expect(env.logUpdateConfig).toHaveBeenLastCalledWith({
      enabled: true,
      level: 'debug',
      retentionDays: 14,
    });
    expect(env.useSettingsStore.getState().logRetentionDays).toBe(14);

    await store.setWebInspectorEnabled(true);
    expect(env.webInspectorStart).toHaveBeenCalledTimes(1);
    expect(env.useSettingsStore.getState().webInspectorEnabled).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('[WebInspector] Failed to start:', 'port busy');

    await store.setWebInspectorEnabled(false);
    expect(env.webInspectorStop).toHaveBeenCalledTimes(1);
  });

  it('updates collection settings consistently across agents, providers, prompts, and favorites', async () => {
    const env = await loadSettingsStore();
    const store = env.useSettingsStore.getState();

    expect(store.colorPreset).toBe('graphite-ink');
    expect(store.customAccentColor).toBe('');

    const firstBuiltinAgentId = Object.keys(store.agentSettings)[0];

    expect(firstBuiltinAgentId).toBeTruthy();

    if (!firstBuiltinAgentId) {
      throw new Error('Expected at least one builtin agent');
    }

    store.setAgentEnabled(firstBuiltinAgentId, false);
    store.setAgentCustomConfig(firstBuiltinAgentId, {
      customPath: '/usr/local/bin/custom-agent',
      customArgs: '--fast',
    });
    store.setAgentDetectionStatus(firstBuiltinAgentId, { installed: true, detectedAt: 1 });
    store.clearAgentDetectionStatus(firstBuiltinAgentId);

    store.addCustomAgent({
      id: 'custom-agent',
      name: 'Custom Agent',
      command: 'custom-agent',
    });
    store.setAgentDefault('custom-agent');
    store.updateCustomAgent('custom-agent', { description: 'Updated agent' });

    const providerA = {
      id: 'provider-a',
      name: 'Provider A',
      baseUrl: 'https://a.example.com',
      authToken: 'token-a',
      enabled: true,
    };
    const providerB = {
      id: 'provider-b',
      name: 'Provider B',
      baseUrl: 'https://b.example.com',
      authToken: 'token-b',
      enabled: true,
    };

    store.addClaudeProvider(providerA);
    store.addClaudeProvider(providerB);
    store.updateClaudeProvider('provider-b', { name: 'Provider B Updated' });
    store.reorderClaudeProviders(1, 0);
    store.setClaudeProviderEnabled('provider-a', false);
    store.setClaudeProviderOrder([
      {
        ...providerB,
        name: 'Provider B Updated',
      },
      {
        ...providerA,
        enabled: false,
      },
    ]);

    const remoteProfile = {
      id: 'profile-a',
      name: 'Profile A',
      sshTarget: 'root@example.com',
      createdAt: 1,
      updatedAt: 1,
    };
    store.upsertRemoteProfile(remoteProfile);
    store.upsertRemoteProfile({ ...remoteProfile, name: 'Profile A Updated' });

    store.addHostMapping({ pattern: 'github.com', dirname: 'github' });
    store.updateHostMapping('github.com', { dirname: 'gh' });

    store.addMcpServer({
      id: 'stdio-server',
      name: 'Stdio Server',
      transportType: 'stdio',
      command: 'node',
      args: ['server.js'],
      enabled: true,
    });
    store.updateMcpServer('stdio-server', { description: 'Updated MCP' });
    store.setMcpServerEnabled('stdio-server', false);

    store.addPromptPreset({
      id: 'preset-a',
      name: 'Preset A',
      content: 'Hello',
      enabled: false,
      createdAt: 1,
      updatedAt: 1,
    });
    store.updatePromptPreset('preset-a', { content: 'Updated' });
    store.setPromptPresetEnabled('preset-a');

    store.addFavoriteTerminalTheme('Nord');
    store.addFavoriteTerminalTheme('Nord');
    store.toggleFavoriteTerminalTheme('Dracula');
    store.toggleFavoriteTerminalTheme('Dracula');
    store.toggleHiddenOpenInApp('com.example.app');
    store.setQuickTerminalEnabled(true);
    store.setQuickTerminalButtonPosition({ x: 10, y: 20 });
    store.setQuickTerminalModalPosition({ x: 30, y: 40 });
    store.setQuickTerminalModalSize({ width: 800, height: 500 });
    store.setQuickTerminalOpen(true);

    let state = env.useSettingsStore.getState();
    expect(state.agentSettings[firstBuiltinAgentId]).toMatchObject({
      enabled: false,
      customPath: '/usr/local/bin/custom-agent',
      customArgs: '--fast',
    });
    expect(state.agentDetectionStatus[firstBuiltinAgentId]).toBeUndefined();
    expect(state.customAgents).toEqual([
      {
        id: 'custom-agent',
        name: 'Custom Agent',
        command: 'custom-agent',
        description: 'Updated agent',
      },
    ]);
    expect(state.agentSettings['custom-agent']?.isDefault).toBe(true);
    expect(state.claudeCodeIntegration.providers).toEqual([
      expect.objectContaining({
        id: 'provider-b',
        name: 'Provider B Updated',
        displayOrder: 0,
      }),
      expect.objectContaining({
        id: 'provider-a',
        enabled: false,
        displayOrder: 1,
      }),
    ]);
    expect(state.remoteSettings.profiles).toEqual([
      { ...remoteProfile, name: 'Profile A Updated' },
    ]);
    expect(state.gitClone.hostMappings).toContainEqual({ pattern: 'github.com', dirname: 'gh' });
    expect(state.mcpServers).toEqual([
      expect.objectContaining({
        id: 'stdio-server',
        description: 'Updated MCP',
        enabled: false,
      }),
    ]);
    expect(state.promptPresets[0]).toMatchObject({
      id: 'preset-a',
      content: 'Updated',
      enabled: true,
    });
    expect(state.promptPresets[0]?.updatedAt).toBeGreaterThanOrEqual(1);
    expect(state.favoriteTerminalThemes).toEqual(['Nord']);
    expect(state.hiddenOpenInApps).toEqual(['com.example.app']);
    expect(state.quickTerminal).toMatchObject({
      enabled: true,
      buttonPosition: { x: 10, y: 20 },
      modalPosition: { x: 30, y: 40 },
      modalSize: { width: 800, height: 500 },
      isOpen: true,
    });

    store.removeClaudeProvider('provider-a');
    store.removeRemoteProfile('profile-a');
    store.removeHostMapping('github.com');
    store.removeMcpServer('stdio-server');
    store.removePromptPreset('preset-a');
    store.removeFavoriteTerminalTheme('Nord');
    store.removeCustomAgent('custom-agent');

    state = env.useSettingsStore.getState();
    expect(state.claudeCodeIntegration.providers).toHaveLength(1);
    expect(state.remoteSettings.profiles).toEqual([]);
    expect(state.gitClone.hostMappings.some((mapping) => mapping.pattern === 'github.com')).toBe(
      false
    );
    expect(state.mcpServers).toEqual([]);
    expect(state.promptPresets).toEqual([]);
    expect(state.favoriteTerminalThemes).toEqual([]);
    expect(state.customAgents).toEqual([]);
    expect(state.agentSettings['custom-agent']).toBeUndefined();
  });

  it('clamps numeric settings and excludes transient fields from persisted snapshots', async () => {
    const env = await loadSettingsStore();
    const store = env.useSettingsStore.getState();

    store.setBackgroundRandomInterval(Number.NaN);
    store.setBackgroundOpacity(4);
    store.setBackgroundBlur(-3);
    store.setBackgroundBrightness(Number.POSITIVE_INFINITY);
    store.setBackgroundSaturation(-1);
    store.setLogRetentionDays(99);
    store.triggerBackgroundRefresh();

    let state = env.useSettingsStore.getState();
    expect(state.backgroundRandomInterval).toBe(300);
    expect(state.backgroundOpacity).toBe(1);
    expect(state.backgroundBlur).toBe(0);
    expect(state.backgroundBrightness).toBe(1);
    expect(state.backgroundSaturation).toBe(0);
    expect(state.logRetentionDays).toBe(30);
    expect(state._backgroundRefreshKey).toBe(1);

    store.setBackgroundRandomInterval(2);
    store.setBackgroundOpacity(Number.NaN);
    store.setBackgroundBlur(25);
    store.setBackgroundBrightness(1.5);
    store.setBackgroundSaturation(1.25);
    store.setLogRetentionDays(0);

    state = env.useSettingsStore.getState();
    expect(state.backgroundRandomInterval).toBe(5);
    expect(state.backgroundOpacity).toBe(1);
    expect(state.backgroundBlur).toBe(20);
    expect(state.backgroundBrightness).toBe(1.5);
    expect(state.backgroundSaturation).toBe(1.25);
    expect(state.logRetentionDays).toBe(1);

    const persisted = env.useSettingsStore.persist.getOptions().partialize?.(state);
    expect(persisted).toBeDefined();
    expect(typeof persisted).toBe('object');
    expect(persisted).not.toBeNull();

    if (!persisted || typeof persisted !== 'object') {
      throw new Error('Expected persisted settings snapshot');
    }

    expect(Object.hasOwn(persisted, '_backgroundRefreshKey')).toBe(false);
  });
});
