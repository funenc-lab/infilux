import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('session bar tab selection style', () => {
  it('uses a real border so active tab contrast is visible', () => {
    expect(globalsSource).toContain('.control-session-tab {');
    expect(globalsSource).toContain('border: 1px solid transparent;');
  });

  it('adds a structural active marker instead of relying on color alone', () => {
    expect(globalsSource).toContain('.control-session-tab::after {');
    expect(globalsSource).toContain('.control-session-tab[data-active="true"]::after {');
    expect(globalsSource).toContain('font-weight: 590;');
    expect(globalsSource).toContain('transform: scaleX(1);');
  });
});
