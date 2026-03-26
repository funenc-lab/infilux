import { describe, expect, it } from 'vitest';
import {
  APP_COLOR_PRESET_OPTIONS,
  createCustomThemeFromPresetDocument,
  getColorPresetOption,
  resolveColorPresetVariables,
  resolvePresetThemeTokens,
  resolveThemeVariables,
  sanitizeCustomAccentColor,
} from '../appTheme';

function extractOklchLightness(value: string): number {
  const match = value.match(/^oklch\(([\d.]+)\s+/);
  if (!match) {
    throw new Error(`Expected OKLCH value, received: ${value}`);
  }

  return Number.parseFloat(match[1]);
}

describe('resolveColorPresetVariables', () => {
  it('sanitizes valid custom accents and rejects invalid values', () => {
    expect(sanitizeCustomAccentColor('  #AbC123  ')).toBe('#abc123');
    expect(sanitizeCustomAccentColor('#abc')).toBe('');
  });

  it('returns the graphite-ink preset tokens for dark mode', () => {
    const vars = resolveColorPresetVariables('dark', 'graphite-ink', '');

    expect(vars['--background']).toBe('oklch(0.165 0.01 248)');
    expect(vars['--primary']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--accent']).toBe('oklch(0.296 0.034 242)');
    expect(vars['--support']).toBe('oklch(0.72 0.058 196)');
    expect(vars['--theme']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--ring']).toBe('oklch(0.784 0.1 242)');
    expect(vars['--info']).toBe('oklch(0.742 0.1 244)');
  });

  it('keeps tide blue light mode distinct from the default cool graphite baseline', () => {
    const vars = resolveColorPresetVariables('light', 'tide-blue', '');

    expect(vars['--background']).toBe('oklch(0.976 0.011 224)');
    expect(vars['--accent']).toBe('oklch(0.919 0.04 220)');
    expect(vars['--primary']).toBe('oklch(0.588 0.112 220)');
    expect(vars['--support']).toBe('oklch(0.636 0.082 194)');
    expect(vars['--ring']).toBe('oklch(0.662 0.118 220)');
  });

  it('preserves midnight core identity in light mode instead of collapsing into graphite ink', () => {
    const vars = resolveColorPresetVariables('light', 'midnight-oled', '');

    expect(vars['--background']).toBe('oklch(0.968 0.012 266)');
    expect(vars['--accent']).toBe('oklch(0.912 0.044 254)');
    expect(vars['--primary']).toBe('oklch(0.556 0.102 246)');
    expect(vars['--support']).toBe('oklch(0.552 0.094 290)');
    expect(vars['--ring']).toBe('oklch(0.636 0.112 246)');
  });

  it('keeps paper console dark mode grounded enough for operational surfaces', () => {
    const vars = resolveColorPresetVariables('dark', 'soft-parchment', '');

    expect(vars['--background']).toBe('oklch(0.188 0.011 78)');
    expect(vars['--card']).toBe('oklch(0.226 0.012 78)');
    expect(vars['--secondary']).toBe('oklch(0.281 0.014 80)');
    expect(vars['--accent']).toBe('oklch(0.318 0.028 80)');
    expect(vars['--border']).toBe('oklch(0.338 0.015 80)');
  });

  it('normalizes the retired signal-red preset to warm graphite', () => {
    const vars = resolveColorPresetVariables('dark', 'classic-red', '');

    expect(getColorPresetOption('classic-red').id).toBe('warm-graphite');
    expect(vars['--background']).toBe('oklch(0.175 0.011 42)');
    expect(vars['--primary']).toBe('oklch(0.756 0.09 44)');
    expect(vars['--support']).toBe('oklch(0.71 0.06 146)');
    expect(vars['--ring']).toBe('oklch(0.8 0.095 44)');
  });

  it('normalizes the retired forge-red oled preset to midnight core', () => {
    const vars = resolveColorPresetVariables('dark', 'red-graphite-oled', '');

    expect(getColorPresetOption('red-graphite-oled').id).toBe('midnight-oled');
    expect(vars['--background']).toBe('oklch(0.118 0.006 250)');
    expect(vars['--primary']).toBe('oklch(0.792 0.082 242)');
    expect(vars['--support']).toBe('oklch(0.72 0.074 282)');
    expect(vars['--ring']).toBe('oklch(0.83 0.09 242)');
    expect(vars['--success']).toBe('oklch(0.678 0.116 154)');
  });

  it('falls back to the default preset when the runtime preset id is unknown', () => {
    const vars = resolveColorPresetVariables(
      'dark',
      'unknown-preset' as unknown as Parameters<typeof resolveColorPresetVariables>[1],
      'invalid'
    );

    expect(vars['--background']).toBe('oklch(0.165 0.01 248)');
    expect(vars['--primary']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--accent']).toBe('oklch(0.296 0.034 242)');
    expect(vars['--theme']).toBe('oklch(0.74 0.09 242)');
  });

  it('uses the dark-mode custom accent mix and readable dark foreground for bright accents', () => {
    const vars = resolveColorPresetVariables('dark', 'graphite-ink', '#f4f4f4');

    expect(vars['--primary']).toBe('#f4f4f4');
    expect(vars['--primary-foreground']).toBe('#081018');
    expect(vars['--theme']).toBe('#f4f4f4');
    expect(vars['--theme-foreground']).toBe('#081018');
    expect(vars['--accent']).toBe('color-mix(in oklch, #f4f4f4 18%, oklch(0.202 0.012 248) 82%)');
    expect(vars['--ring']).toBe('#f4f4f4');
  });

  it('overrides theme emphasis tokens with a custom accent while preserving support and semantics', () => {
    const vars = resolveColorPresetVariables('light', 'warm-graphite', '#ff7a00');

    expect(vars['--background']).toBe('oklch(0.979 0.006 62)');
    expect(vars['--primary']).toBe('#ff7a00');
    expect(vars['--primary-foreground']).toBe('#f5f7fb');
    expect(vars['--theme']).toBe('#ff7a00');
    expect(vars['--theme-foreground']).toBe('#f5f7fb');
    expect(vars['--accent']).toBe('color-mix(in oklch, #ff7a00 12%, oklch(0.994 0.003 62) 88%)');
    expect(vars['--ring']).toBe('#ff7a00');
    expect(vars['--support']).toBe('oklch(0.6 0.056 146)');
    expect(vars['--warning']).toBe('oklch(0.788 0.136 80)');
  });

  it('resolves the graphite red preset into a graphite-red token set', () => {
    const vars = resolveColorPresetVariables('dark', 'graphite-red', '');

    expect(getColorPresetOption('graphite-red').id).toBe('graphite-red');
    expect(vars['--background']).toBe('oklch(0.166 0.014 18)');
    expect(vars['--primary']).toBe('oklch(0.714 0.1 22)');
    expect(vars['--accent']).toBe('oklch(0.294 0.036 20)');
    expect(vars['--support']).toBe('oklch(0.688 0.036 38)');
    expect(vars['--ring']).toBe('oklch(0.762 0.108 22)');
    expect(vars['--destructive']).toBe('oklch(0.648 0.148 24)');
  });

  it('keeps preset theme accents visually separated from their backgrounds in both modes', () => {
    for (const option of APP_COLOR_PRESET_OPTIONS) {
      const lightTokens = resolvePresetThemeTokens(option.id, 'light');
      const darkTokens = resolvePresetThemeTokens(option.id, 'dark');

      const lightPrimaryDelta = Math.abs(
        extractOklchLightness(lightTokens.background) - extractOklchLightness(lightTokens.primary)
      );
      const darkPrimaryDelta = Math.abs(
        extractOklchLightness(darkTokens.background) - extractOklchLightness(darkTokens.primary)
      );
      const lightAccentDelta = Math.abs(
        extractOklchLightness(lightTokens.background) - extractOklchLightness(lightTokens.accent)
      );
      const darkAccentDelta = Math.abs(
        extractOklchLightness(darkTokens.background) - extractOklchLightness(darkTokens.accent)
      );

      expect(lightPrimaryDelta).toBeGreaterThanOrEqual(0.35);
      expect(darkPrimaryDelta).toBeGreaterThanOrEqual(0.5);
      expect(lightAccentDelta).toBeGreaterThanOrEqual(0.05);
      expect(darkAccentDelta).toBeGreaterThanOrEqual(0.125);
    }
  });

  it('keeps light preset surface hierarchy and muted text contrast readable for long-form use', () => {
    for (const option of APP_COLOR_PRESET_OPTIONS) {
      const lightTokens = resolvePresetThemeTokens(option.id, 'light');

      const cardDelta =
        extractOklchLightness(lightTokens.card) - extractOklchLightness(lightTokens.background);
      const secondaryDelta =
        extractOklchLightness(lightTokens.background) -
        extractOklchLightness(lightTokens.secondary);
      const mutedDelta =
        extractOklchLightness(lightTokens.background) - extractOklchLightness(lightTokens.muted);
      const mutedTextDelta = Math.abs(
        extractOklchLightness(lightTokens.background) -
          extractOklchLightness(lightTokens.mutedForeground)
      );
      const borderDelta = Math.abs(
        extractOklchLightness(lightTokens.background) - extractOklchLightness(lightTokens.border)
      );

      expect(cardDelta).toBeGreaterThanOrEqual(0.012);
      expect(secondaryDelta).toBeGreaterThanOrEqual(0.024);
      expect(mutedDelta).toBeGreaterThanOrEqual(0.017);
      expect(mutedTextDelta).toBeGreaterThanOrEqual(0.44);
      expect(borderDelta).toBeGreaterThanOrEqual(0.09);
    }
  });

  it('protects semantic tokens when resolving a custom theme document', () => {
    const customTheme = createCustomThemeFromPresetDocument('classic-red');
    customTheme.tokens.dark.success = '#123456';
    customTheme.tokens.dark.warning = '#654321';
    customTheme.tokens.dark.info = '#abcdef';
    customTheme.tokens.dark.destructive = '#fedcba';
    customTheme.tokens.dark.primary = '#ff7a00';

    const vars = resolveThemeVariables({
      mode: 'dark',
      preset: 'classic-red',
      customTheme,
    });

    expect(vars['--primary']).toBe('#ff7a00');
    expect(vars['--success']).toBe('oklch(0.684 0.11 150)');
    expect(vars['--warning']).toBe('oklch(0.808 0.122 80)');
    expect(vars['--info']).toBe('oklch(0.726 0.084 230)');
    expect(vars['--destructive']).toBe('oklch(0.656 0.134 28)');
  });
});
