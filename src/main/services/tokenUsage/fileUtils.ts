import type { Dirent } from 'node:fs';
import { createReadStream } from 'node:fs';
import { access, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

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

export async function readFirstLine(filePath: string): Promise<string | null> {
  const fileHandle = await open(filePath, 'r');
  const chunks: string[] = [];
  const buffer = Buffer.alloc(8192);
  let position = 0;

  try {
    while (true) {
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) {
        break;
      }

      const chunk = buffer.subarray(0, bytesRead).toString('utf8');
      const lineBreakIndex = chunk.indexOf('\n');
      if (lineBreakIndex >= 0) {
        chunks.push(chunk.slice(0, lineBreakIndex));
        break;
      }

      chunks.push(chunk);
      position += bytesRead;
    }
  } finally {
    await fileHandle.close();
  }

  const firstLine = chunks.join('').replace(/\r$/, '');
  return firstLine.length > 0 ? firstLine : null;
}

export async function readLines(
  filePath: string,
  onLine: (line: string) => void | Promise<void>
): Promise<void> {
  const lineReader = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of lineReader) {
    await onLine(line);
  }
}
