import { AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR } from '@shared/utils/agentTerminalHistoryPolicy';
import { describe, expect, it } from 'vitest';
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
  it('uses an expanded scrollback floor for agent terminals', () => {
    const input = {
      platform: 'darwin',
      kind: 'agent' as const,
      settings: {
        ...baseSettings,
        scrollback: 3000,
      },
    };

    const options = buildXtermTerminalOptions(input);

    expect(options.scrollback).toBe(AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR);
  });

  it('keeps a user-configured agent scrollback when it is larger than the transcript floor', () => {
    const options = buildXtermTerminalOptions({
      platform: 'darwin',
      kind: 'agent',
      settings: {
        ...baseSettings,
        scrollback: AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR + 1_000,
      },
    });

    expect(options.scrollback).toBe(AGENT_TERMINAL_SCROLLBACK_LINE_FLOOR + 1_000);
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
});
