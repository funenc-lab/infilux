import type { ITerminalOptions } from '@xterm/xterm';

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
  settings: XtermTerminalSettings;
}

export function buildXtermTerminalOptions({
  platform,
  settings,
}: BuildXtermTerminalOptionsInput): ITerminalOptions {
  return {
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    fontWeight: settings.fontWeight,
    fontWeightBold: settings.fontWeightBold,
    theme: settings.theme,
    scrollback: settings.scrollback,
    macOptionIsMeta: settings.optionIsMeta,
    macOptionClickForcesSelection: platform === 'darwin' ? true : undefined,
    allowProposedApi: true,
    allowTransparency: settings.backgroundImageEnabled,
    rescaleOverlappingGlyphs: true,
  };
}
