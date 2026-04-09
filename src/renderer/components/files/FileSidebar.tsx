import { AnimatePresence, motion } from 'framer-motion';
import {
  FileCode,
  FilePlus,
  FolderPlus,
  PanelLeftOpen,
  RefreshCw,
  Search,
  SquareMinus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { panelTransition } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { CollapsedSidebarRail } from '@/components/layout/CollapsedSidebarRail';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog';
import type { SearchMode } from '@/components/search/useGlobalSearch';
import { addToast, toastManager } from '@/components/ui/toast';
import { useEditor } from '@/hooks/useEditor';
import { useFileTree } from '@/hooks/useFileTree';
import { useI18n } from '@/i18n';
import { buildFileWorkflowToastCopy } from '@/lib/feedbackCopy';
import { isFocusLocked, pauseFocusLock, restoreFocus } from '@/lib/focusLock';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { getEditorSelectionText } from './editorSelectionCache';
import {
  type ConflictInfo,
  type ConflictResolution,
  FileConflictDialog,
} from './FileConflictDialog';
import { FileTree } from './FileTree';
import { NewItemDialog } from './NewItemDialog';

interface FileSidebarProps {
  rootPath: string | undefined;
  isActive?: boolean;
  sessionId?: string | null;
  width: number;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onSwitchTab?: () => void;
}

type NewItemType = 'file' | 'directory' | null;

export function FileSidebar({
  rootPath,
  isActive = false,
  sessionId,
  width,
  collapsed,
  onCollapse,
  onExpand,
  onResizeStart,
  onSwitchTab,
}: FileSidebarProps) {
  const { t } = useI18n();
  const {
    tree,
    isLoading,
    expandedPaths,
    toggleExpand,
    createFile,
    createDirectory,
    renameItem,
    deleteItem,
    refresh,
    handleExternalDrop,
    resolveConflictsAndContinue,
    revealFile,
  } = useFileTree({ rootPath, enabled: !!rootPath, isActive });

  const { tabs, activeTab, loadFile, closeFile, setActiveFile, navigateToFile } = useEditor();

  const [newItemType, setNewItemType] = useState<NewItemType>(null);
  const [newItemParentPath, setNewItemParentPath] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('content');
  const addOperationsRef = useRef<((operations: any[]) => void) | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [pendingDropData, setPendingDropData] = useState<{
    files: FileList;
    targetDir: string;
    operation: 'copy' | 'move';
  } | null>(null);
  const newItemFocusReleaseRef = useRef<(() => void) | null>(null);
  const newItemPausedSessionIdRef = useRef<string | null>(null);

  // Auto-sync file tree selection with active tab
  useEffect(() => {
    if (!activeTab?.path || !rootPath) return;
    setSelectedFilePath(activeTab.path);
    revealFile(activeTab.path);
  }, [activeTab?.path, rootPath, revealFile]);

  const handleRecordOperations = useCallback((addFn: (operations: any[]) => void) => {
    addOperationsRef.current = addFn;
  }, []);

  const handleOpenSearch = useCallback((selectedText?: string) => {
    setSearchMode('content');
    const query = selectedText ?? getEditorSelectionText();
    if (query) {
      window._pendingSearchQuery = query;
    }
    setSearchOpen(true);
  }, []);

  const handleFileClick = useCallback(
    (path: string) => {
      onSwitchTab?.();
      const existingTab = tabs.find((t) => t.path === path);
      if (existingTab) {
        setActiveFile(path);
      } else {
        loadFile.mutate(path);
      }
    },
    [tabs, setActiveFile, loadFile, onSwitchTab]
  );

  const getFocusedEnhancedInputSessionId = useCallback(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;

    const owner = active.closest<HTMLElement>('[data-enhanced-input-session-id]');
    return owner?.dataset.enhancedInputSessionId ?? null;
  }, []);

  const handleRename = useCallback(
    async (path: string, newName: string) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;
      await renameItem(path, newPath);
    },
    [renameItem]
  );

  const handleDelete = useCallback(
    async (path: string) => {
      const confirmed = window.confirm(`Delete "${path.split('/').pop()}"?`);
      if (confirmed) {
        await deleteItem(path);
        closeFile(path);
      }
    },
    [deleteItem, closeFile]
  );

  const terminalWrite = useTerminalWriteStore((state) => state.write);
  const terminalFocus = useTerminalWriteStore((state) => state.focus);
  const activeSessionId = useTerminalWriteStore((state) => state.activeSessionId);
  const effectiveSessionId = sessionId ?? activeSessionId;

  const startNewItemFocusPause = useCallback(() => {
    if (newItemFocusReleaseRef.current) return;

    const fallbackSessionId =
      effectiveSessionId && isFocusLocked(effectiveSessionId) ? effectiveSessionId : null;
    const targetSessionId = getFocusedEnhancedInputSessionId() ?? fallbackSessionId;
    if (!targetSessionId) return;

    newItemPausedSessionIdRef.current = targetSessionId;
    newItemFocusReleaseRef.current = pauseFocusLock(targetSessionId);
  }, [effectiveSessionId, getFocusedEnhancedInputSessionId]);

  const endNewItemFocusPause = useCallback(() => {
    if (!newItemFocusReleaseRef.current) return;

    const pausedSessionId = newItemPausedSessionIdRef.current;
    newItemFocusReleaseRef.current();
    newItemFocusReleaseRef.current = null;
    newItemPausedSessionIdRef.current = null;

    const targetSessionId =
      pausedSessionId ??
      (effectiveSessionId && isFocusLocked(effectiveSessionId) ? effectiveSessionId : null);
    if (!targetSessionId) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!restoreFocus(targetSessionId)) {
          setTimeout(() => {
            restoreFocus(targetSessionId);
          }, 0);
        }
      });
    });
  }, [effectiveSessionId]);

  useEffect(() => {
    return () => {
      newItemFocusReleaseRef.current?.();
      newItemFocusReleaseRef.current = null;
      newItemPausedSessionIdRef.current = null;
    };
  }, []);

  const handleCreateFile = useCallback(
    (parentPath: string) => {
      startNewItemFocusPause();
      setNewItemType('file');
      setNewItemParentPath(parentPath);
    },
    [startNewItemFocusPause]
  );

  const handleCreateDirectory = useCallback(
    (parentPath: string) => {
      startNewItemFocusPause();
      setNewItemType('directory');
      setNewItemParentPath(parentPath);
    },
    [startNewItemFocusPause]
  );

  const handleNewItemConfirm = useCallback(
    async (name: string) => {
      try {
        const fullPath = `${newItemParentPath}/${name}`;
        if (newItemType === 'file') {
          await createFile(fullPath);
          loadFile.mutate(fullPath);
        } else if (newItemType === 'directory') {
          await createDirectory(fullPath);
        }
      } finally {
        setNewItemType(null);
        setNewItemParentPath('');
        endNewItemFocusPause();
      }
    },
    [newItemType, newItemParentPath, createFile, createDirectory, loadFile, endNewItemFocusPause]
  );

  const handleSendToSession = useCallback(
    (path: string) => {
      if (!effectiveSessionId) return;
      let displayPath = path;
      const normalizedRoot = rootPath ? normalizePath(rootPath) : '';
      if (normalizedRoot && path.startsWith(`${normalizedRoot}/`)) {
        displayPath = path.slice(normalizedRoot.length + 1);
      }
      terminalWrite(effectiveSessionId, `@${displayPath} `);
      terminalFocus(effectiveSessionId);
      const copy = buildFileWorkflowToastCopy(
        {
          action: 'send-to-session',
          phase: 'success',
          target: `@${displayPath}`,
        },
        t
      );
      addToast({
        type: 'success',
        title: copy.title,
        description: copy.description,
        timeout: 2000,
      });
    },
    [effectiveSessionId, rootPath, terminalWrite, terminalFocus, t]
  );

  const handleCollapseAll = useCallback(() => {
    toggleExpand('__COLLAPSE_ALL__');
  }, [toggleExpand]);

  const handleExternalFileDrop = useCallback(
    async (files: FileList, targetDir: string, operation: 'copy' | 'move') => {
      const result = await handleExternalDrop(files, targetDir, operation);

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setPendingDropData({ files, targetDir, operation });
        setConflictDialogOpen(true);
        return;
      }

      if (result.success.length > 0) {
        const successCopy = buildFileWorkflowToastCopy(
          {
            action: 'file-transfer',
            phase: 'success',
            operation,
            count: result.success.length,
          },
          t
        );
        toastManager.add({
          type: 'success',
          title: successCopy.title,
          description: successCopy.description,
          timeout: 3000,
        });

        if (addOperationsRef.current) {
          const operations = result.success.map((sourcePath) => {
            const fileName = sourcePath.split('/').pop() || '';
            const targetPath = `${targetDir}/${fileName}`;
            return {
              type: operation,
              sourcePath,
              targetPath,
              isDirectory: false,
            };
          });
          addOperationsRef.current(operations);
        }

        let firstFile: string | null = null;
        for (const sourcePath of result.success) {
          const fileName = sourcePath.split('/').pop() || '';
          const hasExtension = fileName.includes('.') && !fileName.startsWith('.');
          if (hasExtension) {
            firstFile = `${targetDir}/${fileName}`;
            break;
          }
        }

        if (firstFile) {
          setTimeout(() => {
            setSelectedFilePath(firstFile!);
            loadFile.mutate(firstFile!);
          }, 500);
        }
      }
      if (result.failed.length > 0) {
        const errorCopy = buildFileWorkflowToastCopy(
          {
            action: 'file-transfer',
            phase: 'error',
            count: result.failed.length,
          },
          t
        );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
          timeout: 3000,
        });
      }
    },
    [handleExternalDrop, t, loadFile]
  );

  const handleConflictResolve = useCallback(
    async (resolutions: ConflictResolution[]) => {
      if (!pendingDropData) return;

      setConflictDialogOpen(false);

      const sourcePaths: string[] = [];
      for (let i = 0; i < pendingDropData.files.length; i++) {
        const file = pendingDropData.files[i];
        try {
          const filePath = window.electronAPI.utils.getPathForFile(file);
          if (filePath) {
            sourcePaths.push(filePath);
          }
        } catch (error) {
          console.error('Failed to get file path:', error);
        }
      }

      const result = await resolveConflictsAndContinue(
        sourcePaths,
        pendingDropData.targetDir,
        pendingDropData.operation,
        resolutions
      );

      setPendingDropData(null);
      setConflicts([]);

      if (result.success.length > 0) {
        const successCopy = buildFileWorkflowToastCopy(
          {
            action: 'file-transfer',
            phase: 'success',
            operation: pendingDropData.operation,
            count: result.success.length,
          },
          t
        );
        toastManager.add({
          type: 'success',
          title: successCopy.title,
          description: successCopy.description,
          timeout: 3000,
        });

        if (addOperationsRef.current) {
          const operations = result.success.map((sourcePath) => {
            const fileName = sourcePath.split('/').pop() || '';
            const targetPath = `${pendingDropData.targetDir}/${fileName}`;
            return {
              type: pendingDropData.operation,
              sourcePath,
              targetPath,
              isDirectory: false,
            };
          });
          addOperationsRef.current(operations);
        }

        let firstFile: string | null = null;
        for (const sourcePath of result.success) {
          const fileName = sourcePath.split('/').pop() || '';
          const hasExtension = fileName.includes('.') && !fileName.startsWith('.');
          if (hasExtension) {
            firstFile = `${pendingDropData.targetDir}/${fileName}`;
            break;
          }
        }

        if (firstFile) {
          setTimeout(() => {
            setSelectedFilePath(firstFile!);
            loadFile.mutate(firstFile!);
          }, 500);
        }
      }
      if (result.failed.length > 0) {
        const errorCopy = buildFileWorkflowToastCopy(
          {
            action: 'file-transfer',
            phase: 'error',
            count: result.failed.length,
          },
          t
        );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
          timeout: 3000,
        });
      }
    },
    [pendingDropData, resolveConflictsAndContinue, t, loadFile]
  );

  const handleConflictCancel = useCallback(() => {
    setConflictDialogOpen(false);
    setPendingDropData(null);
    setConflicts([]);
  }, []);

  if (!rootPath) {
    return (
      <aside className="flex h-full w-full flex-col border-r bg-background">
        <ControlStateCard
          icon={<FileCode className="h-5 w-5" />}
          eyebrow={t('File Explorer')}
          title={t('File explorer needs a worktree')}
          description={t('Files and folders appear here for the selected worktree.')}
          metaLabel={t('Next Step')}
          metaValue={t('Choose a worktree in the sidebar to browse its files')}
        />
      </aside>
    );
  }

  return (
    <>
      {collapsed ? (
        <CollapsedSidebarRail
          label="File Sidebar"
          triggerTitle={t('File sidebar actions')}
          icon={FileCode}
          popupClassName="min-w-[208px]"
          actions={[
            {
              id: 'expand-file-sidebar',
              label: t('Expand File Sidebar'),
              icon: PanelLeftOpen,
              onSelect: onExpand,
            },
            {
              id: 'search-files',
              label: t('Search Files'),
              icon: Search,
              onSelect: () => handleOpenSearch(),
            },
            {
              id: 'new-file',
              label: t('New File'),
              icon: FilePlus,
              onSelect: () => handleCreateFile(rootPath),
              separatorBefore: true,
            },
            {
              id: 'new-folder',
              label: t('New Folder'),
              icon: FolderPlus,
              onSelect: () => handleCreateDirectory(rootPath),
            },
            {
              id: 'refresh-file-tree',
              label: t('Refresh'),
              icon: RefreshCw,
              onSelect: refresh,
              separatorBefore: true,
            },
            {
              id: 'collapse-all-folders',
              label: t('Collapse all folders'),
              icon: SquareMinus,
              onSelect: handleCollapseAll,
            },
          ]}
        />
      ) : (
        <AnimatePresence initial={false}>
          <motion.aside
            key="file-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={panelTransition}
            className="relative h-full shrink-0 overflow-hidden border-r bg-background"
            style={{ width }}
          >
            <FileTree
              tree={tree}
              expandedPaths={expandedPaths}
              onToggleExpand={toggleExpand}
              onFileClick={handleFileClick}
              selectedPath={selectedFilePath}
              onSelectedPathChange={setSelectedFilePath}
              onCreateFile={handleCreateFile}
              onCreateDirectory={handleCreateDirectory}
              onRename={handleRename}
              onDelete={handleDelete}
              onRefresh={refresh}
              onOpenSearch={handleOpenSearch}
              onExternalDrop={handleExternalFileDrop}
              onRecordOperations={handleRecordOperations}
              onFileDeleted={closeFile}
              isLoading={isLoading}
              rootPath={rootPath}
              isCollapsed={false}
              onToggleCollapse={onCollapse}
              onSendToSession={effectiveSessionId ? handleSendToSession : undefined}
            />
            <div
              className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20 active:bg-primary/30"
              onMouseDown={onResizeStart}
            />
          </motion.aside>
        </AnimatePresence>
      )}
      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        rootPath={rootPath}
        initialMode={searchMode}
        onOpenFile={navigateToFile}
      />
      <NewItemDialog
        isOpen={newItemType !== null}
        type={newItemType || 'file'}
        onConfirm={handleNewItemConfirm}
        onCancel={() => {
          setNewItemType(null);
          setNewItemParentPath('');
          endNewItemFocusPause();
        }}
      />
      <FileConflictDialog
        open={conflictDialogOpen}
        conflicts={conflicts}
        onResolve={handleConflictResolve}
        onCancel={handleConflictCancel}
      />
    </>
  );
}
