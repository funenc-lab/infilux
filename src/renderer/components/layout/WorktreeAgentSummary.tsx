import type { LiveAgentSubagent } from '@shared/types';
import { CornerDownRight, Sparkles } from 'lucide-react';
import type { Session } from '@/components/chat/SessionBar';
import { cn } from '@/lib/utils';
import { getSubagentStatusPresentation } from '@/lib/worktreeAgentSummary';

interface WorktreeAgentSummaryProps {
  session?: Session;
  subagents?: LiveAgentSubagent[];
  onSelectSession?: (sessionId: string) => void;
  onSelectSubagent?: (subagent: LiveAgentSubagent) => void;
  className?: string;
}

export function WorktreeAgentSummary({
  session,
  subagents = [],
  onSelectSession,
  onSelectSubagent,
  className,
}: WorktreeAgentSummaryProps) {
  if (!session) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-theme/10 hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onSelectSession?.(session.id);
        }}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{session.name}</span>
      </button>

      {subagents.map((subagent) =>
        (() => {
          const presentation = getSubagentStatusPresentation(subagent.status);

          return (
            <button
              key={subagent.id}
              type="button"
              title={subagent.summary}
              className={cn(
                'ml-4 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2',
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
          );
        })()
      )}
    </div>
  );
}
