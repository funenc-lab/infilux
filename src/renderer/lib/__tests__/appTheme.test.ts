import { describe, expect, it } from 'vitest';
import { resolveColorPresetVariables, sanitizeCustomAccentColor } from '../appTheme';

describe('resolveColorPresetVariables', () => {
  it('sanitizes valid custom accents and rejects invalid values', () => {
    expect(sanitizeCustomAccentColor('  #AbC123  ')).toBe('#abc123');
    expect(sanitizeCustomAccentColor('#abc')).toBe('');
  });

  it('returns the graphite-ink preset tokens for dark mode', () => {
    const vars = resolveColorPresetVariables('dark', 'graphite-ink', '');

    expect(vars['--background']).toBe('oklch(0.165 0.01 248)');
    expect(vars['--primary']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--accent']).toBe('oklch(0.278 0.024 242)');
    expect(vars['--support']).toBe('oklch(0.72 0.058 196)');
    expect(vars['--theme']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--ring']).toBe('oklch(0.784 0.1 242)');
    expect(vars['--info']).toBe('oklch(0.742 0.1 244)');
  });

  it('returns the signal-red preset tokens for dark mode', () => {
    const vars = resolveColorPresetVariables('dark', 'classic-red', '');

    expect(vars['--background']).toBe('oklch(0.172 0.011 22)');
    expect(vars['--primary']).toBe('oklch(0.76 0.112 24)');
    expect(vars['--accent']).toBe('oklch(0.29 0.026 24)');
    expect(vars['--support']).toBe('oklch(0.716 0.064 244)');
    expect(vars['--ring']).toBe('oklch(0.806 0.12 24)');
    expect(vars['--destructive']).toBe('oklch(0.648 0.148 24)');
  });

  it('returns the forge-red oled tokens for dark mode', () => {
    const vars = resolveColorPresetVariables('dark', 'red-graphite-oled', '');

    expect(vars['--background']).toBe('oklch(0.108 0.004 22)');
    expect(vars['--primary']).toBe('oklch(0.804 0.122 24)');
    expect(vars['--accent']).toBe('oklch(0.224 0.02 22)');
    expect(vars['--support']).toBe('oklch(0.73 0.068 244)');
    expect(vars['--ring']).toBe('oklch(0.842 0.13 24)');
    expect(vars['--success']).toBe('oklch(0.69 0.122 154)');
  });

  it('falls back to the default preset when the runtime preset id is unknown', () => {
    const vars = resolveColorPresetVariables(
      'dark',
      'unknown-preset' as unknown as Parameters<typeof resolveColorPresetVariables>[1],
      'invalid'
    );

    expect(vars['--background']).toBe('oklch(0.165 0.01 248)');
    expect(vars['--primary']).toBe('oklch(0.74 0.09 242)');
    expect(vars['--accent']).toBe('oklch(0.278 0.024 242)');
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

    expect(vars['--background']).toBe('oklch(0.983 0.004 62)');
    expect(vars['--primary']).toBe('#ff7a00');
    expect(vars['--primary-foreground']).toBe('#f5f7fb');
    expect(vars['--theme']).toBe('#ff7a00');
    expect(vars['--theme-foreground']).toBe('#f5f7fb');
    expect(vars['--accent']).toBe('color-mix(in oklch, #ff7a00 12%, oklch(0.993 0.003 62) 88%)');
    expect(vars['--ring']).toBe('#ff7a00');
    expect(vars['--support']).toBe('oklch(0.6 0.056 146)');
    expect(vars['--warning']).toBe('oklch(0.788 0.136 80)');
  });
});
