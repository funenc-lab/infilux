import { getTranslation, type Locale, normalizeLocale } from '@shared/i18n';
import * as React from 'react';
import { useSettingsStore } from '@/stores/settings';

export type TFunction = (key: string, params?: Record<string, string | number>) => string;
type RichParams = Record<string, React.ReactNode>;

const decodeEscapedUnicode = (value: string): string =>
  value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );

const rendererZhTranslations: Record<string, string> = {
  'Import from EnsoAI': decodeEscapedUnicode('\\u4ece EnsoAI \\u5bfc\\u5165'),
  'Preview and import settings from an EnsoAI settings.json file': decodeEscapedUnicode(
    '\\u9884\\u89c8\\u5e76\\u5bfc\\u5165 EnsoAI settings.json \\u6587\\u4ef6\\u4e2d\\u7684\\u8bbe\\u7f6e'
  ),
  'Settings import': decodeEscapedUnicode('\\u8bbe\\u7f6e\\u5bfc\\u5165'),
  'Detect the typical EnsoAI settings locations first, or choose a settings.json file manually and review the changed keys before applying them.':
    decodeEscapedUnicode(
      '\\u5148\\u68c0\\u6d4b\\u5e38\\u89c1\\u7684 EnsoAI \\u8bbe\\u7f6e\\u4f4d\\u7f6e\\uff0c\\u6216\\u624b\\u52a8\\u9009\\u62e9 settings.json \\u6587\\u4ef6\\uff0c\\u5e76\\u5728\\u5e94\\u7528\\u524d\\u67e5\\u770b\\u53d8\\u66f4\\u952e\\u3002'
    ),
  'Loading preview...': decodeEscapedUnicode('\\u6b63\\u5728\\u52a0\\u8f7d\\u9884\\u89c8...'),
  'Detect automatically': decodeEscapedUnicode('\\u81ea\\u52a8\\u68c0\\u6d4b'),
  'Choose settings file': decodeEscapedUnicode('\\u9009\\u62e9\\u8bbe\\u7f6e\\u6587\\u4ef6'),
  'Typical paths': decodeEscapedUnicode('\\u5e38\\u89c1\\u8def\\u5f84'),
};

function getRendererTranslation(locale: Locale, key: string): string {
  if (locale === 'zh') {
    return rendererZhTranslations[key] ?? getTranslation(locale, key);
  }
  return getTranslation(locale, key);
}

function translateRenderer(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const template = getRendererTranslation(locale, key);
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

function translateNodes(locale: Locale, key: string, params?: RichParams): React.ReactNode {
  const template = getRendererTranslation(locale, key);
  if (!params) return template;

  const parts: React.ReactNode[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(template);

  while (match) {
    const [placeholder, token] = match;
    const index = match.index;
    if (index > lastIndex) {
      parts.push(template.slice(lastIndex, index));
    }
    parts.push(params[token] ?? placeholder);
    lastIndex = index + placeholder.length;
    match = regex.exec(template);
  }

  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }

  // Return a single React element with keyed fragments to avoid key warnings
  return parts.length > 0
    ? React.createElement(
        React.Fragment,
        null,
        ...parts.map((part, i) => React.createElement(React.Fragment, { key: i }, part))
      )
    : template;
}

export function useI18n() {
  const language = useSettingsStore((state) => state.language);
  const locale = normalizeLocale(language);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translateRenderer(locale, key, params),
    [locale]
  );

  const tNode = React.useCallback(
    (key: string, params?: RichParams) => translateNodes(locale, key, params),
    [locale]
  );

  return { t, tNode, locale };
}
