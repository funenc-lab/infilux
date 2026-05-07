export const AGENT_STARTUP_STALL_THRESHOLD_MS = 4000;

export interface AgentStartupOverlayPresentation {
  descriptionKey:
    | 'Waiting for the agent prompt.'
    | 'Session startup is taking longer than expected.';
  state: 'starting' | 'stalled';
  titleKey: 'Starting session' | 'Still starting';
}

export function resolveAgentStartupOverlayPresentation(options: {
  isStalled: boolean;
}): AgentStartupOverlayPresentation {
  if (options.isStalled) {
    return {
      state: 'stalled',
      titleKey: 'Still starting',
      descriptionKey: 'Session startup is taking longer than expected.',
    };
  }

  return {
    state: 'starting',
    titleKey: 'Starting session',
    descriptionKey: 'Waiting for the agent prompt.',
  };
}
