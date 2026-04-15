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
  'Repository sidebar actions': decodeEscapedUnicode('\\u4ed3\\u5e93\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Bring to Front': decodeEscapedUnicode('\\u7f6e\\u4e8e\\u524d\\u53f0'),
  'Back to Canvas': decodeEscapedUnicode('\\u8fd4\\u56de\\u753b\\u5e03'),
  'Dismiss Floating Session': decodeEscapedUnicode('\\u6536\\u8d77\\u60ac\\u6d6e\\u4f1a\\u8bdd'),
  Attachment: decodeEscapedUnicode('\\u9644\\u4ef6'),
  Attachments: decodeEscapedUnicode('\\u9644\\u4ef6'),
  'Attachment paste unavailable': decodeEscapedUnicode(
    '\\u5f53\\u524d\\u65e0\\u6cd5\\u7c98\\u8d34\\u9644\\u4ef6'
  ),
  'Attachment too large': decodeEscapedUnicode('\\u9644\\u4ef6\\u8fc7\\u5927'),
  'Wait for the agent to finish responding before pasting attachments.': decodeEscapedUnicode(
    '\\u8bf7\\u7b49\\u5f85 Agent \\u5b8c\\u6210\\u56de\\u590d\\u540e\\u518d\\u7c98\\u8d34\\u9644\\u4ef6\\u3002'
  ),
  'Wait for the agent prompt before pasting attachments.': decodeEscapedUnicode(
    '\\u8bf7\\u7b49\\u5f85 Agent \\u63d0\\u793a\\u8f93\\u5165\\u540e\\u518d\\u7c98\\u8d34\\u9644\\u4ef6\\u3002'
  ),
  '{{label}} must be smaller than {{limit}} MB to paste into the agent input. Largest pasted file: {{size}} MB.':
    decodeEscapedUnicode(
      '\\{\\{label\\}\\} \\u5fc5\\u987b\\u5c0f\\u4e8e \\{\\{limit\\}\\} MB \\u624d\\u80fd\\u7c98\\u8d34\\u5230 Agent \\u8f93\\u5165\\u6846\\u3002\\u5f53\\u524d\\u7c98\\u8d34\\u6587\\u4ef6\\u4e2d\\u6700\\u5927\\u7684\\u662f \\{\\{size\\}\\} MB\\u3002'
    ),
  'Tree sidebar actions': decodeEscapedUnicode('\\u6811\\u5f62\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Show all worktrees': decodeEscapedUnicode('\\u663e\\u793a\\u5168\\u90e8\\u5de5\\u4f5c\\u6811'),
  'Only show Agent worktrees': decodeEscapedUnicode(
    '\\u4ec5\\u663e\\u793a Agent \\u5de5\\u4f5c\\u6811'
  ),
  'Agent worktrees': decodeEscapedUnicode('Agent \\u5de5\\u4f5c\\u6811'),
  'Worktree panel actions': decodeEscapedUnicode('Worktree \\u9762\\u677f\\u64cd\\u4f5c'),
  'Temp session actions': decodeEscapedUnicode('\\u4e34\\u65f6\\u4f1a\\u8bdd\\u64cd\\u4f5c'),
  'File sidebar actions': decodeEscapedUnicode('\\u6587\\u4ef6\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Expand Temp Sessions': decodeEscapedUnicode('\\u5c55\\u5f00\\u4e34\\u65f6\\u4f1a\\u8bdd'),
  'Search Files': decodeEscapedUnicode('\\u641c\\u7d22\\u6587\\u4ef6'),
  '{{count}} minutes': decodeEscapedUnicode('\\{\\{count\\}\\} \\u5206\\u949f'),
  'Chat panel retention': decodeEscapedUnicode(
    '\\u804a\\u5929\\u9762\\u677f\\u4fdd\\u7559\\u65f6\\u957f'
  ),
  'How long to keep an idle chat panel mounted after you switch away.': decodeEscapedUnicode(
    '\\u5207\\u6362\\u79bb\\u5f00\\u540e\\uff0c\\u7a7a\\u95f2\\u804a\\u5929\\u9762\\u677f\\u4fdd\\u6301\\u6302\\u8f7d\\u7684\\u65f6\\u957f\\u3002'
  ),
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
