export type BootstrapThemeSource = 'light' | 'dark' | 'system';
export type BootstrapThemeMode = 'light' | 'dark';

export interface BootstrapThemeSnapshot {
  theme: BootstrapThemeSource;
  terminalTheme: string;
  systemShouldUseDarkColors: boolean;
}

const BOOTSTRAP_THEME_ARGUMENT_PREFIX = '--infilux-bootstrap-theme=';
export const BOOTSTRAP_THEME_SEARCH_PARAM = 'infiluxBootstrapTheme';
const DEFAULT_TERMINAL_THEME = 'Dracula';
const VALID_THEME_SOURCES = new Set<BootstrapThemeSource>(['light', 'dark', 'system']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeThemeSource(value: unknown): BootstrapThemeSource | null {
  if (value === 'sync-terminal') {
    return 'system';
  }

  return typeof value === 'string' && VALID_THEME_SOURCES.has(value as BootstrapThemeSource)
    ? (value as BootstrapThemeSource)
    : null;
}

export function extractBootstrapThemeSnapshotFromSettingsData(
  data: unknown,
  systemShouldUseDarkColors: boolean
): BootstrapThemeSnapshot | null {
  if (!isRecord(data)) {
    return null;
  }

  const ensoSettings = data['enso-settings'];
  if (!isRecord(ensoSettings)) {
    return null;
  }

  const state = ensoSettings.state;
  if (!isRecord(state)) {
    return null;
  }

  const theme = normalizeThemeSource(state.theme);
  if (!theme) {
    return null;
  }

  return {
    theme,
    terminalTheme:
      typeof state.terminalTheme === 'string' && state.terminalTheme.trim().length > 0
        ? state.terminalTheme
        : DEFAULT_TERMINAL_THEME,
    systemShouldUseDarkColors,
  };
}

export function encodeBootstrapThemeArgument(snapshot: BootstrapThemeSnapshot): string {
  return `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}${encodeURIComponent(JSON.stringify(snapshot))}`;
}

export function encodeBootstrapThemeSearchValue(snapshot: BootstrapThemeSnapshot): string {
  return encodeURIComponent(JSON.stringify(snapshot));
}

export function parseBootstrapThemeSnapshotFromArgv(
  argv: readonly string[]
): BootstrapThemeSnapshot | null {
  const encodedSnapshot = argv.find((entry) => entry.startsWith(BOOTSTRAP_THEME_ARGUMENT_PREFIX));
  if (!encodedSnapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decodeURIComponent(encodedSnapshot.slice(BOOTSTRAP_THEME_ARGUMENT_PREFIX.length))
    ) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const theme = normalizeThemeSource(parsed.theme);
    if (!theme) {
      return null;
    }

    return {
      theme,
      terminalTheme:
        typeof parsed.terminalTheme === 'string' && parsed.terminalTheme.trim().length > 0
          ? parsed.terminalTheme
          : DEFAULT_TERMINAL_THEME,
      systemShouldUseDarkColors: Boolean(parsed.systemShouldUseDarkColors),
    };
  } catch {
    return null;
  }
}

export function parseBootstrapThemeSnapshotFromSearch(
  search: string
): BootstrapThemeSnapshot | null {
  const params = new URLSearchParams(search);
  const encodedSnapshot = params.get(BOOTSTRAP_THEME_SEARCH_PARAM);
  if (!encodedSnapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedSnapshot)) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const theme = normalizeThemeSource(parsed.theme);
    if (!theme) {
      return null;
    }

    return {
      theme,
      terminalTheme:
        typeof parsed.terminalTheme === 'string' && parsed.terminalTheme.trim().length > 0
          ? parsed.terminalTheme
          : DEFAULT_TERMINAL_THEME,
      systemShouldUseDarkColors: Boolean(parsed.systemShouldUseDarkColors),
    };
  } catch {
    return null;
  }
}

export function resolveStaticBootstrapThemeMode(
  snapshot: BootstrapThemeSnapshot | null | undefined
): BootstrapThemeMode | null {
  if (!snapshot) {
    return null;
  }

  switch (snapshot.theme) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'system':
      return snapshot.systemShouldUseDarkColors ? 'dark' : 'light';
  }
}
