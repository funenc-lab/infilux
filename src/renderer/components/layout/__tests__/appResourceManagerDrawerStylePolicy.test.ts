import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const drawerSource = readFileSync(resolve(currentDir, '../AppResourceManagerDrawer.tsx'), 'utf8');

describe('app resource manager drawer style policy', () => {
  it('uses control-console surfaces instead of a generic background sheet', () => {
    expect(drawerSource).toContain('bg-[color:var(--theme-popover-base)]');
    expect(drawerSource).not.toContain('max-w-[48rem] bg-background');
  });

  it('keeps summary and resource sections on shared control panel surfaces', () => {
    expect(drawerSource).toContain('control-panel-muted rounded-[1.1rem]');
    expect(drawerSource).toContain('control-panel rounded-[1.15rem]');
    expect(drawerSource).toContain('border-t border-border/55 pt-4 sm:grid-cols-2');
  });
});
