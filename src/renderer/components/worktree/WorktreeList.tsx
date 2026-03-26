import type { GitStatus, GitWorktree } from '@shared/types';
import { GitBranch } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { WorktreeCard } from './WorktreeCard';

interface WorktreeListProps {
  worktrees: GitWorktree[];
  statusMap?: Map<string, GitStatus>;
  activeWorktreePath?: string | null;
  isLoading?: boolean;
  onSelect?: (worktree: GitWorktree) => void;
  onOpenTerminal?: (worktree: GitWorktree) => void;
  onOpenInFinder?: (worktree: GitWorktree) => void;
  onCopyPath?: (worktree: GitWorktree) => void;
  onRemove?: (worktree: GitWorktree) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function WorktreeList({
  worktrees,
  statusMap,
  activeWorktreePath,
  isLoading,
  onSelect,
  onOpenTerminal,
  onOpenInFinder,
  onCopyPath,
  onRemove,
  onReorder,
}: WorktreeListProps) {
  const { t } = useI18n();

  // Drag reorder
  const draggedIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, worktree: GitWorktree) => {
      draggedIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Create styled drag image
      const dragImage = document.createElement('div');
      dragImage.textContent = worktree.branch || worktree.path.split(/[\\/]/).pop() || '';
      dragImage.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        padding: 8px 12px;
        background-color: var(--accent);
        color: var(--accent-foreground);
        font-size: 14px;
        font-weight: 500;
        border-radius: 8px;
        white-space: nowrap;
        pointer-events: none;
      `;
      document.body.appendChild(dragImage);
      dragImageRef.current = dragImage;
      e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedIndexRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorder) {
        onReorder(fromIndex, toIndex);
      }
    },
    [onReorder]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <WorktreeCardSkeleton key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  if (worktrees.length === 0) {
    return (
      <ControlStateCard
        icon={<GitBranch className="h-5 w-5" />}
        eyebrow={t('Choose Worktree')}
        title={t('No worktrees')}
        description={t('Click the button in the top right to create your first worktree')}
        className="px-0 pb-0 pt-0"
        cardClassName="max-w-[min(54rem,100%)]"
      />
    );
  }

  return (
    <div className="space-y-3">
      {worktrees.map((worktree, index) => (
        <WorktreeCard
          key={worktree.path}
          worktree={worktree}
          status={statusMap?.get(worktree.path)}
          isActive={activeWorktreePath === worktree.path}
          onSelect={onSelect}
          onOpenTerminal={onOpenTerminal}
          onOpenInFinder={onOpenInFinder}
          onCopyPath={onCopyPath}
          onRemove={onRemove}
          draggable={!!onReorder}
          onDragStart={(e) => handleDragStart(e, index, worktree)}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
        />
      ))}
    </div>
  );
}

function WorktreeCardSkeleton() {
  return (
    <div className="control-panel rounded-xl p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mt-2 h-4 w-48" />
      <Skeleton className="mt-3 h-3 w-24" />
    </div>
  );
}
