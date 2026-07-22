import type { AgentSessionTitleSource } from '@shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShouldPoll } from './useWindowFocus';

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 8;

interface UseAgentProviderSessionTitleOptions {
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  titleSource?: AgentSessionTitleSource;
  isRemoteExecution?: boolean;
  activitySignal?: number;
  onProviderSessionTitle?: (title: string) => void;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

function buildProviderSessionTitleKey(params: {
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  titleSource?: AgentSessionTitleSource;
  isRemoteExecution?: boolean;
}): string | null {
  if (
    params.agentCommand !== 'codex' ||
    params.isRemoteExecution ||
    params.titleSource !== 'default' ||
    !params.uiSessionId ||
    !params.providerSessionId ||
    params.providerSessionId === params.uiSessionId
  ) {
    return null;
  }

  return [params.agentCommand, params.providerSessionId].join('\u0000');
}

export function useAgentProviderSessionTitle(options: UseAgentProviderSessionTitleOptions): void {
  const {
    agentCommand,
    uiSessionId,
    providerSessionId,
    titleSource,
    isRemoteExecution,
    activitySignal,
    onProviderSessionTitle,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;
  const shouldPoll = useShouldPoll();
  const onProviderSessionTitleRef = useRef(onProviderSessionTitle);
  const exhaustedTitleKeyRef = useRef<string | null>(null);
  const previousActivitySignalRef = useRef(activitySignal);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const hasProviderSessionTitleHandler = Boolean(onProviderSessionTitle);
  const titleKey = useMemo(
    () =>
      shouldPoll && hasProviderSessionTitleHandler
        ? buildProviderSessionTitleKey({
            agentCommand,
            uiSessionId,
            providerSessionId,
            titleSource,
            isRemoteExecution,
          })
        : null,
    [
      agentCommand,
      hasProviderSessionTitleHandler,
      isRemoteExecution,
      providerSessionId,
      shouldPoll,
      titleSource,
      uiSessionId,
    ]
  );
  const lookupKey = useMemo(
    () => (titleKey ? `${titleKey}\u0000${retryGeneration}` : null),
    [retryGeneration, titleKey]
  );

  useEffect(() => {
    onProviderSessionTitleRef.current = onProviderSessionTitle;
  }, [onProviderSessionTitle]);

  useEffect(() => {
    const activityChanged = previousActivitySignalRef.current !== activitySignal;
    previousActivitySignalRef.current = activitySignal;

    if (!titleKey) {
      exhaustedTitleKeyRef.current = null;
      return;
    }

    if (activityChanged && exhaustedTitleKeyRef.current === titleKey) {
      exhaustedTitleKeyRef.current = null;
      setRetryGeneration((generation) => generation + 1);
    }
  }, [activitySignal, titleKey]);

  useEffect(() => {
    if (!lookupKey || !titleKey || !providerSessionId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const activitySignalAtStart = previousActivitySignalRef.current;

    const runLookup = async () => {
      attempts += 1;

      try {
        const result = await window.electronAPI.agentSession.readProviderSessionTitle({
          agentCommand,
          providerSessionId,
        });
        if (cancelled) {
          return;
        }

        if (result.title) {
          exhaustedTitleKeyRef.current = null;
          onProviderSessionTitleRef.current?.(result.title);
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      if (cancelled || attempts >= maxAttempts) {
        if (!cancelled) {
          if (previousActivitySignalRef.current !== activitySignalAtStart) {
            exhaustedTitleKeyRef.current = null;
            setRetryGeneration((generation) => generation + 1);
          } else {
            exhaustedTitleKeyRef.current = titleKey;
          }
        }
        return;
      }

      timer = setTimeout(() => {
        void runLookup();
      }, pollIntervalMs);
    };

    void runLookup();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [agentCommand, lookupKey, maxAttempts, pollIntervalMs, providerSessionId, titleKey]);
}
