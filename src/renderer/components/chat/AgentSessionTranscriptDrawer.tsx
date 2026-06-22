import { ArrowDownToLine, Copy, Download, FileText, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentReplaySnapshotStore } from './agentReplaySnapshotStore';
import {
  type AgentSessionTranscriptView,
  buildAgentSessionTranscriptView,
} from './agentSessionTranscriptModel';
import type { Session } from './SessionBar';

type AgentSessionTranscriptSession = Pick<
  Session,
  'id' | 'name' | 'replaySnapshot' | 'replaySnapshotCapturedAt'
>;

interface AgentSessionTranscriptDrawerProps {
  open: boolean;
  replaySnapshotStore?: AgentReplaySnapshotStore;
  session: AgentSessionTranscriptSession | null;
  onOpenChange: (open: boolean) => void;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatSnapshotCapturedAt(timestamp?: number): string | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
}

function buildTranscriptFileName(session: AgentSessionTranscriptSession): string {
  const safeName =
    session.name
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'agent-session';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return `${safeName}-${timestamp}.txt`;
}

function downloadTranscriptSnapshot(fileName: string, snapshot: string): void {
  const blob = new Blob([snapshot], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function getTranscriptRangeLabel(view: AgentSessionTranscriptView, t: Translate): string {
  if (view.mode === 'search') {
    return t('{{count}} matches', { count: formatCount(view.matchCount) });
  }

  if (!view.hasSnapshot) {
    return t('{{count}} lines', { count: 0 });
  }

  return t('Lines {{start}}-{{end}} of {{total}}', {
    end: formatCount(view.visibleLineEnd),
    start: formatCount(view.visibleLineStart),
    total: formatCount(view.totalLines),
  });
}

function TranscriptLine({ lineNumber, text }: { lineNumber: number; text: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] border-b border-border/30 last:border-b-0">
      <span className="select-none border-r border-border/30 bg-muted/18 px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground">
        {lineNumber}
      </span>
      <code className="min-w-0 whitespace-pre-wrap break-words px-3 py-1 text-[12px] leading-5 text-foreground/92">
        {text.length > 0 ? text : ' '}
      </code>
    </div>
  );
}

export function AgentSessionTranscriptDrawer({
  open,
  replaySnapshotStore,
  session,
  onOpenChange,
}: AgentSessionTranscriptDrawerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const sessionId = session?.id ?? null;
  const subscribeToLiveSnapshot = useCallback(
    (onStoreChange: () => void) =>
      replaySnapshotStore && sessionId
        ? replaySnapshotStore.subscribe(sessionId, onStoreChange)
        : () => undefined,
    [replaySnapshotStore, sessionId]
  );
  const getLiveSnapshot = useCallback(
    () =>
      replaySnapshotStore && sessionId ? replaySnapshotStore.getSnapshot(sessionId) : undefined,
    [replaySnapshotStore, sessionId]
  );
  const liveSnapshot = useSyncExternalStore(
    subscribeToLiveSnapshot,
    getLiveSnapshot,
    getLiveSnapshot
  );
  const snapshot =
    liveSnapshot !== undefined
      ? (liveSnapshot.replaySnapshot ?? '')
      : (session?.replaySnapshot ?? '');
  const view = useMemo(
    () => buildAgentSessionTranscriptView({ query, snapshot }),
    [query, snapshot]
  );
  const capturedAtLabel = formatSnapshotCapturedAt(
    liveSnapshot !== undefined
      ? liveSnapshot.replaySnapshotCapturedAt
      : session?.replaySnapshotCapturedAt
  );
  const rangeLabel = getTranscriptRangeLabel(view, t);
  const hasSnapshot = view.hasSnapshot && snapshot.length > 0;
  const hasVisibleLines = view.visibleLines.length > 0;

  useEffect(() => {
    if (open || sessionId === null) {
      setQuery('');
    }
  }, [open, sessionId]);

  const handleCopy = useCallback(async () => {
    if (!session || !hasSnapshot) {
      return;
    }

    try {
      await navigator.clipboard.writeText(snapshot);
      toastManager.add({
        type: 'success',
        title: t('Copied'),
        description: t('Copied to clipboard'),
      });
    } catch {
      toastManager.add({
        type: 'error',
        title: t('Copy failed'),
        description: t('Unable to copy transcript output.'),
      });
    }
  }, [hasSnapshot, session, snapshot, t]);

  const handleExport = useCallback(() => {
    if (!session || !hasSnapshot) {
      return;
    }

    try {
      downloadTranscriptSnapshot(buildTranscriptFileName(session), snapshot);
    } catch {
      toastManager.add({
        type: 'error',
        title: t('Export failed'),
        description: t('Unable to export transcript output.'),
      });
    }
  }, [hasSnapshot, session, snapshot, t]);

  const handleJumpToLatest = useCallback(() => {
    setQuery('');
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup
        side="right"
        className="w-[min(48rem,calc(100vw-1rem))] max-w-[48rem] border-s border-border/70 bg-[color:var(--theme-popover-base)] shadow-[0_24px_64px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
      >
        <SheetHeader className="border-b border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--control-surface-muted)_62%,var(--background)_38%)_0%,color-mix(in_oklch,var(--control-surface)_36%,transparent)_100%)]">
          <div className="flex min-w-0 items-start gap-3 pe-10">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-muted-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <SheetTitle className="ui-type-title-lg min-w-0">{t('Transcript')}</SheetTitle>
                <span className="control-chip shrink-0">{t('Latest retained output')}</span>
              </div>
              <SheetDescription className="max-w-[38rem] text-muted-foreground/84">
                {session
                  ? `${session.name} / ${rangeLabel}`
                  : t('No active agent session selected.')}
              </SheetDescription>
              <div className="flex min-w-0 flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="control-chip">
                  {t('{{count}} lines', { count: formatCount(view.totalLines) })}
                </span>
                <span className="control-chip">
                  {t('{{count}} chars', { count: formatCount(view.totalCharacters) })}
                </span>
                {capturedAtLabel ? <span className="control-chip">{capturedAtLabel}</span> : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        <SheetPanel scrollFade={false} className="space-y-4 pb-4">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="control-input flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/72"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search terminal output')}
                aria-label={t('Search terminal output')}
                disabled={!hasSnapshot}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-lg px-3"
              onClick={handleJumpToLatest}
              disabled={!query}
              title={t('Latest retained output')}
            >
              <ArrowDownToLine className="h-4 w-4" />
              <span>{t('Latest')}</span>
            </Button>
          </div>

          {view.omittedOlderLineCount > 0 || view.omittedSearchResultCount > 0 ? (
            <div className="rounded-lg border border-border/70 bg-muted/16 px-3 py-2 text-xs text-muted-foreground">
              {view.mode === 'search'
                ? t('{{count}} older matches are omitted from this view.', {
                    count: formatCount(view.omittedSearchResultCount),
                  })
                : t('{{count}} older retained lines are omitted from this view.', {
                    count: formatCount(view.omittedOlderLineCount),
                  })}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/70 bg-[color:color-mix(in_oklch,var(--background)_78%,var(--control-surface)_22%)]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{rangeLabel}</span>
              <span>{t('Showing the latest')}</span>
            </div>
            {hasVisibleLines ? (
              <div
                className={cn(
                  'max-h-[calc(100vh-18rem)] min-h-64 overflow-auto font-mono',
                  'bg-[color:color-mix(in_oklch,var(--background)_86%,black_14%)]'
                )}
                data-agent-session-transcript-lines={view.visibleLines.length}
              >
                {view.visibleLines.map((line) => (
                  <TranscriptLine key={line.lineNumber} {...line} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/72" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {hasSnapshot
                    ? t('No matching retained output')
                    : t('No retained terminal output yet')}
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {hasSnapshot
                    ? t('Adjust the search query to inspect this retained transcript.')
                    : t('Run the session or wait for output before opening the transcript.')}
                </p>
              </div>
            )}
          </div>
        </SheetPanel>

        <SheetFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t(
              'Terminal keeps a lightweight live scrollback; this drawer reads the latest retained replay snapshot.'
            )}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-lg px-3"
              onClick={handleCopy}
              disabled={!hasSnapshot}
            >
              <Copy className="h-4 w-4" />
              <span>{t('Copy')}</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-2 rounded-lg px-3"
              onClick={handleExport}
              disabled={!hasSnapshot}
            >
              <Download className="h-4 w-4" />
              <span>{t('Export')}</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}
