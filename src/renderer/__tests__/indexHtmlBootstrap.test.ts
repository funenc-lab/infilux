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
});
