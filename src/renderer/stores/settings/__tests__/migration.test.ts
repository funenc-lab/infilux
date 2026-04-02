import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupLegacyFields, migrateSettings } from '../migration';
import type { SettingsState, TerminalKeybinding } from '../types';

function key(key: string): TerminalKeybinding {
  return { key };
}

function createCurrentState(): SettingsState {
  return {
    colorPreset: 'graphite-ink',
    customAccentColor: '',
    backgroundOpacity: 0.85,
    backgroundBlur: 0,
    backgroundBrightness: 1,
    backgroundSaturation: 1,
    backgroundImageEnabled: false,
    backgroundImagePath: '',
    backgroundUrlPath: '',
    backgroundFolderPath: '',
    backgroundSourceType: 'file',
    backgroundRandomEnabled: false,
    backgroundRandomInterval: 300,
    backgroundSizeMode: 'cover',
    terminalRenderer: 'dom',
    xtermKeybindings: {
      newTab: key('t'),
      closeTab: key('w'),
      nextTab: key(']'),
      prevTab: key('['),
      split: key('d'),
      merge: key('m'),
      clear: key('k'),
    },
    claudeCodeIntegration: {
      enabled: true,
      selectionChangedDebounce: 300,
      atMentionedKeybinding: key('m'),
      stopHookEnabled: true,
      permissionRequestHookEnabled: true,
      statusLineEnabled: false,
      statusLineFields: {
        model: true,
        context: true,
        cost: true,
        duration: false,
        lines: false,
        tokens: false,
        cache: false,
        apiTime: false,
        currentDir: false,
        projectDir: false,
        version: false,
      },
      tmuxEnabled: false,
      showProviderSwitcher: true,
      enableProviderWatcher: true,
      enableProviderDisableFeature: false,
      providers: [],
      enhancedInputEnabled: false,
      enhancedInputAutoPopup: 'manual',
      autoSessionRollover: 'manual',
    },
    agentDetectionStatus: {
      enabledAgent: { installed: true, version: '1.0.0', detectedAt: 1 },
      disabledAgent: { installed: true, version: '1.0.0', detectedAt: 2 },
    },
    agentSettings: {
      enabledAgent: { enabled: true, isDefault: true },
      disabledAgent: { enabled: false, isDefault: false },
    },
    mainTabKeybindings: {
      switchToAgent: key('1'),
      switchToFile: key('2'),
      switchToTerminal: key('3'),
      switchToSourceControl: key('4'),
    },
    sourceControlKeybindings: {
      prevDiff: key('p'),
      nextDiff: key('n'),
    },
    searchKeybindings: {
      searchFiles: key('f'),
      searchContent: key('g'),
    },
    editorKeybindings: {
      gotoSymbol: key('o'),
    },
    globalKeybindings: {
      runningProjects: key('r'),
    },
    workspaceKeybindings: {
      toggleWorktree: key('w'),
      toggleRepository: key('e'),
      switchActiveWorktree: key('s'),
    },
    editorSettings: { minimapEnabled: true },
    commitMessageGenerator: {
      enabled: true,
      maxDiffLines: 1000,
      timeout: 120,
      provider: 'claude-code',
      model: 'haiku',
      prompt: 'commit',
    },
    codeReview: {
      enabled: true,
      maxDiffLines: 1000,
      timeout: 120,
      provider: 'claude-code',
      model: 'haiku',
      prompt: 'review',
      showComments: true,
    },
    branchNameGenerator: {
      enabled: false,
      provider: 'claude-code',
      model: 'haiku',
      prompt: 'branch',
    },
    todoPolish: {
      enabled: true,
      provider: 'claude-code',
      model: 'haiku',
      timeout: 60,
      prompt: 'todo',
    },
    hapiSettings: {
      enabled: false,
      port: 3000,
      authToken: '',
      cliPath: '',
      apiKey: '',
      cliApiToken: '',
      telegramBotToken: '',
      webappUrl: '',
      allowedChatIds: '',
      cfEnabled: false,
      tunnelMode: 'token',
      tunnelToken: '',
      useHttp2: false,
      runnerEnabled: false,
      happyEnabled: false,
    },
    remoteSettings: { profiles: [] },
    proxySettings: { enabled: false, httpProxy: '', httpsProxy: '', noProxy: '' },
    mcpServers: [],
    promptPresets: [],
    quickTerminal: {
      enabled: false,
      buttonPosition: null,
      modalPosition: null,
      modalSize: null,
      isOpen: false,
    },
  } as unknown as SettingsState;
}

describe('migrateSettings', () => {
  it('clamps persisted background values, migrates url source path, and upgrades legacy canvas renderer', () => {
    const result = migrateSettings(
      {
        backgroundOpacity: 99,
        backgroundBlur: -10,
        backgroundBrightness: '1.5' as never,
        backgroundSaturation: '2.5' as never,
        backgroundImageEnabled: true,
        backgroundImagePath: 'https://example.com/wallpaper.png',
        backgroundSourceType: 'url',
        terminalRenderer: 'canvas' as never,
      },
      createCurrentState()
    );

    expect(result.backgroundOpacity).toBe(1);
    expect(result.backgroundBlur).toBe(0);
    expect(result.backgroundBrightness).toBe(1.5);
    expect(result.backgroundSaturation).toBe(2);
    expect(result.backgroundUrlPath).toBe('https://example.com/wallpaper.png');
    expect(result.terminalRenderer).toBe('webgl');
  });

  it('migrates legacy keybindings and filters detection status to enabled agents only', () => {
    const persisted = {
      terminalKeybindings: { clear: key('x') },
      agentKeybindings: {
        newSession: key('n'),
        closeSession: key('c'),
      },
      terminalPaneKeybindings: {
        split: key('s'),
        merge: key('g'),
      },
      agentDetectionStatus: {
        enabledAgent: { installed: true, version: '2.0.0', detectedAt: 10 },
        disabledAgent: { installed: true, version: '2.0.0', detectedAt: 11 },
      },
    } as unknown as Partial<SettingsState>;

    const result = migrateSettings(persisted, createCurrentState());

    expect(result.xtermKeybindings).toMatchObject({
      newTab: key('n'),
      closeTab: key('c'),
      split: key('s'),
      merge: key('g'),
      clear: key('x'),
    });
    expect(result.agentDetectionStatus).toEqual({
      enabledAgent: { installed: true, version: '2.0.0', detectedAt: 10 },
    });
  });

  it('migrates legacy enhanced input auto-popup booleans and repairs inconsistent stop hook state', () => {
    const currentState = createCurrentState();

    const legacyTrue = migrateSettings(
      {
        claudeCodeIntegration: {
          enhancedInputAutoPopup: true as never,
          stopHookEnabled: true,
        } as never,
      },
      currentState
    );
    expect(legacyTrue.claudeCodeIntegration.enhancedInputAutoPopup).toBe('hideWhileRunning');

    const inconsistent = migrateSettings(
      {
        claudeCodeIntegration: {
          enhancedInputAutoPopup: 'hideWhileRunning' as never,
          stopHookEnabled: false,
        } as never,
      },
      currentState
    );
    expect(inconsistent.claudeCodeIntegration.enhancedInputAutoPopup).toBe('always');
  });

  it('falls back to manual auto session rollover when the persisted mode is invalid', () => {
    const currentState = createCurrentState();

    const result = migrateSettings(
      {
        claudeCodeIntegration: {
          autoSessionRollover: 'always' as never,
        } as never,
      },
      currentState
    );

    expect(result.claudeCodeIntegration.autoSessionRollover).toBe('manual');
  });

  it('accepts the graphite red preset as a persisted preset value', () => {
    const result = migrateSettings(
      {
        colorPreset: 'graphite-red',
        activeThemeSelection: {
          kind: 'preset',
          presetId: 'graphite-red',
        },
      } as unknown as Partial<SettingsState>,
      createCurrentState()
    );

    expect(result.colorPreset).toBe('graphite-red');
    expect(result.activeThemeSelection).toEqual({
      kind: 'preset',
      presetId: 'graphite-red',
    });
  });

  it('falls back to a supported color preset and sanitizes invalid custom accent values', () => {
    const result = migrateSettings(
      {
        colorPreset: 'unknown' as never,
        customAccentColor: 'not-a-color' as never,
      },
      createCurrentState()
    );

    expect(result.colorPreset).toBe('graphite-ink');
    expect(result.customAccentColor).toBe('');
  });

  it('maps legacy color preset ids to the new Bear-like preset family', () => {
    const result = migrateSettings(
      {
        colorPreset: 'amber-command' as never,
      },
      createCurrentState()
    );

    expect(result.colorPreset).toBe('warm-graphite');
  });

  it('retires the old red preset ids into the supported preset set', () => {
    const result = migrateSettings(
      {
        colorPreset: 'classic-red' as never,
        activeThemeSelection: {
          kind: 'preset',
          presetId: 'red-graphite-oled' as never,
        } as never,
      },
      createCurrentState()
    );

    expect(result.colorPreset).toBe('warm-graphite');
    expect(result.activeThemeSelection).toEqual({
      kind: 'preset',
      presetId: 'midnight-oled',
    });
  });

  it('sanitizes custom themes and repairs invalid custom theme selections', () => {
    const result = migrateSettings(
      {
        customThemes: [
          null,
          {
            id: 'preset-theme',
            name: '  Preset Theme  ',
            sourceType: 'preset',
            sourcePresetId: 'tide-blue',
            createdAt: 10,
            updatedAt: 11,
            tokens: {
              light: {
                background: '#101010',
              },
            },
          },
          {
            id: 'blank-theme',
            name: 'Blank Theme',
            sourceType: 'blank',
            sourcePresetId: 'classic-red',
            createdAt: 12,
            updatedAt: 13,
            tokens: {},
          },
          {
            id: 'invalid-preset-theme',
            name: 'Invalid Preset Theme',
            sourceType: 'preset',
            sourcePresetId: 'unknown-preset',
            createdAt: 14,
            updatedAt: 15,
            tokens: {},
          },
          {
            id: '',
            name: 'invalid',
          },
        ] as never,
        activeThemeSelection: {
          kind: 'custom',
          customThemeId: 'missing-theme',
        } as never,
      },
      createCurrentState()
    );

    expect(result.customThemes).toHaveLength(3);
    expect(result.customThemes[0]).toMatchObject({
      id: 'preset-theme',
      name: 'Preset Theme',
      sourceType: 'preset',
      sourcePresetId: 'tide-blue',
    });
    expect(result.customThemes[0].tokens.light.background).toBe('#101010');
    expect(result.customThemes[1]).toMatchObject({
      id: 'blank-theme',
      name: 'Blank Theme',
      sourceType: 'blank',
    });
    expect('sourcePresetId' in result.customThemes[1]).toBe(false);
    expect(result.customThemes[2]).toMatchObject({
      id: 'invalid-preset-theme',
      name: 'Invalid Preset Theme',
      sourceType: 'preset',
      sourcePresetId: 'warm-graphite',
    });
    expect(result.activeThemeSelection).toEqual({
      kind: 'custom',
      customThemeId: 'preset-theme',
    });
  });
});

describe('cleanupLegacyFields', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('window', {
      electronAPI: {
        settings: {
          read: vi.fn(),
          write: vi.fn(),
        },
      },
    });
  });

  it('removes legacy keybinding fields from persisted settings state', async () => {
    const read = vi.fn().mockResolvedValue({
      'enso-settings': {
        state: {
          terminalKeybindings: { clear: key('x') },
          agentKeybindings: { newSession: key('n') },
          terminalPaneKeybindings: { split: key('s') },
          untouched: true,
        },
      },
    });
    const write = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        settings: { read, write },
      },
    });

    await cleanupLegacyFields();

    expect(write).toHaveBeenCalledWith({
      'enso-settings': {
        state: {
          untouched: true,
        },
      },
    });
  });
});
