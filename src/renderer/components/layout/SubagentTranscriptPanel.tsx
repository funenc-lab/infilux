import type { AgentSubagentTranscriptEntry, LiveAgentSubagent } from '@shared/types';
import { Bot, TerminalSquare, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubagentTranscript } from '@/hooks/useSubagentTranscript';
import { cn } from '@/lib/utils';

interface SubagentTranscriptPanelProps {
  subagent: LiveAgentSubagent;
  onClose: () => void;
}

function formatEntryTime(timestamp: number): string {
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

function getEntryPresentation(entry: AgentSubagentTranscriptEntry): {
  icon: typeof User;
  label: string;
  className: string;
} {
  if (entry.kind === 'tool_call') {
    return {
      icon: TerminalSquare,
      label: 'Tool',
      className: 'border-border/80 bg-muted/35',
    };
  }

  if (entry.role === 'user') {
    return {
      icon: User,
      label: 'Task',
      className: 'border-border/80 bg-muted/45',
    };
  }

  return {
    icon: Bot,
    label:
      entry.phase === 'final_answer'
        ? 'Final'
        : entry.phase === 'commentary'
          ? 'Update'
          : 'Assistant',
    className:
      entry.phase === 'final_answer'
        ? 'border-theme/25 bg-theme/10'
        : 'border-border/80 bg-panel/70',
  };
}

export function SubagentTranscriptPanel({ subagent, onClose }: SubagentTranscriptPanelProps) {
  const { data, isLoading, error } = useSubagentTranscript(subagent);
  const entries = data?.entries ?? [];

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/96 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Subagent Transcript
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {data?.label ?? subagent.label}
            </span>
            <span className="shrink-0 rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 text-[10px] text-muted-foreground">
              {subagent.status}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {data?.cwd ?? subagent.cwd}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close subagent transcript"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Loading transcript...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && entries.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            No transcript entries were found for this subagent.
          </div>
        ) : null}

        <div className="space-y-3">
          {entries.map((entry) => {
            const presentation = getEntryPresentation(entry);
            const Icon = presentation.icon;

            return (
              <section
                key={entry.id}
                className={cn(
                  'rounded-2xl border px-4 py-3 shadow-sm shadow-black/5',
                  presentation.className
                )}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{presentation.label}</span>
                  {entry.toolName ? (
                    <span className="truncate normal-case tracking-normal">{entry.toolName}</span>
                  ) : null}
                  {entry.timestamp ? (
                    <span className="ml-auto shrink-0 normal-case tracking-normal">
                      {formatEntryTime(entry.timestamp)}
                    </span>
                  ) : null}
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-foreground">
                  {entry.text}
                </pre>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
