import { describe, expect, it } from 'vitest';
import {
  buildSubagentTranscriptWindow,
  DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT,
  expandSubagentTranscriptWindow,
  SUBAGENT_TRANSCRIPT_EXPAND_STEP,
} from '../subagentTranscriptWindowPolicy';

describe('subagentTranscriptWindowPolicy', () => {
  it('shows all entries when the transcript is already short', () => {
    expect(buildSubagentTranscriptWindow(18)).toEqual({
      startIndex: 0,
      endIndex: 18,
      visibleCount: 18,
      hiddenOlderCount: 0,
      hasHiddenOlder: false,
    });
  });

  it('shows only the latest window when the transcript exceeds the default size', () => {
    expect(buildSubagentTranscriptWindow(150)).toEqual({
      startIndex: 90,
      endIndex: 150,
      visibleCount: DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT,
      hiddenOlderCount: 90,
      hasHiddenOlder: true,
    });
  });

  it('expands the visible window in fixed-size steps without exceeding the total', () => {
    expect(expandSubagentTranscriptWindow(150, DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT)).toBe(
      DEFAULT_SUBAGENT_TRANSCRIPT_VISIBLE_COUNT + SUBAGENT_TRANSCRIPT_EXPAND_STEP
    );
    expect(expandSubagentTranscriptWindow(150, 140)).toBe(150);
    expect(expandSubagentTranscriptWindow(32, 32)).toBe(32);
  });
});
