import { type Locale, normalizeLocale } from '@shared/i18n';

const BOOTSTRAP_LOCALE_ARGUMENT_PREFIX = '--infilux-bootstrap-locale=';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractBootstrapLocaleFromSettingsData(data: unknown): Locale | null {
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

  return typeof state.language === 'string' ? normalizeLocale(state.language) : null;
}

export function encodeBootstrapLocaleArgument(locale: Locale): string {
  return `${BOOTSTRAP_LOCALE_ARGUMENT_PREFIX}${encodeURIComponent(locale)}`;
}

export function parseBootstrapLocaleFromArgv(argv: readonly string[]): Locale | null {
  const encodedLocale = argv.find((entry) => entry.startsWith(BOOTSTRAP_LOCALE_ARGUMENT_PREFIX));
  if (!encodedLocale) {
    return null;
  }

  try {
    return normalizeLocale(
      decodeURIComponent(encodedLocale.slice(BOOTSTRAP_LOCALE_ARGUMENT_PREFIX.length))
    );
  } catch {
    return null;
  }
}
