import { describe, expect, it } from 'vitest';
import { MAX_TERMINAL_SCROLLBACK } from '../../stores/settings/terminalScrollbackPolicy';
import { buildXtermTerminalOptions } from '../xtermTerminalOptions';

const baseSettings = {
  theme: {
    background: '#000000',
    foreground: '#ffffff',
  },
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
  fontWeight: '400',
  fontWeightBold: '700',
  scrollback: 5000,
  optionIsMeta: true,
  backgroundImageEnabled: false,
} as const;

describe('xtermTerminalOptions', () => {
  it('keeps agent terminal scrollback at the configured interactive budget', () => {
    const input = {
      platform: 'darwin',
      kind: 'agent' as const,
      settings: {
        ...baseSettings,
        scrollback: 3000,
      },
    };

    const options = buildXtermTerminalOptions(input);

    expect(options.scrollback).toBe(3000);
  });

  it('caps oversized agent scrollback so long transcripts do not overload the renderer', () => {
    const options = buildXtermTerminalOptions({
      platform: 'darwin',
      kind: 'agent',
      settings: {
        ...baseSettings,
        scrollback: MAX_TERMINAL_SCROLLBACK + 95_000,
      },
    });

    expect(options.scrollback).toBe(MAX_TERMINAL_SCROLLBACK);
  });

  it('keeps shell terminal scrollback at the configured value', () => {
    const options = buildXtermTerminalOptions({
      platform: 'darwin',
      settings: {
        ...baseSettings,
        scrollback: 3000,
      },
    });

    expect(options.scrollback).toBe(3000);
  });

  it('enables mac option forced selection on darwin so mouse-mode terminals remain copyable', () => {
    const options = buildXtermTerminalOptions({
      platform: 'darwin',
      settings: baseSettings,
    });

    expect(options.macOptionClickForcesSelection).toBe(true);
  });

  it('does not enable mac-only forced selection on non-darwin platforms', () => {
    const options = buildXtermTerminalOptions({
      platform: 'linux',
      settings: baseSettings,
    });

    expect(options.macOptionClickForcesSelection).toBeUndefined();
  });

  it('inserts macOS CJK fallbacks before the terminal generic monospace fallback', () => {
    const options = buildXtermTerminalOptions({
      platform: 'darwin',
      settings: {
        ...baseSettings,
        fontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
      },
    });

    expect(options.fontFamily).toBe(
      'ui-monospace, SF Mono, Menlo, Monaco, Consolas, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", monospace'
    );
  });
});
