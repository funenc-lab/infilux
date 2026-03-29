import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const useFileTreeSource = readFileSync(resolve(currentDir, '../useFileTree.ts'), 'utf8');

describe('fileTree watch timer typing', () => {
  it('uses a cross-environment timeout handle type for the watch batch timer', () => {
    expect(useFileTreeSource).toContain(
      'let flushTimer: ReturnType<typeof setTimeout> | null = null;'
    );
    expect(useFileTreeSource).toContain('flushTimer = setTimeout(() => {');
    expect(useFileTreeSource).toContain('clearTimeout(flushTimer);');
    expect(useFileTreeSource).not.toContain('window.setTimeout(() => {');
    expect(useFileTreeSource).not.toContain('window.clearTimeout(flushTimer);');
  });
});
