import { describe, expect, it } from 'vitest';
import { defaultEditorSettings } from '@/stores/settings/defaults';
import {
  applyEditorReadabilityPreset,
  getMatchingEditorReadabilityPreset,
} from '../editorReadabilityPresets';

describe('applyEditorReadabilityPreset', () => {
  it('applies the comfort preset to improve long-form readability', () => {
    const result = applyEditorReadabilityPreset(defaultEditorSettings, 'comfort');

    expect(result.fontSize).toBe(14);
    expect(result.lineHeight).toBe(22);
    expect(result.paddingTop).toBe(14);
    expect(result.paddingBottom).toBe(14);
    expect(result.renderWhitespace).toBe('none');
    expect(result.wordWrap).toBe('on');
    expect(result.minimapEnabled).toBe(false);
  });

  it('preserves unrelated editor settings when applying a preset', () => {
    const result = applyEditorReadabilityPreset(
      {
        ...defaultEditorSettings,
        tabSize: 4,
        autoSave: 'afterDelay',
        gitBlameEnabled: true,
      },
      'compact'
    );

    expect(result.tabSize).toBe(4);
    expect(result.autoSave).toBe('afterDelay');
    expect(result.gitBlameEnabled).toBe(true);
    expect(result.fontSize).toBe(12);
    expect(result.lineHeight).toBe(18);
  });
});

describe('getMatchingEditorReadabilityPreset', () => {
  it('returns the matching preset id when the tracked fields align', () => {
    const comfort = applyEditorReadabilityPreset(defaultEditorSettings, 'comfort');
    expect(getMatchingEditorReadabilityPreset(comfort)).toBe('comfort');
  });

  it('returns null when tracked readability fields were customized', () => {
    const comfort = applyEditorReadabilityPreset(defaultEditorSettings, 'comfort');
    expect(
      getMatchingEditorReadabilityPreset({
        ...comfort,
        lineHeight: comfort.lineHeight + 1,
      })
    ).toBeNull();
  });
});
