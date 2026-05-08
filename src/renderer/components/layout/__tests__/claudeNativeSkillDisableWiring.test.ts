import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const worktreePanelSource = readFileSync(resolve(currentDir, '../WorktreePanel.tsx'), 'utf8');

describe('Claude native skill disable wiring', () => {
  it('marks matching worktree sessions stale after changing a native skill file', () => {
    expect(treeSidebarSource).toContain('onNativeSkillFileChanged={() => {');
    expect(treeSidebarSource).toContain('markClaudePolicyStaleForWorktree(');
    expect(worktreePanelSource).toContain('onNativeSkillFileChanged={() => {');
    expect(worktreePanelSource).toContain('markClaudePolicyStaleForWorktree(');
  });
});
