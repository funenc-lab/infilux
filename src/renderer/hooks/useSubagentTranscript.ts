import type { GetAgentSubagentTranscriptResult, LiveAgentSubagent } from '@shared/types';
import { useEffect, useState } from 'react';

interface UseSubagentTranscriptState {
  data: GetAgentSubagentTranscriptResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useSubagentTranscript(
  subagent: LiveAgentSubagent | null | undefined
): UseSubagentTranscriptState {
  const [state, setState] = useState<UseSubagentTranscriptState>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!subagent) {
      setState({
        data: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    setState({
      data: null,
      isLoading: true,
      error: null,
    });

    window.electronAPI.agentSubagent
      .getTranscript({ threadId: subagent.threadId })
      .then((data) => {
        if (!cancelled) {
          setState({
            data,
            isLoading: false,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState({
            data: null,
            isLoading: false,
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
