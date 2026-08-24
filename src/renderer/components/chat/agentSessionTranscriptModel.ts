export const MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT = 1_200;
export const DEFAULT_TRANSCRIPT_VISIBLE_LINE_LIMIT = MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT;
export const MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT = 200;
export const DEFAULT_TRANSCRIPT_SEARCH_RESULT_LIMIT = MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT;

export interface AgentSessionTranscriptLine {
  lineNumber: number;
  text: string;
}

export type AgentSessionTranscriptMode = 'latest' | 'search';

export interface AgentSessionTranscriptView {
  hasSnapshot: boolean;
  matchCount: number;
  mode: AgentSessionTranscriptMode;
  omittedOlderLineCount: number;
  omittedNewerLineCount: number;
  omittedSearchResultCount: number;
  query: string;
  totalCharacters: number;
  totalLines: number;
  visibleLineEnd: number;
  visibleLines: AgentSessionTranscriptLine[];
  visibleLineStart: number;
}

export interface BuildAgentSessionTranscriptViewInput {
  query?: string;
  searchResultLimit?: number;
  snapshot?: string | null;
  visibleLineEnd?: number;
  visibleLineLimit?: number;
}

function clampLimit(value: number | undefined, defaultValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(Math.max(1, Math.floor(value)), maxValue);
}

function normalizeTranscriptLines(snapshot: string): string[] {
  const normalized = snapshot.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

function buildVisibleLines(
  lines: readonly string[],
  startIndex: number,
  endIndex: number
): AgentSessionTranscriptLine[] {
  const visibleLines: AgentSessionTranscriptLine[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    visibleLines.push({
      lineNumber: index + 1,
      text: lines[index] ?? '',
    });
  }

  return visibleLines;
}

function resolveVisibleLineEnd(value: number | undefined, totalLines: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return totalLines;
  }

  return Math.min(Math.max(1, Math.floor(value)), totalLines);
}

function buildEmptyTranscriptView(snapshot: string | null | undefined): AgentSessionTranscriptView {
  return {
    hasSnapshot: false,
    matchCount: 0,
    mode: 'latest',
    omittedOlderLineCount: 0,
    omittedNewerLineCount: 0,
    omittedSearchResultCount: 0,
    query: '',
    totalCharacters: snapshot?.length ?? 0,
    totalLines: 0,
    visibleLineEnd: 0,
    visibleLines: [],
    visibleLineStart: 0,
  };
}

function buildSearchTranscriptView(
  lines: readonly string[],
  query: string,
  totalCharacters: number,
  searchResultLimit: number
): AgentSessionTranscriptView {
  const normalizedQuery = query.toLowerCase();
  const matchedLines = lines.reduce<AgentSessionTranscriptLine[]>((matches, line, index) => {
    if (line.toLowerCase().includes(normalizedQuery)) {
      matches.push({
        lineNumber: index + 1,
        text: line,
      });
    }

    return matches;
  }, []);
  const startIndex = Math.max(0, matchedLines.length - searchResultLimit);
  const visibleLines = matchedLines.slice(startIndex);

  return {
    hasSnapshot: true,
    matchCount: matchedLines.length,
    mode: 'search',
    omittedOlderLineCount: 0,
    omittedNewerLineCount: 0,
    omittedSearchResultCount: startIndex,
    query,
    totalCharacters,
    totalLines: lines.length,
    visibleLineEnd: visibleLines.at(-1)?.lineNumber ?? 0,
    visibleLines,
    visibleLineStart: visibleLines[0]?.lineNumber ?? 0,
  };
}

export function buildAgentSessionTranscriptView({
  query = '',
  searchResultLimit,
  snapshot,
  visibleLineEnd,
  visibleLineLimit,
}: BuildAgentSessionTranscriptViewInput): AgentSessionTranscriptView {
  if (snapshot == null || snapshot.length === 0) {
    return buildEmptyTranscriptView(snapshot);
  }

  const lines = normalizeTranscriptLines(snapshot);
  if (lines.length === 0) {
    return buildEmptyTranscriptView(snapshot);
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length > 0) {
    return buildSearchTranscriptView(
      lines,
      trimmedQuery,
      snapshot.length,
      clampLimit(
        searchResultLimit,
        DEFAULT_TRANSCRIPT_SEARCH_RESULT_LIMIT,
        MAX_TRANSCRIPT_SEARCH_RESULT_LIMIT
      )
    );
  }

  const resolvedVisibleLineLimit = clampLimit(
    visibleLineLimit,
    DEFAULT_TRANSCRIPT_VISIBLE_LINE_LIMIT,
    MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT
  );
  const endIndex = resolveVisibleLineEnd(visibleLineEnd, lines.length);
  const startIndex = Math.max(0, endIndex - resolvedVisibleLineLimit);
  const visibleLines = buildVisibleLines(lines, startIndex, endIndex);

  return {
    hasSnapshot: true,
    matchCount: 0,
    mode: 'latest',
    omittedOlderLineCount: startIndex,
    omittedNewerLineCount: lines.length - endIndex,
    omittedSearchResultCount: 0,
    query: '',
    totalCharacters: snapshot.length,
    totalLines: lines.length,
    visibleLineEnd: visibleLines.at(-1)?.lineNumber ?? 0,
    visibleLines,
    visibleLineStart: visibleLines[0]?.lineNumber ?? 0,
  };
}
