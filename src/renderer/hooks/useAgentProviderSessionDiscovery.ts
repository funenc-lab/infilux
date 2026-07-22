import { useEffect, useMemo, useRef, useState } from 'react';
import { useShouldPoll } from './useWindowFocus';

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 8;

type ProviderSessionResolutionMode = 'discover' | 'validate';

interface UseAgentProviderSessionDiscoveryOptions {
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  cwd?: string;
  createdAt?: number;
  initialized?: boolean;
  isRemoteExecution?: boolean;
  allowRecoveryBeforeInitialization?: boolean;
  validateResolvedProviderSession?: boolean;
  onProviderSessionIdChange?: (providerSessionId: string) => void;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

interface UseAgentProviderSessionDiscoveryState {
  providerSessionResolutionPending: boolean;
  resolvedProviderSessionId?: string | null;
}

function resolveProviderSessionResolutionMode(
  options: UseAgentProviderSessionDiscoveryOptions
): ProviderSessionResolutionMode | null {
  if (options.agentCommand !== 'codex') {
    return null;
  }

  if (
    options.isRemoteExecution ||
    (!options.initialized && !options.allowRecoveryBeforeInitialization)
  ) {
    return null;
  }

  if (!options.uiSessionId || !options.providerSessionId || !options.cwd) {
    return null;
  }

  if (typeof options.createdAt !== 'number' || !Number.isFinite(options.createdAt)) {
    return null;
  }

  if (options.providerSessionId === options.uiSessionId) {
    return 'discover';
  }

  return options.validateResolvedProviderSession ? 'validate' : null;
}

function buildProviderSessionResolutionKey(params: {
  mode: ProviderSessionResolutionMode;
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  cwd?: string;
  createdAt?: number;
}): string {
  return [
    params.mode,
    params.agentCommand,
    params.uiSessionId ?? '',
    params.providerSessionId ?? '',
    params.cwd ?? '',
    String(params.createdAt ?? ''),
  ].join('\u0000');
}

export function useAgentProviderSessionDiscovery(
  options: UseAgentProviderSessionDiscoveryOptions
): UseAgentProviderSessionDiscoveryState {
  const {
    agentCommand,
    uiSessionId,
    providerSessionId,
    cwd,
    createdAt,
    onProviderSessionIdChange,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;
  const shouldPoll = useShouldPoll();
  const onProviderSessionIdChangeRef = useRef(onProviderSessionIdChange);
  const hasProviderSessionIdChangeHandler = Boolean(onProviderSessionIdChange);
  const resolutionMode = resolveProviderSessionResolutionMode(options);
  const resolutionKey = useMemo(() => {
    if (!resolutionMode || !hasProviderSessionIdChangeHandler || !shouldPoll) {
      return null;
    }

    return buildProviderSessionResolutionKey({
      mode: resolutionMode,
      agentCommand,
      uiSessionId,
      providerSessionId,
      cwd,
      createdAt,
    });
  }, [
    agentCommand,
    createdAt,
    cwd,
    hasProviderSessionIdChangeHandler,
    providerSessionId,
    resolutionMode,
    shouldPoll,
    uiSessionId,
  ]);
  const [settledResolutionKey, setSettledResolutionKey] = useState<string | null>(null);
  const [resolvedProviderSessionId, setResolvedProviderSessionId] = useState<string | null>();
  const providerSessionResolutionPending = Boolean(
    resolutionKey && settledResolutionKey !== resolutionKey
  );

  useEffect(() => {
    onProviderSessionIdChangeRef.current = onProviderSessionIdChange;
  }, [onProviderSessionIdChange]);

  useEffect(() => {
    if (!resolutionMode || !resolutionKey || !hasProviderSessionIdChangeHandler || !shouldPoll) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const observedAt = Date.now();
    const settleResolution = () => {
      setSettledResolutionKey(resolutionKey);
    };
    setResolvedProviderSessionId(undefined);

    const runLookup = async () => {
      attempts += 1;

      try {
        const result = await window.electronAPI.agentSession.resolveProviderSession({
          agentCommand,
          uiSessionId: uiSessionId!,
          cwd: cwd!,
          createdAt: createdAt!,
          observedAt,
          ...(resolutionMode === 'validate' ? { providerSessionId } : {}),
        });

        if (cancelled) {
          return;
        }

        if (result.providerSessionId && result.providerSessionId !== providerSessionId) {
          setResolvedProviderSessionId(result.providerSessionId);
          onProviderSessionIdChangeRef.current?.(result.providerSessionId);
          settleResolution();
          return;
        }

        if (resolutionMode === 'validate') {
          if (!result.providerSessionId) {
            setResolvedProviderSessionId(null);
          }
          settleResolution();
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
        if (resolutionMode === 'validate') {
          setResolvedProviderSessionId(null);
          settleResolution();
          return;
        }
      }

      if (attempts >= maxAttempts || cancelled) {
        settleResolution();
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
  }, [
    agentCommand,
    createdAt,
    cwd,
    hasProviderSessionIdChangeHandler,
    maxAttempts,
    pollIntervalMs,
    providerSessionId,
    resolutionKey,
    resolutionMode,
    shouldPoll,
    uiSessionId,
  ]);

  return {
    providerSessionResolutionPending,
    resolvedProviderSessionId,
  };
}
