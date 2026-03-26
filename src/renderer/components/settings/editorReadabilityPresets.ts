import type { EditorSettings } from '@/stores/settings';

export type EditorReadabilityPresetId = 'balanced' | 'comfort' | 'compact';

type ReadabilityPresetPatch = Pick<
  EditorSettings,
  | 'fontSize'
  | 'lineHeight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'renderWhitespace'
  | 'renderLineHighlight'
  | 'wordWrap'
  | 'minimapEnabled'
  | 'smoothScrolling'
  | 'cursorBlinking'
  | 'fontLigatures'
>;

interface EditorReadabilityPresetDefinition {
  id: EditorReadabilityPresetId;
  labelKey: string;
  descriptionKey: string;
  patch: ReadabilityPresetPatch;
}

export const EDITOR_READABILITY_PRESETS: EditorReadabilityPresetDefinition[] = [
  {
    id: 'balanced',
    labelKey: 'Balanced',
    descriptionKey: 'Default reading balance for mixed editing and navigation',
    patch: {
      fontSize: 13,
      lineHeight: 20,
      paddingTop: 12,
      paddingBottom: 12,
      renderWhitespace: 'selection',
      renderLineHighlight: 'line',
      wordWrap: 'on',
      minimapEnabled: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      fontLigatures: true,
    },
  },
  {
    id: 'comfort',
    labelKey: 'Comfort',
    descriptionKey: 'Larger text and calmer guides for extended reading sessions',
    patch: {
      fontSize: 14,
      lineHeight: 22,
      paddingTop: 14,
      paddingBottom: 14,
      renderWhitespace: 'none',
      renderLineHighlight: 'line',
      wordWrap: 'on',
      minimapEnabled: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      fontLigatures: true,
    },
  },
  {
    id: 'compact',
    labelKey: 'Compact',
    descriptionKey: 'Denser layout for high-information scanning without noisy chrome',
    patch: {
      fontSize: 12,
      lineHeight: 18,
      paddingTop: 8,
      paddingBottom: 8,
      renderWhitespace: 'selection',
      renderLineHighlight: 'gutter',
      wordWrap: 'off',
      minimapEnabled: false,
      smoothScrolling: true,
      cursorBlinking: 'solid',
      fontLigatures: true,
    },
  },
];

const TRACKED_KEYS = [
  'fontSize',
  'lineHeight',
  'paddingTop',
  'paddingBottom',
  'renderWhitespace',
  'renderLineHighlight',
  'wordWrap',
  'minimapEnabled',
  'smoothScrolling',
  'cursorBlinking',
  'fontLigatures',
] as const satisfies readonly (keyof ReadabilityPresetPatch)[];

export function applyEditorReadabilityPreset(
  settings: EditorSettings,
  presetId: EditorReadabilityPresetId
): EditorSettings {
  const preset = EDITOR_READABILITY_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    return settings;
  }

  return {
    ...settings,
    ...preset.patch,
  };
}

export function getMatchingEditorReadabilityPreset(
  settings: EditorSettings
): EditorReadabilityPresetId | null {
  for (const preset of EDITOR_READABILITY_PRESETS) {
    const matches = TRACKED_KEYS.every((key) => settings[key] === preset.patch[key]);
    if (matches) {
      return preset.id;
    }
  }

  return null;
}
