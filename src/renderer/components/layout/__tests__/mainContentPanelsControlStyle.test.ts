import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const mainContentPanelsSource = readFileSync(
  resolve(currentDir, '../MainContentPanels.tsx'),
  'utf8'
);

describe('MainContentPanels control style policy', () => {
  it('uses the shared topbar action class for the settings display-mode switch', () => {
    expect(mainContentPanelsSource).toContain(
      'className="control-topbar-action h-6 gap-1 rounded-md px-2 text-xs"'
    );
    expect(mainContentPanelsSource).not.toContain('hover:bg-accent/50');
  });
});
