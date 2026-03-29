import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const editorReloadQueueSource = readFileSync(
  resolve(currentDir, '../editorReloadQueue.ts'),
  'utf8'
);

describe('editorReloadQueue type policy', () => {
  it('stores non-generic queue entries so mixed task result types remain type-safe', () => {
    expect(editorReloadQueueSource).toContain('interface QueueEntry {');
    expect(editorReloadQueueSource).toContain('run: () => void;');
    expect(editorReloadQueueSource).not.toContain('interface QueueEntry<T>');
    expect(editorReloadQueueSource).not.toContain('const queue: QueueEntry<unknown>[] = [];');
  });
});
