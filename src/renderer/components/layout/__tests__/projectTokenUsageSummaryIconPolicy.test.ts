import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const summarySource = readFileSync(resolve(currentDir, '../ProjectTokenUsageSummary.tsx'), 'utf8');

describe('project token usage summary icon policy', () => {
  it('uses a repository glyph for project rows instead of a hash glyph', () => {
    expect(summarySource).toContain('FolderGit2');
    expect(summarySource).not.toContain('<Hash');
  });
});
