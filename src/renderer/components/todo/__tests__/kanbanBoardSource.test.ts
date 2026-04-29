import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(__dirname, '../KanbanBoard.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('KanbanBoard source policy', () => {
  it('opens the task dialog for focused global todo requests in the current repository', () => {
    expect(source).toContain('focusTaskRequest?: TodoTaskFocusRequest | null;');
    expect(source).toContain('normalizePath(focusTaskRequest.repoPath)');
    expect(source).toContain('normalizePath(repoPath)');
    expect(source).toContain(
      'const task = tasks.find((candidate) => candidate.id === focusTaskRequest.taskId);'
    );
    expect(source).toContain('setEditingTask(task);');
    expect(source).toContain('setDialogOpen(true);');
  });
});
