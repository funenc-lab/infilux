import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const openInMenuSource = readFileSync(resolve(currentDir, '../OpenInMenu.tsx'), 'utf8');

describe('openInMenuStoreSubscriptionPolicy', () => {
  it('uses a narrowed editor selector instead of subscribing to the whole editor store', () => {
    expect(openInMenuSource).not.toContain(
      'const { activeTabPath, tabs, currentCursorLine } = useEditorStore();'
    );
    expect(openInMenuSource).toContain('useEditorStore(');
  });
});
