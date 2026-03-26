import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(resolve(currentDir, '../QuickTerminalModal.tsx'), 'utf8');

describe('QuickTerminalModal theme policy', () => {
  it('uses the shared themed overlay and floating button styles', () => {
    expect(modalSource).not.toContain('bg-black/20 backdrop-blur-[2px]');
    expect(modalSource).toContain(
      'bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]'
    );
    expect(modalSource).toContain('control-floating-button h-7 w-7 rounded-lg');
  });
});
