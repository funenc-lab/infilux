import type { FileEntry } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFileTreeExpandedPaths, saveFileTreeExpandedPaths } from '@/App/storage';
import {
  resolveFileListGitRoot,
  resolveFileListPath,
} from '@/components/files/breadcrumbPathUtils';
import { shouldEmitFileTreeRuntimeDiagnostics } from './fileTreeDiagnosticsPolicy';
import {
  FILE_TREE_ROOT_QUERY_STALE_TIME_MS,
  shouldInvalidateFileTreeRootQueryOnRootChange,
  shouldRefetchFileTreeRootQueryOnMount,
} from './fileTreeRootQueryPolicy';
import { fileTreeRootQueryRemountTracker } from './fileTreeRootQueryRemountTracker';
import { shouldRecoverRootFileList } from './fileTreeRootRecoveryPolicy';
import { createFileTreeRootRecoveryTracker } from './fileTreeRootRecoveryTracker';
import {
  cloneEntriesToNodes,
  findNodeByPath,
  mergeNodesPreservingState,
  replaceNodeChildren,
  setNodeLoadingState,
} from './fileTreeStateUtils';
import { buildFileTreeWatchRefreshPlan, type FileTreeWatchEvent } from './fileTreeWatchBatch';
import {
  type FileTreeWatchStateSnapshot,
  shouldRefreshFileTreeOnWatchResume,
  shouldWatchFileTree,
} from './fileTreeWatchPolicy';
import { useShouldPoll } from './useWindowFocus';

interface UseFileTreeOptions {
  rootPath: string | undefined;
  enabled?: boolean;
  isActive?: boolean;
}

interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[];
  isLoading?: boolean;
}

const shouldLogFileTreeDiagnostics = import.meta.env.DEV;
const FILE_TREE_WATCH_BATCH_MS = 48;

function logFileTreeDiagnostics(
  stage: string,
  payload: Record<string, unknown>,
  shouldLog: boolean
): void {
  if (!shouldLog) {
    return;
  }

  console.info(`[file-tree] ${stage}`, payload);
}

function emitFileTreeRuntimeDiagnostics(
  stage: string,
  payload: Record<string, unknown>,
  shouldEmit: boolean
): void {
  if (!shouldEmit) {
    return;
  }

  console.error(`[file-tree-debug] ${stage}`, payload);
}

export function useFileTree({ rootPath, enabled = true, isActive = true }: UseFileTreeOptions) {
  const queryClient = useQueryClient();
  const shouldPoll = useShouldPoll();
  const shouldLogDiagnostics = shouldLogFileTreeDiagnostics;
  const shouldEmitRuntimeDiagnostics = shouldEmitFileTreeRuntimeDiagnostics({
    isDev: import.meta.env.DEV,
    mode: import.meta.env.MODE,
  });
  const shouldRefetchRootQueryOnMount =
    rootPath === undefined
      ? true
      : shouldRefetchFileTreeRootQueryOnMount({
          lastInactiveAt: fileTreeRootQueryRemountTracker.getLastInactiveAt(rootPath),
        });
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    rootPath ? loadFileTreeExpandedPaths(rootPath) : new Set()
  );

  // Fetch root directory
  const {
    data: rootFiles,
    isLoading: isRootLoading,
    isError: isRootError,
  } = useQuery({
    queryKey: ['file', 'list', rootPath],
    queryFn: async () => {
      if (!rootPath) return [];
      const resolvedRootPath = resolveFileListPath(rootPath, rootPath) ?? rootPath;
      const resolvedGitRoot = resolveFileListGitRoot(rootPath, rootPath);
      logFileTreeDiagnostics(
        'root-query:start',
        { rootPath, resolvedRootPath, resolvedGitRoot },
        shouldLogDiagnostics
      );
      emitFileTreeRuntimeDiagnostics(
        'root-query:start',
        {
          rootPath,
          resolvedRootPath,
          resolvedGitRoot,
          enabled,
          isActive,
        },
        shouldEmitRuntimeDiagnostics
      );
      const files = await window.electronAPI.file.list(resolvedRootPath, resolvedGitRoot);
      logFileTreeDiagnostics(
        'root-query:success',
        { rootPath, resolvedRootPath, resolvedGitRoot, count: files.length },
        shouldLogDiagnostics
      );
      emitFileTreeRuntimeDiagnostics(
        'root-query:success',
        {
          rootPath,
          resolvedRootPath,
          resolvedGitRoot,
          count: files.length,
        },
        shouldEmitRuntimeDiagnostics
      );
      return files;
    },
    enabled: enabled && !!rootPath,
    refetchOnMount: shouldRefetchRootQueryOnMount,
    staleTime: FILE_TREE_ROOT_QUERY_STALE_TIME_MS,
  });

  // Build tree structure with expanded directories
  const [tree, setTree] = useState<FileTreeNode[]>([]);

  // Use refs to access state in callbacks without stale closure issues
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  // Track the current rootPath in a ref for use inside callbacks
  const rootPathRef = useRef(rootPath);
  rootPathRef.current = rootPath;
  const previousRootPathRef = useRef<string | undefined>(undefined);
  // Track whether children have been restored for the current rootPath
  const childrenRestoredRef = useRef(false);
  const rootRecoveryTrackerRef = useRef(createFileTreeRootRecoveryTracker());

  // Helper: update expanded state and persist to localStorage atomically
  const setAndPersistExpandedPaths = useCallback((paths: Set<string>) => {
    setExpandedPaths(paths);
    if (rootPathRef.current) saveFileTreeExpandedPaths(rootPathRef.current, paths);
  }, []);

  // When rootPath changes: restore saved expanded state and trigger a fresh tree fetch
  useEffect(() => {
    const previousRootPath = previousRootPathRef.current;
    previousRootPathRef.current = rootPath;
    rootRecoveryTrackerRef.current.reset();
    if (!rootPath) return;

    childrenRestoredRef.current = false;
    setExpandedPaths(loadFileTreeExpandedPaths(rootPath));
    setTree([]);

    if (shouldInvalidateFileTreeRootQueryOnRootChange(previousRootPath, rootPath)) {
      queryClient.invalidateQueries({ queryKey: ['file', 'list', rootPath] });
    }
  }, [rootPath, queryClient]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    return () => {
      fileTreeRootQueryRemountTracker.markInactive(rootPath);
    };
  }, [rootPath]);

  // Load children for a directory
  const loadChildren = useCallback(
    async (path: string): Promise<FileEntry[]> => {
      const resolvedPath = resolveFileListPath(path, rootPath) ?? path;
      const resolvedGitRoot = resolveFileListGitRoot(path, rootPath);
      const cached = queryClient.getQueryData<FileEntry[]>(['file', 'list', resolvedPath]);
      if (cached) {
        logFileTreeDiagnostics(
          'children-query:cache-hit',
          { path, rootPath, resolvedPath, resolvedGitRoot, count: cached.length },
          shouldLogDiagnostics
        );
        return cached;
      }

      logFileTreeDiagnostics(
        'children-query:start',
        { path, rootPath, resolvedPath, resolvedGitRoot },
        shouldLogDiagnostics
      );
      const files = await window.electronAPI.file.list(resolvedPath, resolvedGitRoot);
      logFileTreeDiagnostics(
        'children-query:success',
        { path, rootPath, resolvedPath, resolvedGitRoot, count: files.length },
        shouldLogDiagnostics
      );
      queryClient.setQueryData(['file', 'list', resolvedPath], files);
      return files;
    },
    [queryClient, rootPath, shouldLogDiagnostics]
  );

  // Update tree when root files change, then restore children for all expanded paths
  useEffect(() => {
    if (!rootFiles || !rootPath) return;

    logFileTreeDiagnostics(
      'root-files:update',
      { rootPath, count: rootFiles.length },
      shouldLogDiagnostics
    );
    emitFileTreeRuntimeDiagnostics(
      'root-files:update',
      {
        rootPath,
        count: rootFiles.length,
        expandedCount: expandedPathsRef.current.size,
      },
      shouldEmitRuntimeDiagnostics
    );

    const merged = mergeNodesPreservingState(rootFiles, treeRef.current);
    setTree(merged);
    treeRef.current = merged;

    // Only restore once per rootPath switch (childrenRestoredRef resets on rootPath change)
    if (childrenRestoredRef.current) return;

    // Read directly from localStorage to avoid stale ref when this effect fires
    // in the same flush as the rootPath effect (expandedPathsRef may still hold
    // the previous rootPath's paths before setExpandedPaths state update is applied)
    const restored = loadFileTreeExpandedPaths(rootPath);
    if (restored.size === 0) {
      childrenRestoredRef.current = true;
      return;
    }

    // Sort shallow-first so parent nodes are populated before their children
    const sortedPaths = [...restored].sort((a, b) => a.split('/').length - b.split('/').length);

    let cancelled = false;

    const restoreChildren = async () => {
      let restoredTree = merged;

      for (const expandedPath of sortedPaths) {
        if (cancelled) return;
        try {
          const children = await loadChildren(expandedPath);
          if (cancelled) return;
          const childNodes = cloneEntriesToNodes(children) as FileTreeNode[];
          restoredTree = replaceNodeChildren(restoredTree, expandedPath, childNodes);
        } catch {
          // Silently skip paths that fail to load (e.g. deleted directories)
        }
      }
      // Only mark as restored after all children loaded successfully without cancellation
      if (!cancelled) {
        treeRef.current = restoredTree;
        setTree(restoredTree);
        childrenRestoredRef.current = true;
      }
    };

    restoreChildren();
    return () => {
      cancelled = true;
    };
  }, [rootFiles, rootPath, loadChildren, shouldLogDiagnostics, shouldEmitRuntimeDiagnostics]);

  useEffect(() => {
    if (
      !shouldRecoverRootFileList({
        hasRootPath: Boolean(rootPath),
        isRootLoading,
        isRootError,
        rootFileCount: rootFiles?.length ?? null,
        alreadyRecovered: rootPath ? rootRecoveryTrackerRef.current.has(rootPath) : false,
      })
    ) {
      return;
    }

    const targetRootPath = rootPath as string;
    rootRecoveryTrackerRef.current.mark(targetRootPath);

    const recoveredGitRoot =
      resolveFileListGitRoot(targetRootPath, targetRootPath) ?? targetRootPath;
    logFileTreeDiagnostics(
      'root-query:recover:start',
      {
        rootPath: targetRootPath,
        isRootError,
        rootFileCount: rootFiles?.length ?? null,
      },
      shouldLogDiagnostics
    );
    emitFileTreeRuntimeDiagnostics(
      'root-query:recover:start',
      {
        rootPath: targetRootPath,
        isRootError,
        rootFileCount: rootFiles?.length ?? null,
      },
      shouldEmitRuntimeDiagnostics
    );

    let cancelled = false;

    const recoverRootFiles = async () => {
      try {
        const files = await window.electronAPI.file.list(targetRootPath, recoveredGitRoot);
        if (cancelled) {
          return;
        }

        queryClient.setQueryData(['file', 'list', targetRootPath], files);

        logFileTreeDiagnostics(
          'root-query:recover:success',
          {
            rootPath: targetRootPath,
            count: files.length,
          },
          shouldLogDiagnostics
        );
        emitFileTreeRuntimeDiagnostics(
          'root-query:recover:success',
          {
            rootPath: targetRootPath,
            count: files.length,
          },
          shouldEmitRuntimeDiagnostics
        );
      } catch (error) {
        if (!cancelled) {
          rootRecoveryTrackerRef.current.clear(targetRootPath);
        }
        logFileTreeDiagnostics(
          'root-query:recover:error',
          {
            rootPath: targetRootPath,
            message: error instanceof Error ? error.message : String(error),
          },
          shouldLogDiagnostics
        );
        emitFileTreeRuntimeDiagnostics(
          'root-query:recover:error',
          {
            rootPath: targetRootPath,
            message: error instanceof Error ? error.message : String(error),
          },
          shouldEmitRuntimeDiagnostics
        );
      }
    };

    void recoverRootFiles();

    return () => {
      cancelled = true;
    };
  }, [
    queryClient,
    rootFiles,
    rootPath,
    isRootLoading,
    isRootError,
    shouldLogDiagnostics,
    shouldEmitRuntimeDiagnostics,
  ]);

  // Toggle directory expansion
  const toggleExpand = useCallback(
    async (path: string) => {
      // Special case: collapse all
      if (path === '__COLLAPSE_ALL__') {
        setAndPersistExpandedPaths(new Set());
        return;
      }

      const newExpanded = new Set(expandedPathsRef.current);

      if (newExpanded.has(path)) {
        // Collapse: remove this path and all its expanded descendants so that
        // no orphaned child paths remain in localStorage. This prevents the
        // inconsistency where a child appears "expanded" (arrow icon) but has
        // no content after the parent is re-opened following a repo switch.
        for (const p of [...newExpanded]) {
          if (p === path || p.startsWith(`${path}/`)) {
            newExpanded.delete(p);
          }
        }
        setAndPersistExpandedPaths(newExpanded);
      } else {
        const targetNode = findNodeByPath(treeRef.current, path);
        const needsLoad = Boolean(targetNode?.isDirectory && !targetNode.children);

        newExpanded.add(path);
        expandedPathsRef.current = newExpanded; // Sync ref immediately
        setAndPersistExpandedPaths(newExpanded);

        if (needsLoad) {
          setTree((current) => {
            const nextTree = setNodeLoadingState(current, path, true) as FileTreeNode[];
            treeRef.current = nextTree;
            return nextTree;
          });

          try {
            const children = await loadChildren(path);
            const allPaths = [path];
            const finalChildren = cloneEntriesToNodes(children) as FileTreeNode[];

            if (children.length === 1 && children[0].isDirectory) {
              const loadChain = async (dirPath: string): Promise<FileTreeNode[]> => {
                const dirChildren = await loadChildren(dirPath);
                allPaths.push(dirPath);

                const childNodes = cloneEntriesToNodes(dirChildren) as FileTreeNode[];

                if (dirChildren.length === 1 && dirChildren[0].isDirectory) {
                  childNodes[0].children = await loadChain(dirChildren[0].path);
                }

                return childNodes;
              };

              finalChildren[0].children = await loadChain(children[0].path);
            }

            const nextExpanded = new Set(expandedPathsRef.current);
            for (const p of allPaths) nextExpanded.add(p);
            expandedPathsRef.current = nextExpanded; // Sync ref immediately
            setAndPersistExpandedPaths(nextExpanded);

            const newTree = replaceNodeChildren(
              treeRef.current,
              path,
              finalChildren
            ) as FileTreeNode[];
            treeRef.current = newTree; // Sync ref immediately
            setTree(newTree);
          } catch (error) {
            const rolled = new Set(expandedPathsRef.current);
            rolled.delete(path);
            setAndPersistExpandedPaths(rolled);
            setTree((current) => {
              const nextTree = setNodeLoadingState(current, path, false) as FileTreeNode[];
              treeRef.current = nextTree;
              return nextTree;
            });
            console.error('Failed to load directory children:', error);
          }
        }
      }
    },
    [loadChildren, setAndPersistExpandedPaths]
  );

  // Recursively refresh the children of a directory in the tree.
  const refreshNodeChildren = useCallback(
    async (targetPath: string) => {
      try {
        const resolvedTargetPath = resolveFileListPath(targetPath, rootPath) ?? targetPath;
        const resolvedGitRoot = resolveFileListGitRoot(targetPath, rootPath);
        logFileTreeDiagnostics(
          'refresh-node:start',
          { targetPath, rootPath, resolvedTargetPath, resolvedGitRoot },
          shouldLogDiagnostics
        );
        const newChildren = await window.electronAPI.file.list(resolvedTargetPath, resolvedGitRoot);
        logFileTreeDiagnostics(
          'refresh-node:success',
          { targetPath, rootPath, resolvedTargetPath, resolvedGitRoot, count: newChildren.length },
          shouldLogDiagnostics
        );
        queryClient.setQueryData(['file', 'list', resolvedTargetPath], newChildren);

        setTree((current) => {
          const targetNode = findNodeByPath(current, targetPath);
          const previousChildren = targetNode?.children ?? [];
          const mergedChildren = mergeNodesPreservingState(
            newChildren,
            previousChildren
          ) as FileTreeNode[];
          const nextTree = replaceNodeChildren(
            current,
            targetPath,
            mergedChildren
          ) as FileTreeNode[];
          treeRef.current = nextTree;
          return nextTree;
        });
      } catch (error) {
        // Directory was deleted - remove from expanded paths and tree
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          queryClient.removeQueries({ queryKey: ['file', 'list', targetPath] });
          // Compute next set outside updater to avoid side effects inside pure function
          const next = new Set(expandedPathsRef.current);
          for (const p of expandedPathsRef.current) {
            if (p === targetPath || p.startsWith(`${targetPath}/`)) {
              next.delete(p);
            }
          }
          setAndPersistExpandedPaths(next);
        }
      }
    },
    [queryClient, rootPath, setAndPersistExpandedPaths, shouldLogDiagnostics]
  );

  const shouldWatch = shouldWatchFileTree({
    rootPath,
    enabled,
    isActive,
    shouldPoll,
  });
  const previousWatchStateRef = useRef<FileTreeWatchStateSnapshot>({
    rootPath: undefined,
    shouldWatch: false,
    isActive: false,
    shouldPoll: false,
    updatedAt: 0,
  });

  const refresh = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['file', 'list'] });
    await queryClient.refetchQueries({ queryKey: ['file', 'list', rootPath] });
    const currentExpanded = Array.from(expandedPathsRef.current);
    await Promise.all(
      currentExpanded.filter((path) => path !== rootPath).map((path) => refreshNodeChildren(path))
    );
  }, [queryClient, rootPath, refreshNodeChildren]);

  // File watch effect - only watch while the file tree is active and the window is not idle
  useEffect(() => {
    const nextWatchState: FileTreeWatchStateSnapshot = {
      rootPath,
      shouldWatch,
      isActive,
      shouldPoll,
      updatedAt: Date.now(),
    };
    const previousWatchState = previousWatchStateRef.current;
    previousWatchStateRef.current = nextWatchState;

    if (!rootPath || !shouldWatch) return;

    window.electronAPI.file.watchStart(rootPath);

    if (shouldRefreshFileTreeOnWatchResume(previousWatchState, nextWatchState)) {
      void refresh();
    }

    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingEvents: FileTreeWatchEvent[] = [];
    let flushQueue = Promise.resolve();

    const flushPendingEvents = async () => {
      flushTimer = null;
      const queuedEvents = pendingEvents;
      pendingEvents = [];
      if (queuedEvents.length === 0) {
        return;
      }

      const refreshPlan = buildFileTreeWatchRefreshPlan({
        rootPath,
        expandedPaths: expandedPathsRef.current,
        events: queuedEvents,
      });

      for (const invalidatePath of refreshPlan.invalidateQueryPaths) {
        queryClient.removeQueries({ queryKey: ['file', 'list', invalidatePath] });
      }

      if (refreshPlan.shouldRefetchRoot) {
        await queryClient.refetchQueries({ queryKey: ['file', 'list', rootPath] });
      }

      await Promise.all(refreshPlan.refreshNodePaths.map((path) => refreshNodeChildren(path)));
    };

    const scheduleFlush = () => {
      if (flushTimer !== null) {
        return;
      }

      flushTimer = setTimeout(() => {
        flushQueue = flushQueue.then(flushPendingEvents).catch((error) => {
          console.error('[file-tree] Failed to process watch batch', error);
        });
      }, FILE_TREE_WATCH_BATCH_MS);
    };

    const unsubscribe = window.electronAPI.file.onChange((event) => {
      pendingEvents.push(event);
      scheduleFlush();
    });

    return () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingEvents = [];
      unsubscribe();
      window.electronAPI.file.watchStop(rootPath);
    };
  }, [queryClient, refresh, refreshNodeChildren, rootPath, shouldWatch, isActive, shouldPoll]);

  // File operations
  const createFile = useCallback(
    async (path: string, content = '') => {
      await window.electronAPI.file.createFile(path, content);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const createDirectory = useCallback(
    async (path: string) => {
      await window.electronAPI.file.createDirectory(path);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const renameItem = useCallback(
    async (fromPath: string, toPath: string) => {
      await window.electronAPI.file.rename(fromPath, toPath);
      const parentPath = fromPath.substring(0, fromPath.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const deleteItem = useCallback(
    async (path: string) => {
      await window.electronAPI.file.delete(path);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  // Handle external file drop
  const handleExternalDrop = useCallback(
    async (
      files: FileList,
      targetDir: string,
      operation: 'copy' | 'move'
    ): Promise<{
      success: string[];
      failed: Array<{ path: string; error: string }>;
      conflicts?: Array<{
        path: string;
        name: string;
        sourceSize: number;
        targetSize: number;
        sourceModified: number;
        targetModified: number;
      }>;
    }> => {
      console.log('[useFileTree] handleExternalDrop', {
        filesCount: files.length,
        targetDir,
        operation,
        rootPath,
      });

      if (!rootPath) {
        console.warn('[useFileTree] No rootPath');
        return { success: [], failed: [] };
      }

      // Convert FileList to array of paths
      const sourcePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log('[useFileTree] Processing file:', {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        // Get the full path from the file using Electron's webUtils
        try {
          const filePath = window.electronAPI.utils.getPathForFile(file);
          console.log('[useFileTree] File path:', filePath);
          if (filePath) {
            sourcePaths.push(filePath);
          }
        } catch (error) {
          console.error('[useFileTree] Failed to get file path:', error);
        }
      }

      console.log('[useFileTree] Source paths:', sourcePaths);

      if (sourcePaths.length === 0) {
        console.warn('[useFileTree] No valid source paths');
        return { success: [], failed: [] };
      }

      // Check for conflicts
      console.log('[useFileTree] Checking conflicts...');
      const conflicts = await window.electronAPI.file.checkConflicts(sourcePaths, targetDir);
      console.log('[useFileTree] Conflicts:', conflicts);

      if (conflicts.length > 0) {
        // Return conflicts to be handled by the UI
        return { success: [], failed: [], conflicts };
      }

      // No conflicts, proceed with operation
      try {
        console.log('[useFileTree] Executing operation:', operation);
        if (operation === 'copy') {
          const result = await window.electronAPI.file.batchCopy(sourcePaths, targetDir, []);
          console.log('[useFileTree] Copy result:', result);
          await refresh();
          return result;
        }
        const result = await window.electronAPI.file.batchMove(sourcePaths, targetDir, []);
        console.log('[useFileTree] Move result:', result);
        await refresh();
        return result;
      } catch (error) {
        console.error('[useFileTree] Operation failed:', error);
        return {
          success: [],
          failed: sourcePaths.map((path) => ({
            path,
            error: error instanceof Error ? error.message : 'Unknown error',
          })),
        };
      }
    },
    [rootPath, refresh]
  );

  // Resolve conflicts and complete file operation
  const resolveConflictsAndContinue = useCallback(
    async (
      sourcePaths: string[],
      targetDir: string,
      operation: 'copy' | 'move',
      resolutions: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> => {
      try {
        if (operation === 'copy') {
          const result = await window.electronAPI.file.batchCopy(
            sourcePaths,
            targetDir,
            resolutions
          );
          await refresh();
          return result;
        }
        const result = await window.electronAPI.file.batchMove(sourcePaths, targetDir, resolutions);
        await refresh();
        return result;
      } catch (error) {
        console.error('Failed to resolve conflicts:', error);
        return {
          success: [],
          failed: sourcePaths.map((path) => ({
            path,
            error: error instanceof Error ? error.message : 'Unknown error',
          })),
        };
      }
    },
    [refresh]
  );

  // Reveal a file in the tree by expanding all parent directories
  const revealFile = useCallback(
    async (filePath: string) => {
      if (!rootPath || !filePath.startsWith(rootPath)) return;

      // Get relative path and split into parts
      const relativePath = filePath.slice(rootPath.length).replace(/^\//, '');
      if (!relativePath) return;

      const parts = relativePath.split('/');
      // Remove the file name, keep only directories
      parts.pop();

      if (parts.length === 0) return;

      // Build paths for each parent directory
      let currentPath = rootPath;
      const pathsToExpand: string[] = [];

      for (const part of parts) {
        currentPath = `${currentPath}/${part}`;
        // Use ref to get current expanded state (avoids stale closure)
        if (!expandedPathsRef.current.has(currentPath)) {
          pathsToExpand.push(currentPath);
        }
      }

      // Expand each path sequentially (toggleExpand handles loading)
      for (const path of pathsToExpand) {
        await toggleExpand(path);
      }
    },
    [rootPath, toggleExpand]
  );

  return {
    tree,
    isLoading: isRootLoading,
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
  };
}

export type { FileTreeNode };
