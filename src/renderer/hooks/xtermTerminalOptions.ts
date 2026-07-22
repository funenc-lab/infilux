import type { SessionKind } from '@shared/types';
import type { ITerminalOptions } from '@xterm/xterm';
import { MAX_TERMINAL_SCROLLBACK } from '@/stores/settings/terminalScrollbackPolicy';

export interface XtermTerminalSettings {
  theme: ITerminalOptions['theme'];
  fontSize: number;
  fontFamily: string;
  fontWeight: ITerminalOptions['fontWeight'];
  fontWeightBold: ITerminalOptions['fontWeightBold'];
  scrollback: number;
  optionIsMeta: boolean;
  backgroundImageEnabled: boolean;
}

interface BuildXtermTerminalOptionsInput {
  platform: string;
  kind?: SessionKind;
  settings: XtermTerminalSettings;
}

const GENERIC_FONT_FAMILY_NAMES = new Set(['monospace', 'serif', 'sans-serif', 'system-ui']);

function resolveTerminalScrollback(
  kind: SessionKind | undefined,
  configuredScrollback: number
): number {
  if (kind === 'agent') {
    return Math.min(configuredScrollback, MAX_TERMINAL_SCROLLBACK);
  }

  return configuredScrollback;
}

function normalizeFontFamilyName(fontFamily: string): string {
  return fontFamily
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

function getTerminalCjkFontFallbacks(platform: string): string[] {
  if (platform === 'darwin') {
    return ['"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans CJK SC"'];
  }

  if (platform === 'win32') {
    return ['"Microsoft YaHei UI"', '"Microsoft YaHei"', '"Noto Sans CJK SC"'];
  }

  return ['"Noto Sans CJK SC"', '"WenQuanYi Micro Hei"'];
}

function resolveTerminalFontFamily(platform: string, configuredFontFamily: string): string {
  const configuredTokens = configuredFontFamily
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const terminalTokens = configuredTokens.length > 0 ? configuredTokens : ['monospace'];
  const terminalTokenNames = new Set(terminalTokens.map(normalizeFontFamilyName));
  const trailingGenericFont = terminalTokens.at(-1);
  const trailingGenericFontName = trailingGenericFont
    ? normalizeFontFamilyName(trailingGenericFont)
    : null;
  const hasTrailingGenericFont =
    trailingGenericFontName !== null && GENERIC_FONT_FAMILY_NAMES.has(trailingGenericFontName);
  const baseTokens = hasTrailingGenericFont ? terminalTokens.slice(0, -1) : terminalTokens;
  const fallbackTokens = getTerminalCjkFontFallbacks(platform).filter(
    (fallback) => !terminalTokenNames.has(normalizeFontFamilyName(fallback))
  );
  const fallbackGenericFont =
    hasTrailingGenericFont && trailingGenericFont ? trailingGenericFont : 'monospace';

  return [...baseTokens, ...fallbackTokens, fallbackGenericFont].join(', ');
}

export function buildXtermTerminalOptions({
  platform,
  kind,
  settings,
}: BuildXtermTerminalOptionsInput): ITerminalOptions {
  return {
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: settings.fontSize,
    fontFamily: resolveTerminalFontFamily(platform, settings.fontFamily),
    fontWeight: settings.fontWeight,
    fontWeightBold: settings.fontWeightBold,
    theme: settings.theme,
    scrollback: resolveTerminalScrollback(kind, settings.scrollback),
    macOptionIsMeta: settings.optionIsMeta,
    macOptionClickForcesSelection: platform === 'darwin' ? true : undefined,
    allowProposedApi: true,
    allowTransparency: settings.backgroundImageEnabled,
    rescaleOverlappingGlyphs: true,
  };
}
