/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConflictInfo, ConflictResolution } from '../FileConflictDialog';

type FileSidebarModule = typeof import('../FileSidebar');
type FileSidebarProps = React.ComponentProps<FileSidebarModule['FileSidebar']>;
type FileTreeModule = typeof import('../FileTree');
type FileTreeProps = React.ComponentProps<FileTreeModule['FileTree']>;
type NewItemDialogModule = typeof import('../NewItemDialog');
type NewItemDialogProps = React.ComponentProps<NewItemDialogModule['NewItemDialog']>;
type FileConflictDialogModule = typeof import('../FileConflictDialog');
type FileConflictDialogProps = React.ComponentProps<FileConflictDialogModule['FileConflictDialog']>;
type GlobalSearchDialogModule = typeof import('@/components/search/GlobalSearchDialog');
type GlobalSearchDialogProps = React.ComponentProps<GlobalSearchDialogModule['GlobalSearchDialog']>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* files;
    },
  };

  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, {
      configurable: true,
      enumerable: true,
      value: file,
    });
  });

  return fileList as unknown as FileList;
}

const toggleExpand = vi.fn();
const createFile = vi.fn(async () => {});
const createDirectory = vi.fn(async () => {});
const renameItem = vi.fn(async () => {});
const deleteItem = vi.fn(async () => {});
const refresh = vi.fn(async () => {});
const handleExternalDrop = vi.fn();
const resolveConflictsAndContinue = vi.fn();
const revealFile = vi.fn(async () => {});

const loadFileMutate = vi.fn();
const closeFile = vi.fn();
const setActiveFile = vi.fn();
const navigateToFile = vi.fn();

const terminalWrite = vi.fn();
const terminalFocus = vi.fn();

const addToast = vi.fn();
const toastAdd = vi.fn();

const getPathForFile = vi.fn();
const useFileTreeMock = vi.fn();
const useEditorMock = vi.fn();

const fileTreeState = {
  tree: [],
  isLoading: false,
  expandedPaths: new Set<string>(),
  toggleExpand,
  createFile,
  createDirectory,
  renameItem,
  deleteItem,
  refresh,
  handleExternalDrop,
  resolveConflictsAndContinue,
  revealFile,
};

const editorState: {
  tabs: Array<{ path: string }>;
  activeTab: { path: string } | null;
  loadFile: { mutate: typeof loadFileMutate };
  closeFile: typeof closeFile;
  setActiveFile: typeof setActiveFile;
  navigateToFile: typeof navigateToFile;
} = {
  tabs: [],
  activeTab: null,
  loadFile: {
    mutate: loadFileMutate,
  },
  closeFile,
  setActiveFile,
  navigateToFile,
};

const terminalState = {
  write: terminalWrite,
  focus: terminalFocus,
  activeSessionId: 'terminal-store-session',
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: {
    aside: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
      React.createElement('aside', props, children),
  },
}));

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    FileCode: icon,
    FilePlus: icon,
    FolderPlus: icon,
    PanelLeftOpen: icon,
    RefreshCw: icon,
    Search: icon,
    SquareMinus: icon,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/App/storage', () => ({
  normalizePath: (value: string) => value.replace(/\\/g, '/'),
}));

vi.mock('@/hooks/useFileTree', () => ({
  useFileTree: (options: unknown) => useFileTreeMock(options),
}));

vi.mock('@/hooks/useEditor', () => ({
  useEditor: () => useEditorMock(),
}));

vi.mock('@/stores/terminalWrite', () => ({
  useTerminalWriteStore: (
    selector: (state: typeof terminalState) => (typeof terminalState)[keyof typeof terminalState]
  ) => selector(terminalState),
}));

vi.mock('@/components/layout/CollapsedSidebarRail', () => ({
  CollapsedSidebarRail: () => React.createElement('div', { 'data-testid': 'collapsed-sidebar' }),
}));

vi.mock('@/components/layout/ControlStateCard', () => ({
  ControlStateCard: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-testid': 'control-state-card' }, title),
}));

vi.mock('@/components/search/GlobalSearchDialog', () => ({
  GlobalSearchDialog: ({ open }: GlobalSearchDialogProps) =>
    React.createElement('div', {
      'data-testid': 'global-search-dialog',
      'data-open': String(open),
    }),
}));

vi.mock('../NewItemDialog', () => ({
  NewItemDialog: ({ isOpen, type, onConfirm, onCancel }: NewItemDialogProps) =>
    isOpen
      ? React.createElement(
          'div',
          {
            'data-testid': 'new-item-dialog',
            'data-type': type,
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'new-item-confirm',
              onClick: () => void onConfirm(type === 'file' ? 'created-file.ts' : 'created-folder'),
            },
            'confirm'
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'new-item-cancel',
              onClick: onCancel,
            },
            'cancel'
          )
        )
      : null,
}));

vi.mock('../FileConflictDialog', () => ({
  FileConflictDialog: ({ open, conflicts, onResolve, onCancel }: FileConflictDialogProps) =>
    open
      ? React.createElement(
          'div',
          {
            'data-testid': 'file-conflict-dialog',
            'data-conflicts': String(conflicts.length),
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'file-conflict-resolve',
              onClick: () =>
                onResolve(
                  conflicts.map<ConflictResolution>((conflict) => ({
                    path: conflict.path,
                    action: 'replace',
                  }))
                ),
            },
            'resolve'
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'file-conflict-cancel',
              onClick: onCancel,
            },
            'cancel'
          )
        )
      : null,
}));

vi.mock('../FileTree', () => ({
  FileTree: ({
    selectedPath,
    onFileClick,
    onCreateFile,
    onCreateDirectory,
    onExternalDrop,
    onSendToSession,
  }: FileTreeProps) =>
    React.createElement(
      'div',
      {
        'data-testid': 'file-tree',
        'data-selected-path': selectedPath ?? '',
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-open-existing',
          onClick: () => onFileClick('/repo/src/existing.ts'),
        },
        'open-existing'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-open-new',
          onClick: () => onFileClick('/repo/src/new.ts'),
        },
        'open-new'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-create-file',
          onClick: () => onCreateFile('/repo/src'),
        },
        'create-file'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-create-directory',
          onClick: () => onCreateDirectory('/repo/src'),
        },
        'create-directory'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-send-to-session',
          disabled: !onSendToSession,
          onClick: () => onSendToSession?.('/repo/src/current.ts'),
        },
        'send-to-session'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'file-tree-drop',
          onClick: () =>
            void onExternalDrop?.(
              createFileList([new File(['incoming'], 'incoming.ts', { type: 'text/plain' })]),
              '/repo/inbox',
              'copy'
            ),
        },
        'external-drop'
      )
    ),
}));

vi.mock('@/components/ui/toast', () => ({
  addToast,
  toastManager: {
    add: toastAdd,
  },
}));

vi.mock('@/lib/feedbackCopy', () => ({
  buildFileWorkflowToastCopy: () => ({
    title: 'toast-title',
    description: 'toast-description',
  }),
}));

vi.mock('@/lib/focusLock', () => ({
  isFocusLocked: () => false,
  pauseFocusLock: () => () => {},
  restoreFocus: () => true,
}));

vi.mock('../editorSelectionCache', () => ({
  getEditorSelectionText: () => '',
}));

interface MountedFileSidebar {
  container: HTMLDivElement;
  rerender: (overrides?: Partial<FileSidebarProps>) => Promise<void>;
  unmount: () => Promise<void>;
}

function getByTestId<T extends HTMLElement>(container: HTMLElement, testId: string): T | null {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

async function click(container: HTMLElement, testId: string) {
  const target = getByTestId<HTMLElement>(container, testId);
  expect(target).not.toBeNull();

  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountFileSidebar(
  overrides: Partial<FileSidebarProps> = {}
): Promise<MountedFileSidebar> {
  const { FileSidebar } = await import('../FileSidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let currentProps: FileSidebarProps = {
    rootPath: '/repo',
    isActive: true,
    sessionId: 'session-1',
    width: 320,
    collapsed: false,
    onCollapse: vi.fn(),
    onExpand: vi.fn(),
    onResizeStart: vi.fn(),
    onSwitchTab: vi.fn(),
    ...overrides,
  };

  const render = async (nextOverrides: Partial<FileSidebarProps> = {}) => {
    currentProps = {
      ...currentProps,
      ...nextOverrides,
    };

    await act(async () => {
      root.render(React.createElement(FileSidebar, currentProps));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  await render();

  return {
    container,
    rerender: render,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('FileSidebar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    fileTreeState.tree = [];
    fileTreeState.isLoading = false;
    fileTreeState.expandedPaths = new Set<string>();

    editorState.tabs = [];
    editorState.activeTab = null;

    terminalState.activeSessionId = 'terminal-store-session';

    useFileTreeMock.mockReturnValue(fileTreeState);
    useEditorMock.mockReturnValue(editorState);

    handleExternalDrop.mockResolvedValue({
      success: [],
      failed: [],
    });
    resolveConflictsAndContinue.mockResolvedValue({
      success: [],
      failed: [],
    });
    getPathForFile.mockReturnValue('/external/incoming.ts');

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        utils: {
          getPathForFile,
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('mirrors the active editor tab into the tree selection and reveal flow', async () => {
    editorState.activeTab = { path: '/repo/src/active.ts' };
    const view = await mountFileSidebar();

    try {
      expect(revealFile).toHaveBeenCalledWith('/repo/src/active.ts');
      expect(getByTestId(view.container, 'file-tree')?.getAttribute('data-selected-path')).toBe(
        '/repo/src/active.ts'
      );

      editorState.activeTab = { path: '/repo/src/next.ts' };
      await view.rerender();

      expect(revealFile).toHaveBeenLastCalledWith('/repo/src/next.ts');
      expect(getByTestId(view.container, 'file-tree')?.getAttribute('data-selected-path')).toBe(
        '/repo/src/next.ts'
      );
    } finally {
      await view.unmount();
    }
  });

  it('activates existing tabs and loads unopened files from the tree', async () => {
    editorState.tabs = [{ path: '/repo/src/existing.ts' }];
    const onSwitchTab = vi.fn();
    const view = await mountFileSidebar({ onSwitchTab });

    try {
      await click(view.container, 'file-tree-open-existing');
      await click(view.container, 'file-tree-open-new');

      expect(onSwitchTab).toHaveBeenCalledTimes(2);
      expect(setActiveFile).toHaveBeenCalledWith('/repo/src/existing.ts');
      expect(loadFileMutate).toHaveBeenCalledWith('/repo/src/new.ts');
      expect(loadFileMutate).not.toHaveBeenCalledWith('/repo/src/existing.ts');
    } finally {
      await view.unmount();
    }
  });

  it('creates files and directories through the new item dialog workflow', async () => {
    const view = await mountFileSidebar();

    try {
      await click(view.container, 'file-tree-create-file');

      expect(getByTestId(view.container, 'new-item-dialog')?.getAttribute('data-type')).toBe(
        'file'
      );

      await click(view.container, 'new-item-confirm');

      expect(createFile).toHaveBeenCalledWith('/repo/src/created-file.ts');
      expect(loadFileMutate).toHaveBeenCalledWith('/repo/src/created-file.ts');
      expect(getByTestId(view.container, 'new-item-dialog')).toBeNull();

      loadFileMutate.mockClear();

      await click(view.container, 'file-tree-create-directory');

      expect(getByTestId(view.container, 'new-item-dialog')?.getAttribute('data-type')).toBe(
        'directory'
      );

      await click(view.container, 'new-item-confirm');

      expect(createDirectory).toHaveBeenCalledWith('/repo/src/created-folder');
      expect(loadFileMutate).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it('writes relative file references into the active session', async () => {
    const view = await mountFileSidebar({ sessionId: 'session-1' });

    try {
      await click(view.container, 'file-tree-send-to-session');

      expect(terminalWrite).toHaveBeenCalledWith('session-1', '@src/current.ts ');
      expect(terminalFocus).toHaveBeenCalledWith('session-1');
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'toast-title',
          description: 'toast-description',
          timeout: 2000,
        })
      );
    } finally {
      await view.unmount();
    }
  });

  it('opens the first transferred file after a successful external drop', async () => {
    vi.useFakeTimers();
    handleExternalDrop.mockResolvedValueOnce({
      success: ['/external/incoming.ts', '/external/README'],
      failed: [],
    });
    const view = await mountFileSidebar();

    try {
      await click(view.container, 'file-tree-drop');

      expect(handleExternalDrop).toHaveBeenCalledWith(expect.anything(), '/repo/inbox', 'copy');
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'toast-title',
          description: 'toast-description',
          timeout: 3000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(loadFileMutate).toHaveBeenCalledWith('/repo/inbox/incoming.ts');
    } finally {
      await view.unmount();
      vi.useRealTimers();
    }
  });

  it('resolves external drop conflicts and opens the first resulting file', async () => {
    vi.useFakeTimers();
    const conflicts: ConflictInfo[] = [
      {
        path: '/repo/inbox/incoming.ts',
        name: 'incoming.ts',
        sourceSize: 10,
        targetSize: 11,
        sourceModified: 1,
        targetModified: 2,
      },
    ];
    handleExternalDrop.mockResolvedValueOnce({
      success: [],
      failed: [],
      conflicts,
    });
    resolveConflictsAndContinue.mockResolvedValueOnce({
      success: ['/external/incoming.ts'],
      failed: [],
    });
    const view = await mountFileSidebar();

    try {
      await click(view.container, 'file-tree-drop');

      expect(getByTestId(view.container, 'file-conflict-dialog')).not.toBeNull();

      await click(view.container, 'file-conflict-resolve');

      expect(resolveConflictsAndContinue).toHaveBeenCalledWith(
        ['/external/incoming.ts'],
        '/repo/inbox',
        'copy',
        [{ path: '/repo/inbox/incoming.ts', action: 'replace' }]
      );

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(loadFileMutate).toHaveBeenCalledWith('/repo/inbox/incoming.ts');
      expect(getByTestId(view.container, 'file-conflict-dialog')).toBeNull();
    } finally {
      await view.unmount();
      vi.useRealTimers();
    }
  });
});
