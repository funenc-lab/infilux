import type { UIFontPresetOption } from '@/stores/settings';

export const CUSTOM_INTERFACE_FONT_PRESET_ID = 'custom' as const;

export interface FontPresetOption {
  fontFamily: string;
  id: string;
  label: string;
}

export interface FontPresetSelectionOption {
  disabled: boolean;
  fontFamily?: string;
  id: string;
  label: string;
}

export interface FontPresetSelection {
  options: FontPresetSelectionOption[];
  selectedId: string;
  selectedLabel: string;
}

function getPrimaryFontName(fontFamily: string): string {
  const [primaryFont] = fontFamily.split(',');
  const normalizedPrimaryFont = primaryFont?.trim().replace(/^['"]|['"]$/g, '');

  return normalizedPrimaryFont || fontFamily;
}

export function buildFontPresetSelection(
  presetOptions: readonly FontPresetOption[],
  fontFamily: string
): FontPresetSelection {
  const primaryFontName = getPrimaryFontName(fontFamily).toLocaleLowerCase();
  const matchedOption =
    presetOptions.find((option) => option.fontFamily === fontFamily) ??
    presetOptions.find(
      (option) => getPrimaryFontName(option.fontFamily).toLocaleLowerCase() === primaryFontName
    );

  if (matchedOption) {
    return {
      options: presetOptions.map((option) => ({
        disabled: false,
        fontFamily: option.fontFamily,
        id: option.id,
        label: option.label,
      })),
      selectedId: matchedOption.id,
      selectedLabel: matchedOption.label,
    };
  }

  return {
    options: [
      ...presetOptions.map((option) => ({
        disabled: false,
        fontFamily: option.fontFamily,
        id: option.id,
        label: option.label,
      })),
      {
        disabled: true,
        id: CUSTOM_INTERFACE_FONT_PRESET_ID,
        label: 'Custom font stack',
      },
    ],
    selectedId: CUSTOM_INTERFACE_FONT_PRESET_ID,
    selectedLabel: 'Custom font stack',
  };
}

export function applyFontPresetSelection(
  selection: FontPresetSelection,
  presetId: string | null,
  applyFontFamily: (fontFamily: string) => void
): void {
  if (!presetId) {
    return;
  }

  const nextPreset = selection.options.find((option) => option.id === presetId);

  if (nextPreset?.fontFamily) {
    applyFontFamily(nextPreset.fontFamily);
  }
}

export function buildInterfaceFontPresetSelection(
  recommendedOptions: readonly UIFontPresetOption[],
  fontFamily: string
): FontPresetSelection {
  return buildFontPresetSelection(
    recommendedOptions.map((option) => ({
      fontFamily: option.fontFamily,
      id: option.id,
      label: getPrimaryFontName(option.fontFamily),
    })),
    fontFamily
  );
}
