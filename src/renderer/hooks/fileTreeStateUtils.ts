import type { FileEntry } from '@shared/types';

export interface FileTreeStateNode extends FileEntry {
  children?: FileTreeStateNode[];
  isLoading?: boolean;
}

function areEntriesEqual(previousNode: FileTreeStateNode, nextEntry: FileEntry): boolean {
  return (
    previousNode.name === nextEntry.name &&
    previousNode.path === nextEntry.path &&
    previousNode.isDirectory === nextEntry.isDirectory &&
    previousNode.size === nextEntry.size &&
    previousNode.modifiedAt === nextEntry.modifiedAt &&
    previousNode.ignored === nextEntry.ignored
  );
}

export function cloneEntriesToNodes(entries: FileEntry[]): FileTreeStateNode[] {
  return entries.map((entry) => ({ ...entry }));
}

export function mergeNodesPreservingState(
  nextEntries: FileEntry[],
  previousNodes: FileTreeStateNode[]
): FileTreeStateNode[] {
  const previousByPath = new Map(previousNodes.map((node) => [node.path, node]));

  return nextEntries.map((entry) => {
    const previousNode = previousByPath.get(entry.path);
    if (!previousNode) {
      return { ...entry };
    }

    if (areEntriesEqual(previousNode, entry)) {
      return previousNode;
    }

    return {
      ...entry,
      ...(previousNode.children ? { children: previousNode.children } : {}),
      ...(previousNode.isLoading ? { isLoading: previousNode.isLoading } : {}),
    };
  });
}

export function findNodeByPath(
  nodes: FileTreeStateNode[],
  targetPath: string
): FileTreeStateNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children) {
      const foundNode = findNodeByPath(node.children, targetPath);
      if (foundNode) {
        return foundNode;
      }
    }
  }

  return null;
}

export function replaceNodeChildren(
  nodes: FileTreeStateNode[],
  targetPath: string,
  nextChildren: FileTreeStateNode[]
): FileTreeStateNode[] {
  let hasChanges = false;

  const nextNodes = nodes.map((node) => {
    if (node.path === targetPath) {
      if (node.children === nextChildren && !node.isLoading) {
        return node;
      }

      hasChanges = true;
      return {
        ...node,
        children: nextChildren,
        isLoading: false,
      };
    }

    if (!node.children) {
      return node;
    }

    const updatedChildren = replaceNodeChildren(node.children, targetPath, nextChildren);
    if (updatedChildren === node.children) {
      return node;
    }

    hasChanges = true;
    return {
      ...node,
      children: updatedChildren,
    };
  });

  return hasChanges ? nextNodes : nodes;
}

export function setNodeLoadingState(
  nodes: FileTreeStateNode[],
  targetPath: string,
  isLoading: boolean
): FileTreeStateNode[] {
  let hasChanges = false;

  const nextNodes = nodes.map((node) => {
    if (node.path === targetPath) {
      if (Boolean(node.isLoading) === isLoading) {
        return node;
      }

      hasChanges = true;
      if (!isLoading && !node.children) {
        const { isLoading: _isLoading, ...restNode } = node;
        return restNode;
      }

      return {
        ...node,
        ...(isLoading ? { isLoading: true } : { isLoading: false }),
      };
    }

    if (!node.children) {
      return node;
    }

    const updatedChildren = setNodeLoadingState(node.children, targetPath, isLoading);
    if (updatedChildren === node.children) {
      return node;
    }

    hasChanges = true;
    return {
      ...node,
      children: updatedChildren,
    };
  });

  return hasChanges ? nextNodes : nodes;
}
