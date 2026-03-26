import { describe, expect, it } from 'vitest';
import { buildAppearanceThemeModel } from '../appearanceThemeModel';

describe('buildAppearanceThemeModel', () => {
  it('treats sync-terminal as terminal accent sync instead of a theme mode', () => {
    const t = (value: string) => value;

    const syncModel = buildAppearanceThemeModel({ theme: 'sync-terminal', t });
    expect(syncModel.modeOptions.map((option) => option.value)).toEqual([
      'light',
      'dark',
      'system',
    ]);
    expect(syncModel.activeMode).toBe('system');
    expect(syncModel.terminalSyncEnabled).toBe(true);

    const darkModel = buildAppearanceThemeModel({ theme: 'dark', t });
    expect(darkModel.activeMode).toBe('dark');
    expect(darkModel.terminalSyncEnabled).toBe(false);
  });
});
