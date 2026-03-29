import { create } from 'zustand';

export interface EditorTab {
  path: string;
  title: string;
  content: string;
  isDirty: boolean;
  isStale?: boolean;
  encoding?: string;
  viewState?: unknown;
  isUnsupported?: boolean;
  // External change conflict: set when file is modified externally while user has unsaved edits
  hasExternalChange?: boolean;
  externalContent?: string;
}

export interface PendingCursor {
  path: string;
  line: number;
  column?: number;
  matchLength?: number;
  previewMode?: 'off' | 'split' | 'fullscreen';
}

interface WorktreeEditorState {
  tabs: EditorTab[];
  activeTabPath: string | null;
}

const MAX_INACTIVE_WORKTREE_STATES = 3;

function touchWorktreeOrder(worktreeOrder: string[], worktreePath: string): string[] {
  return [worktreePath, ...worktreeOrder.filter((path) => path !== worktreePath)];
}

function pruneInactiveWorktreeStates(
  worktreeStates: Record<string, WorktreeEditorState>,
  worktreeOrder: string[],
  maxStates: number = MAX_INACTIVE_WORKTREE_STATES
): {
  worktreeStates: Record<string, WorktreeEditorState>;
  worktreeOrder: string[];
} {
  const nextWorktreeStates = { ...worktreeStates };
  const nextWorktreeOrder = [...worktreeOrder];

  while (nextWorktreeOrder.length > maxStates) {
    const evictedWorktreePath = nextWorktreeOrder.pop();
    if (!evictedWorktreePath) {
      break;
    }
    delete nextWorktreeStates[evictedWorktreePath];
  }

  return {
    worktreeStates: nextWorktreeStates,
    worktreeOrder: nextWorktreeOrder,
  };
}

interface EditorState {
  // Current active state
  tabs: EditorTab[];
  activeTabPath: string | null;
  pendingCursor: PendingCursor | null;
  currentCursorLine: number | null; // Current cursor line in active editor

  // Per-worktree state storage
  worktreeStates: Record<string, WorktreeEditorState>;
  worktreeOrder: string[];
  currentWorktreePath: string | null;

  openFile: (file: Omit<EditorTab, 'title' | 'viewState'> & { title?: string }) => void;
  closeFile: (path: string) => void;
  closeOtherFiles: (keepPath: string) => void;
  closeFilesToLeft: (path: string) => void;
  closeFilesToRight: (path: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string, isDirty?: boolean) => void;
  markFileSaved: (path: string) => void;
  markExternalChange: (path: string, externalContent: string) => void;
  applyExternalChange: (path: string) => void;
  dismissExternalChange: (path: string) => void;
  markTabsStale: (paths: string[]) => void;
  setTabViewState: (path: string, viewState: unknown) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setPendingCursor: (cursor: PendingCursor | null) => void;
  setCurrentCursorLine: (line: number | null) => void;
  switchWorktree: (worktreePath: string | null) => void;
  clearAllWorktreeStates: () => void;
  clearWorktreeState: (worktreePath: string) => void;
}

const getTabTitle = (path: string) => path.split(/[/\\]/).pop() || path;

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  pendingCursor: null,
  currentCursorLine: null,
  worktreeStates: {},
  worktreeOrder: [],
  currentWorktreePath: null,

  openFile: (file) =>
    set((state) => {
      const exists = state.tabs.some((tab) => tab.path === file.path);
      if (exists) {
        return {
          tabs: state.tabs.map((tab) =>
            tab.path === file.path
              ? {
                  ...tab,
                  ...file,
                  title: file.title ?? tab.title,
                  isStale: false,
                  // Clear external change state on explicit file open (fresh load)
                  hasExternalChange: false,
                  externalContent: undefined,
                }
              : tab
          ),
          activeTabPath: file.path,
        };
      }
      return {
        tabs: [
          ...state.tabs,
          {
            ...file,
            title: file.title ?? getTabTitle(file.path),
          },
        ],
        activeTabPath: file.path,
      };
    }),

  closeFile: (path) =>
    set((state) => {
      const newTabs = state.tabs.filter((tab) => tab.path !== path);
      const newActive =
        state.activeTabPath === path
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].path
            : null
          : state.activeTabPath;
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeOtherFiles: (keepPath) =>
    set((state) => {
      const keepTab = state.tabs.find((tab) => tab.path === keepPath);
      if (!keepTab) return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      return { tabs: [keepTab], activeTabPath: keepPath };
    }),

  closeFilesToLeft: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.path === path);
      if (index <= 0) return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      const newTabs = state.tabs.slice(index);
      const activeStillOpen = state.activeTabPath
        ? newTabs.some((t) => t.path === state.activeTabPath)
        : false;
      const newActive = activeStillOpen ? state.activeTabPath : (newTabs[0]?.path ?? null);
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeFilesToRight: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.path === path);
      if (index < 0 || index >= state.tabs.length - 1) {
        return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      }
      const newTabs = state.tabs.slice(0, index + 1);
      const activeStillOpen = state.activeTabPath
        ? newTabs.some((t) => t.path === state.activeTabPath)
        : false;
      const newActive = activeStillOpen
        ? state.activeTabPath
        : (newTabs[newTabs.length - 1]?.path ?? null);
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeAllFiles: () =>
    set({ tabs: [], activeTabPath: null, pendingCursor: null, currentCursorLine: null }),

  setActiveFile: (path) => set({ activeTabPath: path }),

  updateFileContent: (path, content, isDirty = true) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path ? { ...tab, content, isDirty, isStale: false } : tab
      ),
    })),

  markFileSaved: (path) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              isDirty: false,
              isStale: false,
              hasExternalChange: false,
              externalContent: undefined,
            }
          : tab
      ),
    })),

  markExternalChange: (path, externalContent) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path ? { ...tab, hasExternalChange: true, externalContent } : tab
      ),
    })),

  applyExternalChange: (path) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              content: tab.externalContent ?? tab.content,
              isStale: false,
              isDirty: false,
              hasExternalChange: false,
              externalContent: undefined,
            }
          : tab
      ),
    })),

  dismissExternalChange: (path) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path ? { ...tab, hasExternalChange: false, externalContent: undefined } : tab
      ),
    })),

  markTabsStale: (paths) =>
    set((state) => {
      if (paths.length === 0) {
        return { tabs: state.tabs };
      }
      const staleSet = new Set(paths);
      return {
        tabs: state.tabs.map((tab) => (staleSet.has(tab.path) ? { ...tab, isStale: true } : tab)),
      };
    }),

  setTabViewState: (path, viewState) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, viewState } : tab)),
    })),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return { tabs: state.tabs };
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      if (!moved) return { tabs: state.tabs };
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),

  setPendingCursor: (cursor) => set({ pendingCursor: cursor }),

  setCurrentCursorLine: (line) => set({ currentCursorLine: line }),

  switchWorktree: (worktreePath) => {
    const state = get();
    const currentPath = state.currentWorktreePath;

    // Persist the current active worktree into the inactive snapshot map.
    let nextWorktreeStates = state.worktreeStates;
    let nextWorktreeOrder = state.worktreeOrder;
    if (currentPath) {
      nextWorktreeStates = {
        ...nextWorktreeStates,
        [currentPath]: {
          tabs: state.tabs,
          activeTabPath: state.activeTabPath,
        },
      };
      nextWorktreeOrder = touchWorktreeOrder(nextWorktreeOrder, currentPath);
    }

    // The active worktree should live only in the current `tabs` slice, not be
    // duplicated in the inactive snapshot map.
    let savedState: WorktreeEditorState | null = null;
    if (worktreePath) {
      savedState = nextWorktreeStates[worktreePath] ?? null;
      if (savedState) {
        const { [worktreePath]: _, ...restStates } = nextWorktreeStates;
        nextWorktreeStates = restStates;
        nextWorktreeOrder = nextWorktreeOrder.filter((path) => path !== worktreePath);
      }
    }

    const prunedState = pruneInactiveWorktreeStates(nextWorktreeStates, nextWorktreeOrder);

    set({
      worktreeStates: prunedState.worktreeStates,
      worktreeOrder: prunedState.worktreeOrder,
      currentWorktreePath: worktreePath,
      tabs: savedState?.tabs ?? [],
      activeTabPath: savedState?.activeTabPath ?? null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  },

  clearAllWorktreeStates: () => {
    set({
      worktreeStates: {},
      worktreeOrder: [],
      currentWorktreePath: null,
      tabs: [],
      activeTabPath: null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  },

  clearWorktreeState: (worktreePath) => {
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.worktreeStates;
      return {
        worktreeStates: rest,
        worktreeOrder: state.worktreeOrder.filter((path) => path !== worktreePath),
      };
    });
  },
}));
