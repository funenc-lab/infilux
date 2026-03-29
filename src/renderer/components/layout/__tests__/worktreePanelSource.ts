import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const worktreePanelPath = resolve(currentDir, '../WorktreePanel.tsx');
const worktreeItemPath = resolve(currentDir, '../worktree-panel/WorktreeItem.tsx');

export const worktreePanelSource = `${readFileSync(worktreePanelPath, 'utf8')}\n${readFileSync(worktreeItemPath, 'utf8')}`;
