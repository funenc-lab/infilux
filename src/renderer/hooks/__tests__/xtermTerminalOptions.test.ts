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
