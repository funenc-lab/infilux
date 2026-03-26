import type { TFunction } from '@/i18n';
import type { APP_COLOR_PRESET_OPTIONS } from '@/lib/appTheme';

type ColorPresetOption = (typeof APP_COLOR_PRESET_OPTIONS)[number];

export function buildAppearanceColorPresetModel({
  selectedPresetId,
  presetOptions,
  t,
}: {
  selectedPresetId: string;
  presetOptions: readonly ColorPresetOption[];
  t: TFunction;
}) {
  const defaultPreset = presetOptions.find((option) => option.isDefault) ?? presetOptions[0];
  const selectedPreset =
    presetOptions.find((option) => option.id === selectedPresetId) ?? defaultPreset;

  return {
    selectedPreset: {
      ...selectedPreset,
      label: t(selectedPreset.label),
      description: t(selectedPreset.description),
    },
    compactOptions: presetOptions.map((option) => ({
      ...option,
      label: t(option.label),
      description: t(option.description),
      recommended: option.featured ?? false,
    })),
  };
}
