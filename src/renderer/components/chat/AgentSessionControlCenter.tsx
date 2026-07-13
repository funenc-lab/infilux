import { getDisplayPathBasename } from '@shared/utils/path';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  ListChecks,
} from 'lucide-react';
import { useMemo } from 'react';
import { Menu, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentSessionInventoryItem } from '@/stores/agentSessionInventory';
import {
  buildAgentSessionAgentSummaries,
  buildAgentSessionControlSections,
  buildAgentSessionControlSummary,
  resolveAgentSessionControlActionHint,
  resolveAgentSessionControlTone,
  resolveAgentSessionStatusPresentation,
} from './agentSessionControlCenterModel';

interface AgentSessionControlCenterProps {
  inventoryItems: AgentSessionInventoryItem[];
  onFocusSession: (sessionId: string) => void;
  scopeLabel?: string;
  buttonClassName?: string;
}

function getStatusIcon(status: AgentSessionInventoryItem['status']) {
  if (status === 'running') {
    return Activity;
  }
  if (status === 'waiting-for-input') {
    return Clock3;
  }
  if (status === 'reconnecting') {
    return Clock3;
  }
  if (status === 'unread') {
    return CheckCircle2;
  }
  if (status === 'dead' || status === 'disconnected') {
    return AlertTriangle;
  }
  return CircleDot;
}

function getButtonToneClassName(tone: ReturnType<typeof resolveAgentSessionControlTone>): string {
  if (tone === 'live') {
    return 'control-icon-button-live';
  }
  if (tone === 'wait') {
    return 'control-icon-button-wait';
  }
  if (tone === 'done') {
    return 'control-icon-button-active';
  }
  return '';
}

function getLocationLabel(item: AgentSessionInventoryItem): string {
  const repoLabel = getDisplayPathBasename(item.repoPath) || item.repoPath;
  const worktreeLabel = getDisplayPathBasename(item.cwd) || item.cwd;
  return repoLabel && repoLabel !== worktreeLabel
    ? `${repoLabel} / ${worktreeLabel}`
    : worktreeLabel;
}

export function AgentSessionControlCenter({
  buttonClassName,
  inventoryItems,
  onFocusSession,
  scopeLabel,
}: AgentSessionControlCenterProps) {
  const { t } = useI18n();
  const summary = useMemo(() => buildAgentSessionControlSummary(inventoryItems), [inventoryItems]);
  const sections = useMemo(
    () => buildAgentSessionControlSections(inventoryItems),
    [inventoryItems]
  );
  const agentSummaries = useMemo(
    () => buildAgentSessionAgentSummaries(inventoryItems),
    [inventoryItems]
  );
  const actionHint = resolveAgentSessionControlActionHint(summary);
  const tone = resolveAgentSessionControlTone(summary);
  const badgeCount = summary.needsAttention > 0 ? summary.needsAttention : summary.total;

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className={cn(
              'control-panel-muted pointer-events-auto relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30',
              getButtonToneClassName(tone),
              buttonClassName
            )}
            aria-label={t('Agent Sessions')}
            title={t('Agent Sessions')}
          >
            <Bot className="h-4 w-4" />
            {badgeCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ) : null}
          </button>
        }
      />
      <MenuPopup
        align="end"
        sideOffset={8}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-2"
      >
        <div className="flex min-w-0 items-start justify-between gap-3 px-2 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-semibold text-foreground">
                {t('Agent Sessions')}
              </span>
            </div>
            {scopeLabel ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{scopeLabel}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <span className="control-chip">{t('{{count}} total', { count: summary.total })}</span>
            {summary.running > 0 ? (
              <span className="control-chip control-chip-live">
                {t('{{count}} running', { count: summary.running })}
              </span>
            ) : null}
            {summary.waitingForInput > 0 ? (
              <span className="control-chip control-chip-wait">
                {t('{{count}} waiting', { count: summary.waitingForInput })}
              </span>
            ) : null}
          </div>
        </div>

        {inventoryItems.length > 0 ? (
          <div className="mx-2 mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={actionHint.chipClassName}>{t(actionHint.labelKey)}</span>
            {agentSummaries.map((agent) => (
              <span key={agent.key} className="control-chip max-w-36 truncate">
                {agent.label}: {agent.count}
              </span>
            ))}
          </div>
        ) : null}

        {inventoryItems.length === 0 ? (
          <div className="control-panel-muted mx-1 my-1 rounded-xl border border-dashed border-border/70 px-3 py-5 text-center">
            <p className="text-sm font-medium text-foreground">{t('No agent sessions')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('Start an agent session to track its status here.')}
            </p>
          </div>
        ) : (
          <div className="mt-1 max-h-[24rem] space-y-2 overflow-y-auto px-1 pb-1">
            {sections.map((section) => (
              <section key={section.key} data-testid={`session-control-section-${section.key}`}>
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/72">
                    {t(section.titleKey)}
                  </span>
                  <span className={section.chipClassName}>{section.items.length}</span>
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const StatusIcon = getStatusIcon(item.status);
                    const status = resolveAgentSessionStatusPresentation(item.status);
                    const locationLabel = getLocationLabel(item);

                    return (
                      <Tooltip key={item.sessionId}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              data-testid={`focus-session-${item.sessionId}`}
                              className={cn(
                                'control-menu-item flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left text-foreground transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                item.isActive && 'bg-accent/20'
                              )}
                              onClick={() => onFocusSession(item.sessionId)}
                            >
                              <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="min-w-0 truncate text-sm font-medium">
                                    {item.displayName}
                                  </span>
                                  {item.isActive ? (
                                    <span className="control-chip control-chip-strong shrink-0">
                                      {t('Active')}
                                    </span>
                                  ) : null}
                                  {item.isStale ? (
                                    <span className="control-chip control-chip-wait shrink-0">
                                      {t('Stale')}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="truncate">{item.agentName}</span>
                                  <span aria-hidden="true">/</span>
                                  <span className="truncate">{locationLabel}</span>
                                </div>
                                {item.task ? (
                                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                    <ListChecks className="h-3.5 w-3.5 shrink-0" />
                                    <span className="min-w-0 truncate">
                                      {t('Task: {{title}}', { title: item.task.title })}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className={status.chipClassName}>{t(status.labelKey)}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            </button>
                          }
                        />
                        <TooltipPopup
                          align="start"
                          className="max-w-sm whitespace-normal text-left break-words"
                        >
                          {item.displayName}
                        </TooltipPopup>
                      </Tooltip>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </MenuPopup>
    </Menu>
  );
}
