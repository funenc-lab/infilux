interface SessionContextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

interface SessionRolloverInput {
  contextWindowSize: number;
  currentUsage: SessionContextUsage | null;
}

export interface SessionRolloverSignal {
  level: 'warning' | 'critical';
  percent: number;
  recommendedAction: 'consider_new_session' | 'start_new_session';
}

const WARNING_THRESHOLD_PERCENT = 85;
const CRITICAL_THRESHOLD_PERCENT = 95;

export function getSessionRolloverSignal(
  input: SessionRolloverInput
): SessionRolloverSignal | null {
  const { currentUsage, contextWindowSize } = input;
  if (!currentUsage || contextWindowSize <= 0) {
    return null;
  }

  const usedTokens =
    currentUsage.inputTokens +
    currentUsage.cacheCreationInputTokens +
    currentUsage.cacheReadInputTokens;
  const percent = Math.round((usedTokens / contextWindowSize) * 100);

  if (percent >= CRITICAL_THRESHOLD_PERCENT) {
    return {
      level: 'critical',
      percent,
      recommendedAction: 'start_new_session',
    };
  }

  if (percent >= WARNING_THRESHOLD_PERCENT) {
    return {
      level: 'warning',
      percent,
      recommendedAction: 'consider_new_session',
    };
  }

  return null;
}
