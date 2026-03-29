import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(currentDir, relativePath), 'utf8');
}

export const repositorySidebarSource = [
  readSource('../RepositorySidebar.tsx'),
  readSource('../repository-sidebar/RepositoryTreeItem.tsx'),
].join('\n');
