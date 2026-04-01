import { describe, expect, it } from 'vitest';
import { buildSessionHandoffPrompt, summarizeGitStatusForHandoff } from '../sessionHandoffPrompt';

describe('sessionHandoffPrompt', () => {
  it('builds a concise handoff prompt with session and workspace context', () => {
    const prompt = buildSessionHandoffPrompt({
      sessionName: 'Claude',
      worktreePath: '/repo/worktrees/feature-a',
      projectPath: '/repo',
      contextUsagePercent: 92,
      diffStats: {
        insertions: 24,
        deletions: 7,
      },
      openFiles: ['/repo/worktrees/feature-a/src/App.tsx', '/repo/worktrees/feature-a/README.md'],
    });

    expect(prompt).toContain('Previous session handoff');
    expect(prompt).toContain('Previous session: Claude');
    expect(prompt).toContain('Worktree: /repo/worktrees/feature-a');
    expect(prompt).toContain('Project: /repo');
    expect(prompt).toContain('Previous context usage: 92%');
    expect(prompt).toContain('Working tree diff stats: +24 / -7');
    expect(prompt).toContain(
      'Open files: /repo/worktrees/feature-a/src/App.tsx, /repo/worktrees/feature-a/README.md'
    );
    expect(prompt).toContain('Do not resume the previous session by ID');
  });

  it('omits optional lines when project path and context usage are unavailable', () => {
    const prompt = buildSessionHandoffPrompt({
      sessionName: 'Codex',
      worktreePath: '/repo/worktrees/feature-b',
    });

    expect(prompt).toContain('Previous session: Codex');
    expect(prompt).toContain('Worktree: /repo/worktrees/feature-b');
    expect(prompt).not.toContain('Project:');
    expect(prompt).not.toContain('Previous context usage:');
  });

  it('summarizes current git changes for handoff', () => {
    const summary = summarizeGitStatusForHandoff({
      isClean: false,
      current: 'feature-a',
      tracking: 'origin/feature-a',
      ahead: 0,
      behind: 0,
      staged: ['src/main.ts'],
      modified: ['src/App.tsx', 'src/store.ts'],
      deleted: ['old.txt'],
      untracked: ['draft.md'],
      conflicted: [],
    });

    expect(summary).toEqual([
      'Current uncommitted changes:',
      '- Staged: src/main.ts',
      '- Modified: src/App.tsx, src/store.ts',
      '- Deleted: old.txt',
      '- Untracked: draft.md',
    ]);
  });

  it('notes truncation when git status is intentionally capped', () => {
    const summary = summarizeGitStatusForHandoff({
      isClean: false,
      current: 'feature-a',
      tracking: 'origin/feature-a',
      ahead: 0,
      behind: 0,
      staged: ['a.ts', 'b.ts'],
      modified: [],
      deleted: [],
      untracked: [],
      conflicted: [],
      truncated: true,
      truncatedLimit: 2,
    });

    expect(summary).toContain('- Change list truncated to the first 2 paths.');
  });

  it('summarizes open files with truncation guardrails', () => {
    const prompt = buildSessionHandoffPrompt({
      sessionName: 'Claude',
      worktreePath: '/repo/worktrees/feature-a',
      openFiles: [
        '/repo/worktrees/feature-a/src/a.ts',
        '/repo/worktrees/feature-a/src/b.ts',
        '/repo/worktrees/feature-a/src/c.ts',
        '/repo/worktrees/feature-a/src/d.ts',
        '/repo/worktrees/feature-a/src/e.ts',
      ],
    });

    expect(prompt).toContain(
      'Open files: /repo/worktrees/feature-a/src/a.ts, /repo/worktrees/feature-a/src/b.ts, /repo/worktrees/feature-a/src/c.ts, /repo/worktrees/feature-a/src/d.ts'
    );
    expect(prompt).toContain('Additional open files omitted: 1');
  });
});
