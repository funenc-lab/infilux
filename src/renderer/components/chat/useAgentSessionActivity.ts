import { useCallback, useEffect, useMemo, useRef } from 'react';

export const ACTIVE_AGENT_SESSION_ACTIVITY_POLL_INTERVAL_MS = 1_000;
export const VISIBLE_AGENT_SESSION_ACTIVITY_POLL_INTERVAL_MS = 5_000;
export const AGENT_SESSION_ACTIVITY_OUTPUT_STALE_MS = 3_000;

interface SessionActivityVisibilityDocument {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

interface AgentSessionActivityObservationInput {
  isActive: boolean;
  isVisible: boolean;
  onActivity?: (hasProcessActivity: boolean) => void;
  onOutput?: () => void;
  sessionId: string;
}

interface AgentSessionActivityObservation extends AgentSessionActivityObservationInput {
  id: number;
  isMonitoring: boolean;
}

interface SessionActivityCandidate {
  isActive: boolean;
  lastOutputAt?: number;
  lastPolledAt?: number;
  sessionId: string;
}

export interface AgentSessionActivityObservationHandle {
  dispose: () => void;
  recordOutput: () => void;
  setMonitoring: (isMonitoring: boolean) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  update: (input: Omit<AgentSessionActivityObservationInput, 'sessionId'>) => void;
}

export interface AgentSessionActivitySchedulerOptions {
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  document?: SessionActivityVisibilityDocument;
  getActivity: (sessionId: string) => Promise<boolean>;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof globalThis.setTimeout>;
}

export class AgentSessionActivityScheduler {
  private readonly clearTimeoutFn: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly document: SessionActivityVisibilityDocument | undefined;
  private readonly getActivity: (sessionId: string) => Promise<boolean>;
  private readonly lastOutputAtBySessionId = new Map<string, number>();
  private readonly lastPolledAtBySessionId = new Map<string, number>();
  private readonly now: () => number;
  private readonly observations = new Map<number, AgentSessionActivityObservation>();
  private nextObservationId = 1;
  private isPolling = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AgentSessionActivitySchedulerOptions) {
    const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
    const scheduleTimer = options.setTimeout ?? globalThis.setTimeout;

    this.clearTimeoutFn = (timer) => {
      clearTimer.call(globalThis, timer);
    };
    this.document = options.document;
    this.getActivity = options.getActivity;
    this.now = options.now ?? Date.now;
    this.setTimeoutFn = (callback, delay) => scheduleTimer.call(globalThis, callback, delay);
  }

  private readonly setTimeoutFn: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>;

  private readonly handleVisibilityChange = () => {
    if (this.document?.hidden) {
      this.clearTimer();
      return;
    }

    this.schedule();
  };

  observe(input: AgentSessionActivityObservationInput): AgentSessionActivityObservationHandle {
    const observation: AgentSessionActivityObservation = {
      ...input,
      id: this.nextObservationId++,
      isMonitoring: false,
    };
    this.observations.set(observation.id, observation);
    this.attachVisibilityListener();

    return {
      dispose: () => {
        this.observations.delete(observation.id);
        this.releaseSessionTrackingIfUnused(observation.sessionId);
        this.detachVisibilityListenerWhenUnused();
        this.schedule();
      },
      recordOutput: () => {
        if (!this.observations.has(observation.id)) {
          return;
        }

        this.lastOutputAtBySessionId.set(observation.sessionId, this.now());
        for (const current of this.observations.values()) {
          if (current.sessionId === observation.sessionId && current.isMonitoring) {
            current.onOutput?.();
          }
        }
        this.schedule();
      },
      setMonitoring: (isMonitoring) => {
        if (!this.observations.has(observation.id)) {
          return;
        }

        observation.isMonitoring = isMonitoring;
        this.schedule();
      },
      startMonitoring: () => {
        if (!this.observations.has(observation.id)) {
          return;
        }

        observation.isMonitoring = true;
        this.schedule();
      },
      stopMonitoring: () => {
        if (!this.observations.has(observation.id)) {
          return;
        }

        observation.isMonitoring = false;
        this.schedule();
      },
      update: (nextInput) => {
        if (!this.observations.has(observation.id)) {
          return;
        }

        observation.isActive = nextInput.isActive;
        observation.isVisible = nextInput.isVisible;
        observation.onActivity = nextInput.onActivity;
        observation.onOutput = nextInput.onOutput;
        this.schedule();
      },
    };
  }

  private attachVisibilityListener(): void {
    if (this.observations.size !== 1 || !this.document) {
      return;
    }

    this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private clearTimer(): void {
    if (!this.timer) {
      return;
    }

    this.clearTimeoutFn(this.timer);
    this.timer = null;
  }

  private detachVisibilityListenerWhenUnused(): void {
    if (this.observations.size !== 0 || !this.document) {
      return;
    }

    this.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private getNextCandidate(): { candidate: SessionActivityCandidate; delayMs: number } | null {
    const candidatesBySessionId = new Map<string, SessionActivityCandidate>();
    for (const observation of this.observations.values()) {
      if (!observation.isMonitoring || !observation.isVisible) {
        continue;
      }

      const existing = candidatesBySessionId.get(observation.sessionId);
      if (existing) {
        existing.isActive ||= observation.isActive;
        continue;
      }

      candidatesBySessionId.set(observation.sessionId, {
        isActive: observation.isActive,
        lastOutputAt: this.lastOutputAtBySessionId.get(observation.sessionId),
        lastPolledAt: this.lastPolledAtBySessionId.get(observation.sessionId),
        sessionId: observation.sessionId,
      });
    }

    const now = this.now();
    const scheduledCandidates = Array.from(candidatesBySessionId.values()).map((candidate) => {
      const pollIntervalMs = candidate.isActive
        ? ACTIVE_AGENT_SESSION_ACTIVITY_POLL_INTERVAL_MS
        : VISIBLE_AGENT_SESSION_ACTIVITY_POLL_INTERVAL_MS;
      const outputDelayMs =
        candidate.lastOutputAt === undefined
          ? 0
          : Math.max(0, candidate.lastOutputAt + AGENT_SESSION_ACTIVITY_OUTPUT_STALE_MS - now);
      const pollDelayMs =
        candidate.lastPolledAt === undefined
          ? 0
          : Math.max(0, candidate.lastPolledAt + pollIntervalMs - now);

      return {
        candidate,
        delayMs: Math.max(outputDelayMs, pollDelayMs),
      };
    });

    scheduledCandidates.sort((left, right) => {
      if (left.delayMs !== right.delayMs) {
        return left.delayMs - right.delayMs;
      }
      if (left.candidate.isActive !== right.candidate.isActive) {
        return left.candidate.isActive ? -1 : 1;
      }
      return left.candidate.sessionId.localeCompare(right.candidate.sessionId);
    });

    return scheduledCandidates[0] ?? null;
  }

  private poll = async (): Promise<void> => {
    this.timer = null;
    if (this.isPolling || this.document?.hidden) {
      return;
    }

    const next = this.getNextCandidate();
    if (!next) {
      return;
    }

    this.isPolling = true;
    try {
      const hasProcessActivity = await this.getActivity(next.candidate.sessionId);
      if (this.document?.hidden) {
        return;
      }

      this.lastPolledAtBySessionId.set(next.candidate.sessionId, this.now());
      for (const observation of this.observations.values()) {
        if (
          observation.sessionId === next.candidate.sessionId &&
          observation.isMonitoring &&
          observation.isVisible
        ) {
          observation.onActivity?.(hasProcessActivity);
        }
      }
    } catch {
      this.lastPolledAtBySessionId.set(next.candidate.sessionId, this.now());
    } finally {
      this.isPolling = false;
      this.schedule();
    }
  };

  private releaseSessionTrackingIfUnused(sessionId: string): void {
    for (const observation of this.observations.values()) {
      if (observation.sessionId === sessionId) {
        return;
      }
    }

    this.lastOutputAtBySessionId.delete(sessionId);
    this.lastPolledAtBySessionId.delete(sessionId);
  }

  private schedule(): void {
    this.clearTimer();
    if (this.isPolling || this.document?.hidden) {
      return;
    }

    const next = this.getNextCandidate();
    if (!next) {
      return;
    }

    this.timer = this.setTimeoutFn(() => {
      void this.poll();
    }, next.delayMs);
  }
}

interface UseAgentSessionActivityOptions {
  isActive: boolean;
  isVisible: boolean;
  onActivity?: (hasProcessActivity: boolean) => void;
  onOutput?: () => void;
  scheduler?: AgentSessionActivityScheduler;
  sessionId?: string;
}

interface UseAgentSessionActivityResult {
  recordOutput: () => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
}

let rendererScheduler: AgentSessionActivityScheduler | null = null;

function getRendererScheduler(): AgentSessionActivityScheduler {
  if (!rendererScheduler) {
    rendererScheduler = new AgentSessionActivityScheduler({
      document,
      getActivity: (sessionId) => window.electronAPI.session.getActivity(sessionId),
    });
  }

  return rendererScheduler;
}

export function useAgentSessionActivity({
  isActive,
  isVisible,
  onActivity,
  onOutput,
  scheduler,
  sessionId,
}: UseAgentSessionActivityOptions): UseAgentSessionActivityResult {
  const activityCallbackRef = useRef(onActivity);
  activityCallbackRef.current = onActivity;
  const outputCallbackRef = useRef(onOutput);
  outputCallbackRef.current = onOutput;
  const observationRef = useRef<AgentSessionActivityObservationHandle | null>(null);
  const resolvedScheduler = useMemo(() => scheduler ?? getRendererScheduler(), [scheduler]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const observation = resolvedScheduler.observe({
      isActive: false,
      isVisible: false,
      onActivity: (hasProcessActivity) => activityCallbackRef.current?.(hasProcessActivity),
      onOutput: () => outputCallbackRef.current?.(),
      sessionId,
    });
    observationRef.current = observation;

    return () => {
      if (observationRef.current === observation) {
        observationRef.current = null;
      }
      observation.dispose();
    };
  }, [resolvedScheduler, sessionId]);

  useEffect(() => {
    observationRef.current?.update({
      isActive,
      isVisible,
      onActivity: (hasProcessActivity) => activityCallbackRef.current?.(hasProcessActivity),
      onOutput: () => outputCallbackRef.current?.(),
    });
  }, [isActive, isVisible]);

  const recordOutput = useCallback(() => {
    observationRef.current?.recordOutput();
  }, []);
  const startMonitoring = useCallback(() => {
    observationRef.current?.startMonitoring();
  }, []);
  const stopMonitoring = useCallback(() => {
    observationRef.current?.stopMonitoring();
  }, []);

  return useMemo(
    () => ({
      recordOutput,
      startMonitoring,
      stopMonitoring,
    }),
    [recordOutput, startMonitoring, stopMonitoring]
  );
}
