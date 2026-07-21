import type { AgentSessionTitleSource } from '@shared/types';
import { useEffect, useMemo, useRef } from 'react';
import { useShouldPoll } from './useWindowFocus';

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 8;

interface UseAgentProviderSessionTitleOptions {
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  titleSource?: AgentSessionTitleSource;
  isRemoteExecution?: boolean;
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
    onProviderSessionTitle,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;
  const shouldPoll = useShouldPoll();
  const onProviderSessionTitleRef = useRef(onProviderSessionTitle);
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

  useEffect(() => {
    onProviderSessionTitleRef.current = onProviderSessionTitle;
  }, [onProviderSessionTitle]);

  useEffect(() => {
    if (!titleKey || !providerSessionId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

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
          onProviderSessionTitleRef.current?.(result.title);
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      if (cancelled || attempts >= maxAttempts) {
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
  }, [agentCommand, maxAttempts, pollIntervalMs, providerSessionId, titleKey]);
}
