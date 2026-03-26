import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PendingCursor = {
  path: string;
  line: number;
  column?: number;
  matchLength?: number;
  previewMode?: 'off' | 'split' | 'fullscreen';
} | null;

type EditorTab = {
  path: string;
  content: string;
  encoding?: string;
  isDirty: boolean;
};

type EditorStoreState = {
  tabs: EditorTab[];
  activeTabPath: string | null;
  pendingCursor: PendingCursor;
  openFile: ReturnType<typeof vi.fn>;
  closeFile: ReturnType<typeof vi.fn>;
  closeOtherFiles: ReturnType<typeof vi.fn>;
  closeFilesToLeft: ReturnType<typeof vi.fn>;
  closeFilesToRight: ReturnType<typeof vi.fn>;
  closeAllFiles: ReturnType<typeof vi.fn>;
  setActiveFile: ReturnType<typeof vi.fn>;
  updateFileContent: ReturnType<typeof vi.fn>;
  markFileSaved: ReturnType<typeof vi.fn>;
  setTabViewState: ReturnType<typeof vi.fn>;
  reorderTabs: ReturnType<typeof vi.fn>;
  setPendingCursor: ReturnType<typeof vi.fn>;
};

type FileReadResult = {
  content: string;
  encoding?: string;
  isBinary?: boolean;
};

const reactQueryMock = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

const editorStoreMock = vi.hoisted(() => {
  const state = {
    current: null as EditorStoreState | null,
  };

  const hook = vi.fn(() => {
    if (!state.current) {
      throw new Error('Editor store state is not configured');
    }

    return state.current;
  });

  const getState = vi.fn(() => {
    if (!state.current) {
      throw new Error('Editor store state is not configured');
    }

    return state.current;
  });

  return {
    state,
    hook,
    getState,
  };
});

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: reactQueryMock.invalidateQueries,
  }),
  useMutation: <TResult, TVariables extends string>(options: {
    mutationFn: (variables: TVariables) => Promise<TResult>;
    onSuccess?: () => void;
  }) => ({
    mutateAsync: async (variables: TVariables) => {
      const result = await options.mutationFn(variables);
      options.onSuccess?.();
      return result;
    },
  }),
}));

vi.mock('@/stores/editor', () => ({
  useEditorStore: Object.assign(editorStoreMock.hook, {
    getState: editorStoreMock.getState,
  }),
}));

import { useEditor } from '../useEditor';

function createStoreState(overrides?: Partial<EditorStoreState>): EditorStoreState {
  return {
    tabs: [],
    activeTabPath: null,
    pendingCursor: null,
    openFile: vi.fn(),
    closeFile: vi.fn(),
    closeOtherFiles: vi.fn(),
    closeFilesToLeft: vi.fn(),
    closeFilesToRight: vi.fn(),
    closeAllFiles: vi.fn(),
    setActiveFile: vi.fn(),
    updateFileContent: vi.fn(),
    markFileSaved: vi.fn(),
    setTabViewState: vi.fn(),
    reorderTabs: vi.fn(),
    setPendingCursor: vi.fn(),
    ...overrides,
  };
}

describe('useEditor', () => {
  const readMock = vi.fn<(path: string) => Promise<FileReadResult>>();
  const writeMock = vi.fn<(path: string, content: string, encoding?: string) => Promise<void>>();

  beforeEach(() => {
    editorStoreMock.state.current = createStoreState();
    reactQueryMock.invalidateQueries.mockReset();
    readMock.mockReset();
    writeMock.mockReset();

    vi.stubGlobal('window', {
      electronAPI: {
        file: {
          read: readMock,
          write: writeMock,
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the active tab from the editor store snapshot', () => {
    editorStoreMock.state.current = createStoreState({
      tabs: [
        { path: '/repo/a.ts', content: 'a', encoding: 'utf8', isDirty: false },
        { path: '/repo/b.ts', content: 'b', encoding: 'utf8', isDirty: false },
      ],
      activeTabPath: '/repo/b.ts',
      pendingCursor: {
        path: '/repo/b.ts',
        line: 9,
      },
    });

    const editor = useEditor();

    expect(editor.activeTab).toEqual({
      path: '/repo/b.ts',
      content: 'b',
      encoding: 'utf8',
      isDirty: false,
    });
    expect(editor.pendingCursor).toEqual({
      path: '/repo/b.ts',
      line: 9,
    });
  });

  it('refreshes clean text tabs silently and skips missing, dirty, binary, and failing reads', async () => {
    const state = createStoreState({
      tabs: [{ path: '/repo/a.ts', content: 'old', encoding: 'utf8', isDirty: false }],
    });
    editorStoreMock.state.current = state;
    readMock.mockResolvedValueOnce({
      content: 'new',
      encoding: 'utf8',
      isBinary: false,
    });

    const editor = useEditor();
    await editor.refreshFileContent('/repo/a.ts');

    expect(readMock).toHaveBeenCalledWith('/repo/a.ts');
    expect(state.updateFileContent).toHaveBeenCalledWith('/repo/a.ts', 'new', false);

    state.updateFileContent.mockClear();
    state.tabs = [{ path: '/repo/a.ts', content: 'dirty', encoding: 'utf8', isDirty: true }];
    await editor.refreshFileContent('/repo/a.ts');

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(state.updateFileContent).not.toHaveBeenCalled();

    state.tabs = [{ path: '/repo/a.ts', content: 'clean', encoding: 'utf8', isDirty: false }];
    readMock.mockResolvedValueOnce({
      content: 'clean',
      encoding: 'utf8',
      isBinary: true,
    });
    await editor.refreshFileContent('/repo/a.ts');

    expect(state.updateFileContent).not.toHaveBeenCalled();

    readMock.mockRejectedValueOnce(new Error('gone'));
    await expect(editor.refreshFileContent('/repo/a.ts')).resolves.toBeUndefined();
    expect(state.updateFileContent).not.toHaveBeenCalled();

    await editor.refreshFileContent('/repo/missing.ts');
    expect(readMock).toHaveBeenCalledTimes(3);
  });

  it('loads files through the mutation and marks unsupported binary files', async () => {
    const state = createStoreState();
    editorStoreMock.state.current = state;
    readMock.mockResolvedValueOnce({
      content: 'binary-content',
      encoding: 'utf8',
      isBinary: true,
    });

    const editor = useEditor();
    const result = await editor.loadFile.mutateAsync('/repo/archive.bin');

    expect(result).toEqual({
      content: 'binary-content',
      encoding: 'utf8',
      isBinary: true,
    });
    expect(state.openFile).toHaveBeenCalledWith({
      path: '/repo/archive.bin',
      content: 'binary-content',
      encoding: 'utf8',
      isDirty: false,
      isUnsupported: true,
    });
  });

  it('saves the latest file content from store state and invalidates file queries', async () => {
    const state = createStoreState({
      tabs: [{ path: '/repo/a.ts', content: 'before', encoding: 'utf8', isDirty: true }],
    });
    editorStoreMock.state.current = state;
    writeMock.mockResolvedValueOnce();

    const editor = useEditor();
    state.tabs = [{ path: '/repo/a.ts', content: 'after', encoding: 'utf8', isDirty: true }];

    await editor.saveFile.mutateAsync('/repo/a.ts');

    expect(writeMock).toHaveBeenCalledWith('/repo/a.ts', 'after', 'utf8');
    expect(state.markFileSaved).toHaveBeenCalledWith('/repo/a.ts');
    expect(reactQueryMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['file', 'list'],
    });
  });

  it('throws when saving a file that no longer exists in the store', async () => {
    editorStoreMock.state.current = createStoreState();

    const editor = useEditor();

    await expect(editor.saveFile.mutateAsync('/repo/missing.ts')).rejects.toThrow('File not found');
  });

  it('navigates existing tabs by activating them, refreshing content, and storing cursor metadata', async () => {
    const state = createStoreState({
      tabs: [{ path: '/repo/a.ts', content: 'cached', encoding: 'utf8', isDirty: false }],
    });
    editorStoreMock.state.current = state;
    readMock.mockResolvedValueOnce({
      content: 'updated',
      encoding: 'utf8',
      isBinary: false,
    });

    const editor = useEditor();
    await editor.navigateToFile('/repo/a.ts', 12, 4, 3, 'split');

    expect(state.setActiveFile).toHaveBeenCalledWith('/repo/a.ts');
    expect(readMock).toHaveBeenCalledWith('/repo/a.ts');
    expect(state.setPendingCursor).toHaveBeenCalledWith({
      path: '/repo/a.ts',
      line: 12,
      column: 4,
      matchLength: 3,
      previewMode: 'split',
    });
  });

  it('loads missing tabs during navigation and stops when the read fails', async () => {
    const state = createStoreState();
    editorStoreMock.state.current = state;
    readMock.mockResolvedValueOnce({
      content: 'fresh',
      encoding: 'utf8',
      isBinary: false,
    });

    const editor = useEditor();
    await editor.navigateToFile('/repo/new.ts', 8);

    expect(state.openFile).toHaveBeenCalledWith({
      path: '/repo/new.ts',
      content: 'fresh',
      encoding: 'utf8',
      isDirty: false,
      isUnsupported: false,
    });
    expect(state.setPendingCursor).toHaveBeenCalledWith({
      path: '/repo/new.ts',
      line: 8,
      column: undefined,
      matchLength: undefined,
      previewMode: undefined,
    });

    state.openFile.mockClear();
    state.setPendingCursor.mockClear();
    readMock.mockRejectedValueOnce(new Error('missing'));

    await editor.navigateToFile('/repo/fail.ts', 3, 1);

    expect(state.openFile).not.toHaveBeenCalled();
    expect(state.setPendingCursor).not.toHaveBeenCalled();
  });
});
