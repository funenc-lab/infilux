export const AGENT_STARTUP_STALL_THRESHOLD_MS = 4000;

export interface AgentStartupOverlayPresentation {
  descriptionKey:
    | 'Attaching the terminal and waiting for the agent prompt.'
    | 'Runtime is taking longer than expected. Retry if the terminal stays quiet.';
  eyebrowKey: 'Agent runtime';
  state: 'starting' | 'stalled';
  titleKey: 'Preparing runtime' | 'Still preparing';
}

export function resolveAgentStartupOverlayPresentation(options: {
  isStalled: boolean;
}): AgentStartupOverlayPresentation {
  if (options.isStalled) {
    return {
      state: 'stalled',
      eyebrowKey: 'Agent runtime',
      titleKey: 'Still preparing',
      descriptionKey: 'Runtime is taking longer than expected. Retry if the terminal stays quiet.',
    };
  }

  return {
    state: 'starting',
    eyebrowKey: 'Agent runtime',
    titleKey: 'Preparing runtime',
    descriptionKey: 'Attaching the terminal and waiting for the agent prompt.',
  };
}
