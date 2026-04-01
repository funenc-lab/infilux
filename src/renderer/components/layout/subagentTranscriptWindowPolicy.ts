export const DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT = 60;
export const SUBAGENT_TRANSCRIPT_EXPAND_STEP = 40;

export interface SubagentTranscriptWindow {
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  hiddenOlderCount: number;
  hasHiddenOlder: boolean;
}

export function buildSubagentTranscriptWindow(
  totalEntries: number,
  requestedVisibleCount: number = DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT
): SubagentTranscriptWindow {
  const normalizedTotal = Math.max(0, totalEntries);
  const visibleCount = Math.min(normalizedTotal, Math.max(0, requestedVisibleCount));
  const startIndex = Math.max(0, normalizedTotal - visibleCount);
  const hiddenOlderCount = startIndex;

  return {
    startIndex,
    endIndex: normalizedTotal,
    visibleCount,
    hiddenOlderCount,
    hasHiddenOlder: hiddenOlderCount > 0,
  };
}

export function expandSubagentTranscriptWindow(
  totalEntries: number,
  currentVisibleCount: number
): number {
  const normalizedTotal = Math.max(0, totalEntries);
  const normalizedCurrent = Math.max(0, currentVisibleCount);
  return Math.min(normalizedTotal, normalizedCurrent + SUBAGENT_TRANSCRIPT_EXPAND_STEP);
}
