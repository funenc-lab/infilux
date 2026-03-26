import type { APP_COLOR_PRESET_OPTIONS } from "@/lib/appTheme";

type ColorPresetOption = (typeof APP_COLOR_PRESET_OPTIONS)[number];

export function buildAppearanceColorPresetModel({
  selectedPresetId,
  presetOptions,
}: {
  selectedPresetId: string;
  presetOptions: readonly ColorPresetOption[];
}) {
  const defaultPreset = presetOptions.find((option) => option.isDefault) ?? presetOptions[0];
  const selectedPreset =
    presetOptions.find((option) => option.id === selectedPresetId) ?? defaultPreset;

  return {
    selectedPreset,
    compactOptions: presetOptions.map((option) => ({
      ...option,
      recommended: option.featured ?? false,
    })),
  };
}
