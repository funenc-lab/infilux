export const CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS = [1, 3, 5, 10, 20, 30] as const;
export const MIN_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES =
  CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS[0];
export const DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES = 5;
export const MAX_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES =
  CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS[CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS.length - 1];

export function normalizeChatPanelInactivityThresholdMinutes(
  value: unknown,
  fallback: number = DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES
): number {
  const candidate =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(candidate)) {
    return fallback;
  }

  const normalized = Math.floor(candidate);
  return Math.min(
    MAX_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
    Math.max(MIN_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES, normalized)
  );
}

export function toChatPanelInactivityThresholdMs(value: unknown): number {
  return normalizeChatPanelInactivityThresholdMinutes(value) * 60 * 1000;
}
