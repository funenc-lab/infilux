import { normalizeLocale } from '@shared/i18n';
import type { CustomAgent, McpServer, PromptPreset } from '@shared/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  APP_THEME_PROTECTED_TOKEN_KEYS,
  createBlankCustomThemeDocument,
  createCustomThemeFromPresetDocument,
  normalizeColorPreset,
  sanitizeCustomAccentColor,
} from '@/lib/appTheme';
import {
  DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
  normalizeChatPanelInactivityThresholdMinutes,
} from './chatPanelInactivityThresholdPolicy';
import {
  defaultAgentSettings,
  defaultBranchNameGeneratorSettings,
  defaultClaudeCodeIntegrationSettings,
  defaultCodeReviewSettings,
  defaultCommitMessageGeneratorSettings,
  defaultEditorKeybindings,
  defaultEditorSettings,
  defaultGitCloneSettings,
  defaultGlobalKeybindings,
  defaultHapiSettings,
  defaultMainTabKeybindings,
  defaultProxySettings,
  defaultQuickTerminalSettings,
  defaultRemoteSettings,
  defaultSearchKeybindings,
  defaultSourceControlKeybindings,
  defaultTodoPolishSettings,
  defaultWorkspaceKeybindings,
  defaultXtermKeybindings,
  getDefaultLocale,
  getDefaultShellConfig,
  getDefaultUIFontFamily,
} from './defaults';
import { migrateSettings } from './migration';
import {
  beginSettingsRuntimeHydration,
  deriveNextFontFamilyForLanguage,
  finishSettingsRuntimeHydration,
  initializeSettingsRuntime,
} from './runtime';
import { electronStorage } from './storage';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  normalizeTerminalScrollback,
} from './terminalScrollbackPolicy';
import type {
  BackgroundSizeMode,
  BackgroundSourceType,
  ColorPreset,
  CustomThemeDocument,
  FontWeight,
  SettingsState,
  Theme,
} from './types';

const protectedThemeTokenKeys = new Set<string>(APP_THEME_PROTECTED_TOKEN_KEYS);

export * from './defaults';
// Re-export types and defaults for external use
export * from './types';

// Get initial state values
function getInitialState() {
  const defaultLanguage = getDefaultLocale();

  return {
    // UI Settings
    theme: 'system' as Theme,
    terminalAccentSync: false,
    colorPreset: 'graphite-ink' as ColorPreset,
    customAccentColor: '',
    activeThemeSelection: { kind: 'preset' as const, presetId: 'graphite-ink' as ColorPreset },
    customThemes: [] as CustomThemeDocument[],
    layoutMode: 'tree' as const,
    fileTreeDisplayMode: 'legacy' as const,
    repositoryListDisplayMode: 'list' as const,
    agentSessionDisplayMode: 'tab' as const,
    language: defaultLanguage,
    fontSize: 14,
    fontFamily: getDefaultUIFontFamily(defaultLanguage),

    // Terminal Settings
    terminalFontSize: 18,
    terminalFontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
    terminalFontWeight: 'normal' as FontWeight,
    terminalFontWeightBold: '500' as FontWeight,
    terminalTheme: 'Dracula',
    terminalRenderer: 'webgl' as const,
    terminalScrollback: DEFAULT_TERMINAL_SCROLLBACK,
    terminalOptionIsMeta: true,
    copyOnSelection: false,

    // Keybindings
    xtermKeybindings: defaultXtermKeybindings,
    mainTabKeybindings: defaultMainTabKeybindings,
    sourceControlKeybindings: defaultSourceControlKeybindings,
    searchKeybindings: defaultSearchKeybindings,
    editorKeybindings: defaultEditorKeybindings,
    globalKeybindings: defaultGlobalKeybindings,
    workspaceKeybindings: defaultWorkspaceKeybindings,

    // Editor Settings
    editorSettings: defaultEditorSettings,

    // Agent Settings
    agentSettings: defaultAgentSettings,
    agentDetectionStatus: {},
    customAgents: [] as CustomAgent[],
    shellConfig: getDefaultShellConfig(),
    chatPanelInactivityThresholdMinutes: DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
    retainSessionBackedChatPanels: true,
    agentNotificationEnabled: true,
    agentNotificationDelay: 5,
    agentNotificationEnterDelay: 5,

    // Claude Code Integration
    claudeCodeIntegration: defaultClaudeCodeIntegrationSettings,

    // AI Features
    commitMessageGenerator: defaultCommitMessageGeneratorSettings,
    codeReview: defaultCodeReviewSettings,
    branchNameGenerator: defaultBranchNameGeneratorSettings,
    todoPolish: defaultTodoPolishSettings,

    // App Settings
    autoUpdateEnabled: true,
    hapiSettings: defaultHapiSettings,
    remoteSettings: defaultRemoteSettings,
    defaultWorktreePath: '',
    proxySettings: defaultProxySettings,
    autoCreateSessionOnActivate: false,
    confirmBeforeClosingAgentSession: true,

    // Git Auto Operations
    gitAutoFetchEnabled: true,

    // Git Clone Settings
    gitClone: defaultGitCloneSettings,

    // Beta features
    todoEnabled: false,
    glowEffectEnabled: false,
    temporaryWorkspaceEnabled: false,
    defaultTemporaryPath: '',
    autoCreateSessionOnTempActivate: false,

    // Background image defaults
    backgroundImageEnabled: false,
    backgroundImagePath: '',
    backgroundUrlPath: '',
    backgroundFolderPath: '',
    backgroundSourceType: 'file' as BackgroundSourceType,
    backgroundRandomEnabled: false,
    backgroundRandomInterval: 300,
    backgroundOpacity: 0.85,
    backgroundBlur: 0,
    backgroundBrightness: 1,
    backgroundSaturation: 1,
    backgroundSizeMode: 'cover' as BackgroundSizeMode,
    _backgroundRefreshKey: 0,

    // MCP, Prompts defaults
    mcpServers: [] as McpServer[],
    promptPresets: [] as PromptPreset[],

    // Settings display mode
    settingsDisplayMode: 'tab' as const,
    settingsModalPosition: null,

    // Terminal theme favorites
    favoriteTerminalThemes: [] as string[],

    // Quick Terminal defaults
    quickTerminal: defaultQuickTerminalSettings,

    // Web Inspector defaults
    webInspectorEnabled: false,

    // Hide Groups default
    hideGroups: false,
    hiddenOpenInApps: [] as string[],
    openInMenuFilterEnabled: false,

    // File Tree defaults
    fileTreeAutoReveal: true, // Auto-reveal active file in file tree by default (like VSCode)

    // Logging defaults
    loggingEnabled: false,
    logLevel: 'info' as const,
    logRetentionDays: 7,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      // UI Setters
      setTheme: (theme) => set({ theme }),
      setTerminalAccentSync: (terminalAccentSync) => set({ terminalAccentSync }),

      setColorPreset: (colorPreset) => {
        const normalizedPreset = normalizeColorPreset(colorPreset);
        set({
          colorPreset: normalizedPreset,
          activeThemeSelection: {
            kind: 'preset',
            presetId: normalizedPreset,
          },
        });
      },

      setCustomAccentColor: (customAccentColor) => {
        set({ customAccentColor: sanitizeCustomAccentColor(customAccentColor) });
      },

      setActivePresetTheme: (preset) => {
        const normalizedPreset = normalizeColorPreset(preset);
        set({
          colorPreset: normalizedPreset,
          activeThemeSelection: {
            kind: 'preset',
            presetId: normalizedPreset,
          },
        });
      },

      setActiveCustomTheme: (themeId) => {
        const state = get();
        if (!state.customThemes.some((entry) => entry.id === themeId)) {
          return;
        }
        set({
          activeThemeSelection: {
            kind: 'custom',
            customThemeId: themeId,
          },
        });
      },

      createCustomThemeFromPreset: (preset) => {
        const nextTheme = createCustomThemeFromPresetDocument(normalizeColorPreset(preset));
        const state = get();
        const customThemes = [...state.customThemes, nextTheme];
        set({
          customThemes,
          activeThemeSelection: {
            kind: 'custom',
            customThemeId: nextTheme.id,
          },
        });

        return nextTheme.id;
      },

      createBlankCustomTheme: () => {
        const nextTheme = createBlankCustomThemeDocument();
        const state = get();
        const customThemes = [...state.customThemes, nextTheme];
        set({
          customThemes,
          activeThemeSelection: {
            kind: 'custom',
            customThemeId: nextTheme.id,
          },
        });

        return nextTheme.id;
      },

      renameCustomTheme: (themeId, name) => {
        const nextName = name.trim();
        if (!nextName) {
          return;
        }

        set((state) => ({
          customThemes: state.customThemes.map((theme) =>
            theme.id === themeId
              ? {
                  ...theme,
                  name: nextName,
                  updatedAt: Date.now(),
                }
              : theme
          ),
        }));
      },

      deleteCustomTheme: (themeId) => {
        const state = get();
        const customThemes = state.customThemes.filter((theme) => theme.id !== themeId);
        const nextSelection =
          state.activeThemeSelection.kind === 'custom' &&
          state.activeThemeSelection.customThemeId === themeId
            ? {
                kind: 'preset' as const,
                presetId: state.colorPreset,
              }
            : state.activeThemeSelection;
        set({
          customThemes,
          activeThemeSelection: nextSelection,
        });
      },

      updateCustomThemeTokens: (themeId, mode, updates) => {
        const state = get();
        const timestamp = Date.now();
        const sanitizedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([key]) => !protectedThemeTokenKeys.has(key))
        );

        if (Object.keys(sanitizedUpdates).length === 0) {
          return;
        }

        const customThemes = state.customThemes.map((theme) =>
          theme.id === themeId
            ? {
                ...theme,
                updatedAt: timestamp,
                tokens: {
                  ...theme.tokens,
                  [mode]: {
                    ...theme.tokens[mode],
                    ...sanitizedUpdates,
                  },
                },
              }
            : theme
        );
        set({ customThemes });
      },

      setLayoutMode: (layoutMode) => set({ layoutMode }),

      setFileTreeDisplayMode: (fileTreeDisplayMode) => set({ fileTreeDisplayMode }),

      setRepositoryListDisplayMode: (repositoryListDisplayMode) =>
        set({ repositoryListDisplayMode }),

      setAgentSessionDisplayMode: (agentSessionDisplayMode) => set({ agentSessionDisplayMode }),

      setLanguage: (language) => {
        const normalizedLanguage = normalizeLocale(language);
        const currentState = get();
        const nextFontFamily = deriveNextFontFamilyForLanguage(
          currentState.language,
          currentState.fontFamily,
          normalizedLanguage
        );
        set({
          language: normalizedLanguage,
          fontFamily: nextFontFamily,
        });
      },

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),

      // Terminal Setters
      setTerminalFontSize: (terminalFontSize) => {
        set({ terminalFontSize });
      },

      setTerminalFontFamily: (terminalFontFamily) => set({ terminalFontFamily }),

      setTerminalFontWeight: (terminalFontWeight) => set({ terminalFontWeight }),
      setTerminalFontWeightBold: (terminalFontWeightBold) => set({ terminalFontWeightBold }),

      setTerminalTheme: (terminalTheme) => set({ terminalTheme }),

      setTerminalRenderer: (terminalRenderer) => set({ terminalRenderer }),
      setTerminalScrollback: (terminalScrollback) =>
        set({
          terminalScrollback: normalizeTerminalScrollback(
            terminalScrollback,
            get().terminalScrollback
          ),
        }),
      setTerminalOptionIsMeta: (terminalOptionIsMeta) => set({ terminalOptionIsMeta }),
      setCopyOnSelection: (copyOnSelection) => set({ copyOnSelection }),

      // Keybinding Setters
      setXtermKeybindings: (xtermKeybindings) => set({ xtermKeybindings }),
      setMainTabKeybindings: (mainTabKeybindings) => set({ mainTabKeybindings }),
      setSourceControlKeybindings: (sourceControlKeybindings) => set({ sourceControlKeybindings }),
      setSearchKeybindings: (searchKeybindings) => set({ searchKeybindings }),
      setEditorKeybindings: (editorKeybindings) => set({ editorKeybindings }),
      setGlobalKeybindings: (globalKeybindings) => set({ globalKeybindings }),
      setWorkspaceKeybindings: (workspaceKeybindings) => set({ workspaceKeybindings }),

      // Editor Setters
      setEditorSettings: (settings) =>
        set((state) => ({
          editorSettings: { ...state.editorSettings, ...settings },
        })),

      // Agent Setters
      setAgentEnabled: (agentId, enabled) => {
        const current = get().agentSettings;
        set({
          agentSettings: {
            ...current,
            [agentId]: { ...current[agentId], enabled },
          },
        });
      },

      setAgentDefault: (agentId) => {
        const current = get().agentSettings;
        const updated = { ...current };
        for (const id of Object.keys(updated)) {
          updated[id] = { ...updated[id], isDefault: id === agentId };
        }
        set({ agentSettings: updated });
      },

      setAgentCustomConfig: (agentId, config) => {
        const current = get().agentSettings;
        set({
          agentSettings: {
            ...current,
            [agentId]: {
              ...current[agentId],
              customPath: config.customPath || undefined,
              customArgs: config.customArgs || undefined,
            },
          },
        });
      },

      setAgentDetectionStatus: (agentId, info) => {
        const current = get().agentDetectionStatus;
        set({
          agentDetectionStatus: {
            ...current,
            [agentId]: info,
          },
        });
      },

      clearAgentDetectionStatus: (agentId) => {
        const current = get().agentDetectionStatus;
        const updated = { ...current };
        delete updated[agentId];
        set({ agentDetectionStatus: updated });
      },

      addCustomAgent: (agent) => {
        const { customAgents, agentSettings } = get();
        set({
          customAgents: [...customAgents, agent],
          agentSettings: {
            ...agentSettings,
            [agent.id]: { enabled: true, isDefault: false },
          },
        });
      },

      updateCustomAgent: (id, updates) => {
        const { customAgents } = get();
        set({
          customAgents: customAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        });
      },

      removeCustomAgent: (id) => {
        const { customAgents, agentSettings } = get();
        const wasDefault = agentSettings[id]?.isDefault;
        const newAgentSettings = { ...agentSettings };
        delete newAgentSettings[id];

        if (wasDefault) {
          const firstEnabled = Object.entries(newAgentSettings).find(([, cfg]) => cfg.enabled);
          if (firstEnabled) {
            newAgentSettings[firstEnabled[0]] = { ...firstEnabled[1], isDefault: true };
          }
        }

        set({
          customAgents: customAgents.filter((a) => a.id !== id),
          agentSettings: newAgentSettings,
        });
      },

      setShellConfig: (shellConfig) => set({ shellConfig }),
      setChatPanelInactivityThresholdMinutes: (chatPanelInactivityThresholdMinutes) =>
        set({
          chatPanelInactivityThresholdMinutes: normalizeChatPanelInactivityThresholdMinutes(
            chatPanelInactivityThresholdMinutes,
            get().chatPanelInactivityThresholdMinutes
          ),
        }),
      setRetainSessionBackedChatPanels: (retainSessionBackedChatPanels) =>
        set({ retainSessionBackedChatPanels }),
      setAgentNotificationEnabled: (agentNotificationEnabled) => set({ agentNotificationEnabled }),
      setAgentNotificationDelay: (agentNotificationDelay) => set({ agentNotificationDelay }),
      setAgentNotificationEnterDelay: (agentNotificationEnterDelay) =>
        set({ agentNotificationEnterDelay }),

      // Claude Code Integration Setters
      setClaudeCodeIntegration: (settings) =>
        set((state) => ({
          claudeCodeIntegration: { ...state.claudeCodeIntegration, ...settings },
        })),

      addClaudeProvider: (provider) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: [...state.claudeCodeIntegration.providers, provider],
          },
        })),

      updateClaudeProvider: (id, updates) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          },
        })),

      removeClaudeProvider: (id) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.filter((p) => p.id !== id),
          },
        })),

      reorderClaudeProviders: (fromIndex, toIndex) =>
        set((state) => {
          const providers = [...state.claudeCodeIntegration.providers];
          const [removed] = providers.splice(fromIndex, 1);
          providers.splice(toIndex, 0, removed);
          const reordered = providers.map((p, index) => ({ ...p, displayOrder: index }));
          return {
            claudeCodeIntegration: {
              ...state.claudeCodeIntegration,
              providers: reordered,
            },
          };
        }),

      setClaudeProviderEnabled: (id, enabled) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.map((p) =>
              p.id === id ? { ...p, enabled } : p
            ),
          },
        })),

      setClaudeProviderOrder: (providers) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: providers.map((p, index) => ({ ...p, displayOrder: index })),
          },
        })),

      // AI Feature Setters
      setCommitMessageGenerator: (settings) =>
        set((state) => ({
          commitMessageGenerator: { ...state.commitMessageGenerator, ...settings },
        })),

      setCodeReview: (settings) =>
        set((state) => ({
          codeReview: { ...state.codeReview, ...settings },
        })),

      setBranchNameGenerator: (settings) =>
        set((state) => ({
          branchNameGenerator: { ...state.branchNameGenerator, ...settings },
        })),

      setTodoPolish: (settings) =>
        set((state) => ({
          todoPolish: { ...state.todoPolish, ...settings },
        })),

      // App Setters
      setAutoUpdateEnabled: (autoUpdateEnabled) => set({ autoUpdateEnabled }),

      setHapiSettings: (settings) =>
        set((state) => ({
          hapiSettings: { ...state.hapiSettings, ...settings },
        })),

      setRemoteProfiles: (profiles) =>
        set((state) => ({
          remoteSettings: { ...state.remoteSettings, profiles },
        })),

      upsertRemoteProfile: (profile) =>
        set((state) => {
          const index = state.remoteSettings.profiles.findIndex((item) => item.id === profile.id);
          const profiles =
            index >= 0
              ? state.remoteSettings.profiles.map((item) =>
                  item.id === profile.id ? profile : item
                )
              : [...state.remoteSettings.profiles, profile];
          return {
            remoteSettings: { ...state.remoteSettings, profiles },
          };
        }),

      removeRemoteProfile: (profileId) =>
        set((state) => ({
          remoteSettings: {
            ...state.remoteSettings,
            profiles: state.remoteSettings.profiles.filter((profile) => profile.id !== profileId),
          },
        })),

      setDefaultWorktreePath: (defaultWorktreePath) => set({ defaultWorktreePath }),

      setProxySettings: (settings) =>
        set((state) => ({
          proxySettings: { ...state.proxySettings, ...settings },
        })),

      setAutoCreateSessionOnActivate: (autoCreateSessionOnActivate) =>
        set({ autoCreateSessionOnActivate }),

      setGitAutoFetchEnabled: (gitAutoFetchEnabled) => set({ gitAutoFetchEnabled }),

      // Git Clone Setters
      setGitClone: (settings) =>
        set((state) => ({
          gitClone: { ...state.gitClone, ...settings },
        })),

      addHostMapping: (mapping) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: [...state.gitClone.hostMappings, mapping],
          },
        })),

      removeHostMapping: (pattern) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: state.gitClone.hostMappings.filter((m) => m.pattern !== pattern),
          },
        })),

      updateHostMapping: (oldPattern, updates) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: state.gitClone.hostMappings.map((m) =>
              m.pattern === oldPattern ? { ...m, ...updates } : m
            ),
          },
        })),

      // Beta Feature Setters
      setTodoEnabled: (todoEnabled) => set({ todoEnabled }),
      setGlowEffectEnabled: (glowEffectEnabled) => set({ glowEffectEnabled }),
      setTemporaryWorkspaceEnabled: (temporaryWorkspaceEnabled) =>
        set({ temporaryWorkspaceEnabled }),
      setDefaultTemporaryPath: (defaultTemporaryPath) => set({ defaultTemporaryPath }),
      setAutoCreateSessionOnTempActivate: (autoCreateSessionOnTempActivate) =>
        set({ autoCreateSessionOnTempActivate }),

      // Background Image Setters
      setBackgroundImageEnabled: (backgroundImageEnabled) => set({ backgroundImageEnabled }),
      setBackgroundImagePath: (backgroundImagePath) => set({ backgroundImagePath }),
      setBackgroundUrlPath: (backgroundUrlPath) => set({ backgroundUrlPath }),
      setBackgroundFolderPath: (backgroundFolderPath) => set({ backgroundFolderPath }),
      setBackgroundSourceType: (backgroundSourceType) => set({ backgroundSourceType }),
      setBackgroundRandomEnabled: (backgroundRandomEnabled) => set({ backgroundRandomEnabled }),

      setBackgroundRandomInterval: (backgroundRandomInterval) => {
        const safeValue = Number.isFinite(backgroundRandomInterval)
          ? Math.max(5, Math.min(86400, backgroundRandomInterval))
          : 300;
        set({ backgroundRandomInterval: safeValue });
      },

      setBackgroundOpacity: (backgroundOpacity) => {
        const safeValue = Number.isFinite(backgroundOpacity)
          ? backgroundOpacity
          : get().backgroundOpacity;
        const clamped = Math.min(1, Math.max(0, safeValue));
        set({ backgroundOpacity: clamped });
      },

      setBackgroundBlur: (backgroundBlur) => {
        const safeValue = Number.isFinite(backgroundBlur) ? backgroundBlur : get().backgroundBlur;
        const clamped = Math.min(20, Math.max(0, safeValue));
        set({ backgroundBlur: clamped });
      },

      setBackgroundBrightness: (backgroundBrightness) => {
        const safeValue = Number.isFinite(backgroundBrightness)
          ? backgroundBrightness
          : get().backgroundBrightness;
        const clamped = Math.min(2, Math.max(0, safeValue));
        set({ backgroundBrightness: clamped });
      },

      setBackgroundSaturation: (backgroundSaturation) => {
        const safeValue = Number.isFinite(backgroundSaturation)
          ? backgroundSaturation
          : get().backgroundSaturation;
        const clamped = Math.min(2, Math.max(0, safeValue));
        set({ backgroundSaturation: clamped });
      },

      setBackgroundSizeMode: (backgroundSizeMode) => set({ backgroundSizeMode }),

      triggerBackgroundRefresh: () =>
        set((state) => ({ _backgroundRefreshKey: state._backgroundRefreshKey + 1 })),

      // MCP Setters
      addMcpServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        })),

      updateMcpServer: (id, updates) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? ({ ...s, ...updates } as McpServer) : s
          ),
        })),

      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== id),
        })),

      setMcpServerEnabled: (id, enabled) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? ({ ...s, enabled } as McpServer) : s
          ),
        })),

      // Prompt Setters
      addPromptPreset: (preset) =>
        set((state) => ({
          promptPresets: [...state.promptPresets, preset],
        })),

      updatePromptPreset: (id, updates) =>
        set((state) => ({
          promptPresets: state.promptPresets.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        })),

      removePromptPreset: (id) =>
        set((state) => ({
          promptPresets: state.promptPresets.filter((p) => p.id !== id),
        })),

      setPromptPresetEnabled: (id) =>
        set((state) => ({
          promptPresets: state.promptPresets.map((p) => ({
            ...p,
            enabled: p.id === id,
          })),
        })),

      // Settings Display Setters
      setSettingsDisplayMode: (mode) => set({ settingsDisplayMode: mode }),
      setSettingsModalPosition: (position) => set({ settingsModalPosition: position }),

      // Terminal Theme Favorites Setters
      addFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
            ? state.favoriteTerminalThemes
            : [...state.favoriteTerminalThemes, theme],
        })),

      removeFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.filter((t) => t !== theme),
        })),

      toggleFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
            ? state.favoriteTerminalThemes.filter((t) => t !== theme)
            : [...state.favoriteTerminalThemes, theme],
        })),

      // Quick Terminal Setters
      setQuickTerminalEnabled: (enabled) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, enabled },
        })),

      setQuickTerminalButtonPosition: (position) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, buttonPosition: position },
        })),

      setQuickTerminalModalPosition: (position) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, modalPosition: position },
        })),

      setQuickTerminalModalSize: (size) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, modalSize: size },
        })),

      setQuickTerminalOpen: (open) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, isOpen: open },
        })),

      // Web Inspector Setter
      setWebInspectorEnabled: (enabled) => set({ webInspectorEnabled: enabled }),

      // Other Setters
      setHideGroups: (hideGroups) => set({ hideGroups }),
      toggleHiddenOpenInApp: (bundleId) =>
        set((state) => ({
          hiddenOpenInApps: state.hiddenOpenInApps.includes(bundleId)
            ? state.hiddenOpenInApps.filter((id) => id !== bundleId)
            : [...state.hiddenOpenInApps, bundleId],
        })),
      setOpenInMenuFilterEnabled: (enabled) => set({ openInMenuFilterEnabled: enabled }),

      // File Tree Setters
      setFileTreeAutoReveal: (fileTreeAutoReveal) => set({ fileTreeAutoReveal }),

      // Logging Setters
      setLoggingEnabled: (loggingEnabled) => set({ loggingEnabled }),

      setLogLevel: (logLevel) => set({ logLevel }),

      setLogRetentionDays: (logRetentionDays) => {
        const clampedDays = Math.min(30, Math.max(1, Math.floor(logRetentionDays)));
        set({ logRetentionDays: clampedDays });
      },
    }),
    {
      name: 'enso-settings',
      storage: createJSONStorage(() => electronStorage),
      // Exclude transient fields from persistence
      partialize: (state) => {
        const { _backgroundRefreshKey, ...rest } = state;
        return rest as SettingsState;
      },
      // Deep merge nested objects to preserve new default fields when upgrading
      merge: (persistedState, currentState) => {
        return migrateSettings(persistedState as Partial<SettingsState>, currentState);
      },
      onRehydrateStorage: () => {
        beginSettingsRuntimeHydration();
        return (state) => {
          finishSettingsRuntimeHydration(useSettingsStore, state);
        };
      },
    }
  )
);

initializeSettingsRuntime(useSettingsStore);
