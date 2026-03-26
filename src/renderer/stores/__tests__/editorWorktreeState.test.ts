import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../editor';

function resetEditorStore(): void {
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    pendingCursor: null,
    currentCursorLine: null,
    worktreeStates: {},
    currentWorktreePath: null,
  });
}

describe('useEditorStore worktree state', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('preserves tabs and active file for each worktree', () => {
    const store = useEditorStore.getState();

    store.switchWorktree('/repo-a');
    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });
    store.openFile({ path: '/repo-a/b.ts', content: 'b', isDirty: true });
    store.setActiveFile('/repo-a/a.ts');

    store.switchWorktree('/repo-b');
    expect(useEditorStore.getState().tabs).toEqual([]);
    expect(useEditorStore.getState().activeTabPath).toBeNull();

    useEditorStore.getState().openFile({ path: '/repo-b/c.ts', content: 'c', isDirty: false });

    useEditorStore.getState().switchWorktree('/repo-a');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual([
      '/repo-a/a.ts',
      '/repo-a/b.ts',
    ]);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/a.ts');

    useEditorStore.getState().switchWorktree('/repo-b');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-b/c.ts']);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-b/c.ts');
  });

  it('clears transient cursor state when switching worktrees', () => {
    const store = useEditorStore.getState();

    store.switchWorktree('/repo-a');
    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });
    store.setPendingCursor({ path: '/repo-a/a.ts', line: 12, column: 4, previewMode: 'split' });
    store.setCurrentCursorLine(12);

    store.switchWorktree('/repo-b');

    expect(useEditorStore.getState().pendingCursor).toBeNull();
    expect(useEditorStore.getState().currentCursorLine).toBeNull();

    useEditorStore.getState().switchWorktree('/repo-a');
    expect(useEditorStore.getState().pendingCursor).toBeNull();
    expect(useEditorStore.getState().currentCursorLine).toBeNull();
  });

  it('refreshes an existing tab, tracks external changes, and applies save lifecycle updates', () => {
    const store = useEditorStore.getState();

    store.openFile({ path: '/repo-a/a.ts', content: 'draft', isDirty: true });
    store.markExternalChange('/repo-a/a.ts', 'external');

    store.openFile({
      path: '/repo-a/a.ts',
      content: 'reloaded',
      isDirty: false,
      title: 'custom.ts',
    });

    let tab = useEditorStore.getState().tabs[0];
    expect(tab).toMatchObject({
      path: '/repo-a/a.ts',
      title: 'custom.ts',
      content: 'reloaded',
      isDirty: false,
      hasExternalChange: false,
      externalContent: undefined,
    });

    store.updateFileContent('/repo-a/a.ts', 'edited');
    store.markExternalChange('/repo-a/a.ts', 'from-disk');
    store.applyExternalChange('/repo-a/a.ts');

    tab = useEditorStore.getState().tabs[0];
    expect(tab).toMatchObject({
      content: 'from-disk',
      isDirty: false,
      hasExternalChange: false,
      externalContent: undefined,
    });

    store.markExternalChange('/repo-a/a.ts', 'ignored');
    store.dismissExternalChange('/repo-a/a.ts');
    store.updateFileContent('/repo-a/a.ts', 'edited-again', true);
    store.markFileSaved('/repo-a/a.ts');

    tab = useEditorStore.getState().tabs[0];
    expect(tab).toMatchObject({
      content: 'edited-again',
      isDirty: false,
      hasExternalChange: false,
      externalContent: undefined,
    });
  });

  it('supports tab closing helpers, reordering, and active tab fallback', () => {
    const store = useEditorStore.getState();

    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });
    store.openFile({ path: '/repo-a/b.ts', content: 'b', isDirty: false });
    store.openFile({ path: '/repo-a/c.ts', content: 'c', isDirty: false });
    store.setActiveFile('/repo-a/b.ts');

    store.closeFilesToLeft('/repo-a/b.ts');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual([
      '/repo-a/b.ts',
      '/repo-a/c.ts',
    ]);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/b.ts');

    store.reorderTabs(1, 0);
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual([
      '/repo-a/c.ts',
      '/repo-a/b.ts',
    ]);

    store.closeFilesToRight('/repo-a/c.ts');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-a/c.ts']);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/c.ts');

    store.openFile({ path: '/repo-a/d.ts', content: 'd', isDirty: false });
    store.openFile({ path: '/repo-a/e.ts', content: 'e', isDirty: false });
    store.closeOtherFiles('/repo-a/d.ts');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-a/d.ts']);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/d.ts');

    store.closeFile('/repo-a/d.ts');
    expect(useEditorStore.getState().tabs).toEqual([]);
    expect(useEditorStore.getState().activeTabPath).toBeNull();

    store.openFile({ path: '/repo-a/f.ts', content: 'f', isDirty: false });
    store.setPendingCursor({ path: '/repo-a/f.ts', line: 3 });
    store.setCurrentCursorLine(3);
    store.closeAllFiles();

    expect(useEditorStore.getState()).toMatchObject({
      tabs: [],
      activeTabPath: null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  });

  it('handles no-op tab helper branches and clears stale metadata when content changes', () => {
    const store = useEditorStore.getState();

    store.openFile({ path: 'README', content: 'hello', isDirty: false });
    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false, title: 'custom-a.ts' });
    store.openFile({ path: '/repo-a/b.ts', content: 'b', isDirty: false });
    store.setActiveFile('/repo-a/a.ts');

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      path: 'README',
      title: 'README',
    });

    store.openFile({ path: '/repo-a/a.ts', content: 'updated', isDirty: false });
    expect(useEditorStore.getState().tabs.find((tab) => tab.path === '/repo-a/a.ts')).toMatchObject(
      {
        title: 'custom-a.ts',
        content: 'updated',
      }
    );

    store.markTabsStale([]);
    store.markTabsStale(['/repo-a/a.ts']);
    store.setTabViewState('/repo-a/a.ts', { scrollTop: 120 });
    store.updateFileContent('/repo-a/a.ts', 'edited');

    expect(useEditorStore.getState().tabs.find((tab) => tab.path === '/repo-a/a.ts')).toMatchObject(
      {
        content: 'edited',
        isDirty: true,
        isStale: false,
        viewState: { scrollTop: 120 },
      }
    );

    store.closeOtherFiles('/missing.ts');
    store.closeFilesToLeft('README');
    store.closeFilesToRight('/missing.ts');
    store.reorderTabs(1, 1);
    store.reorderTabs(99, 0);

    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual([
      'README',
      '/repo-a/a.ts',
      '/repo-a/b.ts',
    ]);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/a.ts');
  });

  it('stores and restores worktree state across null switches and preserves active tabs on unrelated closes', () => {
    const store = useEditorStore.getState();

    store.switchWorktree('/repo-a');
    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });
    store.openFile({ path: '/repo-a/b.ts', content: 'b', isDirty: false });
    store.setActiveFile('/repo-a/a.ts');

    store.closeFile('/repo-a/b.ts');
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/a.ts');

    store.switchWorktree(null);
    expect(useEditorStore.getState()).toMatchObject({
      currentWorktreePath: null,
      tabs: [],
      activeTabPath: null,
    });

    store.switchWorktree('/repo-a');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-a/a.ts']);
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/a.ts');
  });

  it('recomputes active tab fallbacks and ignores unmatched save/apply operations', () => {
    const store = useEditorStore.getState();

    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });
    store.openFile({ path: '/repo-a/b.ts', content: 'b', isDirty: true });
    store.openFile({ path: '/repo-a/c.ts', content: 'c', isDirty: false });
    store.setActiveFile('/repo-a/b.ts');

    store.closeFile('/repo-a/b.ts');
    expect(useEditorStore.getState().activeTabPath).toBe('/repo-a/c.ts');

    store.setActiveFile(null);
    store.closeFilesToLeft('/repo-a/c.ts');
    expect(useEditorStore.getState()).toMatchObject({
      tabs: [expect.objectContaining({ path: '/repo-a/c.ts' })],
      activeTabPath: '/repo-a/c.ts',
    });

    store.openFile({ path: '/repo-a/d.ts', content: 'd', isDirty: false });
    store.setActiveFile(null);
    store.closeFilesToRight('/repo-a/c.ts');
    expect(useEditorStore.getState()).toMatchObject({
      tabs: [expect.objectContaining({ path: '/repo-a/c.ts' })],
      activeTabPath: '/repo-a/c.ts',
    });

    store.openFile({ path: '/repo-a/e.ts', content: 'e', isDirty: false });
    store.openFile({ path: '/repo-a/f.ts', content: 'f', isDirty: false });
    store.setActiveFile('/repo-a/c.ts');
    store.closeFilesToRight('/repo-a/c.ts');

    expect(useEditorStore.getState()).toMatchObject({
      tabs: [expect.objectContaining({ path: '/repo-a/c.ts' })],
      activeTabPath: '/repo-a/c.ts',
    });

    const snapshotBeforeNoop = useEditorStore.getState().tabs.map((tab) => ({ ...tab }));
    store.markFileSaved('/repo-a/missing.ts');
    store.applyExternalChange('/repo-a/missing.ts');

    expect(useEditorStore.getState().tabs).toEqual(snapshotBeforeNoop);
  });

  it('clears stored worktree snapshots independently or all at once', () => {
    const store = useEditorStore.getState();

    store.switchWorktree('/repo-a');
    store.openFile({ path: '/repo-a/a.ts', content: 'a', isDirty: false });

    store.switchWorktree('/repo-b');
    store.openFile({ path: '/repo-b/b.ts', content: 'b', isDirty: false });

    store.switchWorktree('/repo-c');
    store.openFile({ path: '/repo-c/c.ts', content: 'c', isDirty: false });

    store.switchWorktree('/repo-b');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-b/b.ts']);

    store.clearWorktreeState('/repo-a');
    store.switchWorktree('/repo-a');
    expect(useEditorStore.getState().tabs).toEqual([]);

    store.switchWorktree('/repo-c');
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(['/repo-c/c.ts']);

    store.clearAllWorktreeStates();
    expect(useEditorStore.getState()).toMatchObject({
      worktreeStates: {},
      currentWorktreePath: null,
      tabs: [],
      activeTabPath: null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  });
});
