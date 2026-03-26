import { describe, expect, it } from 'vitest';
import { filterTerminalThemeNames, localizeTerminalThemeName } from '../terminalThemeLocalization';

const zhMap: Record<string, string> = {
  Dracula: '德古拉',
  Nord: '北境',
  TokyoNight: '东京夜',
  Dark: '深色',
  Light: '浅色',
  Day: '日间',
  Moon: '月',
  Night: '夜',
  Storm: '风暴',
  Hard: '硬核',
  Material: '材质',
  Builtin: '内建',
  'System Colors': '系统颜色',
  'Higher Contrast': '高对比',
};

const t = (key: string) => zhMap[key] ?? key;

describe('terminalThemeLocalization', () => {
  it('prefers exact localized names when a dedicated translation exists', () => {
    expect(localizeTerminalThemeName('Dracula', t)).toBe('德古拉');
    expect(localizeTerminalThemeName('TokyoNight', t)).toBe('东京夜');
  });

  it('falls back to token-based localization for composite theme names', () => {
    expect(localizeTerminalThemeName('Gruvbox Dark', t)).toBe('Gruvbox 深色');
    expect(localizeTerminalThemeName('Nord Light', t)).toBe('北境 浅色');
    expect(localizeTerminalThemeName('TokyoNight Storm', t)).toBe('东京夜 风暴');
    expect(localizeTerminalThemeName('Builtin Solarized Dark', t)).toBe('内建 Solarized 深色');
  });

  it('filters themes by either raw or localized labels', () => {
    const themes = ['Dracula', 'Gruvbox Dark', 'Nord Light', 'TokyoNight Storm'];

    expect(
      filterTerminalThemeNames({
        themes,
        query: '德古拉',
        selectedTheme: 'Nord Light',
        t,
      })
    ).toEqual(['Dracula']);
    expect(
      filterTerminalThemeNames({
        themes,
        query: '浅色',
        selectedTheme: 'Dracula',
        t,
      })
    ).toEqual(['Nord Light']);
    expect(
      filterTerminalThemeNames({
        themes,
        query: 'storm',
        selectedTheme: 'Dracula',
        t,
      })
    ).toEqual(['TokyoNight Storm']);
  });

  it('keeps the full list visible when the query matches the selected localized label', () => {
    const themes = ['Dracula', 'Gruvbox Dark'];

    expect(
      filterTerminalThemeNames({
        themes,
        query: '德古拉',
        selectedTheme: 'Dracula',
        t,
      })
    ).toEqual(themes);
  });
});
