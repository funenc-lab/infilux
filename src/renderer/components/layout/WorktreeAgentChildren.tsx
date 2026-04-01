import type { LiveAgentSubagent } from '@shared/types';
import { ChevronRight, CornerDownRight, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@/components/chat/SessionBar';
import { cn } from '@/lib/utils';
import {
  buildVisibleWorktreeSubagentRows,
  buildWorktreeSubagentTree,
  collectExpandableSubagentThreadIds,
  getSubagentStatusPresentation,
} from '@/lib/worktreeAgentSummary';

interface WorktreeAgentChildrenProps {
  session?: Session;
  subagents?: LiveAgentSubagent[];
  selectedAgentSessionId?: string | null;
  selectedSubagentThreadId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onSelectSubagent?: (subagent: LiveAgentSubagent) => void;
  className?: string;
}

export function WorktreeAgentChildren({
  session,
  subagents = [],
  selectedAgentSessionId = null,
  selectedSubagentThreadId = null,
  onSelectSession,
  onSelectSubagent,
  className,
}: WorktreeAgentChildrenProps) {
  const subagentTree = buildWorktreeSubagentTree(subagents);
  const expandableThreadIds = useMemo(
    () => collectExpandableSubagentThreadIds(subagentTree),
    [subagentTree]
  );
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsedThreadIds((current) => {
      const next = new Set<string>();
      for (const threadId of current) {
        if (expandableThreadIds.has(threadId)) {
          next.add(threadId);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [expandableThreadIds]);

  const visibleRows = useMemo(
    () => buildVisibleWorktreeSubagentRows(subagentTree, collapsedThreadIds),
    [collapsedThreadIds, subagentTree]
  );

  if (!session) {
    return null;
  }

  const isAgentSelected = selectedAgentSessionId === session.id && !selectedSubagentThreadId;

  const toggleSubagentExpansion = (threadId: string) => {
    setCollapsedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  };

  const renderSubagentRow = ({
    item: subagent,
    depth,
    hasChildren,
    isExpanded,
  }: (typeof visibleRows)[number]) => {
    const presentation = getSubagentStatusPresentation(subagent.status);
    const isSelected = selectedSubagentThreadId === subagent.threadId;

    return (
      <div
        key={subagent.id}
        className="flex min-w-0 items-center gap-1"
        style={{ marginLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="control-tree-disclosure h-6 w-6 shrink-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse subagent children' : 'Expand subagent children'}
            onClick={(event) => {
              event.stopPropagation();
              toggleSubagentExpansion(subagent.threadId);
            }}
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-150 ease-out',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          data-worktree-child-kind="subagent"
          data-worktree-child-depth={String(depth)}
          data-selected={isSelected ? 'true' : 'false'}
          title={subagent.summary}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2',
            isSelected && 'bg-theme/12 text-foreground ring-1 ring-theme/25',
            presentation.buttonClassName
          )}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSubagent?.(subagent);
          }}
        >
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
          <span
            aria-hidden="true"
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', presentation.dotClassName)}
          />
          <span className="min-w-0 flex-1 truncate">{subagent.label}</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-[0.01em]',
              presentation.badgeClassName
            )}
          >
            {presentation.label}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1 pt-1', className)}>
      <button
        type="button"
        data-worktree-child-kind="agent"
        data-selected={isAgentSelected ? 'true' : 'false'}
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-theme/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme/30',
          isAgentSelected && 'bg-theme/12 text-foreground ring-1 ring-theme/25'
        )}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSession?.(session.id);
        }}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{session.name}</span>
      </button>

      {visibleRows.map((row) => renderSubagentRow(row))}
    </div>
  );
}
