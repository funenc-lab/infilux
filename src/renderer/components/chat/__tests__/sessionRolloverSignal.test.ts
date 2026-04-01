import { describe, expect, it } from 'vitest';
import { getSessionRolloverSignal } from '../sessionRolloverSignal';

describe('sessionRolloverSignal', () => {
  it('returns null when context usage is unavailable', () => {
    expect(
      getSessionRolloverSignal({
        contextWindowSize: 200_000,
        currentUsage: null,
      })
    ).toBeNull();
  });

  it('returns null when context usage remains below the rollover threshold', () => {
    expect(
      getSessionRolloverSignal({
        contextWindowSize: 200_000,
        currentUsage: {
          inputTokens: 60_000,
          outputTokens: 10_000,
          cacheCreationInputTokens: 20_000,
          cacheReadInputTokens: 0,
        },
      })
    ).toBeNull();
  });

  it('returns a warning signal when context usage is high', () => {
    expect(
      getSessionRolloverSignal({
        contextWindowSize: 200_000,
        currentUsage: {
          inputTokens: 110_000,
          outputTokens: 15_000,
          cacheCreationInputTokens: 60_000,
          cacheReadInputTokens: 0,
        },
      })
    ).toEqual({
      level: 'warning',
      percent: 85,
      recommendedAction: 'consider_new_session',
    });
  });

  it('returns a critical signal when context usage is near exhaustion', () => {
    expect(
      getSessionRolloverSignal({
        contextWindowSize: 200_000,
        currentUsage: {
          inputTokens: 130_000,
          outputTokens: 15_000,
          cacheCreationInputTokens: 60_000,
          cacheReadInputTokens: 5_000,
        },
      })
    ).toEqual({
      level: 'critical',
      percent: 98,
      recommendedAction: 'start_new_session',
    });
  });
});
