import { type Locale, normalizeLocale } from '@shared/i18n';
import { getRendererEnvironment } from './electronEnvironment';

const DEFAULT_BOOTSTRAP_LOCALE: Locale = 'en';

export function resolveBootstrapLocale(): Locale {
  const bootstrapLocale = getRendererEnvironment().bootstrapLocale;
  if (bootstrapLocale) {
    return normalizeLocale(bootstrapLocale);
  }

  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.language);
  }

  return DEFAULT_BOOTSTRAP_LOCALE;
}

export function resolveBootstrapDocumentLanguage(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

export function applyBootstrapLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = resolveBootstrapDocumentLanguage(locale);
}
