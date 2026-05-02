import type { SessionSubagentViewState } from './sessionSubagentState';

export interface SessionSubagentTriggerPresentation {
  emphasized: boolean;
  visible: boolean;
}

export function resolveSessionSubagentTriggerPresentation(
  viewState: SessionSubagentViewState | null | undefined,
  count: number
): SessionSubagentTriggerPresentation {
  if (!viewState || viewState.kind === 'unsupported') {
    return {
      visible: false,
      emphasized: false,
    };
  }

  return {
    visible: true,
    emphasized: viewState.kind === 'supported' && count > 0,
  };
}
