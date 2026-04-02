import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const commitHistoryListSource = readFileSync(resolve(currentDir, '../CommitHistoryList.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('Source control menu style policy', () => {
  it('uses the shared flat control-menu shell for commit history context actions', () => {
    expect(commitHistoryListSource).toContain('COMMIT_HISTORY_CONTEXT_MENU_CLASS_NAME');
    expect(commitHistoryListSource).toContain(
      "'control-menu fixed z-50 min-w-40 rounded-2xl p-2'"
    );
    expect(globalsSource).toContain('.control-menu {');
    expect(globalsSource).toContain('box-shadow: none;');
  });

  it('reuses shared menu item and danger-item classes instead of local hover overrides', () => {
    expect(commitHistoryListSource).toContain('COMMIT_HISTORY_CONTEXT_MENU_ITEM_CLASS_NAME');
    expect(commitHistoryListSource).toContain(
      "'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'"
    );
    expect(commitHistoryListSource).toContain('COMMIT_HISTORY_CONTEXT_MENU_DANGER_ITEM_CLASS_NAME');
    expect(commitHistoryListSource).toContain("'control-menu-item-danger'");
    expect(commitHistoryListSource).not.toContain(
      'className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"'
    );
    expect(commitHistoryListSource).not.toContain(
      'className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"'
    );
  });

  it('reuses the shared control divider between destructive and non-destructive actions', () => {
    expect(commitHistoryListSource).toContain('COMMIT_HISTORY_CONTEXT_MENU_DIVIDER_CLASS_NAME');
    expect(commitHistoryListSource).toContain("'control-divider my-1 h-px'");
  });
});
