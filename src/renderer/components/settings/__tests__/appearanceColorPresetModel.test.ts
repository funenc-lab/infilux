import { describe, expect, it } from 'vitest';
import { APP_COLOR_PRESET_OPTIONS } from '@/lib/appTheme';
import { buildAppearanceColorPresetModel } from '../appearanceColorPresetModel';

describe('buildAppearanceColorPresetModel', () => {
  const t = (key: string) => `translated:${key}`;

  it('falls back to the first preset when the selected id is unknown', () => {
    const model = buildAppearanceColorPresetModel({
      selectedPresetId: 'missing-preset',
      presetOptions: APP_COLOR_PRESET_OPTIONS,
      t,
    });

    expect(model.selectedPreset.id).toBe(APP_COLOR_PRESET_OPTIONS[0]?.id);
    expect(model.selectedPreset.label).toBe(`translated:${APP_COLOR_PRESET_OPTIONS[0]?.label}`);
  });

  it('marks the curated presets as recommended', () => {
    const model = buildAppearanceColorPresetModel({
      selectedPresetId: 'graphite-ink',
      presetOptions: APP_COLOR_PRESET_OPTIONS,
      t,
    });

    expect(model.compactOptions.find((option) => option.id === 'graphite-ink')?.recommended).toBe(
      true
    );
    expect(model.compactOptions.find((option) => option.id === 'tide-blue')?.recommended).toBe(
      true
    );
    expect(model.compactOptions.find((option) => option.id === 'warm-graphite')?.recommended).toBe(
      true
    );
    expect(model.compactOptions.some((option) => option.id === 'classic-red')).toBe(false);
    expect(model.compactOptions.some((option) => option.id === 'red-graphite-oled')).toBe(false);
  });

  it('localizes labels and descriptions through the provided translator', () => {
    const model = buildAppearanceColorPresetModel({
      selectedPresetId: 'graphite-ink',
      presetOptions: APP_COLOR_PRESET_OPTIONS,
      t,
    });

    expect(model.selectedPreset.label).toBe('translated:Graphite Ink');
    expect(model.selectedPreset.description).toBe(
      'translated:Default console palette with cool graphite surfaces, steel-blue theme emphasis, and restrained teal support.'
    );
  });
});
