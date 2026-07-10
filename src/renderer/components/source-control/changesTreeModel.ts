import type { FileChange } from '@shared/types';

export interface ChangeTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: FileChange;
  children?: ChangeTreeNode[];
  filePaths: string[];
}

interface MutableChangeTreeNode extends ChangeTreeNode {
  childIndex?: Map<string, MutableChangeTreeNode>;
  children?: MutableChangeTreeNode[];
}

function compactChangeTree(nodes: MutableChangeTreeNode[]): ChangeTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'file') {
      return {
        name: node.name,
        path: node.path,
        type: node.type,
        file: node.file,
        filePaths: node.filePaths,
      };
    }

    const children = compactChangeTree(node.children ?? []);
    const filePaths = children.flatMap((child) => child.filePaths);
    if (children.length === 1 && children[0].type === 'folder') {
      const child = children[0];
      return {
        ...child,
        name: `${node.name}/${child.name}`,
      };
    }

    return {
      name: node.name,
      path: node.path,
      type: node.type,
      children,
      filePaths,
    };
  });
}

export function buildChangesTree(files: readonly FileChange[]): ChangeTreeNode[] {
  const root: MutableChangeTreeNode[] = [];
  const rootIndex = new Map<string, MutableChangeTreeNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let currentNodes = root;
    let currentIndex = rootIndex;
    let currentPath = '';

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const isFile = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      let node = currentIndex.get(name);
      if (!node) {
        node = {
          name,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          ...(isFile
            ? { file, filePaths: [file.path] }
            : {
                children: [],
                childIndex: new Map<string, MutableChangeTreeNode>(),
                filePaths: [],
              }),
        };
        currentNodes.push(node);
        currentIndex.set(name, node);
      }

      if (!isFile) {
        currentNodes = node.children ?? [];
        currentIndex = node.childIndex ?? new Map<string, MutableChangeTreeNode>();
      }
    }
  }

  return compactChangeTree(root);
}

export function collectChangesTreeFolderPaths(nodes: readonly ChangeTreeNode[]): Set<string> {
  const folders = new Set<string>();
  const collect = (currentNodes: readonly ChangeTreeNode[]) => {
    for (const node of currentNodes) {
      if (node.type !== 'folder') {
        continue;
      }
      folders.add(node.path);
      if (node.children) {
        collect(node.children);
      }
    }
  };

  collect(nodes);
  return folders;
}
