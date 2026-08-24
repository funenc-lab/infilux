import { describe, expect, it } from 'vitest';
import {
  buildAgentSessionTranscriptView,
  MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT,
  MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT,
} from '../agentSessionTranscriptModel';

function buildLines(count: number, prefix = 'entry'): string {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(4, '0')}`
  ).join('\n');
}

describe('agentSessionTranscriptModel', () => {
  it('returns the latest bounded line window for long retained snapshots', () => {
    const snapshot = buildLines(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 3);

    const view = buildAgentSessionTranscriptView({ snapshot });

    expect(view.hasSnapshot).toBe(true);
    expect(view.totalLines).toBe(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 3);
    expect(view.visibleLines).toHaveLength(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT);
    expect(view.visibleLines[0]).toMatchObject({ lineNumber: 4, text: 'entry-0004' });
    expect(view.visibleLines.at(-1)).toMatchObject({
      lineNumber: MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 3,
      text: `entry-${String(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 3).padStart(4, '0')}`,
    });
    expect(view.omittedOlderLineCount).toBe(3);
  });

  it('caps caller-provided visible limits to protect the renderer', () => {
    const snapshot = buildLines(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 50);

    const view = buildAgentSessionTranscriptView({
      snapshot,
      visibleLineLimit: 100_000,
    });

    expect(view.visibleLines).toHaveLength(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT);
    expect(view.omittedOlderLineCount).toBe(50);
  });

  it('renders a bounded older window without discarding the newly loaded page', () => {
    const snapshot = buildLines(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT * 2 + 20);

    const view = buildAgentSessionTranscriptView({
      snapshot,
      visibleLineEnd: MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 20,
    });

    expect(view.visibleLines).toHaveLength(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT);
    expect(view.visibleLines[0]).toMatchObject({ lineNumber: 21, text: 'entry-0021' });
    expect(view.visibleLines.at(-1)).toMatchObject({
      lineNumber: MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 20,
      text: `entry-${String(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 20).padStart(4, '0')}`,
    });
    expect(view.omittedOlderLineCount).toBe(20);
    expect(view.omittedNewerLineCount).toBe(MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT);
  });

  it('returns latest matching search results without rendering every match', () => {
    const snapshot = [
      'error old 1',
      'ok',
      'error old 2',
      'ERROR recent 1',
      'ok',
      'error recent 2',
    ].join('\n');

    const view = buildAgentSessionTranscriptView({
      snapshot,
      query: 'error',
      searchResultLimit: 2,
    });

    expect(view.mode).toBe('search');
    expect(view.matchCount).toBe(4);
    expect(view.omittedSearchResultCount).toBe(2);
    expect(view.visibleLines).toEqual([
      { lineNumber: 4, text: 'ERROR recent 1' },
      { lineNumber: 6, text: 'error recent 2' },
    ]);
  });

  it('caps caller-provided search result limits', () => {
    const snapshot = buildLines(MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT + 12, 'match');

    const view = buildAgentSessionTranscriptView({
      snapshot,
      query: 'match',
      searchResultLimit: 100_000,
    });

    expect(view.matchCount).toBe(MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT + 12);
    expect(view.visibleLines).toHaveLength(MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT);
    expect(view.omittedSearchResultCount).toBe(12);
  });

  it('normalizes terminal line endings and ignores a final trailing newline', () => {
    const view = buildAgentSessionTranscriptView({
      snapshot: 'first\r\nsecond\r\n',
    });

    expect(view.totalLines).toBe(2);
    expect(view.visibleLines).toEqual([
      { lineNumber: 1, text: 'first' },
      { lineNumber: 2, text: 'second' },
    ]);
  });

  it('returns an empty view for missing snapshots', () => {
    const view = buildAgentSessionTranscriptView({ snapshot: null });

    expect(view.hasSnapshot).toBe(false);
    expect(view.totalLines).toBe(0);
    expect(view.visibleLines).toEqual([]);
  });
});
