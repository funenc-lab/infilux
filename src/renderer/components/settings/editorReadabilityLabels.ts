import type { EditorRenderWhitespace } from '@/stores/settings';

const READABILITY_WHITESPACE_LABEL_KEYS: Record<EditorRenderWhitespace, string> = {
  none: 'None',
  boundary: 'Boundary',
  selection: 'Selection',
  trailing: 'Trailing',
  all: 'All',
};

export function getReadabilityWhitespaceLabelKey(value: EditorRenderWhitespace): string {
  return READABILITY_WHITESPACE_LABEL_KEYS[value];
}
