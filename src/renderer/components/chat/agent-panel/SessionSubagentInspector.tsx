import type { LiveAgentSubagent } from '@shared/types';
import { Bot, TerminalSquare, X } from 'lucide-react';
import { type WheelEvent as ReactWheelEvent, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Button } from '@/components/ui/button';
import { useSessionSubagents } from '@/hooks/useSessionSubagents';
import { useSubagentTranscript } from '@/hooks/useSubagentTranscript';
import { useI18n } from '@/i18n';
import { getRendererPlatform } from '@/lib/electronEnvironment';
import { cn } from '@/lib/utils';
import { getSubagentStatusPresentation } from '@/lib/worktreeAgentSummary';
import { AgentTerminal } from '../AgentTerminal';
import { AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE } from '../agentCanvasInteractionPolicy';
import type { SessionSubagentViewState } from '../sessionSubagentState';

const DEFAULT_VISIBLE_ENTRY_COUNT = 60;
const VISIBLE_ENTRY_STEP = 40;
const DEFAULT_INSPECTOR_VIEWPORT_SIZE = { width: 1440, height: 900 } as const;

interface SessionSubagentInspectorProps {
  sessionName: string;
  agentLabel: string;
  sessionCwd?: string;
  providerSessionId?: string;
  viewState: SessionSubagentViewState;
  subagents: LiveAgentSubagent[];
  surfaceColor?: string;
  selectedThreadId?: string | null;
  onSubagentsChange?: (subagents: LiveAgentSubagent[]) => void;
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
}

type InspectorViewportSize = {
  width: number;
  height: number;
};

type InspectorLayoutMode = 'wide' | 'compact' | 'stacked';

function parseSurfaceRgb(input?: string): [number, number, number] | null {
  if (!input || input === 'transparent') {
    return null;
  }

  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0]!.repeat(2), 16),
        Number.parseInt(hex[1]!.repeat(2), 16),
        Number.parseInt(hex[2]!.repeat(2), 16),
      ];
    }

    if (hex.length >= 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }

    return null;
  }

  if (value.startsWith('rgb')) {
    const channels =
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      return [channels[0]!, channels[1]!, channels[2]!];
    }
  }

  return null;
}

function isDarkSurfaceColor(input?: string): boolean {
  const rgb = parseSurfaceRgb(input);
  if (!rgb) {
    return true;
  }

  const [r, g, b] = rgb.map((value) => value / 255);
  const toLinear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance < 0.38;
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

function buildSubagentTabId(threadId: string): string {
  return `session-subagent-tab-${threadId}`;
}

function buildSubagentPanelId(threadId: string): string {
  return `session-subagent-panel-${threadId}`;
}

function getInitialInspectorViewportSize(): InspectorViewportSize {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_INSPECTOR_VIEWPORT_SIZE };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function resolveInspectorLayoutMode({ width, height }: InspectorViewportSize): InspectorLayoutMode {
  if (width < 980 || height < 720) {
    return 'stacked';
  }

  if (width < 1320 || height < 860) {
    return 'compact';
  }

  return 'wide';
}

function shouldCaptureInspectorWheel(
  event: Pick<ReactWheelEvent<HTMLElement>, 'ctrlKey' | 'metaKey'>
): boolean {
  return event.ctrlKey || event.metaKey;
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
    title: t('No session subagents'),
    description: t('This session has not spawned any subagents yet.'),
  };
}

function getSubagentStatusSignal(status: LiveAgentSubagent['status']): {
  activityState: 'running' | 'waiting_input' | 'completed' | null;
  dotClassName: string;
  label: string;
} {
  const statusPresentation = getSubagentStatusPresentation(status);
  return {
    activityState:
      status === 'running'
        ? 'running'
        : status === 'waiting'
          ? 'waiting_input'
          : status === 'completed'
            ? 'completed'
            : null,
    dotClassName: statusPresentation.dotClassName,
    label: statusPresentation.label,
  };
}

function SubagentStatusSignal({
  status,
  className,
}: {
  status: LiveAgentSubagent['status'];
  className?: string;
}) {
  const signal = getSubagentStatusSignal(status);

  if (signal.activityState) {
    return (
      <ActivityIndicator
        state={signal.activityState}
        size="sm"
        className={cn('opacity-90', className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={signal.label}
      title={signal.label}
      data-session-subagent-status-signal={status}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', signal.dotClassName)} />
    </span>
  );
}

export function SessionSubagentInspector({
  sessionName,
  agentLabel,
  sessionCwd,
  providerSessionId,
  viewState,
  subagents,
  surfaceColor,
  selectedThreadId = null,
  onSubagentsChange,
  onSelectThread,
  onClose,
}: SessionSubagentInspectorProps) {
  const { t } = useI18n();
  const platform = useMemo(() => getRendererPlatform(), []);
  const isMac = platform === 'darwin';
  const [viewportSize, setViewportSize] = useState<InspectorViewportSize>(
    getInitialInspectorViewportSize
  );
  const { items: sessionSubagents, isLoading: isLoadingSessionSubagents } = useSessionSubagents({
    cwd: sessionCwd,
    providerSessionId,
    enabled: viewState.kind === 'supported',
  });
  const layoutMode = useMemo(() => resolveInspectorLayoutMode(viewportSize), [viewportSize]);
  const isCompactLayout = layoutMode === 'compact';
  const isStackedLayout = layoutMode === 'stacked';
  const resolvedSubagents = useMemo(() => {
    if (viewState.kind !== 'supported') {
      return [];
    }

    if (sessionSubagents.length > 0 || !isLoadingSessionSubagents) {
      return sessionSubagents;
    }

    return subagents;
  }, [isLoadingSessionSubagents, sessionSubagents, subagents, viewState.kind]);
  const selectedSubagent = useMemo(
    () =>
      resolvedSubagents.find((subagent) => subagent.threadId === selectedThreadId) ??
      resolvedSubagents[0] ??
      null,
    [resolvedSubagents, selectedThreadId]
  );
  const { data, isLoading, isRefreshing, error } = useSubagentTranscript(
    viewState.kind === 'supported' ? selectedSubagent : null
  );
  const transcriptIdentity = data?.threadId ?? selectedSubagent?.threadId ?? null;
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_ENTRY_COUNT);

  useEffect(() => {
    if (viewState.kind !== 'supported' || resolvedSubagents.length === 0) {
      return;
    }

    if (
      !selectedThreadId ||
      !resolvedSubagents.some((subagent) => subagent.threadId === selectedThreadId)
    ) {
      onSelectThread(resolvedSubagents[0]!.threadId);
    }
  }, [onSelectThread, resolvedSubagents, selectedThreadId, viewState.kind]);

  useEffect(() => {
    onSubagentsChange?.(resolvedSubagents);
  }, [onSubagentsChange, resolvedSubagents]);

  useEffect(() => {
    if (transcriptIdentity === null) {
      setVisibleCount(DEFAULT_VISIBLE_ENTRY_COUNT);
      return;
    }

    setVisibleCount(DEFAULT_VISIBLE_ENTRY_COUNT);
  }, [transcriptIdentity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
  const selectedSubagentTabId = selectedSubagent
    ? buildSubagentTabId(selectedSubagent.threadId)
    : undefined;
  const selectedSubagentPanelId = selectedSubagent
    ? buildSubagentPanelId(selectedSubagent.threadId)
    : undefined;
  const selectedSubagentDisplayName =
    data?.agentNickname?.trim() || data?.label?.trim() || selectedSubagent?.label || '';
  const selectedSubagentAgentType = data?.agentType?.trim() || selectedSubagent?.agentType?.trim();
  const selectedSubagentSummary = selectedSubagent?.summary?.trim() ?? '';
  const transcriptRenderIdentity = useMemo(
    () =>
      [
        selectedSubagent?.threadId ?? 'empty',
        windowState.startIndex,
        windowState.endIndex,
        data?.generatedAt ?? 0,
        data?.truncated ? 'truncated' : 'full',
      ].join(':'),
    [
      data?.generatedAt,
      data?.truncated,
      selectedSubagent?.threadId,
      windowState.endIndex,
      windowState.startIndex,
    ]
  );
  const EmptyStateIcon = viewState.kind === 'pending' ? TerminalSquare : Bot;
  const hasSupportedSubagents = viewState.kind === 'supported' && resolvedSubagents.length > 0;
  const resolvedSurfaceColor = surfaceColor && surfaceColor !== 'transparent' ? surfaceColor : null;
  const prefersDarkEditorSurface = resolvedSurfaceColor
    ? isDarkSurfaceColor(resolvedSurfaceColor)
    : false;

  const frameClassName = prefersDarkEditorSurface
    ? 'control-panel border-white/10 text-white/92'
    : 'control-panel border-border/70 bg-background text-foreground';
  const chromeClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-white/[0.03]'
    : 'control-panel-muted border-border/60';
  const railPanelClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-black/[0.14]'
    : 'control-panel-muted border-border/60 bg-muted/[0.08]';
  const transcriptPanelClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-black/[0.12]'
    : 'control-panel border-border/60 bg-background/92';
  const listRowClassName = prefersDarkEditorSurface
    ? 'border-transparent bg-transparent text-white/82 hover:bg-white/[0.05] hover:text-white/92'
    : 'border-transparent bg-transparent text-foreground/80 hover:bg-accent/10 hover:text-foreground';
  const activeListRowClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-white/[0.065] text-white'
    : 'border-border/55 bg-accent/10 text-foreground';
  const mutedTextClassName = prefersDarkEditorSurface ? 'text-white/58' : 'text-muted-foreground';
  const strongMetaTextClassName = prefersDarkEditorSurface ? 'text-white/74' : 'text-foreground/76';
  const primaryTextClassName = prefersDarkEditorSurface ? 'text-white/92' : 'text-foreground';
  const terminalCountClassName = prefersDarkEditorSurface
    ? 'font-mono text-[10px] uppercase tracking-[0.08em] text-white/46'
    : 'font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground';
  const closeButtonClassName = prefersDarkEditorSurface
    ? 'h-8 w-8 rounded-md border border-white/10 bg-white/[0.03] text-white/72 hover:bg-white/[0.08]'
    : 'control-panel h-8 w-8 rounded-md text-foreground hover:bg-accent/20';
  const infoCalloutClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-black/[0.2] text-white/58'
    : 'border-border/70 bg-muted/18 text-muted-foreground';
  const terminalViewportClassName = prefersDarkEditorSurface
    ? 'border-white/10 bg-black/[0.34]'
    : 'border-border/70 bg-muted/12';
  const terminalDividerClassName = prefersDarkEditorSurface ? 'border-white/8' : 'border-border/55';
  const terminalMetaTextClassName = prefersDarkEditorSurface
    ? 'text-white/48'
    : 'text-muted-foreground';
  const refreshingPillClassName = prefersDarkEditorSurface
    ? 'border-white/12 bg-black/55 text-white/70'
    : 'border-border/70 bg-background/92 text-muted-foreground';
  const windowClassName = isStackedLayout
    ? 'h-[44rem] w-[62rem]'
    : isCompactLayout
      ? 'h-[47rem] w-[74rem]'
      : 'h-[50rem] w-[82rem]';
  const contentGridClassName = isStackedLayout
    ? 'grid-cols-1 grid-rows-[15rem_minmax(0,1fr)] gap-3'
    : isCompactLayout
      ? 'grid-cols-[18rem_minmax(0,1fr)] gap-3'
      : 'grid-cols-[20rem_minmax(0,1fr)] gap-4';
  const headerChromeLabel = isMac ? t('Session subagents') : 'session://subagents';
  const platformChromeLabel =
    platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux';
  const hasTranscriptEntries = entries.length > 0;
  const showBlockingTranscriptLoading =
    !hasTranscriptEntries && !data && (isLoading || isLoadingSessionSubagents);
  const showRefreshingTranscriptIndicator = hasTranscriptEntries && (isRefreshing || isLoading);
  const showTranscriptErrorBanner = hasTranscriptEntries && Boolean(error);
  const showTranscriptErrorState =
    !hasTranscriptEntries && !showBlockingTranscriptLoading && Boolean(error);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling already closes the dialog and backdrop click is pointer-only.
    <div
      {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[color:color-mix(in_oklch,var(--background)_72%,transparent)] p-4 backdrop-blur-[2px] no-drag sm:p-6"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onWheelCapture={(event) => {
        if (shouldCaptureInspectorWheel(event)) {
          event.stopPropagation();
        }
      }}
    >
      <div className="flex min-h-0 w-full items-center justify-center">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: This only prevents backdrop dismissal while interacting inside the dialog. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Session subagents')}
          {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
          data-session-subagent-inspector="true"
          data-session-subagent-layout={layoutMode}
          data-session-subagent-platform={platform}
          data-session-subagent-header-chrome={isMac ? 'darwin' : 'terminal'}
          className={cn(
            'mx-auto flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-none flex-col overflow-hidden rounded-[1rem] border shadow-[0_24px_60px_rgba(0,0,0,0.42)] no-drag',
            windowClassName,
            frameClassName
          )}
          style={resolvedSurfaceColor ? { backgroundColor: resolvedSurfaceColor } : undefined}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onWheelCapture={(event) => {
            if (shouldCaptureInspectorWheel(event)) {
              event.stopPropagation();
            }
          }}
        >
          <div
            className={cn(
              'flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-3.5',
              chromeClassName
            )}
          >
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'flex flex-wrap items-center gap-3 font-mono text-[11px]',
                  mutedTextClassName
                )}
              >
                {isMac ? (
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-destructive/80" />
                    <span className="h-2 w-2 rounded-full bg-warning/80" />
                    <span className="h-2 w-2 rounded-full bg-success/80" />
                  </div>
                ) : (
                  <span className={primaryTextClassName}>{headerChromeLabel}</span>
                )}
                <span className="uppercase tracking-[0.14em]">
                  {isMac ? headerChromeLabel : platformChromeLabel}
                </span>
                <span className={strongMetaTextClassName}>{agentLabel}</span>
                {viewState.kind === 'supported' ? (
                  <span className={terminalCountClassName}>{resolvedSubagents.length} tracked</span>
                ) : null}
                {selectedSubagent ? (
                  <SubagentStatusSignal status={selectedSubagent.status} className="shrink-0" />
                ) : null}
              </div>

              <div className="mt-3 min-w-0">
                {isMac ? (
                  <div
                    className={cn(
                      'truncate font-mono text-[13px] font-semibold tracking-[0.01em]',
                      primaryTextClassName
                    )}
                  >
                    {sessionName}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]',
                      primaryTextClassName
                    )}
                  >
                    <span className="truncate text-[13px] font-semibold tracking-[0.01em]">
                      {sessionName}
                    </span>
                    <span className={terminalCountClassName}>terminal-view</span>
                  </div>
                )}
                {viewState.kind !== 'supported' ? (
                  <div className={cn('mt-1 font-mono text-[11px]', mutedTextClassName)}>
                    {copy.title}
                  </div>
                ) : null}
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className={closeButtonClassName}
              onClick={onClose}
              aria-label={t('Close subagent window')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div
            className={cn(
              'p-3 sm:p-4',
              hasSupportedSubagents ? 'min-h-0 flex-1 overflow-hidden' : 'overflow-visible'
            )}
          >
            {hasSupportedSubagents ? (
              <div className={cn('grid h-full min-h-0', contentGridClassName)}>
                <div
                  className={cn(
                    'flex min-h-0 flex-col overflow-hidden rounded-[0.7rem] border',
                    railPanelClassName
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-between gap-2 border-b px-3 py-2.5 font-mono',
                      chromeClassName
                    )}
                  >
                    <div
                      className={cn('text-[11px] uppercase tracking-[0.14em]', mutedTextClassName)}
                    >
                      {t('Session subagents')}
                    </div>
                    <span className={terminalCountClassName}>{resolvedSubagents.length}</span>
                  </div>

                  <div
                    role="tablist"
                    aria-label={t('Session subagents')}
                    className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
                  >
                    {resolvedSubagents.map((subagent) => {
                      const isActive = subagent.threadId === selectedSubagent?.threadId;
                      const tabId = buildSubagentTabId(subagent.threadId);
                      const panelId = buildSubagentPanelId(subagent.threadId);
                      const trimmedSummary = subagent.summary?.trim() ?? '';

                      return (
                        <button
                          key={subagent.threadId}
                          id={tabId}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-controls={panelId}
                          title={trimmedSummary || subagent.label}
                          className={cn(
                            'group relative flex w-full min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left font-mono transition-colors',
                            listRowClassName,
                            isActive &&
                              cn(
                                activeListRowClassName,
                                'shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]'
                              )
                          )}
                          onClick={() => onSelectThread(subagent.threadId)}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                            )}
                          />
                          <div className="flex w-full min-w-0 items-start gap-2.5">
                            <SubagentStatusSignal
                              status={subagent.status}
                              className="mt-[0.2rem] shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className={cn(
                                    'min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[0.01em]',
                                    primaryTextClassName
                                  )}
                                >
                                  {subagent.label}
                                </span>
                                {subagent.agentType?.trim() ? (
                                  <span className={terminalCountClassName}>
                                    {subagent.agentType.trim()}
                                  </span>
                                ) : null}
                              </div>
                              {trimmedSummary ? (
                                <div
                                  className={cn(
                                    'mt-1 line-clamp-1 text-[10px] leading-5',
                                    mutedTextClassName
                                  )}
                                >
                                  {trimmedSummary}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className={cn(
                    'flex min-h-0 flex-col overflow-hidden rounded-[0.7rem] border',
                    transcriptPanelClassName
                  )}
                >
                  <div className={cn('border-b px-4 py-3 font-mono', chromeClassName)}>
                    <div
                      className={cn(
                        'flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.14em]',
                        mutedTextClassName
                      )}
                    >
                      {t('Transcript')}
                      {selectedSubagentDisplayName ? (
                        <span className={primaryTextClassName}>{selectedSubagentDisplayName}</span>
                      ) : null}
                      {selectedSubagent ? (
                        <SubagentStatusSignal
                          status={selectedSubagent.status}
                          className="shrink-0"
                        />
                      ) : null}
                      {selectedSubagentAgentType ? (
                        <span className={terminalCountClassName}>{selectedSubagentAgentType}</span>
                      ) : null}
                      {showRefreshingTranscriptIndicator ? (
                        <span
                          data-session-subagent-loading="refresh"
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.08em]',
                            refreshingPillClassName
                          )}
                        >
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent opacity-80" />
                          {t('Loading transcript...')}
                        </span>
                      ) : null}
                    </div>
                    {selectedSubagentSummary ? (
                      <div
                        className={cn(
                          'mt-1 line-clamp-2 text-[11px] leading-5',
                          mutedTextClassName
                        )}
                      >
                        {selectedSubagentSummary}
                      </div>
                    ) : null}
                  </div>

                  <div
                    role="tabpanel"
                    id={selectedSubagentPanelId}
                    aria-labelledby={selectedSubagentTabId}
                    className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-4 sm:py-4"
                  >
                    <div
                      className={cn(
                        'flex h-full min-h-0 flex-col overflow-hidden rounded-[0.6rem] border',
                        terminalViewportClassName
                      )}
                    >
                      {!isLoading && !error && data?.truncated ? (
                        <div
                          className={cn(
                            'border-b px-4 py-2.5 font-mono text-[11px] leading-6',
                            terminalDividerClassName,
                            terminalMetaTextClassName
                          )}
                        >
                          {t(
                            'Showing the latest transcript entries. Older entries were omitted to keep long sessions responsive.'
                          )}
                        </div>
                      ) : null}

                      {!isLoading && !error && windowState.hasHiddenOlder ? (
                        <div
                          className={cn(
                            'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 font-mono',
                            terminalDividerClassName
                          )}
                        >
                          <div className={cn('text-[11px] leading-6', terminalMetaTextClassName)}>
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

                      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
                        {showBlockingTranscriptLoading ? (
                          <div className="mx-auto w-full max-w-4xl">
                            <div
                              className={cn(
                                'rounded-xl border px-4 py-3 text-sm',
                                infoCalloutClassName
                              )}
                            >
                              {resolvedSubagents.length === 0 && isLoadingSessionSubagents
                                ? t('Loading session subagents...')
                                : t('Loading transcript...')}
                            </div>
                          </div>
                        ) : null}

                        {showTranscriptErrorState ? (
                          <div className="mx-auto w-full max-w-4xl">
                            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                              {error}
                            </div>
                          </div>
                        ) : null}

                        {!showBlockingTranscriptLoading &&
                        !showTranscriptErrorState &&
                        entries.length === 0 ? (
                          <div className="mx-auto w-full max-w-4xl">
                            <div
                              className={cn(
                                'rounded-xl border px-4 py-3 text-sm',
                                infoCalloutClassName
                              )}
                            >
                              {t('No transcript entries were found for this subagent.')}
                            </div>
                          </div>
                        ) : null}

                        {hasTranscriptEntries ? (
                          <div
                            className={cn(
                              'relative h-full min-h-0 overflow-hidden rounded-[0.72rem] border',
                              terminalViewportClassName
                            )}
                          >
                            <AgentTerminal
                              agentId={selectedSubagent?.provider ?? 'codex'}
                              agentCommand={selectedSubagent?.provider ?? 'codex'}
                              isActive
                              readOnlyTranscript={{
                                entries,
                                identity: transcriptRenderIdentity,
                              }}
                            />
                            {showTranscriptErrorBanner ? (
                              <div className="pointer-events-none absolute inset-x-3 top-3 z-10">
                                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-[0_10px_24px_rgba(0,0,0,0.14)] backdrop-blur-sm">
                                  {error}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-center pt-2 sm:pt-3">
                <div
                  data-session-subagent-empty-state={
                    viewState.kind === 'supported' ? 'empty' : viewState.kind
                  }
                  className={cn(
                    'flex w-full max-w-2xl items-start gap-4 rounded-[0.8rem] border px-5 py-5 font-mono',
                    railPanelClassName
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                      prefersDarkEditorSurface
                        ? 'border-white/10 bg-black/[0.22] text-white/82'
                        : 'control-panel text-foreground'
                    )}
                  >
                    <EmptyStateIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'text-[12px] font-semibold uppercase tracking-[0.08em]',
                        primaryTextClassName
                      )}
                    >
                      {copy.title}
                    </div>
                    <div className={cn('mt-2 text-[12px] leading-6', mutedTextClassName)}>
                      {copy.description}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
