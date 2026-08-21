import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { GitService } from '../GitService';

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

async function createRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'infilux-file-diff-'));
  tempDirectories.push(directory);
  await execFileAsync('git', ['init', '--quiet'], { cwd: directory });
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

describe('GitService.getFileDiff', () => {
  it('returns a bounded response instead of transferring an oversized text file', async () => {
    const repositoryPath = await createRepository();
    const filePath = 'large.txt';
    await writeFile(path.join(repositoryPath, filePath), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8');

    const result = await new GitService(repositoryPath).getFileDiff(filePath, false);

    expect(result).toEqual({
      path: filePath,
      original: '',
      modified: '',
      isTooLarge: true,
    });
  });
});
