import { describe, expect, it } from 'vitest';
import {
  buildMonacoThemeDefinition,
  resolveEditorThemeMode,
  resolveEditorVisualPalette,
} from '../editorThemePalette';

describe('resolveEditorThemeMode', () => {
  it('resolves sync-terminal by terminal theme darkness', () => {
    expect(resolveEditorThemeMode('sync-terminal', 'Dracula')).toBe('dark');
    expect(resolveEditorThemeMode('sync-terminal', 'GitHub Light Default')).toBe('light');
  });

  it('prefers explicit app theme modes', () => {
    expect(resolveEditorThemeMode('light', 'Dracula')).toBe('light');
    expect(resolveEditorThemeMode('dark', 'GitHub Light Default')).toBe('dark');
  });
});

describe('buildMonacoThemeDefinition', () => {
  it('resolves an effective visual palette with custom accent for focus-driven states', () => {
    const palette = resolveEditorVisualPalette({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'classic-red',
      customAccentColor: '#ff7a00',
    });

    expect(palette.mode).toBe('dark');
    expect(palette.background).toBe('#1d1718');
    expect(palette.accent).toBe('#ff7a00');
    expect(palette.selectionBackground).toBe('#ff7a0033');
  });

  it('uses preset-driven readable syntax colors instead of terminal token colors', () => {
    const theme = buildMonacoThemeDefinition({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'warm-graphite',
      customAccentColor: '',
      backgroundImageEnabled: false,
    });

    expect(theme.base).toBe('vs-dark');
    expect(theme.colors['editor.background']).toBe('#1b1715');
    expect(theme.colors['editor.foreground']).toBe('#ece2d8');
    expect(theme.colors['editorLineNumber.foreground']).toBe('#8f8072');
    expect(theme.rules).toContainEqual({ token: 'variable', foreground: 'ece2d8' });
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: 'd4ae84' });
    expect(theme.rules).not.toContainEqual({ token: 'variable', foreground: 'ff5555' });
  });

  it('uses custom accent only for focus-driven editor chrome', () => {
    const theme = buildMonacoThemeDefinition({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'graphite-ink',
      customAccentColor: '#ff7a00',
      backgroundImageEnabled: false,
    });

    expect(theme.colors['editorCursor.foreground']).toBe('#ff7a00');
    expect(theme.colors['editor.selectionBackground']).toBe('#ff7a0033');
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: '8ea3ff' });
  });

  it('provides a readable graphite-red syntax palette for the classic red preset', () => {
    const theme = buildMonacoThemeDefinition({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'classic-red',
      customAccentColor: '',
      backgroundImageEnabled: false,
    });

    expect(theme.colors['editor.background']).toBe('#1d1718');
    expect(theme.colors['editor.foreground']).toBe('#f0e6e4');
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: 'cb7676' });
    expect(theme.rules).toContainEqual({ token: 'function', foreground: 'de8f8f' });
  });

  it('provides a deeper red-black oled syntax palette for the oled red preset', () => {
    const theme = buildMonacoThemeDefinition({
      theme: 'dark',
      terminalTheme: 'Dracula',
      colorPreset: 'red-graphite-oled',
      customAccentColor: '',
      backgroundImageEnabled: false,
    });

    expect(theme.colors['editor.background']).toBe('#120e0f');
    expect(theme.colors['editor.foreground']).toBe('#f2e6e4');
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: 'e07878' });
    expect(theme.rules).toContainEqual({ token: 'function', foreground: 'f29696' });
  });
});
