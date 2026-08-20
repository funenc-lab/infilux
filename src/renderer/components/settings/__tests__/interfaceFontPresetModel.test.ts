import { describe, expect, it, vi } from 'vitest';
import {
  applyFontPresetSelection,
  buildFontPresetSelection,
  buildInterfaceFontPresetSelection,
} from '../interfaceFontPresetModel';

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
    expect(selection.selectedLabel).toBe('PingFang SC');
    expect(selection.options).toContainEqual({
      disabled: false,
      fontFamily: 'PingFang SC, system-ui, sans-serif',
      id: 'cjk-priority',
      label: 'PingFang SC',
    });
  });

  it('identifies interface presets by their concrete primary font', () => {
    const selection = buildInterfaceFontPresetSelection(
      [
        {
          id: 'platform-default',
          fontFamily: '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif',
        },
        {
          id: 'english-priority',
          fontFamily: '"SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
        },
      ],
      '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif'
    );

    expect(selection.selectedLabel).toBe('PingFang SC');
    expect(selection.options).toContainEqual({
      disabled: false,
      fontFamily: '"SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
      id: 'english-priority',
      label: 'SF Pro Text',
    });
  });

  it('matches a persisted font stack to an available local font by its primary family', () => {
    const selection = buildFontPresetSelection(
      [
        {
          id: 'local:pingfang-sc',
          label: 'PingFang SC',
          fontFamily: '"PingFang SC", system-ui, sans-serif',
        },
      ],
      '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif'
    );

    expect(selection.selectedId).toBe('local:pingfang-sc');
    expect(selection.selectedLabel).toBe('PingFang SC');
  });

  it('keeps a matching terminal preset selectable', () => {
    const selection = buildFontPresetSelection(
      [
        {
          id: 'terminal-default',
          label: 'System monospace',
          fontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
        },
        {
          id: 'jetbrains-mono',
          label: 'JetBrains Mono',
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        },
      ],
      'JetBrains Mono, Menlo, Monaco, Consolas, monospace'
    );

    expect(selection.selectedId).toBe('jetbrains-mono');
    expect(selection.selectedLabel).toBe('JetBrains Mono');
    expect(selection.options).toContainEqual({
      disabled: false,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      id: 'jetbrains-mono',
      label: 'JetBrains Mono',
    });
  });

  it('only applies an explicitly chosen preset when the current font stack is custom', () => {
    const selection = buildFontPresetSelection(
      [
        {
          id: 'jetbrains-mono',
          label: 'JetBrains Mono',
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        },
      ],
      'Custom Terminal Font, monospace'
    );
    const applyFontFamily = vi.fn();

    applyFontPresetSelection(selection, 'custom', applyFontFamily);
    expect(applyFontFamily).not.toHaveBeenCalled();

    applyFontPresetSelection(selection, 'jetbrains-mono', applyFontFamily);
    expect(applyFontFamily).toHaveBeenCalledOnce();
    expect(applyFontFamily).toHaveBeenCalledWith(
      'JetBrains Mono, Menlo, Monaco, Consolas, monospace'
    );
  });
});
