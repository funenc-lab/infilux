import { describe, expect, it } from 'vitest';
import { buildAppearanceThemeModel } from '../appearanceThemeModel';

describe('buildAppearanceThemeModel', () => {
  it('models terminal accent sync independently from the active theme mode', () => {
    const t = (value: string) => value;

    const syncModel = buildAppearanceThemeModel({
      theme: 'system',
      terminalAccentSync: true,
      t,
    });
    expect(syncModel.modeOptions.map((option) => option.value)).toEqual([
      'light',
      'dark',
      'system',
    ]);
    expect(syncModel.activeMode).toBe('system');
    expect(syncModel.terminalSyncEnabled).toBe(true);

    const darkModel = buildAppearanceThemeModel({
      theme: 'dark',
      terminalAccentSync: false,
      t,
    });
    expect(darkModel.activeMode).toBe('dark');
    expect(darkModel.terminalSyncEnabled).toBe(false);
  });
});
