import type { Theme } from '@/stores/settings';

export type SelectableThemeMode = Exclude<Theme, 'sync-terminal'>;

export interface AppearanceThemeModeOption {
  value: SelectableThemeMode;
  label: string;
  description: string;
}

export interface AppearanceThemeModel {
  modeOptions: AppearanceThemeModeOption[];
  activeMode: SelectableThemeMode;
  terminalSyncEnabled: boolean;
}

export function buildAppearanceThemeModel({
  theme,
  t,
}: {
  theme: Theme;
  t: (key: string) => string;
}): AppearanceThemeModel {
  return {
    modeOptions: [
      {
        value: 'light',
        label: t('Light'),
        description: t('Bright theme'),
      },
      {
        value: 'dark',
        label: t('Dark'),
        description: t('Eye-friendly dark theme'),
      },
      {
        value: 'system',
        label: t('System'),
        description: t('Follow system theme'),
      },
    ],
    activeMode: theme === 'sync-terminal' ? 'system' : theme,
    terminalSyncEnabled: theme === 'sync-terminal',
  };
}
