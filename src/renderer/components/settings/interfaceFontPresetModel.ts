import type { UIFontPresetOption } from '@/stores/settings';

export const CUSTOM_INTERFACE_FONT_PRESET_ID = 'custom' as const;

type InterfaceFontPresetId = UIFontPresetOption['id'] | typeof CUSTOM_INTERFACE_FONT_PRESET_ID;

interface InterfaceFontPresetOption {
  disabled: boolean;
  fontFamily?: string;
  id: InterfaceFontPresetId;
  label: string;
}

export interface InterfaceFontPresetSelection {
  options: InterfaceFontPresetOption[];
  selectedId: InterfaceFontPresetId;
  selectedLabel: string;
}

const FONT_PRESET_LABELS: Record<UIFontPresetOption['id'], string> = {
  'platform-default': 'Platform default',
  'english-priority': 'English UI optimized',
  'cjk-priority': 'Chinese UI optimized',
};

function getFontPresetLabel(id: UIFontPresetOption['id']): string {
  return FONT_PRESET_LABELS[id];
}

export function buildInterfaceFontPresetSelection(
  recommendedOptions: readonly UIFontPresetOption[],
  fontFamily: string
): InterfaceFontPresetSelection {
  const matchedOption = recommendedOptions.find((option) => option.fontFamily === fontFamily);

  if (matchedOption) {
    return {
      options: recommendedOptions.map((option) => ({
        disabled: false,
        fontFamily: option.fontFamily,
        id: option.id,
        label: getFontPresetLabel(option.id),
      })),
      selectedId: matchedOption.id,
      selectedLabel: getFontPresetLabel(matchedOption.id),
    };
  }

  return {
    options: [
      ...recommendedOptions.map((option) => ({
        disabled: false,
        fontFamily: option.fontFamily,
        id: option.id,
        label: getFontPresetLabel(option.id),
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
