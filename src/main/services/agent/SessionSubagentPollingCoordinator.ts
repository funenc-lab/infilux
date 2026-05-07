import type {
  ListSessionAgentSubagentsRequest,
  ListSessionAgentSubagentsResult,
  LiveAgentSubagent,
  SessionAgentSubagentSubscriptionTarget,
  SessionAgentSubagentsUpdatedEvent,
} from '@shared/types';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';

interface SessionSubagentLookup {
  listSession(request: ListSessionAgentSubagentsRequest): Promise<ListSessionAgentSubagentsResult>;
}

interface SessionSubagentPollingCoordinatorOptions {
  defaultPollIntervalMs?: number;
}

interface SessionSubagentSubscription {
  ownerId: string;
  subscriptionId: string;
  pollIntervalMs: number;
  targets: SessionAgentSubagentSubscriptionTarget[];
  listener: (event: SessionAgentSubagentsUpdatedEvent) => void;
}

interface TargetState {
  target: SessionAgentSubagentSubscriptionTarget;
  subscriberKeys: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  activePollIntervalMs: number | null;
  inFlight: Promise<void> | null;
  cachedResult: ListSessionAgentSubagentsResult | null;
}

interface SubscriptionHandle {
  ownerId: string;
  subscriptionId: string;
}

const DEFAULT_POLL_INTERVAL_MS = 2_000;

function resolveWorkspacePlatform(): 'linux' | 'darwin' | 'win32' {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform;
  }

  return 'linux';
}

function normalizeTargetCwd(cwd: string): string {
  return normalizeWorkspaceKey(cwd, resolveWorkspacePlatform());
}

function buildTargetKey(
  target: Pick<SessionAgentSubagentSubscriptionTarget, 'providerSessionId' | 'cwd'>
): string {
  return `${target.providerSessionId}\n${normalizeTargetCwd(target.cwd)}`;
}

function buildSubscriptionKey(ownerId: string, subscriptionId: string): string {
  return `${ownerId}\n${subscriptionId}`;
}

function areLiveSubagentListsEqual(left: LiveAgentSubagent[], right: LiveAgentSubagent[]): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem.id !== rightItem.id ||
      leftItem.provider !== rightItem.provider ||
      leftItem.threadId !== rightItem.threadId ||
      leftItem.rootThreadId !== rightItem.rootThreadId ||
      leftItem.parentThreadId !== rightItem.parentThreadId ||
      leftItem.cwd !== rightItem.cwd ||
      leftItem.label !== rightItem.label ||
      leftItem.agentType !== rightItem.agentType ||
      leftItem.summary !== rightItem.summary ||
      leftItem.status !== rightItem.status ||
      leftItem.lastSeenAt !== rightItem.lastSeenAt
    ) {
      return false;
    }
  }

  return true;
}

function areResultsEqual(
  current: ListSessionAgentSubagentsResult | null,
  next: ListSessionAgentSubagentsResult
): boolean {
  if (!current) {
    return false;
  }

  return areLiveSubagentListsEqual(current.items, next.items);
}

export class SessionSubagentPollingCoordinator {
  private readonly defaultPollIntervalMs: number;
  private readonly subscriptions = new Map<string, SessionSubagentSubscription>();
  private readonly targets = new Map<string, TargetState>();

  constructor(
    private readonly sessionSubagentLookup: SessionSubagentLookup,
    options: SessionSubagentPollingCoordinatorOptions = {}
  ) {
    this.defaultPollIntervalMs = options.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  subscribe(
    subscription: {
      ownerId: string;
      subscriptionId: string;
      targets: SessionAgentSubagentSubscriptionTarget[];
      pollIntervalMs?: number;
    },
    listener: (event: SessionAgentSubagentsUpdatedEvent) => void
  ): void {
    const normalizedTargets = subscription.targets
      .filter((target) => target.sessionId && target.providerSessionId && target.cwd)
      .map((target) => ({
        ...target,
        cwd: normalizeTargetCwd(target.cwd),
      }));
    const subscriptionKey = buildSubscriptionKey(subscription.ownerId, subscription.subscriptionId);

    this.unsubscribe({
      ownerId: subscription.ownerId,
      subscriptionId: subscription.subscriptionId,
    });

    if (normalizedTargets.length === 0) {
      return;
    }

    const record: SessionSubagentSubscription = {
      ownerId: subscription.ownerId,
      subscriptionId: subscription.subscriptionId,
      pollIntervalMs: subscription.pollIntervalMs ?? this.defaultPollIntervalMs,
      targets: normalizedTargets,
      listener,
    };
    this.subscriptions.set(subscriptionKey, record);

    for (const target of normalizedTargets) {
      const targetKey = buildTargetKey(target);
      const targetState = this.getOrCreateTargetState(target);
      targetState.subscriberKeys.add(subscriptionKey);
      this.ensurePolling(targetKey, targetState);
    }

    this.emitCachedSnapshot(subscriptionKey);
  }

  unsubscribe(handle: SubscriptionHandle): void {
    const subscriptionKey = buildSubscriptionKey(handle.ownerId, handle.subscriptionId);
    const subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription) {
      return;
    }

    this.subscriptions.delete(subscriptionKey);
    for (const target of subscription.targets) {
      const targetKey = buildTargetKey(target);
      const targetState = this.targets.get(targetKey);
      if (!targetState) {
        continue;
      }

      targetState.subscriberKeys.delete(subscriptionKey);
      if (targetState.subscriberKeys.size === 0) {
        this.stopTarget(targetKey, targetState);
        continue;
      }

      this.ensurePolling(targetKey, targetState);
    }
  }

  unsubscribeOwner(ownerId: string): void {
    const subscriptionIds = [...this.subscriptions.values()]
      .filter((subscription) => subscription.ownerId === ownerId)
      .map((subscription) => subscription.subscriptionId);

    for (const subscriptionId of subscriptionIds) {
      this.unsubscribe({ ownerId, subscriptionId });
    }
  }

  dispose(): void {
    for (const [targetKey, targetState] of this.targets) {
      this.stopTarget(targetKey, targetState);
    }
    this.targets.clear();
    this.subscriptions.clear();
  }

  private getOrCreateTargetState(target: SessionAgentSubagentSubscriptionTarget): TargetState {
    const targetKey = buildTargetKey(target);
    const existing = this.targets.get(targetKey);
    if (existing) {
      return existing;
    }

    const created: TargetState = {
      target,
      subscriberKeys: new Set(),
      timer: null,
      activePollIntervalMs: null,
      inFlight: null,
      cachedResult: null,
    };
    this.targets.set(targetKey, created);
    return created;
  }

  private ensurePolling(targetKey: string, targetState: TargetState): void {
    const pollIntervalMs = this.getTargetPollIntervalMs(targetState);

    if (!targetState.timer) {
      void this.pollTarget(targetKey, targetState);
      targetState.timer = setInterval(() => {
        void this.pollTarget(targetKey, targetState);
      }, pollIntervalMs);
      targetState.activePollIntervalMs = pollIntervalMs;
      return;
    }

    if (targetState.activePollIntervalMs === pollIntervalMs) {
      return;
    }

    clearInterval(targetState.timer);
    targetState.timer = setInterval(() => {
      void this.pollTarget(targetKey, targetState);
    }, pollIntervalMs);
    targetState.activePollIntervalMs = pollIntervalMs;
  }

  private getTargetPollIntervalMs(targetState: TargetState): number {
    let shortestIntervalMs = this.defaultPollIntervalMs;

    for (const subscriptionKey of targetState.subscriberKeys) {
      const subscription = this.subscriptions.get(subscriptionKey);
      if (!subscription) {
        continue;
      }
      shortestIntervalMs = Math.min(shortestIntervalMs, subscription.pollIntervalMs);
    }

    return shortestIntervalMs;
  }

  private stopTarget(targetKey: string, targetState: TargetState): void {
    if (targetState.timer) {
      clearInterval(targetState.timer);
      targetState.timer = null;
    }
    targetState.activePollIntervalMs = null;
    this.targets.delete(targetKey);
  }

  private async pollTarget(targetKey: string, targetState: TargetState): Promise<void> {
    if (targetState.inFlight) {
      return targetState.inFlight;
    }

    targetState.inFlight = this.sessionSubagentLookup
      .listSession({
        providerSessionId: targetState.target.providerSessionId,
        cwd: targetState.target.cwd,
      })
      .catch(() => ({
        items: [],
        generatedAt: Date.now(),
      }))
      .then((result) => {
        const changed = !areResultsEqual(targetState.cachedResult, result);
        targetState.cachedResult = result;
        if (changed) {
          this.notifySubscribers(targetKey);
        }
      })
      .finally(() => {
        targetState.inFlight = null;
      });

    return targetState.inFlight;
  }

  private notifySubscribers(targetKey: string): void {
    const targetState = this.targets.get(targetKey);
    if (!targetState) {
      return;
    }

    for (const subscriptionKey of targetState.subscriberKeys) {
      this.emitSnapshot(subscriptionKey);
    }
  }

  private emitCachedSnapshot(subscriptionKey: string): void {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription) {
      return;
    }

    const hasCachedTarget = subscription.targets.some((target) => {
      const targetState = this.targets.get(buildTargetKey(target));
      return Boolean(targetState?.cachedResult);
    });
    if (!hasCachedTarget) {
      return;
    }

    this.emitSnapshot(subscriptionKey);
  }

  private emitSnapshot(subscriptionKey: string): void {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription) {
      return;
    }

    let generatedAt = 0;
    const itemsBySessionId: Record<string, LiveAgentSubagent[]> = {};

    for (const target of subscription.targets) {
      const targetState = this.targets.get(buildTargetKey(target));
      const cachedResult = targetState?.cachedResult;
      itemsBySessionId[target.sessionId] = cachedResult?.items ?? [];
      if ((cachedResult?.generatedAt ?? 0) > generatedAt) {
        generatedAt = cachedResult?.generatedAt ?? generatedAt;
      }
    }

    subscription.listener({
      subscriptionId: subscription.subscriptionId,
      itemsBySessionId,
      generatedAt: generatedAt || Date.now(),
    });
  }
}
