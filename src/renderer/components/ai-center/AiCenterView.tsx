import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FolderGit2,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  Play,
  Route,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type {
  TodoGlobalDispatchResult,
  TodoGlobalDispatchSkipReason,
} from '../todo/todoAutoExecuteRuntime';
import type {
  AiCenterNextAction,
  AiCenterProjectStatus,
  AiCenterSummary,
} from '../todo/todoViewModel';
import type {
  AiCenterCoordinationSignal,
  AiCenterDecisionConfidence,
  AiCenterDecisionItem,
  AiCenterDecisionPlan,
  AiCenterRecommendedAction,
  AiCenterRiskSeverity,
} from './aiCenterOrchestrator';

interface AiCenterViewProps {
  canDispatchReadyTasks?: boolean;
  canOpenDecisionChat?: boolean;
  decisionPlan?: AiCenterDecisionPlan;
  dispatchResult?: TodoGlobalDispatchResult;
  onApproveTask?: (repoPath: string, taskId: string) => void;
  onDispatchReadyTasks?: () => void;
  onOpenDecisionChat?: () => void;
  onFocusTask?: (repoPath: string, taskId: string) => void;
  onOpenTask?: (repoPath: string, taskId: string) => void;
  summary: AiCenterSummary;
}

interface AiCenterStat {
  id: string;
  labelKey: string;
  value: number;
  icon: LucideIcon;
  tone: 'neutral' | 'ready' | 'warning' | 'live';
}

interface ActionLaneProps {
  action?: ReactNode;
  children: ReactNode;
  count: number;
  countLabelKey: string;
  icon: LucideIcon;
  titleKey: string;
  tone: 'ready' | 'running' | 'warning';
}

interface TaskItemChip {
  className?: string;
  labelKey?: string;
  text?: string;
}

const PROJECT_ROW_LIMIT = 6;
const EXECUTION_ROW_LIMIT = 3;

const PROJECT_STATUS_META: Record<
  AiCenterProjectStatus,
  {
    labelKey: string;
    chipClassName: string;
    icon: LucideIcon;
  }
> = {
  running: {
    labelKey: 'Running',
    chipClassName: 'control-chip control-chip-live',
    icon: Activity,
  },
  blocked: {
    labelKey: 'Blocked',
    chipClassName: 'control-chip control-chip-wait',
    icon: AlertTriangle,
  },
  ready: {
    labelKey: 'Ready',
    chipClassName: 'control-chip control-chip-done',
    icon: CheckCircle2,
  },
  idle: {
    labelKey: 'Idle',
    chipClassName: 'control-chip',
    icon: CircleDot,
  },
  done: {
    labelKey: 'Done',
    chipClassName: 'control-chip control-chip-done',
    icon: CheckCircle2,
  },
};

const NEXT_ACTION_LABELS: Record<AiCenterNextAction, string> = {
  'dispatch-ready': 'Dispatch Next',
  idle: 'Idle',
  'monitor-running': 'Monitor Running',
  'request-approval': 'Request Approval',
  'resolve-dependencies': 'Resolve Dependencies',
};

const RECOMMENDED_ACTION_LABELS: Record<AiCenterRecommendedAction, string> = {
  'approve-blockers': 'Approve blocked tasks',
  'dispatch-ready': 'Dispatch ready tasks',
  'monitor-running': 'Monitor running tasks',
  'resolve-dependencies': 'Resolve task dependencies',
  standby: 'Stand by',
};

const CONFIDENCE_LABELS: Record<AiCenterDecisionConfidence, string> = {
  high: 'High confidence',
  low: 'Low confidence',
  medium: 'Medium confidence',
};

const DISPATCH_SKIP_REASON_LABELS: Record<TodoGlobalDispatchSkipReason, string> = {
  'missing-task': 'Task not found',
  'missing-worktree': 'Missing worktree',
  'no-enabled-agents': 'No enabled agents',
  'project-running': 'Project already running',
  'start-failed': 'Start failed',
};

function getStatClassName(tone: AiCenterStat['tone']): string {
  if (tone === 'ready') return 'border-success/26 bg-success/7';
  if (tone === 'warning') return 'border-warning/32 bg-warning/8';
  if (tone === 'live') return 'border-info/28 bg-info/8';
  return '';
}

function getActionLaneClassName(tone: ActionLaneProps['tone']): string {
  if (tone === 'ready') return 'border-success/24 bg-success/6';
  if (tone === 'warning') return 'border-warning/30 bg-warning/8';
  return 'border-info/26 bg-info/7';
}

function getRiskClassName(severity: AiCenterRiskSeverity): string {
  if (severity === 'high') return 'control-chip-wait';
  if (severity === 'medium') return 'border-warning/28 bg-warning/10 text-warning';
  return 'border-info/24 bg-info/8 text-info';
}

function getSignalClassName(severity: AiCenterRiskSeverity): string {
  if (severity === 'high') return 'control-chip-wait';
  if (severity === 'medium') return 'border-warning/28 bg-warning/10 text-warning';
  return 'border-info/24 bg-info/8 text-info';
}

function AiCenterStatCard({ icon: Icon, labelKey, tone, value }: AiCenterStat) {
  const { t } = useI18n();

  return (
    <div
      className={cn('control-panel-muted min-w-0 rounded-lg px-3 py-2.5', getStatClassName(tone))}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
          {t(labelKey)}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-1 text-lg font-semibold leading-none text-foreground">{value}</div>
    </div>
  );
}

function ActionLane({
  action,
  children,
  count,
  countLabelKey,
  icon: Icon,
  titleKey,
  tone,
}: ActionLaneProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'control-panel-muted min-w-0 rounded-lg border px-3 py-2.5',
        getActionLaneClassName(tone)
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{t(titleKey)}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {t(countLabelKey, { count })}
            </div>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-2 min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

function TaskItem({
  action,
  chips,
  title,
}: {
  action?: ReactNode;
  chips: readonly TaskItemChip[];
  title: string;
}) {
  const { t } = useI18n();

  return (
    <div className="min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground" title={title}>
            {title}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {chips.map((chip, index) => (
              <span
                key={`${chip.labelKey ?? chip.text ?? 'chip'}:${index}`}
                className={cn('control-chip px-1.5 py-0 text-[10px]', chip.className)}
              >
                {chip.labelKey ? t(chip.labelKey) : chip.text}
              </span>
            ))}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
    </div>
  );
}

function OpenTaskButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();

  return (
    <Button
      aria-label={t('Open task')}
      className="h-6 gap-1 px-2 text-[10px]"
      onClick={onOpen}
      size="xs"
      variant="outline"
    >
      <Route className="h-3 w-3" />
      {t('Open')}
    </Button>
  );
}

function SupportSection({
  children,
  icon: Icon,
  titleKey,
}: {
  children: ReactNode;
  icon: LucideIcon;
  titleKey: string;
}) {
  const { t } = useI18n();

  return (
    <div className="control-panel-muted min-w-0 rounded-lg px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
          {t(titleKey)}
        </span>
      </div>
      <div className="mt-2 min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

function getInterventionItemDetail(item: AiCenterDecisionItem): string | undefined {
  if (item.meta) return item.meta;
  return item.reasonLabelKeys && item.reasonLabelKeys.length > 0 ? undefined : item.detail;
}

function InterventionWorklistItem({ item }: { item: AiCenterDecisionItem }) {
  const { t } = useI18n();
  const itemDetail = getInterventionItemDetail(item);

  return (
    <div className="min-w-0 rounded-md border border-warning/24 px-2 py-1.5">
      <div className="truncate text-xs font-semibold text-foreground">{item.label}</div>
      {item.reasonLabelKeys && item.reasonLabelKeys.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          {item.reasonLabelKeys.map((reasonLabelKey) => (
            <span
              key={reasonLabelKey}
              className="control-chip control-chip-wait px-1.5 py-0 text-[10px]"
            >
              {t(reasonLabelKey)}
            </span>
          ))}
        </div>
      ) : null}
      {itemDetail ? (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{itemDetail}</div>
      ) : null}
    </div>
  );
}

function getMonitoringItemDetail(item: AiCenterDecisionItem, t: (key: string) => string): string {
  if (item.meta && item.agentLabel) {
    return `${item.meta}: ${item.agentLabelKey ? t(item.agentLabelKey) : item.agentLabel}`;
  }

  return item.detail;
}

function MonitoringWorklistItem({ item }: { item: AiCenterDecisionItem }) {
  const { t } = useI18n();
  const itemDetail = getMonitoringItemDetail(item, t);

  return (
    <div className="min-w-0 rounded-md border border-info/22 px-2 py-1.5">
      <div className="truncate text-xs font-semibold text-foreground">{item.label}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{itemDetail}</div>
    </div>
  );
}

function DecisionPlanSection({
  canOpenDecisionChat,
  decisionPlan,
  onOpenDecisionChat,
}: {
  canOpenDecisionChat: boolean;
  decisionPlan?: AiCenterDecisionPlan;
  onOpenDecisionChat?: () => void;
}) {
  const { t } = useI18n();

  if (!decisionPlan) {
    return null;
  }

  const visibleBatches = decisionPlan.dispatchBatches.slice(0, 3);
  const visibleRisks = decisionPlan.riskItems.slice(0, 3);
  const visibleInterventionItems = decisionPlan.interventionItems.slice(0, 3);
  const visibleMonitoringItems = decisionPlan.monitoringItems.slice(0, 3);
  const visibleDeferredItems = decisionPlan.deferredQueueItems.slice(0, 3);
  const hiddenBatchCount = Math.max(0, decisionPlan.dispatchBatches.length - visibleBatches.length);
  const hiddenRiskCount = Math.max(0, decisionPlan.riskItems.length - visibleRisks.length);
  const hiddenInterventionCount = Math.max(
    0,
    decisionPlan.interventionItems.length - visibleInterventionItems.length
  );
  const hiddenMonitoringCount = Math.max(
    0,
    decisionPlan.monitoringItems.length - visibleMonitoringItems.length
  );
  const hiddenDeferredCount = Math.max(
    0,
    decisionPlan.deferredQueueItems.length - visibleDeferredItems.length
  );
  const worklistItemCount =
    decisionPlan.interventionItems.length +
    decisionPlan.monitoringItems.length +
    decisionPlan.deferredQueueItems.length;
  return (
    <div className="mt-3 control-panel-muted min-w-0 rounded-lg border border-info/24 bg-info/6 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">
              {t('Decision Plan')}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-foreground">
              {t(decisionPlan.headline)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span className="control-chip">
            {t('Recommended Action')}:{' '}
            {t(RECOMMENDED_ACTION_LABELS[decisionPlan.recommendedAction])}
          </span>
          <span className="control-chip control-chip-done">
            {t(CONFIDENCE_LABELS[decisionPlan.confidence])}
          </span>
          {onOpenDecisionChat ? (
            <Button
              aria-label={t('Ask AI Center')}
              disabled={!canOpenDecisionChat}
              onClick={onOpenDecisionChat}
              size="xs"
              variant="secondary"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              {t('Ask AI Center')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
              {t('Dispatch Plan')}
            </span>
            <span className="control-chip px-1.5 py-0 text-[10px]">
              {t('{{count}} batches', { count: decisionPlan.dispatchBatches.length })}
            </span>
          </div>
          <div className="mt-2 min-w-0 space-y-1.5">
            {visibleBatches.length > 0 ? (
              visibleBatches.map((batch) => (
                <div key={batch.agentId} className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-foreground">
                      {batch.agentLabel}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {t('{{count}} tasks', { count: batch.tasks.length })}
                    </span>
                  </div>
                  <div className="mt-1 min-w-0 space-y-1">
                    {batch.tasks.slice(0, 2).map((task) => (
                      <div
                        key={`${task.repoPath}:${task.taskId}`}
                        className="flex min-w-0 items-center gap-1.5 text-[11px]"
                      >
                        <span className="control-chip shrink-0 px-1.5 py-0 text-[10px]">
                          {task.repoName}
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No dispatch plan')}</div>
            )}
            {hiddenBatchCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                +{t('{{count}} more', { count: hiddenBatchCount })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
              {t('Risk Review')}
            </span>
            <span className="control-chip px-1.5 py-0 text-[10px]">
              {t('{{count}} risks', { count: decisionPlan.riskItems.length })}
            </span>
          </div>
          <div className="mt-2 min-w-0 space-y-1.5">
            {visibleRisks.length > 0 ? (
              visibleRisks.map((risk) => (
                <div key={risk.id} className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'control-chip shrink-0 px-1.5 py-0 text-[10px]',
                        getRiskClassName(risk.severity)
                      )}
                    >
                      {t(risk.severity)}
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                      {risk.label}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {risk.detail}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No risks')}</div>
            )}
            {hiddenRiskCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                +{t('{{count}} more', { count: hiddenRiskCount })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        aria-label={t('Decision Worklist')}
        className="mt-2 min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2"
        role="group"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
            {t('Decision Worklist')}
          </span>
          <span className="control-chip px-1.5 py-0 text-[10px]">
            {t('{{count}} items', {
              count: worklistItemCount,
            })}
          </span>
        </div>
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-3">
          <div aria-label={t('Intervention Queue')} className="min-w-0" role="group">
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <ShieldCheck className="h-3 w-3 shrink-0" />
              <span className="truncate">{t('Intervention Queue')}</span>
            </div>
            <div className="mt-1.5 min-w-0 space-y-1.5">
              {visibleInterventionItems.length > 0 ? (
                visibleInterventionItems.map((item) => (
                  <InterventionWorklistItem key={item.id} item={item} />
                ))
              ) : (
                <div className="text-xs text-muted-foreground">{t('No interventions')}</div>
              )}
              {hiddenInterventionCount > 0 ? (
                <div className="text-xs text-muted-foreground">
                  +{t('{{count}} more', { count: hiddenInterventionCount })}
                </div>
              ) : null}
            </div>
          </div>

          <div aria-label={t('Monitoring Queue')} className="min-w-0" role="group">
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <Activity className="h-3 w-3 shrink-0" />
              <span className="truncate">{t('Monitoring Queue')}</span>
            </div>
            <div className="mt-1.5 min-w-0 space-y-1.5">
              {visibleMonitoringItems.length > 0 ? (
                visibleMonitoringItems.map((item) => (
                  <MonitoringWorklistItem key={item.id} item={item} />
                ))
              ) : (
                <div className="text-xs text-muted-foreground">{t('No running tasks')}</div>
              )}
              {hiddenMonitoringCount > 0 ? (
                <div className="text-xs text-muted-foreground">
                  +{t('{{count}} more', { count: hiddenMonitoringCount })}
                </div>
              ) : null}
            </div>
          </div>

          <div aria-label={t('Deferred Queue')} className="min-w-0" role="group">
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <ClipboardList className="h-3 w-3 shrink-0" />
              <span className="truncate">{t('Deferred Queue')}</span>
            </div>
            <div className="mt-1.5 min-w-0 space-y-1.5">
              {visibleDeferredItems.length > 0 ? (
                visibleDeferredItems.map((item) => (
                  <div
                    key={item.id}
                    className="min-w-0 rounded-md border border-border/45 px-2 py-1.5"
                  >
                    <div className="truncate text-xs font-semibold text-foreground">
                      {item.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.detail}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">{t('No deferred tasks')}</div>
              )}
              {hiddenDeferredCount > 0 ? (
                <div className="text-xs text-muted-foreground">
                  +{t('{{count}} more', { count: hiddenDeferredCount })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoordinationSignalsSection({
  signals,
}: {
  signals: readonly AiCenterCoordinationSignal[];
}) {
  const { t } = useI18n();

  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 control-panel-muted min-w-0 rounded-lg border border-border/45 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
          {t('Coordination Signals')}
        </span>
      </div>
      <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.id} className="min-w-0 rounded-md border border-border/45 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'control-chip shrink-0 px-1.5 py-0 text-[10px]',
                  getSignalClassName(signal.severity)
                )}
              >
                {t(signal.kind)}
              </span>
              <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                {signal.label}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{signal.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DispatchResultSection({ result }: { result?: TodoGlobalDispatchResult }) {
  const { t } = useI18n();

  if (!result) {
    return null;
  }

  const visibleStartedProjects = result.startedProjects.slice(0, 3);
  const visibleSkippedTasks = result.skippedTasks.slice(0, 4);
  const hiddenStartedCount = Math.max(
    0,
    result.startedProjects.length - visibleStartedProjects.length
  );
  const hiddenSkippedCount = Math.max(0, result.skippedTasks.length - visibleSkippedTasks.length);

  return (
    <div
      aria-label={t('Dispatch Result')}
      className="mt-3 control-panel-muted min-w-0 rounded-lg border border-border/45 px-3 py-2.5"
      role="group"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Route className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
            {t('Dispatch Result')}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="control-chip control-chip-done">
            {t('{{count}} projects started', { count: result.startedCount })}
          </span>
          <span
            className={cn('control-chip', result.skippedTasks.length > 0 && 'control-chip-wait')}
          >
            {t('{{count}} skipped', { count: result.skippedTasks.length })}
          </span>
        </div>
      </div>

      <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
        <div className="min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2">
          <div className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
            {t('Started Projects')}
          </div>
          <div className="mt-1.5 min-w-0 space-y-1.5">
            {visibleStartedProjects.length > 0 ? (
              visibleStartedProjects.map((project) => (
                <div key={project.repoPath} className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">
                    {project.repoPath}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {project.taskIds.join(', ')}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No projects started')}</div>
            )}
            {hiddenStartedCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                +{t('{{count}} more', { count: hiddenStartedCount })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border/45 bg-control-surface/45 px-2.5 py-2">
          <div className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
            {t('Skipped Tasks')}
          </div>
          <div className="mt-1.5 min-w-0 space-y-1.5">
            {visibleSkippedTasks.length > 0 ? (
              visibleSkippedTasks.map((task) => (
                <div key={`${task.repoPath}:${task.taskId}`} className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                      {task.repoPath}
                    </span>
                    <span className="control-chip control-chip-wait shrink-0 px-1.5 py-0 text-[10px]">
                      {t(DISPATCH_SKIP_REASON_LABELS[task.reason])}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {task.taskId}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No skipped tasks')}</div>
            )}
            {hiddenSkippedCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                +{t('{{count}} more', { count: hiddenSkippedCount })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiCenterView({
  canDispatchReadyTasks = false,
  canOpenDecisionChat = false,
  decisionPlan,
  dispatchResult,
  onApproveTask,
  onDispatchReadyTasks,
  onOpenDecisionChat,
  onFocusTask,
  onOpenTask,
  summary,
}: AiCenterViewProps) {
  const { t } = useI18n();
  const stats = useMemo<AiCenterStat[]>(
    () => [
      {
        id: 'open',
        labelKey: 'Open Tasks',
        value: summary.openTaskCount,
        icon: ListChecks,
        tone: 'neutral',
      },
      {
        id: 'ready',
        labelKey: 'Ready Tasks',
        value: summary.readyTaskCount,
        icon: CheckCircle2,
        tone: 'ready',
      },
      {
        id: 'blocked',
        labelKey: 'Blocked Tasks',
        value: summary.blockedTaskCount,
        icon: AlertTriangle,
        tone: 'warning',
      },
      {
        id: 'approvals',
        labelKey: 'Approvals',
        value: summary.approvalPendingTaskCount,
        icon: ShieldCheck,
        tone: 'warning',
      },
      {
        id: 'running',
        labelKey: 'Running',
        value: summary.runningTaskCount,
        icon: Activity,
        tone: 'live',
      },
    ],
    [
      summary.approvalPendingTaskCount,
      summary.blockedTaskCount,
      summary.openTaskCount,
      summary.readyTaskCount,
      summary.runningTaskCount,
    ]
  );
  const visibleProjects = summary.projects.slice(0, PROJECT_ROW_LIMIT);
  const hiddenProjectCount = Math.max(0, summary.projects.length - visibleProjects.length);
  const visibleDispatchTasks = summary.execution.dispatchableTasks.slice(0, EXECUTION_ROW_LIMIT);
  const visibleInterventionTasks = summary.execution.interventionTasks.slice(
    0,
    EXECUTION_ROW_LIMIT
  );
  const visibleRunningTasks = summary.execution.runningTasks.slice(0, EXECUTION_ROW_LIMIT);
  const visibleAgentLoads = summary.execution.agentLoads.slice(0, EXECUTION_ROW_LIMIT);
  const dispatchActionEnabled =
    canDispatchReadyTasks && summary.execution.dispatchableTasks.length > 0;

  return (
    <section
      className="control-panel m-3 mb-0 shrink-0 rounded-xl px-4 py-3"
      aria-label={t('AI Center')}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="control-panel-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">
              {t('Cross-project AI orchestration')}
            </div>
            <h2 className="truncate text-sm font-semibold text-foreground">{t('AI Center')}</h2>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span className="control-chip shrink-0">
            {t('Loaded Projects')} {summary.projectCount}
          </span>
          <span className="control-chip shrink-0">
            {t('Running Projects')} {summary.runningProjectCount}
          </span>
          <span className="control-chip shrink-0">
            {t(NEXT_ACTION_LABELS[summary.execution.nextAction])}
          </span>
        </div>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <AiCenterStatCard key={stat.id} {...stat} />
        ))}
      </div>

      <DecisionPlanSection
        canOpenDecisionChat={canOpenDecisionChat}
        decisionPlan={decisionPlan}
        onOpenDecisionChat={onOpenDecisionChat}
      />

      <CoordinationSignalsSection signals={decisionPlan?.coordinationSignals ?? []} />

      <DispatchResultSection result={dispatchResult} />

      <div className="mt-3 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Route className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-semibold text-foreground">
              {t('Execution Overview')}
            </span>
          </div>
        </div>

        <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-3">
          <ActionLane
            action={
              onDispatchReadyTasks ? (
                <Button
                  aria-label={t('Dispatch ready tasks')}
                  disabled={!dispatchActionEnabled}
                  onClick={onDispatchReadyTasks}
                  size="xs"
                  variant="secondary"
                >
                  <Play className="h-3.5 w-3.5" />
                  {t('Dispatch')}
                </Button>
              ) : undefined
            }
            count={summary.execution.dispatchableTasks.length}
            countLabelKey="{{count}} ready"
            icon={ClipboardList}
            titleKey="Ready to Dispatch"
            tone="ready"
          >
            {visibleDispatchTasks.length > 0 ? (
              visibleDispatchTasks.map((task) => (
                <TaskItem
                  key={`${task.repoPath}:${task.taskId}`}
                  action={
                    onOpenTask ? (
                      <OpenTaskButton onOpen={() => onOpenTask(task.repoPath, task.taskId)} />
                    ) : undefined
                  }
                  chips={[{ text: task.repoName }, { text: `${t('Agent')} ${task.agentLabel}` }]}
                  title={task.title}
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No ready tasks')}</div>
            )}
          </ActionLane>

          <ActionLane
            count={summary.execution.interventionTasks.length}
            countLabelKey="{{count}} blocked"
            icon={ShieldCheck}
            titleKey="Needs Intervention"
            tone="warning"
          >
            {visibleInterventionTasks.length > 0 ? (
              visibleInterventionTasks.map((task) => {
                const hasApprovalBlocker = task.reasons.includes('approval');
                const hasDependencyBlocker = task.reasons.includes('dependency');
                const hasInterventionAction = Boolean(
                  onOpenTask ||
                    (hasApprovalBlocker && onApproveTask) ||
                    (hasDependencyBlocker && onFocusTask)
                );

                return (
                  <TaskItem
                    key={`${task.repoPath}:${task.taskId}`}
                    action={
                      hasInterventionAction ? (
                        <>
                          {onOpenTask ? (
                            <OpenTaskButton onOpen={() => onOpenTask(task.repoPath, task.taskId)} />
                          ) : null}
                          {hasApprovalBlocker && onApproveTask ? (
                            <Button
                              aria-label={t('Approve task')}
                              className="h-6 gap-1 px-2 text-[10px]"
                              onClick={() => onApproveTask(task.repoPath, task.taskId)}
                              size="xs"
                              variant="secondary"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {t('Approve')}
                            </Button>
                          ) : null}
                          {hasDependencyBlocker && onFocusTask ? (
                            <Button
                              aria-label={t('Review task')}
                              className="h-6 gap-1 px-2 text-[10px]"
                              onClick={() => onFocusTask(task.repoPath, task.taskId)}
                              size="xs"
                              variant="outline"
                            >
                              <Route className="h-3 w-3" />
                              {t('Open')}
                            </Button>
                          ) : null}
                        </>
                      ) : undefined
                    }
                    chips={[
                      {
                        labelKey: hasApprovalBlocker ? 'Approval Required' : 'Dependency Blocked',
                        className: 'control-chip-wait',
                      },
                      { text: task.repoName },
                    ]}
                    title={task.title}
                  />
                );
              })
            ) : (
              <div className="text-xs text-muted-foreground">{t('No interventions')}</div>
            )}
          </ActionLane>

          <ActionLane
            count={summary.execution.runningTasks.length}
            countLabelKey="{{count}} active"
            icon={Activity}
            titleKey="Running Now"
            tone="running"
          >
            {visibleRunningTasks.length > 0 ? (
              visibleRunningTasks.map((task) => (
                <TaskItem
                  key={`${task.repoPath}:${task.taskId}`}
                  action={
                    onOpenTask ? (
                      <OpenTaskButton onOpen={() => onOpenTask(task.repoPath, task.taskId)} />
                    ) : undefined
                  }
                  chips={[{ text: task.repoName }, { text: `${t('Agent')} ${task.agentLabel}` }]}
                  title={task.title}
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No running tasks')}</div>
            )}
          </ActionLane>
        </div>

        <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <SupportSection icon={Users} titleKey="Agent Load">
            {visibleAgentLoads.length > 0 ? (
              visibleAgentLoads.map((load) => (
                <div
                  key={load.agentId}
                  className="flex min-w-0 items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate font-semibold text-foreground">{load.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t('Ready')} {load.readyTaskCount} / {t('Running')} {load.runningTaskCount}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No agent load')}</div>
            )}
          </SupportSection>

          <SupportSection icon={FolderGit2} titleKey="Project State">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <span className="control-chip">
                {t('Projects')} {summary.projectCount}
              </span>
              <span className="control-chip">
                {t('Open Tasks')} {summary.openTaskCount}
              </span>
              <span className="control-chip control-chip-done">
                {t('Ready')} {summary.readyTaskCount}
              </span>
              <span
                className={cn('control-chip', summary.blockedTaskCount > 0 && 'control-chip-wait')}
              >
                {t('Blocked')} {summary.blockedTaskCount}
              </span>
            </div>
          </SupportSection>
        </div>
      </div>

      {visibleProjects.length > 0 ? (
        <div className="mt-3 grid max-h-56 min-w-0 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
          {visibleProjects.map((project) => {
            const statusMeta = PROJECT_STATUS_META[project.status];
            const StatusIcon = statusMeta.icon;

            return (
              <div
                key={project.repoPath}
                className={cn(
                  'control-panel-muted min-w-0 rounded-lg px-3 py-2.5',
                  project.isCurrent && 'border-primary/36 bg-accent/12'
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <FolderGit2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {project.repoName}
                        </span>
                        {project.isCurrent && (
                          <span className="control-chip shrink-0 px-1.5 py-0 text-[10px]">
                            {t('Current')}
                          </span>
                        )}
                      </div>
                      <div
                        className="truncate text-[10px] text-muted-foreground"
                        title={project.repoPath}
                      >
                        {project.repoPath}
                      </div>
                    </div>
                  </div>
                  <span className={cn(statusMeta.chipClassName, 'shrink-0 gap-1')}>
                    <StatusIcon className="h-3 w-3" />
                    {t(statusMeta.labelKey)}
                  </span>
                </div>

                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="control-chip">
                    {t('Open Tasks')} {project.openTaskCount}
                  </span>
                  <span className="control-chip control-chip-done">
                    {t('Ready')} {project.readyTaskCount}
                  </span>
                  <span
                    className={cn(
                      'control-chip',
                      project.blockedTaskCount > 0 && 'control-chip-wait'
                    )}
                  >
                    {t('Blocked')} {project.blockedTaskCount}
                  </span>
                  {project.approvalPendingTaskCount > 0 && (
                    <span className="control-chip control-chip-wait">
                      {t('Approvals')} {project.approvalPendingTaskCount}
                    </span>
                  )}
                  {project.dependencyBlockedTaskCount > 0 && (
                    <span className="control-chip control-chip-wait">
                      {t('Dependencies')} {project.dependencyBlockedTaskCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {hiddenProjectCount > 0 && (
            <div className="control-panel-muted rounded-lg px-3 py-2 text-xs text-muted-foreground">
              +{t('{{count}} more', { count: hiddenProjectCount })}
            </div>
          )}
        </div>
      ) : (
        <div className="control-panel-muted mt-3 rounded-lg px-3 py-3">
          <div className="text-xs font-semibold text-foreground">{t('No loaded projects')}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('Select a repository to load project tasks into this center.')}
          </div>
        </div>
      )}
    </section>
  );
}
