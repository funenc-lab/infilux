import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererIndexHtml(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8');
}

describe('renderer index bootstrap shell', () => {
  it('hydrates localized startup shell messaging before React bootstraps', () => {
    const source = readRendererIndexHtml();
    const bootstrapShellBlock = source.match(/\.bootstrap-shell \{[\s\S]*?\n {6}\}/)?.[0] ?? '';

    expect(source).toContain('data-startup-shell="static-bootstrap"');
    expect(source).toContain('data-startup-layout="status-dock"');
    expect(source).toContain('data-startup-eyebrow="Infilux"');
    expect(source).toContain('<script src="./bootstrap-head.js"></script>');
    expect(source).toContain('<script src="./bootstrap-body.js"></script>');
    expect(source).toContain('<h1 class="bootstrap-title"></h1>');
    expect(source).toContain('<p class="bootstrap-description"></p>');
    expect(bootstrapShellBlock).toContain('align-items: center;');
    expect(bootstrapShellBlock).toContain('justify-content: center;');
    expect(source).not.toContain('>IF<');
    expect(source).not.toContain('bootstrap-spinner');
    expect(source).not.toContain('window.electronAPI?.env?.bootstrapLocale');
  });

  it('includes a bootstrap theme script and separate light and dark startup tokens', () => {
    const source = readRendererIndexHtml();

    expect(source).toContain('<script src="./bootstrap-head.js"></script>');
    expect(source).toContain('color-scheme: light;');
    expect(source).toContain('html.dark {');
    expect(source).toContain('color-scheme: dark;');
  });

  it('keeps static startup shell geometry aligned with the React startup fallback', () => {
    const source = readRendererIndexHtml();
    const bootstrapPanelBlock = source.match(/\.bootstrap-panel \{[\s\S]*?\n {6}\}/)?.[0] ?? '';
    const bootstrapIconBlock = source.match(/\.bootstrap-icon \{[\s\S]*?\n {6}\}/)?.[0] ?? '';
    const bootstrapTitleBlock = source.match(/\.bootstrap-title \{[\s\S]*?\n {6}\}/)?.[0] ?? '';
    const bootstrapDescriptionBlock =
      source.match(/\.bootstrap-description \{[\s\S]*?\n {6}\}/)?.[0] ?? '';

    expect(bootstrapPanelBlock).toContain('width: min(36rem, 100%);');
    expect(bootstrapPanelBlock).toContain('padding: 17.5px;');
    expect(bootstrapIconBlock).toContain('width: 38.5px;');
    expect(bootstrapIconBlock).toContain('height: 38.5px;');
    expect(bootstrapIconBlock).toContain('border-radius: 14px;');
    expect(source).toContain('font-size: 9.52px;');
    expect(source).toContain('line-height: 14.28px;');
    expect(bootstrapTitleBlock).toContain('font-size: 19px;');
    expect(bootstrapTitleBlock).toContain('line-height: 1.2;');
    expect(bootstrapTitleBlock).toContain('min-height: calc(19px * 1.2);');
    expect(bootstrapDescriptionBlock).toContain('font-size: 12.25px;');
    expect(bootstrapDescriptionBlock).toContain('margin: 7px 0 0;');
    expect(bootstrapDescriptionBlock).toContain('line-height: 1.6;');
    expect(bootstrapDescriptionBlock).toContain('min-height: calc(12.25px * 1.6);');
    expect(source).toContain('"Aptos",');
    expect(source).toContain('"Segoe UI Variable Text",');
    expect(source).toContain('font-size: var(--app-font-size-base, 14px);');
    expect(source).toContain('*,\n      *::before,\n      *::after');
    expect(source).toContain('box-sizing: border-box;');
    expect(source).toContain('.bootstrap-footer-label');
    expect(source).toContain('position: absolute;');
    expect(source).toContain(
      '<p class="bootstrap-description"></p>\n              <div class="bootstrap-footer">'
    );
  });
});
