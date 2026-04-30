import { Sparkles, Terminal } from 'lucide-react';
import type { ReactElement } from 'react';

type Translate = (value: string) => string;

interface WorktreeActivityCounts {
  agentCount: number;
  terminalCount: number;
}

interface WorktreeDiffStats {
  insertions: number;
  deletions: number;
}

export interface WorktreeInlineItem {
  key: string;
  priority: 'critical' | 'medium' | 'low';
  content: ReactElement;
}

interface BuildWorktreeInlineItemsOptions {
  t: Translate;
  isMain: boolean;
  isPrunable: boolean;
  isMerged: boolean;
  diffStats: WorktreeDiffStats;
  ahead: number;
  behind: number;
  activity: WorktreeActivityCounts;
  hasCompletedTaskNotice: boolean;
}

function isWorktreeInlineItem(item: WorktreeInlineItem | null): item is WorktreeInlineItem {
  return item !== null;
}

export function buildWorktreeActivitySummary(
  activity: WorktreeActivityCounts,
  t: Translate
): string {
  return [
    activity.agentCount > 0 ? `${activity.agentCount} ${t('agents')}` : null,
    activity.terminalCount > 0 ? `${activity.terminalCount} ${t('terminals')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildWorktreeInlineItems({
  t,
  isMain,
  isPrunable,
  isMerged,
  diffStats,
  ahead,
  behind,
  activity,
  hasCompletedTaskNotice,
}: BuildWorktreeInlineItemsOptions): WorktreeInlineItem[] {
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;
  const agentSummary = `${activity.agentCount} ${t('agents')}`;
  const terminalSummary = `${activity.terminalCount} ${t('terminals')}`;

  return [
    isMain
      ? {
          key: 'main',
          priority: 'medium' as const,
          content: <span className="control-tree-flag control-tree-flag-main">{t('Main')}</span>,
        }
      : !isPrunable && isMerged
        ? {
            key: 'merged',
            priority: 'medium' as const,
            content: (
              <span className="control-tree-flag control-tree-flag-merged">{t('Merged')}</span>
            ),
          }
        : null,
    hasDiffStats
      ? {
          key: 'diff',
          priority: 'critical' as const,
          content: (
            <span className="control-tree-diff-badge" data-kind="diff">
              {diffStats.insertions > 0 ? (
                <span className="control-tree-diff-positive">+{diffStats.insertions}</span>
              ) : null}
              {diffStats.deletions > 0 ? (
                <span className="control-tree-diff-negative">-{diffStats.deletions}</span>
              ) : null}
            </span>
          ),
        }
      : null,
    ahead > 0 || behind > 0
      ? {
          key: 'sync',
          priority: 'critical' as const,
          content: (
            <span className="control-tree-sync-inline" data-kind="sync">
              {ahead > 0 ? (
                <span className="control-tree-sync-inline-segment">
                  <span className="control-tree-metric-prefix">^</span>
                  <span className="control-tree-metric-value">{ahead}</span>
                </span>
              ) : null}
              {ahead > 0 && behind > 0 ? <span className="control-tree-separator">/</span> : null}
              {behind > 0 ? (
                <span className="control-tree-sync-inline-segment">
                  <span className="control-tree-metric-prefix">v</span>
                  <span className="control-tree-metric-value">{behind}</span>
                </span>
              ) : null}
            </span>
          ),
        }
      : null,
    activity.agentCount > 0
      ? {
          key: 'agents',
          priority: 'low' as const,
          content: (
            <span className="control-tree-metric" title={agentSummary} data-kind="agents">
              <Sparkles className="control-tree-metric-icon" aria-hidden="true" />
              <span className="control-tree-metric-value">{activity.agentCount}</span>
              <span className="sr-only">{agentSummary}</span>
            </span>
          ),
        }
      : null,
    activity.terminalCount > 0
      ? {
          key: 'terminals',
          priority: 'low' as const,
          content: (
            <span className="control-tree-metric" title={terminalSummary} data-kind="terminals">
              <Terminal className="control-tree-metric-icon" aria-hidden="true" />
              <span className="control-tree-metric-value">{activity.terminalCount}</span>
              <span className="sr-only">{terminalSummary}</span>
            </span>
          ),
        }
      : null,
    hasCompletedTaskNotice
      ? {
          key: 'completed',
          priority: 'low' as const,
          content: <span className="control-task-completion-dot" />,
        }
      : null,
  ].filter(isWorktreeInlineItem);
}
