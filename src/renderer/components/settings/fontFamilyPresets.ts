import type { FontPresetOption } from './interfaceFontPresetModel';

function escapeCssFontFamily(fontFamily: string): string {
  return fontFamily.replace(/[\\"]/g, '\\$&');
}

export function buildLocalFontPresetOptions(
  fontFamilies: readonly string[],
  fallbackFontFamily: string
): FontPresetOption[] {
  return fontFamilies.map((fontFamily) => ({
    id: `local:${fontFamily}`,
    label: fontFamily,
    fontFamily: `"${escapeCssFontFamily(fontFamily)}", ${fallbackFontFamily}`,
  }));
}

export const EDITOR_FONT_PRESET_OPTIONS: readonly FontPresetOption[] = [
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'cascadia-code',
    label: 'Cascadia Code',
    fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'system-monospace',
    label: 'System monospace',
    fontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
  },
];

export const TERMINAL_FONT_PRESET_OPTIONS: readonly FontPresetOption[] = [
  {
    id: 'terminal-default',
    label: 'System monospace',
    fontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'cascadia-code',
    label: 'Cascadia Code',
    fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
  },
];
