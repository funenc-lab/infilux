import type { FileChange, FileChangeStatus } from '@shared/types';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileEdit,
  FilePlus,
  FileWarning,
  FileX,
  Folder,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SmoothCollapse } from '@/components/ui/smooth-collapse';
import { useI18n } from '@/i18n';
import { getFileStatusTextClass } from '@/lib/fileStatusTone';
import { handleKeyboardActivation } from '@/lib/keyboardActivation';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import {
  buildChangesTree,
  type ChangeTreeNode,
  collectChangesTreeFolderPaths,
} from './changesTreeModel';
import { useChangesActions } from './useChangesActions';

interface ChangesTreeProps {
  staged: FileChange[];
  trackedChanges: FileChange[];
  untrackedChanges: FileChange[];
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onDeleteUntracked?: (paths: string[]) => void;
}

// M=Modified, A=Added, D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
const statusIcons: Record<FileChangeStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FilePlus,
  X: FileWarning,
};
const CHANGE_TREE_COLLAPSE_DURATION_MS = 200;

function CollapsibleChangeTreeChildren({ open, children }: { open: boolean; children: ReactNode }) {
  const [shouldRenderChildren, setShouldRenderChildren] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRenderChildren(true);
      return;
    }

    const timer = setTimeout(
      () => setShouldRenderChildren(false),
      CHANGE_TREE_COLLAPSE_DURATION_MS
    );
    return () => clearTimeout(timer);
  }, [open]);

  if (!shouldRenderChildren) {
    return null;
  }

  return <SmoothCollapse open={open}>{children}</SmoothCollapse>;
}

interface FileTreeNodeProps {
  node: ChangeTreeNode;
  level: number;
  staged: boolean;
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onAction: (paths: string[]) => void;
  actionIcon: React.ElementType;
  actionTitle: string;
  onDiscard?: (paths: string[]) => void;
}

function FileTreeNode({
  node,
  level,
  staged,
  selectedFile,
  onFileClick,
  onAction,
  actionIcon: ActionIcon,
  actionTitle,
  onDiscard,
}: FileTreeNodeProps) {
  const { t } = useI18n();
  const isExpanded = useSourceControlStore((state) => state.expandedFolders.has(node.path));
  const toggleFolder = useSourceControlStore((state) => state.toggleFolder);

  if (node.type === 'folder') {
    const Icon = isExpanded ? FolderOpen : Folder;
    const folderPaths = node.filePaths;

    return (
      <>
        <div
          className="group flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors hover:bg-accent/50"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => toggleFolder(node.path)}
          onKeyDown={(event) => handleKeyboardActivation(event, () => toggleFolder(node.path))}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              isExpanded && 'rotate-90'
            )}
          />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={node.path}>
            {node.name}
          </span>

          {/* Folder action buttons */}
          <div className="hidden shrink-0 items-center group-hover:flex">
            {onDiscard && (
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard(folderPaths);
                }}
                title={t('Discard changes')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAction(folderPaths);
              }}
              title={actionTitle}
            >
              <ActionIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {node.children && (
          <CollapsibleChangeTreeChildren open={isExpanded}>
            {node.children.map((child) => (
              <MemoizedFileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
                staged={staged}
                selectedFile={selectedFile}
                onFileClick={onFileClick}
                onAction={onAction}
                actionIcon={ActionIcon}
                actionTitle={actionTitle}
                onDiscard={onDiscard}
              />
            ))}
          </CollapsibleChangeTreeChildren>
        )}
      </>
    );
  }

  // File node
  const file = node.file!;
  const Icon = statusIcons[file.status];
  const isSelected = selectedFile?.path === file.path && selectedFile?.staged === staged;

  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
      onClick={() => onFileClick({ path: file.path, staged })}
      onKeyDown={(event) =>
        handleKeyboardActivation(event, () => onFileClick({ path: file.path, staged }))
      }
      role="button"
      tabIndex={0}
    >
      <div className="h-3.5 w-3.5 shrink-0" />
      <Icon
        className={cn('h-4 w-4 shrink-0', isSelected ? '' : getFileStatusTextClass(file.status))}
      />

      <span
        className={cn(
          'shrink-0 font-mono text-xs',
          isSelected ? '' : getFileStatusTextClass(file.status)
        )}
      >
        {file.status}
      </span>

      <span className="min-w-0 flex-1 truncate" title={file.path}>
        {node.name}
      </span>

      {/* Action buttons */}
      <div className="hidden shrink-0 items-center group-hover:flex">
        {onDiscard && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard([file.path]);
            }}
            title={t('Discard changes')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onAction([file.path]);
          }}
          title={actionTitle}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const MemoizedFileTreeNode = memo(FileTreeNode);

export function ChangesTree({
  staged,
  trackedChanges,
  untrackedChanges,
  selectedFile,
  onFileClick,
  onStage,
  onUnstage,
  onDiscard,
  onDeleteUntracked,
}: ChangesTreeProps) {
  const { t } = useI18n();
  const expandedFolders = useSourceControlStore((state) => state.expandedFolders);
  const setFoldersExpanded = useSourceControlStore((state) => state.setFoldersExpanded);
  const stagedTree = useMemo(() => buildChangesTree(staged), [staged]);
  const trackedTree = useMemo(() => buildChangesTree(trackedChanges), [trackedChanges]);
  const untrackedTree = useMemo(() => buildChangesTree(untrackedChanges), [untrackedChanges]);

  // Collect all folder paths from all trees
  const allFolderPaths = useMemo(() => {
    const folders = collectChangesTreeFolderPaths(stagedTree);
    for (const folder of collectChangesTreeFolderPaths(trackedTree)) {
      folders.add(folder);
    }
    for (const folder of collectChangesTreeFolderPaths(untrackedTree)) {
      folders.add(folder);
    }
    return folders;
  }, [stagedTree, trackedTree, untrackedTree]);

  const allExpanded = useMemo(() => {
    if (allFolderPaths.size === 0) return false;
    for (const folder of allFolderPaths) {
      if (!expandedFolders.has(folder)) return false;
    }
    return true;
  }, [allFolderPaths, expandedFolders]);

  // Use shared hook for batch operations
  const {
    handleUnstageAll,
    handleStageTracked,
    handleDiscardTracked,
    handleStageUntracked,
    handleDeleteAllUntracked,
  } = useChangesActions({
    staged,
    trackedChanges,
    untrackedChanges,
    onStage,
    onUnstage,
    onDiscard,
    onDeleteUntracked,
  });

  const handleToggleAll = useCallback(() => {
    setFoldersExpanded(allFolderPaths, !allExpanded);
  }, [allExpanded, allFolderPaths, setFoldersExpanded]);

  const isEmpty =
    staged.length === 0 && trackedChanges.length === 0 && untrackedChanges.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center text-muted-foreground">
        <p className="text-sm">{t('No changes')}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 py-2">
        {/* Collapse/Expand All Button */}
        {allFolderPaths.size > 0 && (
          <div className="flex justify-end px-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleToggleAll}
              title={allExpanded ? t('Collapse all folders') : t('Expand all folders')}
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  {t('Collapse all')}
                </>
              ) : (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  {t('Expand all')}
                </>
              )}
            </button>
          </div>
        )}

        {/* Staged Changes */}
        {staged.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('Staged changes ({{count}})', { count: staged.length })}
              </h3>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleUnstageAll}
              >
                {t('Unstage all')}
              </button>
            </div>
            <div className="space-y-0.5">
              {stagedTree.map((node) => (
                <MemoizedFileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={true}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={onUnstage}
                  actionIcon={Minus}
                  actionTitle={t('Unstage')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tracked Changes */}
        {trackedChanges.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('Changes ({{count}})', { count: trackedChanges.length })}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleDiscardTracked}
                  title={t('Discard all changes')}
                >
                  {t('Discard all')}
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleStageTracked}
                >
                  {t('Stage all')}
                </button>
              </div>
            </div>
            <div className="space-y-0.5">
              {trackedTree.map((node) => (
                <MemoizedFileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={false}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={onStage}
                  actionIcon={Plus}
                  actionTitle={t('Stage')}
                  onDiscard={onDiscard}
                />
              ))}
            </div>
          </div>
        )}

        {/* Untracked Changes */}
        {untrackedChanges.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('Untracked changes ({{count}})', { count: untrackedChanges.length })}
              </h3>
              <div className="flex items-center gap-2">
                {onDeleteUntracked && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleDeleteAllUntracked}
                    title={t('Delete all untracked files')}
                  >
                    {t('Delete all')}
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleStageUntracked}
                >
                  {t('Stage all')}
                </button>
              </div>
            </div>
            <div className="space-y-0.5">
              {untrackedTree.map((node) => (
                <MemoizedFileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={false}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={onStage}
                  actionIcon={Plus}
                  actionTitle={t('Stage')}
                  onDiscard={onDeleteUntracked}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
