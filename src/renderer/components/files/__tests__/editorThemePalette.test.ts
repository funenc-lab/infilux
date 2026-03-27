import { describe, expect, it } from 'vitest';
import { APP_COLOR_PRESET_OPTIONS, createCustomThemeFromPresetDocument } from '@/lib/appTheme';
import { resolveEditorVisualPalette } from '../editorThemePalette';

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const match = hex
    .trim()
    .toLowerCase()
    .match(/^#([0-9a-f]{6})$/);
  if (!match) {
    throw new Error(`Expected HEX color, received: ${hex}`);
  }

  const value = match[1];

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function getHexContrast(left: string, right: string): number {
  const toRelativeLuminance = (value: string) => {
    const { r, g, b } = parseHexColor(value);
    const toLinear = (channel: number) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const red = toLinear(r);
    const green = toLinear(g);
    const blue = toLinear(b);

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  const leftLuminance = toRelativeLuminance(left);
  const rightLuminance = toRelativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('resolveEditorVisualPalette', () => {
  it('maps the retired signal-red preset to the warm graphite editor palette', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'classic-red',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.support).toBe('#6b8c72');
    expect(palette.type).toBe('#c3b18c');
    expect(palette.constant).toBe('#d8bc8f');
  });

  it('keeps warm graphite editor tokens in a warm material range', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'warm-graphite',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.support).toBe('#6b8c72');
    expect(palette.type).toBe('#c3b18c');
    expect(palette.function).toBe('#d9c09a');
  });

  it('keeps tide blue light mode visibly more maritime than graphite ink', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'light',
      terminalTheme: 'Dracula',
      colorPreset: 'tide-blue',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.background).toBe('#e9f2fb');
    expect(palette.keyword).toBe('#3f74c2');
    expect(palette.type).toBe('#2f86a1');
    expect(palette.constant).toBe('#5c7fd3');
    expect(palette.support).toBe('#63a7a5');
  });

  it('preserves the graphite black editor identity in light mode', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'light',
      terminalTheme: 'Dracula',
      colorPreset: 'midnight-oled',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.background).toBe('#f2f2f2');
    expect(palette.keyword).toBe('#0033b3');
    expect(palette.constant).toBe('#871094');
    expect(palette.type).toBe('#8c3f00');
    expect(palette.support).toBe('#c28a4b');
  });

  it('keeps paper console dark editor surfaces firm enough for console workflows', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'soft-parchment',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.background).toBe('#241f1a');
    expect(palette.keyword).toBe('#d2b06f');
    expect(palette.type).toBe('#cab58d');
    expect(palette.function).toBe('#d6c0a1');
    expect(palette.lineNumber).toBe('#8d8072');
  });

  it('maps graphite red to a graphite-red editor palette', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'graphite-red',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.background).toBe('#1b1816');
    expect(palette.keyword).toBe('#dc857c');
    expect(palette.string).toBe('#c4a19a');
    expect(palette.support).toBe('#8b7a70');
  });

  it('falls back to warm graphite editor accents when the preset id is unknown', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'unknown-preset' as never,
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.accent).toBe('#c2875d');
    expect(palette.support).toBe('#6b8c72');
  });

  it('keeps graphite black editor gutters and guides readable in dark mode', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'midnight-oled',
      customAccentColor: '',
      customTheme: null,
    });

    expect(palette.lineNumber).toBe('#777d84');
    expect(palette.indentGuide).toBe('#454a4e');
    expect(palette.indentGuideActive).toBe('#5f666d');
  });

  it('enforces editor clarity thresholds across every preset', () => {
    for (const option of APP_COLOR_PRESET_OPTIONS) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = resolveEditorVisualPalette({
          theme: mode,
          terminalTheme: 'Dracula',
          colorPreset: option.id,
          customAccentColor: '',
          customTheme: null,
        });

        expect(getHexContrast(palette.background, palette.foreground)).toBeGreaterThanOrEqual(6.75);
        expect(getHexContrast(palette.background, palette.comment)).toBeGreaterThanOrEqual(2.9);
        expect(getHexContrast(palette.background, palette.lineNumber)).toBeGreaterThanOrEqual(2.3);
        expect(getHexContrast(palette.background, palette.indentGuide)).toBeGreaterThanOrEqual(
          1.25
        );
        expect(
          getHexContrast(palette.background, palette.indentGuideActive)
        ).toBeGreaterThanOrEqual(1.7);
        expect(getHexContrast(palette.background, palette.accent)).toBeGreaterThanOrEqual(2.6);
      }
    }
  });

  it('resolves custom theme oklch tokens through computed styles instead of falling back to the dark defaults', () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const customTheme = createCustomThemeFromPresetDocument('graphite-ink');
    const resolvedColors = new Map<string, string>([
      [customTheme.tokens.dark.background, 'rgb(17, 24, 39)'],
      [customTheme.tokens.dark.foreground, 'rgb(235, 241, 247)'],
      [customTheme.tokens.dark.primary, 'rgb(125, 148, 201)'],
      [customTheme.tokens.dark.support, 'rgb(94, 143, 146)'],
      [customTheme.tokens.dark.accent, 'rgb(52, 65, 94)'],
      [customTheme.tokens.dark.warning, 'rgb(216, 176, 106)'],
      [customTheme.tokens.dark.success, 'rgb(152, 192, 143)'],
      [customTheme.tokens.dark.border, 'rgb(59, 68, 82)'],
      [customTheme.tokens.dark.mutedForeground, 'rgb(142, 152, 168)'],
    ]);

    const host = {
      appendChild: () => undefined,
    };

    globalThis.document = {
      body: host,
      documentElement: host,
      createElement: () => ({
        style: { color: '' },
        remove: () => undefined,
      }),
    } as unknown as typeof document;
    globalThis.window = {
      getComputedStyle: (element: { style: { color: string } }) => ({
        color: resolvedColors.get(element.style.color) ?? '',
      }),
    } as unknown as typeof window;

    try {
      const palette = resolveEditorVisualPalette({
        theme: 'dark',
        terminalTheme: 'Dracula',
        colorPreset: 'graphite-ink',
        customAccentColor: '',
        customTheme,
      });

      expect(palette.background).toBe('#111827');
      expect(palette.foreground).toBe('#ebf1f7');
      expect(palette.accent).toBe('#7d94c9');
      expect(palette.support).toBe('#5e8f92');
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });
});
