import type { GitWorktree } from '@shared/types';
import { getDisplayPath, isWslUncPath } from '@shared/utils/path';
import { FolderGit2, MoreHorizontal } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { normalizePath } from '@/App/storage';
import type { TFunction } from '@/i18n';
import { cn } from '@/lib/utils';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

export interface RepositoryTreeItemRepository {
  name: string;
  path: string;
  groupId?: string;
}

interface RepositoryTreeItemProps {
  repo: RepositoryTreeItemRepository;
  originalIndex: number;
  sectionGroupId?: string;
  selectedRepo: string | null;
  allRepoWorktreesMap: Record<string, GitWorktree[]>;
  activePathSet: Set<string>;
  searchQuery: string;
  dropTargetIndex: number | null;
  draggedIndex: number | null;
  onDragStart: (event: DragEvent, index: number, repo: RepositoryTreeItemRepository) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent, index: number, targetGroupId?: string) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent, index: number, targetGroupId?: string) => void;
  onContextMenu: (event: MouseEvent, repo: RepositoryTreeItemRepository) => void;
  onSelectRepo: (
    repoPath: string,
    options?: {
      activateRemote?: boolean;
    }
  ) => void;
  onOpenActions: (event: MouseEvent<HTMLButtonElement>, repo: RepositoryTreeItemRepository) => void;
  t: TFunction;
}

export function RepositoryTreeItem({
  repo,
  originalIndex,
  sectionGroupId,
  selectedRepo,
  allRepoWorktreesMap,
  activePathSet,
  searchQuery,
  dropTargetIndex,
  draggedIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  onSelectRepo,
  onOpenActions,
  t,
}: RepositoryTreeItemProps) {
  const isSelected = selectedRepo === repo.path;
  const displayRepoPath = getDisplayPath(repo.path);
  const useLtrPathDisplay = isWslUncPath(displayRepoPath);
  const repoWorktrees = sanitizeGitWorktrees(allRepoWorktreesMap[repo.path] || []);
  const activeWorktreeCount = repoWorktrees.filter((worktree) =>
    activePathSet.has(normalizePath(worktree.path))
  ).length;
  const hasRepoSummary = repoWorktrees.length > 0 || activeWorktreeCount > 0;

  return (
    <div key={repo.path} className="relative">
      {dropTargetIndex === originalIndex &&
      draggedIndex !== null &&
      draggedIndex > originalIndex ? (
        <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
      ) : null}

      <div
        draggable={!searchQuery}
        onDragStart={(event) => onDragStart(event, originalIndex, repo)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOver(event, originalIndex, sectionGroupId)}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, originalIndex, sectionGroupId)}
        onContextMenu={(event) => onContextMenu(event, repo)}
        className={cn(
          'control-tree-node group relative flex w-full flex-col items-start gap-0.5 px-2 py-1 text-left transition-colors',
          draggedIndex === originalIndex && 'opacity-50'
        )}
        data-active={isSelected ? 'repo' : 'false'}
        data-selection-tone={isSelected && activeWorktreeCount > 0 ? 'context' : 'default'}
      >
        <div className="control-tree-row relative z-10">
          <button
            type="button"
            className="control-tree-primary min-w-0 flex-1 text-left outline-none"
            onClick={() => onSelectRepo(repo.path, { activateRemote: true })}
            aria-current={isSelected ? 'page' : undefined}
          >
            <div className="control-tree-primary-content">
              <span className="control-tree-glyph h-4 w-4 shrink-0">
                <FolderGit2 className="control-tree-icon h-4 w-4" />
              </span>
              <div className="control-tree-text-stack">
                <div className="flex items-center gap-1.5">
                  <span className="control-tree-title min-w-0 flex-1 truncate">{repo.name}</span>
                </div>
                <div
                  className={cn(
                    'control-tree-subtitle w-full overflow-hidden whitespace-nowrap text-ellipsis [text-align:left]',
                    useLtrPathDisplay ? '[direction:ltr]' : '[direction:rtl]'
                  )}
                  title={displayRepoPath}
                >
                  {displayRepoPath}
                </div>
                {hasRepoSummary ? (
                  <div className="control-tree-meta control-tree-meta-row">
                    {repoWorktrees.length > 0 ? (
                      <span className="control-tree-metric">
                        <span className="control-tree-metric-value">{repoWorktrees.length}</span>
                        <span className="control-tree-metric-label">trees</span>
                      </span>
                    ) : null}
                    {repoWorktrees.length > 0 && activeWorktreeCount > 0 ? (
                      <span className="control-tree-separator">·</span>
                    ) : null}
                    {activeWorktreeCount > 0 ? (
                      <span className="control-tree-metric">
                        <span className="control-tree-metric-value">{activeWorktreeCount}</span>
                        <span className="control-tree-metric-label">live</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
          <div className="control-tree-tail" data-role="action">
            <button
              type="button"
              className="control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              onClick={(event) => onOpenActions(event, repo)}
              aria-label={t('Repository actions')}
              title={t('Repository actions')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {dropTargetIndex === originalIndex &&
      draggedIndex !== null &&
      draggedIndex < originalIndex ? (
        <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
      ) : null}
    </div>
  );
}
