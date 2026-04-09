import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const treeSidebarWorktreeItemSource = readFileSync(
  resolve(currentDir, '../tree-sidebar/WorktreeTreeItem.tsx'),
  'utf8'
);
const worktreePanelItemSource = readFileSync(
  resolve(currentDir, '../worktree-panel/WorktreeItem.tsx'),
  'utf8'
);

describe('worktree row performance policy', () => {
  it('keeps tree sidebar worktree rows on path-scoped subscriptions only', () => {
    expect(treeSidebarWorktreeItemSource).not.toContain('useWorktreeOutputState(worktree.path);');
    expect(treeSidebarWorktreeItemSource).toContain(
      'const activity = useWorktreeActivityStore((s) => s.activities[worktree.path] ?? DEFAULT_ACTIVITY);'
    );
    expect(treeSidebarWorktreeItemSource).toContain('const diffStats = useWorktreeActivityStore(');
    expect(treeSidebarWorktreeItemSource).toContain(
      '(s) => s.diffStats[worktree.path] ?? DEFAULT_DIFF_STATS'
    );
    expect(treeSidebarWorktreeItemSource).toContain(
      "const activityState = useWorktreeActivityStore((s) => s.activityStates[worktree.path] ?? 'idle');"
    );
    expect(treeSidebarWorktreeItemSource).not.toContain(
      'const activities = useWorktreeActivityStore((s) => s.activities);'
    );
    expect(treeSidebarWorktreeItemSource).not.toContain(
      'const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);'
    );
    expect(treeSidebarWorktreeItemSource).not.toContain(
      'const activityStates = useWorktreeActivityStore((s) => s.activityStates);'
    );
    expect(treeSidebarWorktreeItemSource).toContain(
      '<WorktreeActivityMarker state={activityState} />'
    );
    expect(treeSidebarWorktreeItemSource).not.toContain("? 'Running'");
    expect(treeSidebarWorktreeItemSource).not.toContain("? 'Waiting'");
    expect(treeSidebarWorktreeItemSource).not.toContain("? 'Done'");
  });

  it('keeps worktree panel rows on the same path-scoped activity selectors', () => {
    expect(worktreePanelItemSource).toContain(
      'const activity = useWorktreeActivityStore((s) => s.activities[worktree.path] ?? DEFAULT_ACTIVITY);'
    );
    expect(worktreePanelItemSource).toContain('const diffStats = useWorktreeActivityStore(');
    expect(worktreePanelItemSource).toContain(
      '(s) => s.diffStats[worktree.path] ?? DEFAULT_DIFF_STATS'
    );
    expect(worktreePanelItemSource).toContain(
      "const activityState = useWorktreeActivityStore((s) => s.activityStates[worktree.path] ?? 'idle');"
    );
    expect(worktreePanelItemSource).not.toContain(
      'const activities = useWorktreeActivityStore((s) => s.activities);'
    );
    expect(worktreePanelItemSource).not.toContain(
      'const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);'
    );
    expect(worktreePanelItemSource).not.toContain(
      'const activityStates = useWorktreeActivityStore((s) => s.activityStates);'
    );
    expect(worktreePanelItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreePanelItemSource).not.toContain('{activityMeta.label}');
  });
});
