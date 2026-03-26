import type { TempWorkspaceItem } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  normalizeStoredTempWorkspaceItems,
  normalizeStoredTempWorkspacePath,
} from '../tempWorkspacePersistence';

describe('tempWorkspacePersistence', () => {
  it('recovers nested absolute paths stored with a duplicated prefix', () => {
    expect(
      normalizeStoredTempWorkspacePath(
        '/Users/tanzv/Development/Git/penpad//Users/tanzv/Development/Project/cvat'
      )
    ).toBe('/Users/tanzv/Development/Project/cvat');
  });

  it('deduplicates stored items after path normalization', () => {
    const items: TempWorkspaceItem[] = [
      {
        id: '1',
        path: '/Users/tanzv/Development/Git/penpad//Users/tanzv/Development/Project/cvat',
        folderName: 'broken',
        title: 'broken',
        createdAt: 1,
      },
      {
        id: '2',
        path: '/Users/tanzv/Development/Project/cvat',
        folderName: 'fixed',
        title: 'fixed',
        createdAt: 2,
      },
    ];

    expect(normalizeStoredTempWorkspaceItems(items)).toEqual([
      {
        id: '1',
        path: '/Users/tanzv/Development/Project/cvat',
        folderName: 'broken',
        title: 'broken',
        createdAt: 1,
      },
    ]);
  });

  it('recovers nested Windows absolute paths stored with a duplicated prefix', () => {
    expect(
      normalizeStoredTempWorkspacePath(
        'C:/Users/tanzv/Development/Git/penpad/C:/Users/tanzv/Development/Project/cvat'
      )
    ).toBe('C:/Users/tanzv/Development/Project/cvat');
  });
});
