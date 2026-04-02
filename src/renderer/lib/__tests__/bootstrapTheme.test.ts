import { beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapThemeTestDoubles = vi.hoisted(() => {
  const isTerminalThemeDark = vi.fn(() => true);
  return {
    isTerminalThemeDark,
  };
});

vi.mock('../ghosttyTheme', () => ({
  isTerminalThemeDark: bootstrapThemeTestDoubles.isTerminalThemeDark,
}));

describe('bootstrapTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    bootstrapThemeTestDoubles.isTerminalThemeDark.mockReset();
    bootstrapThemeTestDoubles.isTerminalThemeDark.mockReturnValue(true);
  });

  it('resolves sync-terminal bootstrap mode from the terminal theme luminance', async () => {
    bootstrapThemeTestDoubles.isTerminalThemeDark.mockReturnValue(false);
    const { resolveBootstrapThemeMode } = await import('../bootstrapTheme');

    expect(
      resolveBootstrapThemeMode({
        theme: 'sync-terminal',
        terminalTheme: 'Xcode WWDC',
        systemShouldUseDarkColors: true,
      })
    ).toBe('light');
  });

  it('applies the resolved bootstrap theme mode to the root element', async () => {
    const classListToggle = vi.fn();
    vi.stubGlobal('document', {
      documentElement: {
        classList: { toggle: classListToggle },
        dataset: {},
      },
    });

    const { applyBootstrapTheme } = await import('../bootstrapTheme');
    applyBootstrapTheme({
      theme: 'system',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: false,
    });

    expect(classListToggle).toHaveBeenCalledWith('dark', false);
    expect(document.documentElement.dataset.themeMode).toBe('light');
    expect(document.documentElement.dataset.themeSource).toBe('system');
  });
});
