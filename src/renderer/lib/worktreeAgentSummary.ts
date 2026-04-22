import type { LiveAgentSubagent, LiveAgentSubagentStatus } from '@shared/types';
import { normalizePath } from '@/App/storage';

interface SessionLike {
  id: string;
  cwd: string;
}

export function buildActiveSessionMapByWorktree<T extends SessionLike>(
  sessions: T[],
  activeIds: Record<string, string | null | undefined>
): Map<string, T> {
  const sessionsByWorktree = new Map<string, T[]>();

  for (const session of sessions) {
    const key = normalizePath(session.cwd);
    const existing = sessionsByWorktree.get(key) ?? [];
    existing.push(session);
    sessionsByWorktree.set(key, existing);
  }

  const result = new Map<string, T>();

  for (const [worktreePath, worktreeSessions] of sessionsByWorktree.entries()) {
    const activeId = activeIds[worktreePath];
    const activeSession =
      worktreeSessions.find((session) => session.id === activeId) ?? worktreeSessions[0];

    if (activeSession) {
      result.set(worktreePath, activeSession);
    }
  }

  return result;
}

export function groupSubagentsByWorktree(
  items: LiveAgentSubagent[]
): Map<string, LiveAgentSubagent[]> {
  const grouped = new Map<string, LiveAgentSubagent[]>();

  for (const item of items) {
    const key = normalizePath(item.cwd);
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }

  for (const [key, value] of grouped.entries()) {
    grouped.set(
      key,
      [...value].sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    );
  }

  return grouped;
}

export interface WorktreeSubagentNode {
  item: LiveAgentSubagent;
  children: WorktreeSubagentNode[];
}

export interface VisibleWorktreeSubagentRow {
  threadId: string;
  item: LiveAgentSubagent;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export function buildWorktreeSubagentTree(items: LiveAgentSubagent[]): WorktreeSubagentNode[] {
  const sortedItems = [...items].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  const nodesByThreadId = new Map<string, WorktreeSubagentNode>();

  for (const item of sortedItems) {
    nodesByThreadId.set(item.threadId, {
      item,
      children: [],
    });
  }

  const roots: WorktreeSubagentNode[] = [];

  for (const item of sortedItems) {
    const node = nodesByThreadId.get(item.threadId);
    if (!node) {
      continue;
    }

    const parentNode = nodesByThreadId.get(item.parentThreadId);
    if (parentNode) {
      parentNode.children.push(node);
      continue;
    }

    roots.push(node);
  }

  return roots;
}

export function collectExpandableSubagentThreadIds(nodes: WorktreeSubagentNode[]): Set<string> {
  const threadIds = new Set<string>();

  const visit = (node: WorktreeSubagentNode) => {
    if (node.children.length > 0) {
      threadIds.add(node.item.threadId);
      for (const child of node.children) {
        visit(child);
      }
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return threadIds;
}

export function buildVisibleWorktreeSubagentRows(
  nodes: WorktreeSubagentNode[],
  collapsedThreadIds: Set<string>,
  depth = 1
): VisibleWorktreeSubagentRow[] {
  const rows: VisibleWorktreeSubagentRow[] = [];

  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren ? !collapsedThreadIds.has(node.item.threadId) : false;

    rows.push({
      threadId: node.item.threadId,
      item: node.item,
      depth,
      hasChildren,
      isExpanded,
    });

    if (hasChildren && isExpanded) {
      rows.push(...buildVisibleWorktreeSubagentRows(node.children, collapsedThreadIds, depth + 1));
    }
  }

  return rows;
}

interface SubagentStatusPresentation {
  label: string;
  dotClassName: string;
  badgeClassName: string;
  buttonClassName: string;
}

const SUBAGENT_STATUS_PRESENTATION: Record<LiveAgentSubagentStatus, SubagentStatusPresentation> = {
  running: {
    label: 'Running',
    dotClassName: 'bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]',
    badgeClassName: 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    buttonClassName:
      'hover:bg-emerald-500/8 hover:text-emerald-100 focus-visible:ring-emerald-400/40',
  },
  waiting: {
    label: 'Waiting',
    dotClassName: 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.16)]',
    badgeClassName: 'border border-amber-500/20 bg-amber-500/10 text-amber-200',
    buttonClassName: 'hover:bg-amber-500/8 hover:text-amber-100 focus-visible:ring-amber-400/40',
  },
  stale: {
    label: 'Stale',
    dotClassName: 'bg-muted-foreground/50 shadow-[0_0_0_3px_rgba(148,163,184,0.12)]',
    badgeClassName: 'border border-border/70 bg-muted/40 text-muted-foreground',
    buttonClassName:
      'hover:bg-muted/50 hover:text-foreground focus-visible:ring-muted-foreground/30',
  },
  completed: {
    label: 'Completed',
    dotClassName: 'bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.16)]',
    badgeClassName: 'border border-sky-500/20 bg-sky-500/10 text-sky-200',
    buttonClassName: 'hover:bg-sky-500/8 hover:text-sky-100 focus-visible:ring-sky-400/40',
  },
};

export function getSubagentStatusPresentation(
  status: LiveAgentSubagentStatus
): SubagentStatusPresentation {
  return SUBAGENT_STATUS_PRESENTATION[status];
}
