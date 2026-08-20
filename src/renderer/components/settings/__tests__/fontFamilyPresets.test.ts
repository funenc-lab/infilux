import { describe, expect, it } from 'vitest';
import { buildLocalFontPresetOptions } from '../fontFamilyPresets';

describe('buildLocalFontPresetOptions', () => {
  it('turns locally available font families into selectable CSS font stacks', () => {
    expect(buildLocalFontPresetOptions(['Menlo', 'PingFang SC'], 'system-ui, sans-serif')).toEqual([
      {
        id: 'local:Menlo',
        label: 'Menlo',
        fontFamily: '"Menlo", system-ui, sans-serif',
      },
      {
        id: 'local:PingFang SC',
        label: 'PingFang SC',
        fontFamily: '"PingFang SC", system-ui, sans-serif',
      },
    ]);
  });

  it('escapes local font names before using them in CSS', () => {
    expect(buildLocalFontPresetOptions(['A "Quoted" Font'], 'monospace')).toEqual([
      {
        id: 'local:A "Quoted" Font',
        label: 'A "Quoted" Font',
        fontFamily: '"A \\"Quoted\\" Font", monospace',
      },
    ]);
  });
});
