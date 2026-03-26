import type { TFunction } from '@/i18n';

const THEME_NAME_PARTS = [
  'TokyoNight',
  'Nordfox',
  'Dracula',
  'Nord',
  'Higher Contrast',
  'System Colors',
  'Material',
  'Classic',
  'Builtin',
  'Storm',
  'Night',
  'Light',
  'Dark',
  'Moon',
  'Hard',
  'Day',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function localizeTerminalThemeName(themeName: string, t: TFunction): string {
  const exactLabel = t(themeName);
  if (exactLabel !== themeName) {
    return exactLabel;
  }

  return THEME_NAME_PARTS.reduce((label, part) => {
    const translatedPart = t(part);
    if (translatedPart === part) {
      return label;
    }

    return label.replace(new RegExp(escapeRegExp(part), 'g'), translatedPart);
  }, themeName);
}

export function filterTerminalThemeNames({
  themes,
  query,
  selectedTheme,
  t,
}: {
  themes: string[];
  query: string;
  selectedTheme: string;
  t: TFunction;
}): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return themes;
  }

  const selectedLabel = localizeTerminalThemeName(selectedTheme, t).toLowerCase();
  if (normalizedQuery === selectedTheme.toLowerCase() || normalizedQuery === selectedLabel) {
    return themes;
  }

  return themes.filter((themeName) => {
    const localizedLabel = localizeTerminalThemeName(themeName, t).toLowerCase();
    return (
      themeName.toLowerCase().includes(normalizedQuery) || localizedLabel.includes(normalizedQuery)
    );
  });
}
