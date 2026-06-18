import type { SessionKind } from '@shared/types';
import { AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR } from '@shared/utils/agentTerminalHistoryPolicy';
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
  kind?: SessionKind;
  settings: XtermTerminalSettings;
}

function resolveTerminalScrollback(
  kind: SessionKind | undefined,
  configuredScrollback: number
): number {
  if (kind === 'agent') {
    return Math.max(configuredScrollback, AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR);
  }

  return configuredScrollback;
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
    fontFamily: settings.fontFamily,
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
