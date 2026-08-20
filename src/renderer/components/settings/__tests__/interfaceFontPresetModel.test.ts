import { describe, expect, it } from 'vitest';
import { buildInterfaceFontPresetSelection } from '../interfaceFontPresetModel';

describe('buildInterfaceFontPresetSelection', () => {
  it('represents an unrecognized font stack as the custom selection', () => {
    const selection = buildInterfaceFontPresetSelection(
      [
        { id: 'platform-default', fontFamily: 'system-ui, sans-serif' },
        { id: 'english-priority', fontFamily: 'Inter, sans-serif' },
      ],
      'IBM Plex Sans, sans-serif'
    );

    expect(selection.selectedId).toBe('custom');
    expect(selection.selectedLabel).toBe('Custom font stack');
    expect(selection.options).toContainEqual({
      id: 'custom',
      label: 'Custom font stack',
      disabled: true,
    });
  });

  it('keeps the matching recommendation label and font stack in one option', () => {
    const selection = buildInterfaceFontPresetSelection(
      [
        { id: 'platform-default', fontFamily: 'system-ui, sans-serif' },
        { id: 'cjk-priority', fontFamily: 'PingFang SC, system-ui, sans-serif' },
      ],
      'PingFang SC, system-ui, sans-serif'
    );

    expect(selection.selectedId).toBe('cjk-priority');
    expect(selection.selectedLabel).toBe('Chinese UI optimized');
    expect(selection.options).toContainEqual({
      disabled: false,
      fontFamily: 'PingFang SC, system-ui, sans-serif',
      id: 'cjk-priority',
      label: 'Chinese UI optimized',
    });
  });
});
