import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '../../constants';
import { applyTerminalNavigation } from '../useTerminalNavigation';

afterEach(() => {
  vi.resetModules();
  vi.unmock('react');
  vi.unmock('@/hooks/useEditor');
  vi.unmock('@/stores/navigation');
});

describe('applyTerminalNavigation', () => {
  it('forwards the navigation request, activates the file tab, updates worktree mapping, and clears the request', () => {
    const navigateToFile = vi.fn();
    const setActiveTab = vi.fn<(tab: TabId) => void>();
    const clearNavigation = vi.fn();
    const setWorktreeTabMap = vi.fn(
      (updater: (prev: Record<string, TabId>) => Record<string, TabId>) => {
        return updater({ '/repo-a': 'terminal' });
      }
    );

    const handled = applyTerminalNavigation({
      activeWorktreePath: '/repo-a',
      pendingNavigation: {
        path: '/repo-a/src/App.tsx',
        line: 15,
        column: 2,
        previewMode: 'split',
      },
      navigateToFile,
      setActiveTab,
      setWorktreeTabMap,
      clearNavigation,
    });

    expect(handled).toBe(true);
    expect(navigateToFile).toHaveBeenCalledWith('/repo-a/src/App.tsx', 15, 2, undefined, 'split');
    expect(setActiveTab).toHaveBeenCalledWith('file');
    expect(setWorktreeTabMap).toHaveBeenCalledTimes(1);
    expect(setWorktreeTabMap.mock.results[0]?.value).toEqual({ '/repo-a': 'file' });
    expect(clearNavigation).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no pending navigation request', () => {
    const handled = applyTerminalNavigation({
      activeWorktreePath: '/repo-a',
      pendingNavigation: null,
      navigateToFile: vi.fn(),
      setActiveTab: vi.fn(),
      setWorktreeTabMap: vi.fn(),
      clearNavigation: vi.fn(),
    });

    expect(handled).toBe(false);
  });

  it('forwards navigation without updating worktree mapping when no worktree is active', () => {
    const navigateToFile = vi.fn();
    const setActiveTab = vi.fn<(tab: TabId) => void>();
    const clearNavigation = vi.fn();
    const setWorktreeTabMap = vi.fn();

    const handled = applyTerminalNavigation({
      activeWorktreePath: null,
      pendingNavigation: {
        path: '/repo-a/src/App.tsx',
        line: 8,
      },
      navigateToFile,
      setActiveTab,
      setWorktreeTabMap,
      clearNavigation,
    });

    expect(handled).toBe(true);
    expect(navigateToFile).toHaveBeenCalledWith(
      '/repo-a/src/App.tsx',
      8,
      undefined,
      undefined,
      undefined
    );
    expect(setActiveTab).toHaveBeenCalledWith('file');
    expect(setWorktreeTabMap).not.toHaveBeenCalled();
    expect(clearNavigation).toHaveBeenCalledTimes(1);
  });
});

describe('useTerminalNavigation', () => {
  it('wires pending navigation through the editor and navigation stores inside the effect', async () => {
    const navigateToFile = vi.fn();
    const clearNavigation = vi.fn();
    const setActiveTab = vi.fn<(tab: TabId) => void>();
    const setWorktreeTabMap = vi.fn(
      (updater: (prev: Record<string, TabId>) => Record<string, TabId>) => updater({})
    );

    vi.doMock('react', () => ({
      useEffect: (effect: () => void) => {
        effect();
      },
    }));
    vi.doMock('@/hooks/useEditor', () => ({
      useEditor: () => ({
        navigateToFile,
      }),
    }));
    vi.doMock('@/stores/navigation', () => ({
      useNavigationStore: () => ({
        pendingNavigation: {
          path: '/repo-b/src/main.ts',
          line: 27,
          column: 4,
          previewMode: 'fullscreen',
        },
        clearNavigation,
      }),
    }));

    const { useTerminalNavigation: useTerminalNavigationHook } = await import(
      '../useTerminalNavigation'
    );

    useTerminalNavigationHook('/repo-b', setActiveTab, setWorktreeTabMap);

    expect(navigateToFile).toHaveBeenCalledWith(
      '/repo-b/src/main.ts',
      27,
      4,
      undefined,
      'fullscreen'
    );
    expect(setActiveTab).toHaveBeenCalledWith('file');
    expect(setWorktreeTabMap).toHaveBeenCalledTimes(1);
    expect(setWorktreeTabMap.mock.results[0]?.value).toEqual({ '/repo-b': 'file' });
    expect(clearNavigation).toHaveBeenCalledTimes(1);
  });
});
