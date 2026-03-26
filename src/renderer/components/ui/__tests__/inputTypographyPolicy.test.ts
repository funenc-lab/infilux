import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('input typography policy', () => {
  it('forces form controls to inherit the app typography tokens', () => {
    expect(globalsSource).toContain('button,');
    expect(globalsSource).toContain('input,');
    expect(globalsSource).toContain('textarea,');
    expect(globalsSource).toContain('select {');
    expect(globalsSource).toContain('font: inherit;');
    expect(globalsSource).toContain('color: inherit;');
  });

  it('keeps custom select and combobox controls on the same inherited typography stack', () => {
    expect(globalsSource).toContain('[data-slot="select-trigger"],');
    expect(globalsSource).toContain('[data-slot="select-item"],');
    expect(globalsSource).toContain('[data-slot="combobox-input"],');
    expect(globalsSource).toContain('[data-slot="combobox-item"],');
    expect(globalsSource).toContain('[data-slot="combobox-chips"] {');
    expect(globalsSource).toContain('font: inherit;');
    expect(globalsSource).toContain('color: inherit;');
  });
});
