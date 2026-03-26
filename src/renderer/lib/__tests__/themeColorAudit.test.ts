import { describe, expect, it } from 'vitest';
import {
  collectThemeColorViolations,
  findRawColorTokens,
  isRendererThemeSource,
} from '../themeColorAudit';

describe('themeColorAudit', () => {
  it('allows raw colors inside declared renderer theme source files', () => {
    expect(isRendererThemeSource('src/renderer/lib/appTheme.ts')).toBe(true);
    expect(isRendererThemeSource('src/renderer/styles/globals.css')).toBe(true);
    expect(isRendererThemeSource('src/renderer/components/files/editorThemePalette.ts')).toBe(true);
    expect(isRendererThemeSource('src/renderer/assets/logo.svg')).toBe(true);
  });

  it('flags raw renderer colors outside the theme source boundaries', () => {
    const violations = collectThemeColorViolations([
      {
        path: 'src/renderer/components/layout/FakePanel.tsx',
        content:
          "export const bad = '#ff0000'; const tint = 'oklch(0.5 0.1 20)'; const mix = 'color-mix(in oklch, var(--primary) 20%, transparent)';",
      },
      {
        path: 'src/renderer/lib/appTheme.ts',
        content: "const allowed = '#ff0000';",
      },
    ]);

    expect(violations).toEqual([
      {
        path: 'src/renderer/components/layout/FakePanel.tsx',
        matches: ['#ff0000', 'oklch('],
      },
    ]);
  });

  it('finds supported raw color forms used by the audit gate', () => {
    expect(
      findRawColorTokens('a #abc b #123456 c oklch(0.5 0.1 20) d color-mix(in oklch, red, blue)')
    ).toEqual(['#abc', '#123456', 'oklch(']);
  });
});
