import { normalizeLocale } from '@shared/i18n';
import { resolvePresetThemeTokens } from '@/lib/appTheme';
import { getDefaultUIFontFamily } from './defaults';
import { normalizeTerminalScrollback } from './terminalScrollbackPolicy';
import type {
  ColorPreset,
  CustomThemeDocument,
  SettingsState,
  TerminalKeybinding,
  ThemeTokenSet,
  XtermKeybindings,
} from './types';

const COLOR_PRESETS: ColorPreset[] = [
  'graphite-ink',
  'graphite-red',
  'tide-blue',
  'warm-graphite',
  'soft-parchment',
  'midnight-oled',
];

const LEGACY_COLOR_PRESET_MAP: Record<string, ColorPreset> = {
  'relay-teal': 'tide-blue',
  'slate-indigo': 'graphite-ink',
  'amber-command': 'warm-graphite',
  'graphite-neutral': 'graphite-ink',
  'classic-red': 'warm-graphite',
  'red-graphite-oled': 'midnight-oled',
};

const CUSTOM_ACCENT_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;
const SAFE_THEME_SOURCE_PRESET: ColorPreset = 'warm-graphite';

function sanitizeRemoteProfiles(
  profiles: SettingsState['remoteSettings']['profiles'] | undefined
): SettingsState['remoteSettings']['profiles'] | undefined {
  if (!profiles) {
    return undefined;
  }

  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    sshTarget: profile.sshTarget,
    runtimeInstallDir: profile.runtimeInstallDir,
    helperInstallDir: profile.helperInstallDir,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }));
}

/**
 * Helper functions for sanitizing persisted values
 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(max, Math.max(min, parsed));
    }
  }
  return fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeColorPreset(value: unknown, fallback: ColorPreset): ColorPreset {
  if (typeof value !== 'string') {
    return fallback;
  }

  if (COLOR_PRESETS.includes(value as ColorPreset)) {
    return value as ColorPreset;
  }

  return LEGACY_COLOR_PRESET_MAP[value] ?? fallback;
}

function sanitizeCustomAccentColor(value: unknown): string {
  return typeof value === 'string' && CUSTOM_ACCENT_PATTERN.test(value) ? value.toLowerCase() : '';
}

function sanitizeThemeTokenSet(value: unknown, fallback: ThemeTokenSet): ThemeTokenSet {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<Record<keyof ThemeTokenSet, unknown>>;

  return {
    background: sanitizeString(candidate.background, fallback.background),
    foreground: sanitizeString(candidate.foreground, fallback.foreground),
    card: sanitizeString(candidate.card, fallback.card),
    popover: sanitizeString(candidate.popover, fallback.popover),
    secondary: sanitizeString(candidate.secondary, fallback.secondary),
    muted: sanitizeString(candidate.muted, fallback.muted),
    mutedForeground: sanitizeString(candidate.mutedForeground, fallback.mutedForeground),
    accent: sanitizeString(candidate.accent, fallback.accent),
    accentForeground: sanitizeString(candidate.accentForeground, fallback.accentForeground),
    primary: sanitizeString(candidate.primary, fallback.primary),
    primaryForeground: sanitizeString(candidate.primaryForeground, fallback.primaryForeground),
    support: sanitizeString(candidate.support, fallback.support),
    supportForeground: sanitizeString(candidate.supportForeground, fallback.supportForeground),
    border: sanitizeString(candidate.border, fallback.border),
    input: sanitizeString(candidate.input, fallback.input),
    ring: sanitizeString(candidate.ring, fallback.ring),
    success: sanitizeString(candidate.success, fallback.success),
    warning: sanitizeString(candidate.warning, fallback.warning),
    info: sanitizeString(candidate.info, fallback.info),
    destructive: sanitizeString(candidate.destructive, fallback.destructive),
  };
}

function sanitizeCustomThemes(value: unknown): CustomThemeDocument[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CustomThemeDocument | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as Partial<CustomThemeDocument>;
      const sourcePresetId = sanitizeColorPreset(
        candidate.sourcePresetId,
        SAFE_THEME_SOURCE_PRESET
      );
      const lightFallback = resolvePresetThemeTokens(sourcePresetId, 'light');
      const darkFallback = resolvePresetThemeTokens(sourcePresetId, 'dark');
      const id = sanitizeString(candidate.id, '');
      const name = sanitizeString(candidate.name, '').trim();

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        sourceType: candidate.sourceType === 'blank' ? 'blank' : 'preset',
        createdAt: clampNumber(candidate.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
        updatedAt: clampNumber(candidate.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
        tokens: {
          light: sanitizeThemeTokenSet(candidate.tokens?.light, lightFallback),
          dark: sanitizeThemeTokenSet(candidate.tokens?.dark, darkFallback),
        },
        ...(candidate.sourceType === 'preset' ? { sourcePresetId } : {}),
      } satisfies CustomThemeDocument;
    })
    .filter((entry): entry is CustomThemeDocument => entry !== null);
}

/**
 * Migrate persisted state to current state format
 * Handles version upgrades, field sanitization, and legacy data migration
 */
export function migrateSettings(
  persistedState: Partial<SettingsState> | undefined,
  currentState: SettingsState
): SettingsState {
  if (!persistedState) {
    return currentState;
  }

  const persisted = persistedState;
  const sanitizedLanguage = normalizeLocale(persisted.language);
  const sanitizedColorPreset = sanitizeColorPreset(persisted.colorPreset, currentState.colorPreset);
  const sanitizedCustomAccentColor = sanitizeCustomAccentColor(persisted.customAccentColor);
  const sanitizedCustomThemes = sanitizeCustomThemes(persisted.customThemes);
  const persistedActiveThemeSelection = persisted.activeThemeSelection;
  const sanitizedCustomThemeId =
    persistedActiveThemeSelection?.kind === 'custom'
      ? (sanitizedCustomThemes.find(
          (theme) => theme.id === persistedActiveThemeSelection.customThemeId
        )?.id ??
        sanitizedCustomThemes[0]?.id ??
        '')
      : '';
  const sanitizedActiveThemeSelection =
    persistedActiveThemeSelection?.kind === 'custom'
      ? {
          kind: 'custom' as const,
          customThemeId: sanitizedCustomThemeId,
        }
      : {
          kind: 'preset' as const,
          presetId: sanitizeColorPreset(
            persistedActiveThemeSelection?.kind === 'preset'
              ? persistedActiveThemeSelection.presetId
              : undefined,
            sanitizedColorPreset
          ),
        };

  // Sanitize background image settings
  const sanitizedBackgroundOpacity = clampNumber(
    persisted.backgroundOpacity,
    0,
    1,
    currentState.backgroundOpacity
  );
  const sanitizedBackgroundBlur = clampNumber(
    persisted.backgroundBlur,
    0,
    20,
    currentState.backgroundBlur
  );
  const sanitizedBackgroundBrightness = clampNumber(
    persisted.backgroundBrightness,
    0,
    2,
    currentState.backgroundBrightness
  );
  const sanitizedBackgroundSaturation = clampNumber(
    persisted.backgroundSaturation,
    0,
    2,
    currentState.backgroundSaturation
  );
  const sanitizedBackgroundImageEnabled = sanitizeBoolean(
    persisted.backgroundImageEnabled,
    currentState.backgroundImageEnabled
  );
  const sanitizedBackgroundImagePath = sanitizeString(
    persisted.backgroundImagePath,
    currentState.backgroundImagePath
  );
  const sanitizedBackgroundUrlPath = sanitizeString(
    persisted.backgroundUrlPath,
    currentState.backgroundUrlPath
  );
  const sanitizedBackgroundFolderPath = sanitizeString(
    persisted.backgroundFolderPath,
    currentState.backgroundFolderPath
  );

  // Validate background source type
  const sourceTypes: SettingsState['backgroundSourceType'][] = ['file', 'folder', 'url'];
  const sanitizedBackgroundSourceType =
    persisted.backgroundSourceType && sourceTypes.includes(persisted.backgroundSourceType)
      ? persisted.backgroundSourceType
      : currentState.backgroundSourceType;

  // Migrate legacy backgroundUrlPath from backgroundImagePath
  const migratedBackgroundUrlPath =
    sanitizedBackgroundUrlPath ||
    (sanitizedBackgroundSourceType === 'url' ? sanitizedBackgroundImagePath : '');

  const sanitizedBackgroundRandomEnabled = sanitizeBoolean(
    persisted.backgroundRandomEnabled,
    currentState.backgroundRandomEnabled
  );
  const sanitizedBackgroundRandomInterval = clampNumber(
    persisted.backgroundRandomInterval,
    5,
    86400,
    currentState.backgroundRandomInterval
  );

  // Validate background size mode
  const sizeModes: SettingsState['backgroundSizeMode'][] = ['cover', 'contain', 'repeat', 'center'];
  const sanitizedBackgroundSizeMode =
    persisted.backgroundSizeMode && sizeModes.includes(persisted.backgroundSizeMode)
      ? persisted.backgroundSizeMode
      : currentState.backgroundSizeMode;

  // Migrate legacy 'canvas' renderer to 'webgl' (canvas support was removed)
  const terminalRenderer =
    (persisted.terminalRenderer as string) === 'canvas' ? 'webgl' : persisted.terminalRenderer;
  const terminalScrollback = normalizeTerminalScrollback(
    persisted.terminalScrollback,
    currentState.terminalScrollback
  );

  // Migrate xterm keybindings from legacy formats
  const migratedXtermKeybindings = migrateXtermKeybindings(persisted, currentState);

  // Migrate Claude Code integration settings
  const migratedClaudeCodeIntegration = migrateClaudeCodeIntegration(persisted, currentState);

  // Filter agent detection status to only include enabled agents
  const migratedAgentDetectionStatus = Object.fromEntries(
    Object.entries({
      ...currentState.agentDetectionStatus,
      ...persisted.agentDetectionStatus,
    }).filter(([agentId]) => {
      const agentConfig = persisted.agentSettings?.[agentId] ?? currentState.agentSettings[agentId];
      return agentConfig?.enabled;
    })
  );

  const sanitizedFontFamily =
    typeof persisted.fontFamily === 'string' && persisted.fontFamily.trim().length > 0
      ? persisted.fontFamily
      : getDefaultUIFontFamily(sanitizedLanguage);

  return {
    ...currentState,
    ...persisted,
    language: sanitizedLanguage,
    fontFamily: sanitizedFontFamily,
    colorPreset: sanitizedColorPreset,
    customAccentColor: sanitizedCustomAccentColor,
    customThemes: sanitizedCustomThemes,
    activeThemeSelection:
      sanitizedActiveThemeSelection.kind === 'custom' &&
      !sanitizedActiveThemeSelection.customThemeId
        ? {
            kind: 'preset',
            presetId: sanitizedColorPreset,
          }
        : sanitizedActiveThemeSelection,
    // Override with migrated/sanitized values
    ...(terminalRenderer && { terminalRenderer }),
    terminalScrollback,
    xtermKeybindings: migratedXtermKeybindings,
    mainTabKeybindings: {
      ...currentState.mainTabKeybindings,
      ...persisted.mainTabKeybindings,
    },
    sourceControlKeybindings: {
      ...currentState.sourceControlKeybindings,
      ...persisted.sourceControlKeybindings,
    },
    searchKeybindings: {
      ...currentState.searchKeybindings,
      ...persisted.searchKeybindings,
    },
    editorKeybindings: {
      ...currentState.editorKeybindings,
      ...persisted.editorKeybindings,
    },
    globalKeybindings: {
      ...currentState.globalKeybindings,
      ...persisted.globalKeybindings,
    },
    workspaceKeybindings: {
      ...currentState.workspaceKeybindings,
      ...persisted.workspaceKeybindings,
    },
    backgroundImageEnabled: sanitizedBackgroundImageEnabled,
    backgroundImagePath: sanitizedBackgroundImagePath,
    backgroundUrlPath: migratedBackgroundUrlPath,
    backgroundFolderPath: sanitizedBackgroundFolderPath,
    backgroundSourceType: sanitizedBackgroundSourceType,
    backgroundRandomEnabled: sanitizedBackgroundRandomEnabled,
    backgroundRandomInterval: sanitizedBackgroundRandomInterval,
    backgroundOpacity: sanitizedBackgroundOpacity,
    backgroundBlur: sanitizedBackgroundBlur,
    backgroundBrightness: sanitizedBackgroundBrightness,
    backgroundSaturation: sanitizedBackgroundSaturation,
    backgroundSizeMode: sanitizedBackgroundSizeMode,
    editorSettings: {
      ...currentState.editorSettings,
      ...persisted.editorSettings,
    },
    claudeCodeIntegration: migratedClaudeCodeIntegration,
    commitMessageGenerator: {
      ...currentState.commitMessageGenerator,
      ...persisted.commitMessageGenerator,
    },
    codeReview: {
      ...currentState.codeReview,
      ...persisted.codeReview,
    },
    branchNameGenerator: {
      ...currentState.branchNameGenerator,
      ...persisted.branchNameGenerator,
    },
    todoPolish: {
      ...currentState.todoPolish,
      ...persisted.todoPolish,
    },
    hapiSettings: {
      ...currentState.hapiSettings,
      ...persisted.hapiSettings,
    },
    remoteSettings: {
      ...currentState.remoteSettings,
      ...persisted.remoteSettings,
      profiles:
        sanitizeRemoteProfiles(persisted.remoteSettings?.profiles) ??
        currentState.remoteSettings.profiles,
    },
    proxySettings: {
      ...currentState.proxySettings,
      ...persisted.proxySettings,
    },
    agentDetectionStatus: migratedAgentDetectionStatus,
    mcpServers: persisted.mcpServers ?? currentState.mcpServers,
    promptPresets: persisted.promptPresets ?? currentState.promptPresets,
    quickTerminal: {
      ...currentState.quickTerminal,
      ...persisted.quickTerminal,
    },
  };
}

/**
 * Migrate xterm keybindings from legacy formats
 * TODO: Remove this migration block after v1.0 release
 */
function migrateXtermKeybindings(
  persisted: Partial<SettingsState>,
  currentState: SettingsState
): XtermKeybindings {
  // If user has already saved xtermKeybindings, use it directly (no legacy migration)
  if (persisted.xtermKeybindings) {
    return {
      ...currentState.xtermKeybindings,
      ...persisted.xtermKeybindings,
    };
  }

  // Legacy migration: only runs when xtermKeybindings doesn't exist yet
  const filterDefined = <T extends object>(obj: T): Partial<T> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

  type LegacyAgentKeybindings = {
    newSession?: TerminalKeybinding;
    closeSession?: TerminalKeybinding;
    nextSession?: TerminalKeybinding;
    prevSession?: TerminalKeybinding;
  };

  type LegacyPaneKeybindings = {
    split?: TerminalKeybinding;
    merge?: TerminalKeybinding;
  };

  const legacy = persisted as {
    terminalKeybindings?: Partial<XtermKeybindings>;
    agentKeybindings?: LegacyAgentKeybindings;
    terminalPaneKeybindings?: LegacyPaneKeybindings;
  };

  return {
    ...currentState.xtermKeybindings,
    ...(legacy.terminalKeybindings &&
      filterDefined({
        newTab: legacy.terminalKeybindings.newTab,
        closeTab: legacy.terminalKeybindings.closeTab,
        nextTab: legacy.terminalKeybindings.nextTab,
        prevTab: legacy.terminalKeybindings.prevTab,
        clear: legacy.terminalKeybindings.clear,
      })),
    ...(legacy.agentKeybindings &&
      filterDefined({
        newTab: legacy.agentKeybindings.newSession,
        closeTab: legacy.agentKeybindings.closeSession,
        nextTab: legacy.agentKeybindings.nextSession,
        prevTab: legacy.agentKeybindings.prevSession,
      })),
    ...(legacy.terminalPaneKeybindings &&
      filterDefined({
        split: legacy.terminalPaneKeybindings.split,
        merge: legacy.terminalPaneKeybindings.merge,
      })),
  };
}

/**
 * Migrate Claude Code integration settings
 */
function migrateClaudeCodeIntegration(
  persisted: Partial<SettingsState>,
  currentState: SettingsState
): SettingsState['claudeCodeIntegration'] {
  const merged = {
    ...currentState.claudeCodeIntegration,
    ...persisted.claudeCodeIntegration,
    statusLineFields: {
      ...currentState.claudeCodeIntegration.statusLineFields,
      ...persisted.claudeCodeIntegration?.statusLineFields,
    },
  };

  // Migrate legacy boolean enhancedInputAutoPopup to new enum value
  const legacyAutoPopup = persisted.claudeCodeIntegration?.enhancedInputAutoPopup;
  if (typeof legacyAutoPopup === 'boolean') {
    merged.enhancedInputAutoPopup = legacyAutoPopup ? 'hideWhileRunning' : 'manual';
  }

  // Fix inconsistent state: hideWhileRunning requires stopHookEnabled
  if (merged.enhancedInputAutoPopup === 'hideWhileRunning' && !merged.stopHookEnabled) {
    merged.enhancedInputAutoPopup = 'always';
  }

  if (merged.autoSessionRollover !== 'manual' && merged.autoSessionRollover !== 'critical') {
    merged.autoSessionRollover = currentState.claudeCodeIntegration.autoSessionRollover;
  }

  return merged;
}

/**
 * Clean up legacy fields from persisted state
 * TODO: Remove this function after v1.0 release
 */
export async function cleanupLegacyFields(): Promise<void> {
  const data = await window.electronAPI.settings.read();
  if (data && typeof data === 'object') {
    const settingsData = data as Record<string, unknown>;
    const ensoSettings = settingsData['enso-settings'] as
      | { state?: Record<string, unknown> }
      | undefined;

    if (ensoSettings?.state) {
      const legacyFields = ['terminalKeybindings', 'agentKeybindings', 'terminalPaneKeybindings'];
      const hasLegacy = legacyFields.some((f) => f in ensoSettings.state!);

      if (hasLegacy) {
        for (const field of legacyFields) {
          delete ensoSettings.state[field];
        }
        await window.electronAPI.settings.write(settingsData);
      }
    }
  }
}
