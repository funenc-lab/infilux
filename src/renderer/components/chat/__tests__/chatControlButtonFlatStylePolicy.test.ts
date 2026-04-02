import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('chat control button flat style policy', () => {
  it('keeps console action buttons flat-first instead of using raised gradients', () => {
    expect(globalsSource).toContain('.control-action-button-primary {');
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--primary) 16%, var(--background) 84%);'
    );
    expect(globalsSource).toContain(
      'box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 16%, transparent);'
    );
    expect(globalsSource).not.toContain(
      '.control-action-button-primary {\n    border-color: color-mix(in oklch, var(--primary) 28%, var(--border) 72%);\n    background: linear-gradient('
    );
  });

  it('keeps icon, input, and floating buttons free of press-down transforms', () => {
    expect(globalsSource).toContain('.control-icon-button:active {');
    expect(globalsSource).toContain('.control-input-action-primary:active,');
    expect(globalsSource).toContain('.control-action-button:active {');
    expect(globalsSource).toContain('transform: none;');
    expect(globalsSource).not.toContain('.control-icon-button:active {\n    transform: translateY(1px);');
    expect(globalsSource).not.toContain(
      '.control-input-action-primary:active,\n  .control-input-action-secondary:active {\n    transform: translateY(1px);'
    );
    expect(globalsSource).not.toContain('.control-action-button:active {\n    transform: translateY(1px);');
  });

  it('uses restrained outline emphasis instead of elevated drop shadows for control families', () => {
    expect(globalsSource).toContain('.control-floating-button {');
    expect(globalsSource).toContain('.control-icon-button {');
    expect(globalsSource).toContain('.control-action-button {');
    expect(globalsSource).toContain('box-shadow: none;');
    expect(globalsSource).toContain(
      'box-shadow: 0 0 0 1px color-mix(in oklch, var(--border) 18%, transparent);'
    );
    expect(globalsSource).not.toContain(
      '0 14px 30px color-mix(in oklch, var(--primary) 18%, transparent);'
    );
    expect(globalsSource).not.toContain('0 10px 24px\n      color-mix(in oklch, var(--foreground) 4%, transparent);');
  });
});
