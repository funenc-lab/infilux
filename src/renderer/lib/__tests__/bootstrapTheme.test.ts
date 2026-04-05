import { beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapThemeTestDoubles = vi.hoisted(() => {
  return {
    isTerminalThemeDark: vi.fn(() => true),
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

  it('resolves system bootstrap mode from the system preference only', async () => {
    const { resolveBootstrapThemeMode } = await import('../bootstrapTheme');

    expect(
      resolveBootstrapThemeMode({
        theme: 'system',
        terminalTheme: 'Xcode WWDC',
        systemShouldUseDarkColors: false,
      })
    ).toBe('light');

    expect(bootstrapThemeTestDoubles.isTerminalThemeDark).not.toHaveBeenCalled();
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
