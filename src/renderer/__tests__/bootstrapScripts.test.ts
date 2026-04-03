import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererFile(fileName: string): string {
  return readFileSync(join(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('renderer bootstrap scripts', () => {
  it('resolves theme and locale in the CSP-safe head bootstrap script', () => {
    const source = readRendererFile('bootstrap-head.js');

    expect(source).toContain('window.location.search');
    expect(source).toContain('bootstrapLocale');
    expect(source).toContain('bootstrapMainStage');
    expect(source).toContain('document.documentElement.lang');
    expect(source).toContain('classList.remove');
    expect(source).toContain('classList.add');
  });

  it('fills the static startup shell copy in the body bootstrap script', () => {
    const source = readRendererFile('bootstrap-body.js');

    expect(source).toContain('.bootstrap-title');
    expect(source).toContain('.bootstrap-description');
    expect(source).toContain('data-startup-title');
    expect(source).toContain('bootstrapMainStage');
    expect(source).toContain('Opening desktop window');
    expect(source).toContain('--bootstrap-progress-value');
  });
});
