import type { Dirent } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function collectJsonlFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  await visit(rootPath);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}
