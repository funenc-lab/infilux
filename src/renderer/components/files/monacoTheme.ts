import type { ColorPreset, CustomThemeDocument, Theme } from '@/stores/settings';
import { buildMonacoThemeDefinition } from './editorThemePalette';
import { monaco } from './monacoSetup';

export const CUSTOM_THEME_NAME = 'enso-theme';

export interface MonacoThemeOptions {
  theme: Theme;
  terminalTheme: string;
  colorPreset: ColorPreset;
  customAccentColor: string;
  customTheme?: CustomThemeDocument | null;
  /** Whether a custom background image is active */
  backgroundImageEnabled?: boolean;
}

export function defineMonacoTheme(options: MonacoThemeOptions) {
  monaco.editor.defineTheme(CUSTOM_THEME_NAME, buildMonacoThemeDefinition(options));
}
