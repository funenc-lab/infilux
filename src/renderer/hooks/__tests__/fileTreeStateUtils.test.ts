import { describe, expect, it } from 'vitest';
import {
  type FileTreeStateNode,
  findNodeByPath,
  mergeNodesPreservingState,
  replaceNodeChildren,
  setNodeLoadingState,
} from '../fileTreeStateUtils';

function createTree(): FileTreeStateNode[] {
  return [
    {
      name: 'src',
      path: '/repo/src',
      isDirectory: true,
      size: 0,
      modifiedAt: 1,
      children: [
        {
          name: 'components',
          path: '/repo/src/components',
          isDirectory: true,
          size: 0,
          modifiedAt: 1,
          children: [
            {
              name: 'FileTree.tsx',
              path: '/repo/src/components/FileTree.tsx',
              isDirectory: false,
              size: 128,
              modifiedAt: 1,
            },
          ],
        },
      ],
    },
    {
      name: 'docs',
      path: '/repo/docs',
      isDirectory: true,
      size: 0,
      modifiedAt: 1,
    },
  ];
}

describe('fileTreeStateUtils', () => {
  it('preserves previous node references when root entries do not change', () => {
    const previousTree = createTree();
    const nextEntries = [
      {
        name: 'src',
        path: '/repo/src',
        isDirectory: true,
        size: 0,
        modifiedAt: 1,
      },
      {
        name: 'docs',
        path: '/repo/docs',
        isDirectory: true,
        size: 0,
        modifiedAt: 1,
      },
    ];

    const nextTree = mergeNodesPreservingState(nextEntries, previousTree);

    expect(nextTree[0]).toBe(previousTree[0]);
    expect(nextTree[1]).toBe(previousTree[1]);
  });

  it('replaces children with structural sharing limited to the target branch', () => {
    const previousTree = createTree();
    const nextChildren: FileTreeStateNode[] = [
      {
        name: 'FileTree.tsx',
        path: '/repo/src/components/FileTree.tsx',
        isDirectory: false,
        size: 256,
        modifiedAt: 2,
      },
    ];

    const nextTree = replaceNodeChildren(previousTree, '/repo/src/components', nextChildren);

    expect(nextTree[0]).not.toBe(previousTree[0]);
    expect(nextTree[1]).toBe(previousTree[1]);

    const updatedNode = findNodeByPath(nextTree, '/repo/src/components');
    expect(updatedNode?.children).toBe(nextChildren);
  });

  it('updates loading state without touching sibling branches', () => {
    const previousTree = createTree();

    const nextTree = setNodeLoadingState(previousTree, '/repo/src/components', true);

    expect(nextTree[0]).not.toBe(previousTree[0]);
    expect(nextTree[1]).toBe(previousTree[1]);

    const updatedNode = findNodeByPath(nextTree, '/repo/src/components');
    expect(updatedNode?.isLoading).toBe(true);
  });
});
