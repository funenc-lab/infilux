import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const drawerSource = readFileSync(resolve(currentDir, '../AppResourceManagerDrawer.tsx'), 'utf8');

describe('app resource manager drawer auto refresh policy', () => {
  it('binds polling to the shared window focus state and the drawer lifecycle', () => {
    expect(drawerSource).toContain("import { useWindowFocus } from '@/hooks/useWindowFocus';");
    expect(drawerSource).toContain('createAppResourceAutoRefreshController');
    expect(drawerSource).toMatch(/open\s*&&\s*isWindowFocused/);
    expect(drawerSource).toContain('pendingActionKey === null');
    expect(drawerSource).toContain('pendingConfirmation === null');
  });
});
