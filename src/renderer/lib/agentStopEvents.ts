import type { AgentStopNotificationData } from '@shared/types/agent';

const RENDERER_AGENT_STOP_EVENT = 'infilux:agent-stop';

export function emitRendererAgentStop(data: AgentStopNotificationData): void {
  window.dispatchEvent(
    new CustomEvent<AgentStopNotificationData>(RENDERER_AGENT_STOP_EVENT, {
      detail: data,
    })
  );
}

export function onRendererAgentStop(
  callback: (data: AgentStopNotificationData) => void
): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<AgentStopNotificationData>).detail);
  };

  window.addEventListener(RENDERER_AGENT_STOP_EVENT, handler);
  return () => window.removeEventListener(RENDERER_AGENT_STOP_EVENT, handler);
}
