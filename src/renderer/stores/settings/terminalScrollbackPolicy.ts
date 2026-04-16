export const MIN_TERMINAL_SCROLLBACK = 1000;
export const DEFAULT_TERMINAL_SCROLLBACK = 3000;
export const MAX_TERMINAL_SCROLLBACK = 5000;
export const TERMINAL_SCROLLBACK_OPTIONS = [
  MIN_TERMINAL_SCROLLBACK,
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINAL_SCROLLBACK,
] as const;

export function normalizeTerminalScrollback(
  value: unknown,
  fallback: number = DEFAULT_TERMINAL_SCROLLBACK
): number {
  const candidate =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(candidate)) {
    return fallback;
  }

  const normalized = Math.floor(candidate);
  return Math.min(MAX_TERMINAL_SCROLLBACK, Math.max(MIN_TERMINAL_SCROLLBACK, normalized));
}
