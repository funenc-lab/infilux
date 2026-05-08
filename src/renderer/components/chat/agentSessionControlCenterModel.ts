import type {
  AgentSessionInventoryItem,
  AgentSessionInventoryStatus,
} from '@/stores/agentSessionInventory';

export interface AgentSessionControlSummary {
  total: number;
  running: number;
  waitingForInput: number;
  reconnecting: number;
  disconnected: number;
  unread: number;
  idle: number;
  dead: number;
  stale: number;
  recoverable: number;
  taskLinked: number;
  taskCompletionUnread: number;
  needsAttention: number;
}

export type AgentSessionControlTone = 'idle' | 'live' | 'wait' | 'done';
export type AgentSessionControlSectionKey = 'attention' | 'running' | 'idle' | 'dead';

export interface AgentSessionStatusPresentation {
  labelKey: string;
  chipClassName: string;
}

export interface AgentSessionControlSection {
  key: AgentSessionControlSectionKey;
  titleKey: string;
  chipClassName: string;
  items: AgentSessionInventoryItem[];
}

export interface AgentSessionAgentSummary {
  key: string;
  label: string;
  count: number;
}

export interface AgentSessionControlActionHint {
  labelKey: string;
  chipClassName: string;
}

const EMPTY_SUMMARY: AgentSessionControlSummary = {
  total: 0,
  running: 0,
  waitingForInput: 0,
  reconnecting: 0,
  disconnected: 0,
  unread: 0,
  idle: 0,
  dead: 0,
  stale: 0,
  recoverable: 0,
  taskLinked: 0,
  taskCompletionUnread: 0,
  needsAttention: 0,
};

const STATUS_PRESENTATION: Record<AgentSessionInventoryStatus, AgentSessionStatusPresentation> = {
  running: {
    labelKey: 'Running',
    chipClassName: 'control-chip control-chip-live',
  },
  'waiting-for-input': {
    labelKey: 'Waiting',
    chipClassName: 'control-chip control-chip-wait',
  },
  reconnecting: {
    labelKey: 'Reconnecting',
    chipClassName: 'control-chip control-chip-wait',
  },
  disconnected: {
    labelKey: 'Disconnected',
    chipClassName: 'control-chip',
  },
  unread: {
    labelKey: 'Unread',
    chipClassName: 'control-chip control-chip-done',
  },
  idle: {
    labelKey: 'Idle',
    chipClassName: 'control-chip',
  },
  dead: {
    labelKey: 'Dead',
    chipClassName: 'control-chip',
  },
};

const SECTION_PRESENTATION: Record<
  AgentSessionControlSectionKey,
  Pick<AgentSessionControlSection, 'titleKey' | 'chipClassName'>
> = {
  attention: {
    titleKey: 'Needs Attention',
    chipClassName: 'control-chip control-chip-wait',
  },
  running: {
    titleKey: 'Running Sessions',
    chipClassName: 'control-chip control-chip-live',
  },
  idle: {
    titleKey: 'Idle Sessions',
    chipClassName: 'control-chip',
  },
  dead: {
    titleKey: 'Ended Sessions',
    chipClassName: 'control-chip',
  },
};

const SECTION_ORDER: AgentSessionControlSectionKey[] = ['attention', 'running', 'idle', 'dead'];

function isAttentionItem(item: AgentSessionInventoryItem): boolean {
  return (
    item.status === 'waiting-for-input' ||
    item.status === 'reconnecting' ||
    item.status === 'disconnected' ||
    item.status === 'unread' ||
    item.taskCompletionUnread ||
    item.isStale
  );
}

function resolveSectionKey(item: AgentSessionInventoryItem): AgentSessionControlSectionKey {
  if (isAttentionItem(item)) {
    return 'attention';
  }
  if (item.status === 'running') {
    return 'running';
  }
  if (item.status === 'dead') {
    return 'dead';
  }
  return 'idle';
}

function compareInventoryItems(
  left: AgentSessionInventoryItem,
  right: AgentSessionInventoryItem
): number {
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }
  if (right.lastActivityAt !== left.lastActivityAt) {
    return right.lastActivityAt - left.lastActivityAt;
  }
  return left.displayName.localeCompare(right.displayName);
}

export function buildAgentSessionControlSummary(
  items: readonly AgentSessionInventoryItem[]
): AgentSessionControlSummary {
  if (items.length === 0) {
    return EMPTY_SUMMARY;
  }

  const summary: AgentSessionControlSummary = { ...EMPTY_SUMMARY, total: items.length };

  for (const item of items) {
    if (item.status === 'running') {
      summary.running += 1;
    } else if (item.status === 'waiting-for-input') {
      summary.waitingForInput += 1;
    } else if (item.status === 'reconnecting') {
      summary.reconnecting += 1;
    } else if (item.status === 'disconnected') {
      summary.disconnected += 1;
    } else if (item.status === 'unread') {
      summary.unread += 1;
    } else if (item.status === 'dead') {
      summary.dead += 1;
    } else {
      summary.idle += 1;
    }

    if (item.isStale) {
      summary.stale += 1;
    }
    if (item.isRecoverable) {
      summary.recoverable += 1;
    }
    if (item.task) {
      summary.taskLinked += 1;
    }
    if (item.taskCompletionUnread) {
      summary.taskCompletionUnread += 1;
    }
    if (isAttentionItem(item)) {
      summary.needsAttention += 1;
    }
  }

  return summary;
}

export function buildAgentSessionControlSections(
  items: readonly AgentSessionInventoryItem[]
): AgentSessionControlSection[] {
  const buckets = new Map<AgentSessionControlSectionKey, AgentSessionInventoryItem[]>(
    SECTION_ORDER.map((key) => [key, []])
  );

  for (const item of items) {
    buckets.get(resolveSectionKey(item))?.push(item);
  }

  return SECTION_ORDER.flatMap((key) => {
    const sectionItems = buckets.get(key) ?? [];
    if (sectionItems.length === 0) {
      return [];
    }
    const presentation = SECTION_PRESENTATION[key];
    return [
      {
        key,
        titleKey: presentation.titleKey,
        chipClassName: presentation.chipClassName,
        items: [...sectionItems].sort(compareInventoryItems),
      },
    ];
  });
}

export function buildAgentSessionAgentSummaries(
  items: readonly AgentSessionInventoryItem[],
  maxItems = 4
): AgentSessionAgentSummary[] {
  const countsByAgent = new Map<string, AgentSessionAgentSummary>();

  for (const item of items) {
    const key = `${item.agentFamily}:${item.agentName}`;
    const current = countsByAgent.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    countsByAgent.set(key, {
      key,
      label: item.agentName,
      count: 1,
    });
  }

  return [...countsByAgent.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, Math.max(0, maxItems));
}

export function resolveAgentSessionControlActionHint(
  summary: AgentSessionControlSummary
): AgentSessionControlActionHint {
  if (summary.waitingForInput > 0) {
    return {
      labelKey: 'Review waiting sessions',
      chipClassName: 'control-chip control-chip-wait',
    };
  }
  if (summary.reconnecting > 0) {
    return {
      labelKey: 'Reconnecting',
      chipClassName: 'control-chip control-chip-wait',
    };
  }
  if (summary.disconnected > 0) {
    return {
      labelKey: 'Disconnected',
      chipClassName: 'control-chip',
    };
  }
  if (summary.unread > 0 || summary.taskCompletionUnread > 0) {
    return {
      labelKey: 'Inspect unread results',
      chipClassName: 'control-chip control-chip-done',
    };
  }
  if (summary.stale > 0) {
    return {
      labelKey: 'Review stale sessions',
      chipClassName: 'control-chip control-chip-wait',
    };
  }
  if (summary.running > 0) {
    return {
      labelKey: 'Monitor running sessions',
      chipClassName: 'control-chip control-chip-live',
    };
  }
  if (summary.total > 0) {
    return {
      labelKey: 'All sessions idle',
      chipClassName: 'control-chip',
    };
  }
  return {
    labelKey: 'No active sessions',
    chipClassName: 'control-chip',
  };
}

export function resolveAgentSessionControlTone(
  summary: AgentSessionControlSummary
): AgentSessionControlTone {
  if (
    summary.waitingForInput > 0 ||
    summary.reconnecting > 0 ||
    summary.disconnected > 0 ||
    summary.stale > 0
  ) {
    return 'wait';
  }
  if (summary.running > 0) {
    return 'live';
  }
  if (summary.unread > 0 || summary.taskCompletionUnread > 0) {
    return 'done';
  }
  return 'idle';
}

export function resolveAgentSessionStatusPresentation(
  status: AgentSessionInventoryStatus
): AgentSessionStatusPresentation {
  return STATUS_PRESENTATION[status];
}
