import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalSearchDialogSource = readFileSync(
  resolve(currentDir, '../GlobalSearchDialog.tsx'),
  'utf8'
);
const searchResultListSource = readFileSync(resolve(currentDir, '../SearchResultList.tsx'), 'utf8');

describe('Search control style policy', () => {
  it('uses shared icon and menu-item control classes for search toolbar actions', () => {
    expect(globalSearchDialogSource).toContain('GLOBAL_SEARCH_ICON_BUTTON_CLASS_NAME');
    expect(globalSearchDialogSource).toContain(
      "'control-icon-button flex h-6 w-6 items-center justify-center rounded-md'"
    );
    expect(globalSearchDialogSource).toContain('GLOBAL_SEARCH_MODE_TAB_CLASS_NAME');
    expect(globalSearchDialogSource).toContain(
      "'control-menu-item flex items-center gap-1 rounded-md px-2 py-1 text-xs'"
    );
  });

  it('uses shared active control treatment instead of local accent hover overrides', () => {
    expect(globalSearchDialogSource).toContain("'control-icon-button-active'");
    expect(globalSearchDialogSource).not.toContain('hover:bg-accent/50');
  });

  it('keeps search results on the shared flat list-item hover language', () => {
    expect(searchResultListSource).toContain('SEARCH_RESULT_OPTION_CLASS_NAME');
    expect(searchResultListSource).toContain(
      "'control-menu-item flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-sm'"
    );
    expect(searchResultListSource).not.toContain('hover:bg-accent/50');
  });
});
