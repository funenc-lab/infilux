import { useEffect } from 'react';

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 8;

interface UseAgentProviderSessionDiscoveryOptions {
  agentCommand: string;
  uiSessionId?: string;
  providerSessionId?: string;
  cwd?: string;
  createdAt?: number;
  initialized?: boolean;
  isRemoteExecution?: boolean;
  onProviderSessionIdChange?: (providerSessionId: string) => void;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

function shouldResolveProviderSessionId(options: UseAgentProviderSessionDiscoveryOptions): boolean {
  if (options.agentCommand !== 'codex') {
    return false;
  }

  if (options.isRemoteExecution || !options.initialized) {
    return false;
  }

  if (!options.uiSessionId || !options.providerSessionId || !options.cwd) {
    return false;
  }

  if (typeof options.createdAt !== 'number' || !Number.isFinite(options.createdAt)) {
    return false;
  }

  return options.providerSessionId === options.uiSessionId;
}

export function useAgentProviderSessionDiscovery(
  options: UseAgentProviderSessionDiscoveryOptions
): void {
  const {
    agentCommand,
    uiSessionId,
    providerSessionId,
    cwd,
    createdAt,
    initialized,
    isRemoteExecution,
    onProviderSessionIdChange,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;

  useEffect(() => {
    if (
      !shouldResolveProviderSessionId({
        agentCommand,
        uiSessionId,
        providerSessionId,
        cwd,
        createdAt,
        initialized,
        isRemoteExecution,
      }) ||
      !onProviderSessionIdChange
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const observedAt = Date.now();

    const runLookup = async () => {
      attempts += 1;

      try {
        const result = await window.electronAPI.agentSession.resolveProviderSession({
          agentCommand,
          cwd: cwd!,
          createdAt: createdAt!,
          observedAt,
        });

        if (cancelled) {
          return;
        }

        if (result.providerSessionId && result.providerSessionId !== providerSessionId) {
          onProviderSessionIdChange(result.providerSessionId);
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      if (attempts >= maxAttempts || cancelled) {
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
    initialized,
    isRemoteExecution,
    maxAttempts,
    onProviderSessionIdChange,
    pollIntervalMs,
    providerSessionId,
    uiSessionId,
  ]);
}
