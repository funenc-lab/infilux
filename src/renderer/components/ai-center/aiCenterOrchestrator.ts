import type {
  AiCenterInterventionReason,
  AiCenterNextAction,
  AiCenterSummary,
} from '../todo/todoViewModel';
import type { ResolvedAgent } from '../todo/useEnabledAgents';

export type AiCenterRecommendedAction =
  | 'approve-blockers'
  | 'dispatch-ready'
  | 'monitor-running'
  | 'resolve-dependencies'
  | 'standby';

export type AiCenterDecisionConfidence = 'high' | 'low' | 'medium';
export type AiCenterRiskSeverity = 'high' | 'low' | 'medium';
export type AiCenterCoordinationSignalKind =
  | 'agent-coverage'
  | 'cross-project'
  | 'intervention'
  | 'monitoring'
  | 'task-splitting';

export interface AiCenterDispatchPlanTask {
  repoPath: string;
  repoName: string;
  taskId: string;
  title: string;
  priority: string;
}

export interface AiCenterDispatchBatch {
  agentId: string;
  agentLabel: string;
  tasks: AiCenterDispatchPlanTask[];
}

export interface AiCenterDecisionItem {
  id: string;
  label: string;
  detail: string;
  agentLabel?: string;
  agentLabelKey?: string;
  meta?: string;
  reasonLabelKeys?: string[];
}

export interface AiCenterRiskItem {
  id: string;
  severity: AiCenterRiskSeverity;
  label: string;
  detail: string;
}

export interface AiCenterDecisionPlan {
  confidence: AiCenterDecisionConfidence;
  coordinationSignals: AiCenterCoordinationSignal[];
  deferredQueueItems: AiCenterDecisionItem[];
  dispatchBatches: AiCenterDispatchBatch[];
  headline: string;
  interventionItems: AiCenterDecisionItem[];
  monitoringItems: AiCenterDecisionItem[];
  recommendedAction: AiCenterRecommendedAction;
  riskItems: AiCenterRiskItem[];
}

export interface AiCenterCoordinationSignal {
  id: string;
  kind: AiCenterCoordinationSignalKind;
  severity: AiCenterRiskSeverity;
  label: string;
  detail: string;
}

export interface BuildAiCenterDecisionPlanOptions {
  agents: readonly ResolvedAgent[];
  summary: AiCenterSummary;
}

export interface BuildAiCenterSessionPromptOptions {
  currentRepoPath?: string;
  currentWorktreePath?: string;
  plan: AiCenterDecisionPlan;
  summary: AiCenterSummary;
}

function resolveRecommendedAction(nextAction: AiCenterNextAction): AiCenterRecommendedAction {
  if (nextAction === 'request-approval') return 'approve-blockers';
  if (nextAction === 'idle') return 'standby';
  return nextAction;
}

function resolveHeadline(action: AiCenterRecommendedAction): string {
  if (action === 'monitor-running') return 'Monitor running tasks';
  if (action === 'dispatch-ready') return 'Dispatch ready tasks';
  if (action === 'approve-blockers') return 'Approve blocked tasks';
  if (action === 'resolve-dependencies') return 'Resolve task dependencies';
  return 'Stand by';
}

function resolveConfidence(
  summary: AiCenterSummary,
  agents: readonly ResolvedAgent[]
): AiCenterDecisionConfidence {
  if (summary.openTaskCount === 0) return 'high';
  if (agents.length === 0 || summary.blockedTaskCount > summary.readyTaskCount) return 'low';
  if (summary.blockedTaskCount > 0 || summary.runningTaskCount > 0) return 'medium';
  return 'high';
}

function buildDispatchBatches(summary: AiCenterSummary): AiCenterDispatchBatch[] {
  const batches = new Map<string, AiCenterDispatchBatch>();

  for (const task of summary.execution.dispatchableTasks) {
    const current = batches.get(task.agentId) ?? {
      agentId: task.agentId,
      agentLabel: task.agentLabel,
      tasks: [],
    };
    current.tasks.push({
      repoPath: task.repoPath,
      repoName: task.repoName,
      taskId: task.taskId,
      title: task.title,
      priority: task.priority,
    });
    batches.set(task.agentId, current);
  }

  return Array.from(batches.values());
}

function buildDeferredQueueItems(summary: AiCenterSummary): AiCenterDecisionItem[] {
  return summary.execution.deferredQueueTasks.map((task) => ({
    id: `${task.repoPath}:${task.taskId}`,
    label: task.title,
    detail: `${task.repoName}: queued after current run`,
    meta: task.repoName,
  }));
}

function buildInterventionItems(summary: AiCenterSummary): AiCenterDecisionItem[] {
  return summary.execution.interventionTasks.map((task) => ({
    id: `${task.repoPath}:${task.taskId}`,
    label: task.title,
    detail: `${task.repoName}: ${task.reasons.join(', ')}`,
    meta: task.repoName,
    reasonLabelKeys: task.reasons.map(resolveInterventionReasonLabelKey),
  }));
}

function resolveInterventionReasonLabelKey(reason: AiCenterInterventionReason): string {
  if (reason === 'approval') return 'Approval Required';
  return 'Dependency Blocked';
}

function buildMonitoringItems(summary: AiCenterSummary): AiCenterDecisionItem[] {
  return summary.execution.runningTasks.map((task) => ({
    id: `${task.repoPath}:${task.taskId}`,
    label: task.title,
    detail: `${task.repoName}: ${task.agentLabel}`,
    meta: task.repoName,
    agentLabel: task.agentLabel,
    ...(task.agentId === 'auto' ? { agentLabelKey: 'Auto Select' } : {}),
  }));
}

function buildRiskItems(
  summary: AiCenterSummary,
  agents: readonly ResolvedAgent[]
): AiCenterRiskItem[] {
  const risks: AiCenterRiskItem[] = [];

  if (summary.blockedTaskCount > 0) {
    risks.push({
      id: 'blocked-tasks',
      severity: summary.blockedTaskCount > summary.readyTaskCount ? 'high' : 'medium',
      label: 'Blocked tasks need intervention',
      detail: `${summary.blockedTaskCount} blocked, ${summary.approvalPendingTaskCount} approvals, ${summary.dependencyBlockedTaskCount} dependencies`,
    });
  }

  const enabledAgentIds = new Set(agents.map((agent) => agent.agentId));
  const uncoveredAgentIds = new Set(
    summary.execution.dispatchableTasks
      .map((task) => task.agentId)
      .filter((agentId) => agentId !== 'auto' && !enabledAgentIds.has(agentId))
  );
  if (uncoveredAgentIds.size > 0) {
    risks.push({
      id: 'agent-coverage',
      severity: 'medium',
      label: 'Some assigned agents are unavailable',
      detail: Array.from(uncoveredAgentIds).sort().join(', '),
    });
  }

  if (summary.runningTaskCount > 0 && summary.runningProjectCount === 0) {
    risks.push({
      id: 'runtime-state',
      severity: 'low',
      label: 'Running task state is detached from auto-execute state',
      detail: `${summary.runningTaskCount} tasks are marked running`,
    });
  }

  return risks;
}

function getUnavailableAgentIds(
  summary: AiCenterSummary,
  agents: readonly ResolvedAgent[]
): string[] {
  const enabledAgentIds = new Set(agents.map((agent) => agent.agentId));
  return Array.from(
    new Set(
      summary.execution.dispatchableTasks
        .map((task) => task.agentId)
        .filter((agentId) => agentId !== 'auto' && !enabledAgentIds.has(agentId))
    )
  ).sort();
}

function buildCoordinationSignals(
  summary: AiCenterSummary,
  agents: readonly ResolvedAgent[]
): AiCenterCoordinationSignal[] {
  const signals: AiCenterCoordinationSignal[] = [];
  const dispatchRepoCount = new Set(
    summary.execution.dispatchableTasks.map((task) => task.repoPath)
  ).size;
  const unavailableAgentIds = getUnavailableAgentIds(summary, agents);

  if (dispatchRepoCount > 1) {
    signals.push({
      id: 'cross-project-dispatch',
      kind: 'cross-project',
      severity: 'medium',
      label: 'Coordinate cross-project dispatch',
      detail: `${dispatchRepoCount} projects have ready tasks`,
    });
  }

  if (unavailableAgentIds.length > 0) {
    signals.push({
      id: 'agent-reassignment',
      kind: 'agent-coverage',
      severity: 'high',
      label: 'Reassign unavailable agent tasks',
      detail: unavailableAgentIds.join(', '),
    });
  }

  if (summary.execution.interventionTasks.length > 0) {
    signals.push({
      id: 'intervention-queue',
      kind: 'intervention',
      severity: 'high',
      label: 'Review intervention queue',
      detail: `${summary.execution.interventionTasks.length} tasks need human decision`,
    });
  }

  if (summary.execution.runningTasks.length > 0) {
    signals.push({
      id: 'active-monitoring',
      kind: 'monitoring',
      severity: 'medium',
      label: 'Monitor active executions',
      detail: `${summary.execution.runningTasks.length} tasks are running`,
    });
  }

  if (summary.execution.dispatchableTasks.length > agents.length && agents.length > 0) {
    signals.push({
      id: 'task-splitting',
      kind: 'task-splitting',
      severity: 'low',
      label: 'Split dispatch into staged batches',
      detail: `${summary.execution.dispatchableTasks.length} ready tasks across ${agents.length} enabled agents`,
    });
  }

  return signals;
}

export function buildAiCenterDecisionPlan({
  agents,
  summary,
}: BuildAiCenterDecisionPlanOptions): AiCenterDecisionPlan {
  const recommendedAction = resolveRecommendedAction(summary.execution.nextAction);

  return {
    confidence: resolveConfidence(summary, agents),
    coordinationSignals: buildCoordinationSignals(summary, agents),
    deferredQueueItems: buildDeferredQueueItems(summary),
    dispatchBatches: buildDispatchBatches(summary),
    headline: resolveHeadline(recommendedAction),
    interventionItems: buildInterventionItems(summary),
    monitoringItems: buildMonitoringItems(summary),
    recommendedAction,
    riskItems: buildRiskItems(summary, agents),
  };
}

function formatFallback(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildAiCenterSessionPrompt({
  currentRepoPath,
  currentWorktreePath,
  plan,
  summary,
}: BuildAiCenterSessionPromptOptions): string {
  const projectLines = summary.projects.map(
    (project) =>
      `- ${project.repoName}: ${project.status}, open ${project.openTaskCount}, ready ${project.readyTaskCount}, blocked ${project.blockedTaskCount}`
  );
  const dispatchLines = plan.dispatchBatches.flatMap((batch) =>
    batch.tasks.map(
      (task) => `- [${batch.agentLabel}] ${task.repoName}/${task.taskId}: ${task.title}`
    )
  );
  const interventionLines = summary.execution.interventionTasks.map(
    (task) => `- [${task.reasons.join(', ')}] ${task.repoName}/${task.taskId}: ${task.title}`
  );
  const runningLines = summary.execution.runningTasks.map(
    (task) => `- [${task.agentLabel}] ${task.repoName}/${task.taskId}: ${task.title}`
  );
  const riskLines = plan.riskItems.map(
    (risk) => `- [${risk.severity}] ${risk.label}: ${risk.detail}`
  );
  const coordinationLines = plan.coordinationSignals.map(
    (signal) => `- [${signal.kind}/${signal.severity}] ${signal.label}: ${signal.detail}`
  );
  const decisionWorklistLines = [
    ...plan.interventionItems.map((item) => `- Intervention: ${item.label} - ${item.detail}`),
    ...plan.monitoringItems.map((item) => `- Monitor: ${item.label} - ${item.detail}`),
    ...plan.deferredQueueItems.map((item) => `- Deferred: ${item.label} - ${item.detail}`),
  ];

  return `
[AI CENTER CONTEXT]
Current repository: ${formatFallback(currentRepoPath, 'none')}
Current worktree: ${formatFallback(currentWorktreePath, 'none')}
Recommended action: ${plan.recommendedAction}
Decision confidence: ${plan.confidence}

[PROJECT STATE]
${projectLines.length > 0 ? projectLines.join('\n') : '- No loaded projects'}

[DISPATCH PLAN]
${dispatchLines.length > 0 ? dispatchLines.join('\n') : '- No ready tasks'}

[INTERVENTIONS]
${interventionLines.length > 0 ? interventionLines.join('\n') : '- No intervention required'}

[RUNNING TASKS]
${runningLines.length > 0 ? runningLines.join('\n') : '- No running tasks'}

[DECISION WORKLIST]
${decisionWorklistLines.length > 0 ? decisionWorklistLines.join('\n') : '- No decision worklist items'}

[COORDINATION SIGNALS]
${coordinationLines.length > 0 ? coordinationLines.join('\n') : '- No coordination signals'}

[RISKS]
${riskLines.length > 0 ? riskLines.join('\n') : '- No current risks'}

Use the current project Todo tasks as source of truth. Analyze whether to dispatch, pause, split, reassign, or request human approval. Keep the answer actionable and include validation expectations for any task you recommend running.
`.trim();
}
