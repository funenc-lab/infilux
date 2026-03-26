import { APP_COLOR_PRESET_OPTIONS, sanitizeCustomAccentColor } from '@/lib/appTheme';
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
      type: '#86686b',
      function: '#946266',
      variable: '#372a2a',
      constant: '#9b6d71',
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
      type: '#c69d9d',
      function: '#de8f8f',
      variable: '#f0e6e4',
      constant: '#d5a4a4',
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
      type: '#865f62',
      function: '#99484b',
      variable: '#352928',
      constant: '#9d5f63',
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
      type: '#d59b9b',
      function: '#f29696',
      variable: '#f2e6e4',
      constant: '#e5a7a7',
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
      background: '#eef3f8',
      foreground: '#233242',
      comment: '#7f8ea0',
      keyword: '#4f74bd',
      string: '#4d7b63',
      number: '#986e35',
      type: '#437f98',
      function: '#3f6995',
      variable: '#263646',
      constant: '#667cc8',
      punctuation: '#647689',
      lineNumber: '#8fa0b2',
      indentGuide: '#c6d3e0',
      indentGuideActive: '#93a9c0',
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
      type: '#6c8084',
      function: '#7e644d',
      variable: '#392f27',
      constant: '#946f4d',
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
      type: '#9db9c4',
      function: '#d7c1a8',
      variable: '#ece2d8',
      constant: '#dfc198',
      punctuation: '#cabdaf',
      lineNumber: '#8f8072',
      indentGuide: '#4c4038',
      indentGuideActive: '#6d5c51',
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
      type: '#607685',
      function: '#6f6258',
      variable: '#3b3329',
      constant: '#8a6644',
      punctuation: '#6f6258',
      lineNumber: '#9a8e82',
      indentGuide: '#d9d0c3',
      indentGuideActive: '#b2a291',
    },
    dark: {
      background: '#2a241f',
      foreground: '#efe4d7',
      comment: '#a39689',
      keyword: '#d0af7a',
      string: '#a5c39b',
      number: '#dab272',
      type: '#9db4c2',
      function: '#d1c1af',
      variable: '#efe4d7',
      constant: '#dfc396',
      punctuation: '#d0c3b6',
      lineNumber: '#928577',
      indentGuide: '#4d433a',
      indentGuideActive: '#6d6155',
    },
  },
  'midnight-oled': {
    light: {
      background: '#eef1f6',
      foreground: '#242d39',
      comment: '#8591a0',
      keyword: '#5069b1',
      string: '#4f735c',
      number: '#976a31',
      type: '#507690',
      function: '#46628b',
      variable: '#262f3a',
      constant: '#6f65aa',
      punctuation: '#67717f',
      lineNumber: '#8f9aa7',
      indentGuide: '#cad2dc',
      indentGuideActive: '#99a4b3',
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

function toHexColor(value: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }

  const input = document.createElement('input');
  input.type = 'color';
  input.value = fallback;

  try {
    input.value = value;
    return input.value || fallback;
  } catch {
    return fallback;
  }
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
  return APP_COLOR_PRESET_OPTIONS.find((option) => option.id === preset);
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
  const palette = customTheme
    ? deriveCustomThemeEditorPalette(customTheme, mode)
    : editorPalettes[colorPreset][mode];
  const accent = customTheme
    ? toHexColor(customTheme.tokens[mode].primary, resolveDefaultEditorAccent(colorPreset))
    : sanitizeCustomAccentColor(customAccentColor) || resolveDefaultEditorAccent(colorPreset);
  const support = customTheme
    ? toHexColor(customTheme.tokens[mode].support, resolveEditorSupportColor(colorPreset))
    : resolveEditorSupportColor(colorPreset);
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
