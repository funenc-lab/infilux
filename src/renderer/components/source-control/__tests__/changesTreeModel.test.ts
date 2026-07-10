import type { FileChange } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildChangesTree, collectChangesTreeFolderPaths } from '../changesTreeModel';

function createChange(path: string): FileChange {
  return {
    path,
    status: 'M',
    staged: false,
  };
}

describe('changesTreeModel', () => {
  it('compacts linear folders while retaining descendant file paths for folder actions', () => {
    const tree = buildChangesTree([
      createChange('src/components/Button.tsx'),
      createChange('src/components/Input.tsx'),
      createChange('docs/README.md'),
    ]);

    expect(tree.map((node) => node.name)).toEqual(['src/components', 'docs']);
    expect(tree[0].path).toBe('src/components');
    expect(tree[0].filePaths).toEqual(['src/components/Button.tsx', 'src/components/Input.tsx']);
    expect(tree[1].filePaths).toEqual(['docs/README.md']);
  });

  it('retains every changed file when many paths share the same directory prefix', () => {
    const changes = Array.from({ length: 1_000 }, (_, index) =>
      createChange(`src/components/Component${index}.tsx`)
    );
    const tree = buildChangesTree(changes);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('src/components');
    expect(tree[0].children).toHaveLength(1_000);
    expect(tree[0].filePaths).toEqual(changes.map((change) => change.path));
  });

  it('collects compacted folder paths for bulk expansion', () => {
    const tree = buildChangesTree([
      createChange('src/components/Button.tsx'),
      createChange('src/utils/path.ts'),
    ]);

    expect(collectChangesTreeFolderPaths(tree)).toEqual(
      new Set(['src', 'src/components', 'src/utils'])
    );
  });
});
