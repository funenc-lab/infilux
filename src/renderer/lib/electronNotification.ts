import type { AgentStopNotificationData } from '@shared/types/agent';

interface AskUserQuestionNotification {
  sessionId: string;
  toolInput: unknown;
  cwd?: string;
}

interface PreToolUseNotification {
  sessionId: string;
  toolName: string;
  cwd?: string;
}

interface AgentStatusUpdateNotification {
  sessionId: string;
  model?: { id: string; display_name: string };
  contextWindow?: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    current_usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  cost?: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms?: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  workspace?: {
    current_dir: string;
    project_dir: string;
  };
  version?: string;
}

interface RendererNotificationApi {
  show?: (options: {
    title: string;
    body?: string;
    silent?: boolean;
    sessionId?: string;
  }) => Promise<void>;
  onClick?: (callback: (sessionId: string) => void) => (() => void) | undefined;
  onAgentStop?: (callback: (data: AgentStopNotificationData) => void) => (() => void) | undefined;
  onAskUserQuestion?: (
    callback: (data: AskUserQuestionNotification) => void
  ) => (() => void) | undefined;
  onPreToolUse?: (callback: (data: PreToolUseNotification) => void) => (() => void) | undefined;
  onAgentStatusUpdate?: (
    callback: (data: AgentStatusUpdateNotification) => void
  ) => (() => void) | undefined;
}

const noopCleanup = () => {};

function getRendererNotificationApi(): RendererNotificationApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window.electronAPI?.notification as RendererNotificationApi | undefined) ?? null;
}

function subscribe(
  register: (notification: RendererNotificationApi) => (() => void) | undefined
): () => void {
  const notification = getRendererNotificationApi();
  if (!notification) {
    return noopCleanup;
  }

  return register(notification) ?? noopCleanup;
}

export function onNotificationClick(callback: (sessionId: string) => void): () => void {
  return subscribe((notification) => notification.onClick?.(callback));
}

export function onAgentStopNotification(
  callback: (data: AgentStopNotificationData) => void
): () => void {
  return subscribe((notification) => notification.onAgentStop?.(callback));
}

export function onAskUserQuestionNotification(
  callback: (data: AskUserQuestionNotification) => void
): () => void {
  return subscribe((notification) => notification.onAskUserQuestion?.(callback));
}

export function onPreToolUseNotification(
  callback: (data: PreToolUseNotification) => void
): () => void {
  return subscribe((notification) => notification.onPreToolUse?.(callback));
}

export function onAgentStatusUpdateNotification(
  callback: (data: AgentStatusUpdateNotification) => void
): () => void {
  return subscribe((notification) => notification.onAgentStatusUpdate?.(callback));
}

export async function showRendererNotification(options: {
  title: string;
  body?: string;
  silent?: boolean;
  sessionId?: string;
}): Promise<void> {
  const notification = getRendererNotificationApi();
  if (!notification?.show) {
    return;
  }

  await notification.show(options);
}
