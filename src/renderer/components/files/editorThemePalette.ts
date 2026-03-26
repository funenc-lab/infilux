import {
  APP_COLOR_PRESET_OPTIONS,
  normalizeColorPreset,
  sanitizeCustomAccentColor,
} from '@/lib/appTheme';
import { isTerminalThemeDark } from '@/lib/ghosttyTheme';
import type { ColorPreset, CustomThemeDocument, Theme } from '@/stores/settings';

export interface MonacoThemeRule {
  token: string;
  foreground: string;
}

export interface MonacoThemeDefinition {
  base: 'vs' | 'vs-dark';
  inherit: true;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

export interface EditorSyntaxPalette {
  background: string;
  foreground: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  function: string;
  variable: string;
  constant: string;
  punctuation: string;
  lineNumber: string;
  indentGuide: string;
  indentGuideActive: string;
}

export interface BuildMonacoThemeOptions {
  theme: Theme;
  terminalTheme: string;
  colorPreset: ColorPreset;
  customAccentColor: string;
  customTheme?: CustomThemeDocument | null;
  backgroundImageEnabled?: boolean;
}

export interface ResolvedEditorVisualPalette extends EditorSyntaxPalette {
  mode: 'light' | 'dark';
  accent: string;
  support: string;
  lineHighlight: string;
  selectionBackground: string;
  diffInsertedText: string;
  diffRemovedText: string;
  diffInsertedLine: string;
  diffRemovedLine: string;
}

const editorPalettes: Record<ColorPreset, Record<'light' | 'dark', EditorSyntaxPalette>> = {
  'classic-red': {
    light: {
      background: '#f2eceb',
      foreground: '#352828',
      comment: '#8f7b7b',
      keyword: '#a16366',
      string: '#6a7957',
      number: '#a56f3c',
      type: '#8d715d',
      function: '#a46358',
      variable: '#372a2a',
      constant: '#a98468',
      punctuation: '#756666',
      lineNumber: '#a08d8d',
      indentGuide: '#d6c9c8',
      indentGuideActive: '#b4a3a2',
    },
    dark: {
      background: '#1d1718',
      foreground: '#f0e6e4',
      comment: '#a08b89',
      keyword: '#cb7676',
      string: '#a9c18f',
      number: '#d7b077',
      type: '#c7a183',
      function: '#ef9d7d',
      variable: '#f0e6e4',
      constant: '#d8aa88',
      punctuation: '#cebebe',
      lineNumber: '#937f7d',
      indentGuide: '#4c3d3c',
      indentGuideActive: '#6f5a58',
    },
  },
  'red-graphite-oled': {
    light: {
      background: '#f1ebea',
      foreground: '#332827',
      comment: '#8b7a79',
      keyword: '#ab5356',
      string: '#697855',
      number: '#a36e3a',
      type: '#936f5c',
      function: '#ad5751',
      variable: '#352928',
      constant: '#af8469',
      punctuation: '#726665',
      lineNumber: '#9c8d8b',
      indentGuide: '#d4c8c7',
      indentGuideActive: '#b29f9d',
    },
    dark: {
      background: '#120e0f',
      foreground: '#f2e6e4',
      comment: '#9a8684',
      keyword: '#e07878',
      string: '#acc594',
      number: '#d9b179',
      type: '#cba283',
      function: '#f3a286',
      variable: '#f2e6e4',
      constant: '#dab093',
      punctuation: '#d3c4c2',
      lineNumber: '#8b7775',
      indentGuide: '#3c3131',
      indentGuideActive: '#5e4b49',
    },
  },
  'graphite-ink': {
    light: {
      background: '#f2f5f9',
      foreground: '#24303a',
      comment: '#8691a0',
      keyword: '#566eb7',
      string: '#52745b',
      number: '#9b6c33',
      type: '#4f7b94',
      function: '#42658c',
      variable: '#28323d',
      constant: '#7c60a0',
      punctuation: '#697584',
      lineNumber: '#93a0af',
      indentGuide: '#cad2de',
      indentGuideActive: '#9ca9bb',
    },
    dark: {
      background: '#161b24',
      foreground: '#ebf1f7',
      comment: '#8e98a8',
      keyword: '#8ea3ff',
      string: '#98c08f',
      number: '#d8b06a',
      type: '#8ec3dd',
      function: '#aebdff',
      variable: '#e8edf4',
      constant: '#c6a8f3',
      punctuation: '#b7c1cf',
      lineNumber: '#8490a2',
      indentGuide: '#3b4452',
      indentGuideActive: '#59667a',
    },
  },
  'tide-blue': {
    light: {
      background: '#e9f2fb',
      foreground: '#203345',
      comment: '#7890a6',
      keyword: '#3f74c2',
      string: '#427d69',
      number: '#946e34',
      type: '#2f86a1',
      function: '#2d6fa0',
      variable: '#23374a',
      constant: '#5c7fd3',
      punctuation: '#5d7389',
      lineNumber: '#879db2',
      indentGuide: '#bfd1e2',
      indentGuideActive: '#88a7c6',
    },
    dark: {
      background: '#172032',
      foreground: '#e8eef7',
      comment: '#8796aa',
      keyword: '#86a9f6',
      string: '#93c4a1',
      number: '#d7b874',
      type: '#7fb8d6',
      function: '#aac2ff',
      variable: '#e8eef7',
      constant: '#9fc0ff',
      punctuation: '#b8c6d6',
      lineNumber: '#7f91a7',
      indentGuide: '#394655',
      indentGuideActive: '#58708a',
    },
  },
  'warm-graphite': {
    light: {
      background: '#f3efe9',
      foreground: '#352b24',
      comment: '#8d7d6f',
      keyword: '#9d6d48',
      string: '#61724f',
      number: '#a56c2b',
      type: '#7b7459',
      function: '#9a7b56',
      variable: '#392f27',
      constant: '#a6845d',
      punctuation: '#746559',
      lineNumber: '#a18f82',
      indentGuide: '#d4c7bb',
      indentGuideActive: '#ab998b',
    },
    dark: {
      background: '#1b1715',
      foreground: '#ece2d8',
      comment: '#a19082',
      keyword: '#d4ae84',
      string: '#a8c08e',
      number: '#d8b37a',
      type: '#c3b18c',
      function: '#d9c09a',
      variable: '#ece2d8',
      constant: '#d8bc8f',
      punctuation: '#cabdaf',
      lineNumber: '#8f8072',
      indentGuide: '#4c4038',
      indentGuideActive: '#6d5c51',
    },
  },
  'graphite-red': {
    light: {
      background: '#f6f1ef',
      foreground: '#352b2a',
      comment: '#8f817d',
      keyword: '#aa615e',
      string: '#936661',
      number: '#a17145',
      type: '#886f67',
      function: '#ad746f',
      variable: '#3b302f',
      constant: '#b08a68',
      punctuation: '#786b67',
      lineNumber: '#a39591',
      indentGuide: '#dbcfcb',
      indentGuideActive: '#b8a7a2',
    },
    dark: {
      background: '#181314',
      foreground: '#ebe1de',
      comment: '#9e8985',
      keyword: '#dc857c',
      string: '#caa098',
      number: '#d2a772',
      type: '#c49d95',
      function: '#e0aca4',
      variable: '#ebe1de',
      constant: '#d3af84',
      punctuation: '#c8bbb7',
      lineNumber: '#8d7c79',
      indentGuide: '#473a3a',
      indentGuideActive: '#6b5958',
    },
  },
  'soft-parchment': {
    light: {
      background: '#f7f2e8',
      foreground: '#352d24',
      comment: '#8a7d70',
      keyword: '#8b5e3c',
      string: '#56714e',
      number: '#9c6f2b',
      type: '#7d7057',
      function: '#88715b',
      variable: '#3b3329',
      constant: '#947654',
      punctuation: '#726357',
      lineNumber: '#9a8e82',
      indentGuide: '#d9d0c3',
      indentGuideActive: '#b2a291',
    },
    dark: {
      background: '#241f1a',
      foreground: '#efe4d7',
      comment: '#a09184',
      keyword: '#d2b06f',
      string: '#a5c39b',
      number: '#dab272',
      type: '#cab58d',
      function: '#d6c0a1',
      variable: '#efe4d7',
      constant: '#d6bc90',
      punctuation: '#d0c3b6',
      lineNumber: '#8d8072',
      indentGuide: '#473d35',
      indentGuideActive: '#685b4e',
    },
  },
  'midnight-oled': {
    light: {
      background: '#e7ecf8',
      foreground: '#212c3d',
      comment: '#7d8b9e',
      keyword: '#425dc4',
      string: '#507260',
      number: '#94682f',
      type: '#3d7099',
      function: '#365fa0',
      variable: '#233041',
      constant: '#5e58bd',
      punctuation: '#626f82',
      lineNumber: '#8696ab',
      indentGuide: '#c0cbdf',
      indentGuideActive: '#899ab8',
    },
    dark: {
      background: '#0f1218',
      foreground: '#edf2f8',
      comment: '#7f8a99',
      keyword: '#8f9cff',
      string: '#96bc96',
      number: '#d6ae6a',
      type: '#8bb4d2',
      function: '#b0bbff',
      variable: '#edf2f8',
      constant: '#c2b4ff',
      punctuation: '#aeb7c4',
      lineNumber: '#6f7a88',
      indentGuide: '#2b3139',
      indentGuideActive: '#495462',
    },
  },
};

export function withAlpha(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`;
}

function rgbChannelToHex(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel)))
    .toString(16)
    .padStart(2, '0');
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${rgbChannelToHex(rgb.r)}${rgbChannelToHex(rgb.g)}${rgbChannelToHex(rgb.b)}`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().toLowerCase();
  if (!/^#(?:[0-9a-f]{6})$/.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function parseRgbColor(value: string): { r: number; g: number; b: number } | null {
  const normalized = value.trim().toLowerCase();
  const commaSeparatedMatch = normalized.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*[\d.]+\s*)?\)$/
  );

  if (commaSeparatedMatch) {
    return {
      r: Number.parseFloat(commaSeparatedMatch[1]),
      g: Number.parseFloat(commaSeparatedMatch[2]),
      b: Number.parseFloat(commaSeparatedMatch[3]),
    };
  }

  const spaceSeparatedMatch = normalized.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*[\d.]+\s*)?\)$/
  );

  if (spaceSeparatedMatch) {
    return {
      r: Number.parseFloat(spaceSeparatedMatch[1]),
      g: Number.parseFloat(spaceSeparatedMatch[2]),
      b: Number.parseFloat(spaceSeparatedMatch[3]),
    };
  }

  return null;
}

function resolveCssColorToHex(value: string): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const host = document.body ?? document.documentElement;
  if (!host) {
    return null;
  }

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = value;

  host.appendChild(probe);

  try {
    const resolvedColor = window.getComputedStyle(probe).color;
    const rgb = parseRgbColor(resolvedColor);
    return rgb ? rgbToHex(rgb) : null;
  } finally {
    probe.remove();
  }
}

function toHexColor(value: string, fallback: string): string {
  const normalizedValue = value.trim().toLowerCase();
  const parsedHex = parseHexColor(normalizedValue);
  if (parsedHex) {
    return normalizedValue;
  }

  const computedHex = resolveCssColorToHex(value);
  if (computedHex) {
    return computedHex;
  }

  return fallback;
}

function mixHex(left: string, right: string, leftWeight = 0.5): string {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);

  if (!leftRgb || !rightRgb) {
    return left;
  }

  const safeWeight = Math.min(1, Math.max(0, leftWeight));
  const mixChannel = (leftValue: number, rightValue: number) =>
    Math.round(leftValue * safeWeight + rightValue * (1 - safeWeight));

  return `#${[
    mixChannel(leftRgb.r, rightRgb.r),
    mixChannel(leftRgb.g, rightRgb.g),
    mixChannel(leftRgb.b, rightRgb.b),
  ]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function deriveCustomThemeEditorPalette(
  customTheme: CustomThemeDocument,
  mode: 'light' | 'dark'
): EditorSyntaxPalette {
  const tokens = customTheme.tokens[mode];
  const background = toHexColor(tokens.background, mode === 'dark' ? '#1c2027' : '#f3f5f8');
  const foreground = toHexColor(tokens.foreground, mode === 'dark' ? '#e8edf4' : '#25303b');
  const primary = toHexColor(tokens.primary, mode === 'dark' ? '#8ea3ff' : '#566eb7');
  const support = toHexColor(tokens.support, mode === 'dark' ? '#8ec3dd' : '#4f7b94');
  const accent = toHexColor(tokens.accent, mode === 'dark' ? '#59667a' : '#9ca9bb');
  const warning = toHexColor(tokens.warning, mode === 'dark' ? '#d8b06a' : '#9b6c33');
  const success = toHexColor(tokens.success, mode === 'dark' ? '#98c08f' : '#52745b');
  const border = toHexColor(tokens.border, mode === 'dark' ? '#3b4452' : '#cad2de');
  const mutedForeground = toHexColor(
    tokens.mutedForeground,
    mode === 'dark' ? '#8e98a8' : '#8691a0'
  );

  return {
    background,
    foreground,
    comment: mixHex(mutedForeground, background, 0.82),
    keyword: primary,
    string: success,
    number: warning,
    type: support,
    function: mixHex(primary, foreground, 0.72),
    variable: foreground,
    constant: mixHex(primary, support, 0.55),
    punctuation: mixHex(foreground, background, 0.72),
    lineNumber: mixHex(mutedForeground, background, 0.72),
    indentGuide: border,
    indentGuideActive: accent,
  };
}

function resolvePresetOption(preset: ColorPreset) {
  const normalizedPreset = normalizeColorPreset(preset);
  return APP_COLOR_PRESET_OPTIONS.find((option) => option.id === normalizedPreset);
}

function resolveDefaultEditorAccent(preset: ColorPreset): string {
  return resolvePresetOption(preset)?.themeHex ?? '#7d94c9';
}

function resolveEditorSupportColor(preset: ColorPreset): string {
  return resolvePresetOption(preset)?.supportHex ?? '#5e8f92';
}

function resolveEditorSemanticDiff(
  mode: 'light' | 'dark'
): Pick<
  ResolvedEditorVisualPalette,
  'diffInsertedText' | 'diffRemovedText' | 'diffInsertedLine' | 'diffRemovedLine'
> {
  if (mode === 'dark') {
    return {
      diffInsertedText: '#2b8f5a26',
      diffRemovedText: '#d05a5a24',
      diffInsertedLine: '#2b8f5a14',
      diffRemovedLine: '#d05a5a12',
    };
  }

  return {
    diffInsertedText: '#23824b22',
    diffRemovedText: '#b84d4d20',
    diffInsertedLine: '#23824b10',
    diffRemovedLine: '#b84d4d10',
  };
}

export function resolveEditorThemeMode(theme: Theme, terminalTheme: string): 'light' | 'dark' {
  switch (theme) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'system':
      return typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    case 'sync-terminal':
      return isTerminalThemeDark(terminalTheme) ? 'dark' : 'light';
  }
}

export function resolveEditorVisualPalette({
  theme,
  terminalTheme,
  colorPreset,
  customAccentColor,
  customTheme,
}: Omit<BuildMonacoThemeOptions, 'backgroundImageEnabled'>): ResolvedEditorVisualPalette {
  const mode = resolveEditorThemeMode(theme, terminalTheme);
  const normalizedPreset = normalizeColorPreset(colorPreset);
  const palette = customTheme
    ? deriveCustomThemeEditorPalette(customTheme, mode)
    : editorPalettes[normalizedPreset][mode];
  const accent = customTheme
    ? toHexColor(customTheme.tokens[mode].primary, resolveDefaultEditorAccent(normalizedPreset))
    : sanitizeCustomAccentColor(customAccentColor) || resolveDefaultEditorAccent(normalizedPreset);
  const support = customTheme
    ? toHexColor(customTheme.tokens[mode].support, resolveEditorSupportColor(normalizedPreset))
    : resolveEditorSupportColor(normalizedPreset);
  const lineHighlight = withAlpha(accent, mode === 'dark' ? '16' : '12');

  return {
    ...palette,
    mode,
    accent,
    support,
    lineHighlight,
    selectionBackground: withAlpha(accent, '33'),
    ...resolveEditorSemanticDiff(mode),
  };
}

function createRules(palette: EditorSyntaxPalette): MonacoThemeRule[] {
  return [
    { token: 'comment', foreground: palette.comment.slice(1) },
    { token: 'keyword', foreground: palette.keyword.slice(1) },
    { token: 'string', foreground: palette.string.slice(1) },
    { token: 'number', foreground: palette.number.slice(1) },
    { token: 'type', foreground: palette.type.slice(1) },
    { token: 'function', foreground: palette.function.slice(1) },
    { token: 'variable', foreground: palette.variable.slice(1) },
    { token: 'constant', foreground: palette.constant.slice(1) },
    { token: 'keyword.control', foreground: palette.keyword.slice(1) },
    { token: 'keyword.operator', foreground: palette.keyword.slice(1) },
    { token: 'storage.type', foreground: palette.keyword.slice(1) },
    { token: 'storage.modifier', foreground: palette.keyword.slice(1) },
    { token: 'entity.name.function', foreground: palette.function.slice(1) },
    { token: 'entity.name.type', foreground: palette.type.slice(1) },
    { token: 'entity.name.tag', foreground: palette.keyword.slice(1) },
    { token: 'entity.other.attribute-name', foreground: palette.constant.slice(1) },
    { token: 'variable.other', foreground: palette.variable.slice(1) },
    { token: 'variable.parameter', foreground: palette.variable.slice(1) },
    { token: 'support.function', foreground: palette.function.slice(1) },
    { token: 'support.type', foreground: palette.type.slice(1) },
    { token: 'constant.language', foreground: palette.constant.slice(1) },
    { token: 'constant.numeric', foreground: palette.number.slice(1) },
    { token: 'punctuation', foreground: palette.punctuation.slice(1) },
    { token: 'punctuation.definition.tag', foreground: palette.comment.slice(1) },
    { token: 'meta.brace', foreground: palette.punctuation.slice(1) },
  ];
}

export function buildMonacoThemeDefinition({
  theme,
  terminalTheme,
  colorPreset,
  customAccentColor,
  customTheme,
  backgroundImageEnabled = false,
}: BuildMonacoThemeOptions): MonacoThemeDefinition {
  const { mode, selectionBackground, ...palette } = resolveEditorVisualPalette({
    theme,
    terminalTheme,
    colorPreset,
    customAccentColor,
    customTheme,
  });
  const editorBackground = backgroundImageEnabled ? '#00000000' : palette.background;

  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: createRules(palette),
    colors: {
      'editor.background': editorBackground,
      'editor.foreground': palette.foreground,
      'editor.selectionBackground': selectionBackground,
      'editor.lineHighlightBackground': palette.lineHighlight,
      'editorCursor.foreground': palette.accent,
      'editorLineNumber.foreground': palette.lineNumber,
      'editorLineNumber.activeForeground': palette.foreground,
      'editorIndentGuide.background': palette.indentGuide,
      'editorIndentGuide.activeBackground': palette.indentGuideActive,
      'editorGutter.background': backgroundImageEnabled ? '#00000000' : palette.background,
      'minimap.background': backgroundImageEnabled ? '#00000000' : palette.background,
      'diffEditor.insertedTextBackground': palette.diffInsertedText,
      'diffEditor.removedTextBackground': palette.diffRemovedText,
      'diffEditor.insertedLineBackground': palette.diffInsertedLine,
      'diffEditor.removedLineBackground': palette.diffRemovedLine,
    },
  };
}
