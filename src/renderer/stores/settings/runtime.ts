import { normalizeLocale } from '@shared/i18n';
import type { StoreApi } from 'zustand';
import {
  findCustomThemeBySelection,
  resolveThemeVariables,
  sanitizeCustomAccentColor,
} from '@/lib/appTheme';
import { getTerminalThemeAccent, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { updateRendererLogging } from '@/utils/logging';
import { getDefaultUIFontFamily } from './defaults';
import { cleanupLegacyFields } from './migration';
import type { ColorPreset, CustomThemeDocument, SettingsState, Theme } from './types';

type SettingsStoreApi = Pick<StoreApi<SettingsState>, 'getState' | 'setState' | 'subscribe'>;

let runtimeInstalled = false;
let isHydrating = false;
let systemThemeListenerInstalled = false;

function getActiveCustomTheme(
  state: Pick<SettingsState, 'activeThemeSelection' | 'customThemes'>
): CustomThemeDocument | null {
  return findCustomThemeBySelection(state.customThemes, state.activeThemeSelection);
}

function applyAppTypography(fontFamily: string, fontSize: number): void {
  const root = document.documentElement;
  root.style.setProperty('--font-family-sans', fontFamily);
  root.style.setProperty('--app-font-size-base', `${fontSize}px`);
}

function applyTerminalFont(fontFamily: string): void {
  const root = document.documentElement;
  root.style.setProperty('--font-family-mono', fontFamily);
}

function resolveThemeMode(theme: Theme, terminalTheme: string): 'light' | 'dark' {
  switch (theme) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'system':
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    case 'sync-terminal':
      return isTerminalThemeDark(terminalTheme) ? 'dark' : 'light';
  }
}

function applyColorPreset(
  mode: 'light' | 'dark',
  colorPreset: ColorPreset,
  customAccentColor: string,
  customTheme: CustomThemeDocument | null
): void {
  const root = document.documentElement;
  const variables = resolveThemeVariables({
    mode,
    preset: colorPreset,
    customAccentColor,
    customTheme,
  });

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

function applyThemeState(state: SettingsState): void {
  const root = document.documentElement;
  const resolvedMode = resolveThemeMode(state.theme, state.terminalTheme);
  const customTheme = getActiveCustomTheme(state);
  const effectiveAccentColor =
    state.theme === 'sync-terminal' && !customTheme
      ? getTerminalThemeAccent(state.terminalTheme)
      : sanitizeCustomAccentColor(state.customAccentColor);

  root.classList.toggle('dark', resolvedMode === 'dark');
  if ('dataset' in root && root.dataset) {
    root.dataset.themeMode = resolvedMode;
    root.dataset.themeSource = state.theme;
    root.dataset.themePreset = state.colorPreset;
  }

  applyColorPreset(resolvedMode, state.colorPreset, effectiveAccentColor, customTheme);
}

function applyLanguageState(language: SettingsState['language']): void {
  const resolvedLanguage = normalizeLocale(language);
  document.documentElement.lang = resolvedLanguage === 'zh' ? 'zh-CN' : 'en';
  window.electronAPI.app.setLanguage(resolvedLanguage);
}

function applyPresentationState(state: SettingsState): void {
  applyThemeState(state);
  applyAppTypography(state.fontFamily, state.fontSize);
  applyTerminalFont(state.terminalFontFamily);
  applyLanguageState(state.language);
}

function syncLoggingState(state: SettingsState): void {
  window.electronAPI.log?.updateConfig?.({
    enabled: state.loggingEnabled,
    level: state.logLevel,
    retentionDays: state.logRetentionDays,
  });
  updateRendererLogging(state.loggingEnabled, state.logLevel);
}

async function syncWebInspectorState(store: SettingsStoreApi, enabled: boolean): Promise<void> {
  const webInspectorApi = window.electronAPI.webInspector;
  if (!webInspectorApi) {
    return;
  }

  if (enabled) {
    const result = await webInspectorApi.start?.();
    if (result?.success === false && store.getState().webInspectorEnabled) {
      console.error('[WebInspector] Failed to start:', result.error);
      store.setState({ webInspectorEnabled: false });
    }
    return;
  }

  await webInspectorApi.stop?.();
}

function ensureSystemThemeListener(store: SettingsStoreApi): void {
  if (systemThemeListenerInstalled) {
    return;
  }

  systemThemeListenerInstalled = true;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const currentState = store.getState();
    if (currentState.theme === 'system') {
      applyThemeState(currentState);
    }
  });
}

function syncSettingsRuntime(
  store: SettingsStoreApi,
  currentState: SettingsState,
  previousState: SettingsState
): void {
  const shouldApplyTheme =
    currentState.theme !== previousState.theme ||
    currentState.terminalTheme !== previousState.terminalTheme ||
    currentState.colorPreset !== previousState.colorPreset ||
    currentState.customAccentColor !== previousState.customAccentColor ||
    currentState.activeThemeSelection !== previousState.activeThemeSelection ||
    currentState.customThemes !== previousState.customThemes;

  if (shouldApplyTheme) {
    applyThemeState(currentState);
  }

  if (
    currentState.fontFamily !== previousState.fontFamily ||
    currentState.fontSize !== previousState.fontSize
  ) {
    applyAppTypography(currentState.fontFamily, currentState.fontSize);
  }

  if (currentState.terminalFontFamily !== previousState.terminalFontFamily) {
    applyTerminalFont(currentState.terminalFontFamily);
  }

  if (currentState.language !== previousState.language) {
    applyLanguageState(currentState.language);
  }

  if (currentState.autoUpdateEnabled !== previousState.autoUpdateEnabled) {
    window.electronAPI.updater.setAutoUpdateEnabled(currentState.autoUpdateEnabled);
  }

  if (currentState.proxySettings !== previousState.proxySettings) {
    window.electronAPI.app.setProxy(currentState.proxySettings);
  }

  if (currentState.gitAutoFetchEnabled !== previousState.gitAutoFetchEnabled) {
    window.electronAPI.git.setAutoFetchEnabled(currentState.gitAutoFetchEnabled);
  }

  if (currentState.webInspectorEnabled !== previousState.webInspectorEnabled) {
    void syncWebInspectorState(store, currentState.webInspectorEnabled);
  }

  if (
    currentState.loggingEnabled !== previousState.loggingEnabled ||
    currentState.logLevel !== previousState.logLevel ||
    currentState.logRetentionDays !== previousState.logRetentionDays
  ) {
    syncLoggingState(currentState);
  }
}

function runPostHydrationTasks(store: SettingsStoreApi, state: SettingsState | undefined): void {
  if (!state) {
    return;
  }

  cleanupLegacyFields().catch((error) => {
    console.warn('Failed to cleanup legacy fields:', error);
  });

  const shellAutoDetectKey = 'enso-shell-auto-detected';
  const executionPlatform = window.electronAPI?.env?.platform;
  if (executionPlatform === 'win32' && !localStorage.getItem(shellAutoDetectKey)) {
    localStorage.setItem(shellAutoDetectKey, 'true');
    window.electronAPI.shell
      .detect()
      .then((shells) => {
        const ps7 = shells.find((shell) => shell.id === 'powershell7' && shell.available);
        if (ps7) {
          store.getState().setShellConfig({ shellType: 'powershell7' });
        }
      })
      .catch((error) => {
        console.warn('Shell auto-detection failed:', error);
      });
  }
}

export function initializeSettingsRuntime(store: SettingsStoreApi): void {
  if (runtimeInstalled) {
    return;
  }

  runtimeInstalled = true;
  store.subscribe((currentState, previousState) => {
    if (isHydrating) {
      return;
    }
    syncSettingsRuntime(store, currentState, previousState);
  });
}

export function beginSettingsRuntimeHydration(): void {
  isHydrating = true;
}

export function finishSettingsRuntimeHydration(
  store: SettingsStoreApi,
  state: SettingsState | undefined
): void {
  const effectiveState = state ?? store.getState();
  ensureSystemThemeListener(store);
  applyPresentationState(effectiveState);
  updateRendererLogging(effectiveState.loggingEnabled, effectiveState.logLevel);

  if (state) {
    window.electronAPI.app.setProxy(state.proxySettings);

    if (state.webInspectorEnabled) {
      void syncWebInspectorState(store, true);
    }

    if (state.gitAutoFetchEnabled) {
      window.electronAPI.git.setAutoFetchEnabled(true);
    }
  }

  isHydrating = false;
  runPostHydrationTasks(store, state);
}

export function deriveNextFontFamilyForLanguage(
  currentLanguage: SettingsState['language'],
  currentFontFamily: string,
  nextLanguage: SettingsState['language']
): string {
  const normalizedNextLanguage = normalizeLocale(nextLanguage);
  const currentDefaultFontFamily = getDefaultUIFontFamily(currentLanguage);
  const nextDefaultFontFamily = getDefaultUIFontFamily(normalizedNextLanguage);
  return currentFontFamily === currentDefaultFontFamily ? nextDefaultFontFamily : currentFontFamily;
}
