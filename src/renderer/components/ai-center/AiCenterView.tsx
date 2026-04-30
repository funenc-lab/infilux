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
  AiCenterNextAction,
  AiCenterProjectStatus,
  AiCenterSummary,
} from '../todo/todoViewModel';

interface AiCenterViewProps {
  canDispatchReadyTasks?: boolean;
  onApproveTask?: (repoPath: string, taskId: string) => void;
  onDispatchReadyTasks?: () => void;
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

export function AiCenterView({
  canDispatchReadyTasks = false,
  onApproveTask,
  onDispatchReadyTasks,
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
    canDispatchReadyTasks &&
    summary.execution.nextAction === 'dispatch-ready' &&
    summary.execution.dispatchableTasks.length > 0;

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
