import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererIndexHtml(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8');
}

describe('renderer index bootstrap shell', () => {
  it('matches the startup shell messaging and structure before React bootstraps', () => {
    const source = readRendererIndexHtml();
    const bootstrapShellBlock = source.match(/\.bootstrap-shell \{[\s\S]*?\n      \}/)?.[0] ?? '';

    expect(source).toContain('data-startup-shell="static-bootstrap"');
    expect(source).toContain('data-startup-layout="status-dock"');
    expect(source).toContain('data-startup-eyebrow="Infilux"');
    expect(source).toContain('Restoring workspace');
    expect(source).toContain('Loading settings and repository context.');
    expect(bootstrapShellBlock).toContain('align-items: center;');
    expect(bootstrapShellBlock).toContain('justify-content: center;');
    expect(source).not.toContain('>IF<');
    expect(source).not.toContain('bootstrap-spinner');
  });

  it('includes a bootstrap theme script and separate light and dark startup tokens', () => {
    const source = readRendererIndexHtml();

    expect(source).toContain('infiluxBootstrapTheme');
    expect(source).toContain('window.location.search');
    expect(source).toContain('document.documentElement.classList.remove("dark")');
    expect(source).toContain('color-scheme: light;');
    expect(source).toContain('html.dark {');
    expect(source).toContain('color-scheme: dark;');
  });
});
