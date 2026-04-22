import type { GetAgentSubagentTranscriptResult, LiveAgentSubagent } from '@shared/types';
import { useEffect, useRef, useState } from 'react';

interface UseSubagentTranscriptState {
  data: GetAgentSubagentTranscriptResult | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

export function useSubagentTranscript(
  subagent: LiveAgentSubagent | null | undefined
): UseSubagentTranscriptState {
  const transcriptCacheRef = useRef<Record<string, GetAgentSubagentTranscriptResult>>({});
  const [state, setState] = useState<UseSubagentTranscriptState>({
    data: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!subagent) {
      setState({
        data: null,
        isLoading: false,
        isRefreshing: false,
        error: null,
      });
      return;
    }

    const cachedTranscript = transcriptCacheRef.current[subagent.threadId] ?? null;
    setState({
      data: cachedTranscript,
      isLoading: cachedTranscript === null,
      isRefreshing: cachedTranscript !== null,
      error: null,
    });

    window.electronAPI.agentSubagent
      .getTranscript({ threadId: subagent.threadId })
      .then((data) => {
        if (!cancelled) {
          transcriptCacheRef.current[subagent.threadId] = data;
          setState({
            data,
            isLoading: false,
            isRefreshing: false,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState({
            data: cachedTranscript,
            isLoading: false,
            isRefreshing: false,
            error: message || 'Failed to load transcript.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [subagent]);

  return state;
}
