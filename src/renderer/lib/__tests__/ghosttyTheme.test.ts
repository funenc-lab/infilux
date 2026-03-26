import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTerminalThemeToApp,
  clearTerminalThemeFromApp,
  getTerminalThemeAccent,
  getTheme,
  getThemeNames,
  getXtermTheme,
  ghosttyToXterm,
  hexToRgba,
  isTerminalThemeDark,
} from '../ghosttyTheme';

describe('ghosttyTheme', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns theme names in alphabetical order and exposes raw themes', () => {
    const names = getThemeNames();

    expect(names.length).toBeGreaterThan(10);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    expect(names).toContain('Dracula');
    expect(getTheme('Missing Theme')).toBeUndefined();
    expect(getTheme('Dracula')).toMatchObject({
      name: 'Dracula',
      background: '#282a36',
      foreground: '#f8f8f2',
    });
  });

  it('maps ghostty themes into xterm themes and returns undefined for missing names', () => {
    const dracula = getTheme('Dracula');
    expect(dracula).toBeDefined();

    const mapped = ghosttyToXterm(dracula!);
    expect(mapped).toMatchObject({
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      brightWhite: '#ffffff',
    });

    expect(getXtermTheme('Dracula')).toEqual(mapped);
    expect(getXtermTheme('Missing Theme')).toBeUndefined();
  });

  it('converts supported color formats to rgba while preserving unsupported values', () => {
    expect(hexToRgba('#123456', 50)).toBe('rgba(18, 52, 86, 0.5)');
    expect(hexToRgba('#abc', 25)).toBe('rgba(170, 187, 204, 0.25)');
    expect(hexToRgba('#11223380', 50)).toBe('rgba(17, 34, 51, 0.25098039215686274)');
    expect(hexToRgba('rgb(10, 20, 30)', 75)).toBe('rgba(10, 20, 30, 0.75)');
    expect(hexToRgba('rgba(10, 20, 30, 0.5)', 50)).toBe('rgba(10, 20, 30, 0.25)');
    expect(hexToRgba('transparent', 90)).toBe('transparent');
    expect(hexToRgba('var(--accent)', 90)).toBe('var(--accent)');
  });

  it('detects whether a terminal theme is dark and defaults missing themes to dark', () => {
    expect(isTerminalThemeDark('Dracula')).toBe(true);
    expect(isTerminalThemeDark('Adwaita')).toBe(false);
    expect(isTerminalThemeDark('Missing Theme')).toBe(true);
  });

  it('resolves a readable terminal accent and falls back to empty string for missing themes', () => {
    expect(getTerminalThemeAccent('Dracula')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getTerminalThemeAccent('Adwaita')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getTerminalThemeAccent('Missing Theme')).toBe('');
  });

  it('applies terminal theme variables and syncs dark mode when requested', () => {
    const setProperty = vi.fn();
    const toggle = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle },
        style: { setProperty, removeProperty: vi.fn() },
      },
    });

    applyTerminalThemeToApp('Dracula');
    applyTerminalThemeToApp('Adwaita');

    expect(toggle).toHaveBeenNthCalledWith(1, 'dark', true);
    expect(toggle).toHaveBeenNthCalledWith(2, 'dark', false);
    expect(setProperty).toHaveBeenCalledWith('--background', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--foreground', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--card', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--popover', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--primary', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--primary-foreground', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--muted-foreground', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--border', expect.any(String));
    expect(setProperty).toHaveBeenCalledWith('--ring', expect.any(String));
  });

  it('skips unknown themes and can leave dark mode untouched while still applying variables', () => {
    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    const toggle = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle },
        style: { setProperty, removeProperty },
      },
    });

    applyTerminalThemeToApp('Missing Theme');
    applyTerminalThemeToApp('Dracula', false);

    expect(toggle).not.toHaveBeenCalled();
    expect(setProperty).toHaveBeenCalledWith('--background', '#282a36');
    expect(setProperty).toHaveBeenCalledWith('--accent', expect.any(String));
    expect(removeProperty).not.toHaveBeenCalled();
  });

  it('clears every terminal theme css variable from the document root', () => {
    const removeProperty = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle: vi.fn() },
        style: { setProperty: vi.fn(), removeProperty },
      },
    });

    clearTerminalThemeFromApp();

    expect(removeProperty).toHaveBeenCalledTimes(17);
    expect(removeProperty).toHaveBeenCalledWith('--background');
    expect(removeProperty).toHaveBeenCalledWith('--foreground');
    expect(removeProperty).toHaveBeenCalledWith('--card');
    expect(removeProperty).toHaveBeenCalledWith('--popover');
    expect(removeProperty).toHaveBeenCalledWith('--secondary');
    expect(removeProperty).toHaveBeenCalledWith('--muted');
    expect(removeProperty).toHaveBeenCalledWith('--accent');
    expect(removeProperty).toHaveBeenCalledWith('--primary');
    expect(removeProperty).toHaveBeenCalledWith('--border');
    expect(removeProperty).toHaveBeenCalledWith('--input');
    expect(removeProperty).toHaveBeenCalledWith('--ring');
  });

  it('falls back when theme colors are unreadable or cannot be mixed', async () => {
    vi.resetModules();
    vi.doMock('@/data/terminal-themes.json', () => ({
      default: {
        Muted: {
          name: 'Muted',
          palette: [
            '#000000',
            '#000000',
            '#000000',
            '#000000',
            '#010101',
            '#000000',
            '#040404',
            '#000000',
            '#000000',
            '#000000',
            '#000000',
            '#000000',
            '#020202',
            '#000000',
            '#030303',
            '#000000',
          ],
          background: 'var(--bg)',
          foreground: '#050505',
          cursorColor: '#050505',
          cursorText: '#ffffff',
          selectionBackground: '#000000',
          selectionForeground: '#ffffff',
        },
      },
    }));

    const setProperty = vi.fn();
    const toggle = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle },
        style: { setProperty, removeProperty: vi.fn() },
      },
    });

    const { applyTerminalThemeToApp: applyMockedTerminalTheme } = await import('../ghosttyTheme');

    applyMockedTerminalTheme('Muted');

    expect(toggle).toHaveBeenCalledWith('dark', true);
    expect(setProperty).toHaveBeenCalledWith('--background', 'var(--bg)');
    expect(setProperty).toHaveBeenCalledWith('--card', 'var(--bg)');
    expect(setProperty).toHaveBeenCalledWith('--primary', '#050505');
    expect(setProperty).toHaveBeenCalledWith('--muted-foreground', '#d4d4d4');
  });

  it('formats mixed terminal variables as rgba when source colors carry alpha channels', async () => {
    vi.resetModules();
    vi.doMock('@/data/terminal-themes.json', () => ({
      default: {
        Alpha: {
          name: 'Alpha',
          palette: Array.from({ length: 16 }, () => '#ffffff'),
          background: 'rgba(0, 0, 0, 0.5)',
          foreground: '#ffffff',
          cursorColor: '#ffffff',
          cursorText: '#000000',
          selectionBackground: '#ffffff80',
          selectionForeground: '#000000',
        },
      },
    }));

    const setProperty = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle: vi.fn() },
        style: { setProperty, removeProperty: vi.fn() },
      },
    });

    const { applyTerminalThemeToApp: applyMockedTerminalTheme } = await import('../ghosttyTheme');

    applyMockedTerminalTheme('Alpha');

    expect(setProperty).toHaveBeenCalledWith('--background', 'rgba(0, 0, 0, 0.5)');
    expect(setProperty).toHaveBeenCalledWith('--card', expect.stringMatching(/^rgba\(/));
    expect(setProperty).toHaveBeenCalledWith('--popover', expect.stringMatching(/^rgba\(/));
    expect(setProperty).toHaveBeenCalledWith('--accent', expect.stringMatching(/^rgba\(/));
  });

  it('keeps the computed muted foreground when both fallback options remain below the contrast threshold', async () => {
    vi.resetModules();
    vi.doMock('@/data/terminal-themes.json', () => ({
      default: {
        EdgeContrast: {
          name: 'EdgeContrast',
          palette: Array.from({ length: 16 }, () => '#d7d7d7'),
          background: '#4f4f4f',
          foreground: '#d7d7d7',
          cursorColor: '#d7d7d7',
          cursorText: '#000000',
          selectionBackground: '#5c5c5c',
          selectionForeground: '#ffffff',
        },
      },
    }));

    const setProperty = vi.fn();

    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle: vi.fn() },
        style: { setProperty, removeProperty: vi.fn() },
      },
    });

    const { applyTerminalThemeToApp: applyMockedTerminalTheme } = await import('../ghosttyTheme');

    applyMockedTerminalTheme('EdgeContrast');

    expect(setProperty).toHaveBeenCalledWith('--muted-foreground', 'rgb(174, 174, 174)');
  });
});
