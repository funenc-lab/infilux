import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repositoryManagerDialogSource = readFileSync(
  resolve(currentDir, '../RepositoryManagerDialog.tsx'),
  'utf8'
);

describe('RepositoryManagerDialog control style policy', () => {
  it('uses shared row and icon-button classes for repository rows', () => {
    expect(repositoryManagerDialogSource).toContain('REPOSITORY_MANAGER_ROW_CLASS_NAME');
    expect(repositoryManagerDialogSource).toContain(
      "'control-menu-item flex items-center gap-2 rounded-md px-2 py-1.5'"
    );
    expect(repositoryManagerDialogSource).toContain('REPOSITORY_MANAGER_ICON_BUTTON_CLASS_NAME');
    expect(repositoryManagerDialogSource).toContain(
      "'control-icon-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md'"
    );
  });

  it('removes local accent and destructive hover background overrides from repository actions', () => {
    expect(repositoryManagerDialogSource).not.toContain('hover:bg-accent/50');
    expect(repositoryManagerDialogSource).not.toContain('hover:bg-destructive/10');
  });
});
