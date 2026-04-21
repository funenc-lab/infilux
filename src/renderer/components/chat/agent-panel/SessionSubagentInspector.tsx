import type { AgentSubagentTranscriptEntry, LiveAgentSubagent } from '@shared/types';
import { Bot, TerminalSquare, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSubagentTranscript } from '@/hooks/useSubagentTranscript';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { getSubagentStatusPresentation } from '@/lib/worktreeAgentSummary';
import type { SessionSubagentViewState } from '../sessionSubagentState';

const DEFAULT_VISIBLE_ENTRY_COUNT = 60;
const VISIBLE_ENTRY_STEP = 40;

interface SessionSubagentInspectorProps {
  sessionName: string;
  agentLabel: string;
  viewState: SessionSubagentViewState;
  subagents: LiveAgentSubagent[];
  selectedThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
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

function buildTranscriptWindow(totalEntries: number, requestedVisibleCount: number) {
  const visibleCount = Math.min(Math.max(0, requestedVisibleCount), Math.max(0, totalEntries));
  const startIndex = Math.max(0, totalEntries - visibleCount);

  return {
    visibleCount,
    startIndex,
    endIndex: totalEntries,
    hiddenOlderCount: startIndex,
    hasHiddenOlder: startIndex > 0,
  };
}

function getInspectorCopy(
  viewState: SessionSubagentViewState,
  agentLabel: string,
  t: (key: string) => string
): {
  title: string;
  description: string;
} {
  if (viewState.kind === 'pending') {
    if (viewState.reason === 'session-not-ready') {
      return {
        title: t('Subagents are not ready yet'),
        description: t('Run this session once before opening its subagent window.'),
      };
    }

    return {
      title: t('Subagent session is still resolving'),
      description: t('Wait for the provider session id to be captured, then try again.'),
    };
  }

  if (viewState.kind === 'unsupported') {
    if (viewState.reason === 'remote-provider-not-supported') {
      return {
        title: t('Subagent tracking is local-only right now'),
        description: t(
          'This agent tool can open subagents, but the current remote session is not trackable yet.'
        ),
      };
    }

    return {
      title: t('Subagents are not available for this tool'),
      description: `${agentLabel} ${t('does not expose subagent tracking in Infilux yet.')}`,
    };
  }

  return {
    title: t('No active subagents'),
    description: t('This session has not spawned any live subagents yet.'),
  };
}

export function SessionSubagentInspector({
  sessionName,
  agentLabel,
  viewState,
  subagents,
  selectedThreadId = null,
  onSelectThread,
  onClose,
}: SessionSubagentInspectorProps) {
  const { t } = useI18n();
  const selectedSubagent = useMemo(
    () =>
      subagents.find((subagent) => subagent.threadId === selectedThreadId) ?? subagents[0] ?? null,
    [selectedThreadId, subagents]
  );
  const { data, isLoading, error } = useSubagentTranscript(
    viewState.kind === 'supported' ? selectedSubagent : null
  );
  const transcriptIdentity = data?.threadId ?? selectedSubagent?.threadId ?? null;
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_ENTRY_COUNT);

  useEffect(() => {
    if (viewState.kind !== 'supported' || subagents.length === 0) {
      return;
    }

    if (
      !selectedThreadId ||
      !subagents.some((subagent) => subagent.threadId === selectedThreadId)
    ) {
      onSelectThread(subagents[0]!.threadId);
    }
  }, [onSelectThread, selectedThreadId, subagents, viewState.kind]);

  useEffect(() => {
    if (transcriptIdentity === null) {
      setVisibleCount(DEFAULT_VISIBLE_ENTRY_COUNT);
      return;
    }

    setVisibleCount(DEFAULT_VISIBLE_ENTRY_COUNT);
  }, [transcriptIdentity]);

  const allEntries = data?.entries ?? [];
  const windowState = useMemo(
    () => buildTranscriptWindow(allEntries.length, visibleCount),
    [allEntries.length, visibleCount]
  );
  const entries = useMemo(
    () => allEntries.slice(windowState.startIndex, windowState.endIndex),
    [allEntries, windowState.endIndex, windowState.startIndex]
  );
  const copy = getInspectorCopy(viewState, agentLabel, t);

  return (
    <div className="absolute inset-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/96 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('Subagents')}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{sessionName}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {viewState.kind === 'supported'
              ? t('Live subagents spawned from the current agent session.')
              : copy.description}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('Close subagent window')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {viewState.kind === 'supported' && subagents.length > 0 ? (
        <div className="border-b border-border/70 px-3 py-2">
          <div
            role="tablist"
            aria-label={t('Session subagents')}
            className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {subagents.map((subagent) => {
              const presentation = getSubagentStatusPresentation(subagent.status);
              const isActive = subagent.threadId === selectedSubagent?.threadId;

              return (
                <button
                  key={subagent.threadId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={subagent.summary}
                  className={cn(
                    'control-panel-muted flex min-w-0 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                    isActive &&
                      'border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/30',
                    !isActive && presentation.buttonClassName
                  )}
                  onClick={() => onSelectThread(subagent.threadId)}
                >
                  <span
                    aria-hidden="true"
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', presentation.dotClassName)}
                  />
                  <span className="max-w-44 truncate text-sm font-medium">{subagent.label}</span>
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
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {viewState.kind !== 'supported' ? (
          <div
            data-session-subagent-empty-state={viewState.kind}
            className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4"
          >
            <div className="text-sm font-semibold text-foreground">{copy.title}</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">{copy.description}</div>
          </div>
        ) : null}

        {viewState.kind === 'supported' && subagents.length === 0 ? (
          <div
            data-session-subagent-empty-state="empty"
            className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4"
          >
            <div className="text-sm font-semibold text-foreground">{copy.title}</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">{copy.description}</div>
          </div>
        ) : null}

        {viewState.kind === 'supported' && subagents.length > 0 ? (
          <>
            {isLoading ? (
              <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                {t('Loading transcript...')}
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {!isLoading && !error && entries.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                {t('No transcript entries were found for this subagent.')}
              </div>
            ) : null}

            {!isLoading && !error && data?.truncated ? (
              <div className="mb-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                {t(
                  'Showing the latest transcript entries. Older entries were omitted to keep long sessions responsive.'
                )}
              </div>
            ) : null}

            {!isLoading && !error && windowState.hasHiddenOlder ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-panel/40 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  {t('Showing the latest')} {windowState.visibleCount} {t('entries.')}{' '}
                  {windowState.hiddenOlderCount} {t('older entries are hidden.')}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleCount((current) =>
                        Math.min(allEntries.length, current + VISIBLE_ENTRY_STEP)
                      )
                    }
                  >
                    {t('Show older')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleCount(allEntries.length)}
                  >
                    {t('Show all')}
                  </Button>
                </div>
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
                        <span className="truncate normal-case tracking-normal">
                          {entry.toolName}
                        </span>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
