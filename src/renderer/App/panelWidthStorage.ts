interface RestorePanelWidthOptions {
  min: number;
  max: number;
  fallback: number;
}

export function restorePanelWidthFromStorage(
  storedValue: string | null,
  { min, max, fallback }: RestorePanelWidthOptions
): number {
  if (storedValue === null) {
    return fallback;
  }

  const parsed = Number(storedValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
