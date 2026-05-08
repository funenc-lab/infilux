import os from 'node:os';
import path from 'node:path';
import type {
  NormalizedProjectTokenUsageRequest,
  TokenUsageCounts,
  TokenUsageSessionSummary,
} from '@shared/types/tokenUsage';
import { collectJsonlFiles, pathExists, readFirstLine, readLines } from './fileUtils';
import { parseUsageTimestamp, readNumber, readString, safeJsonParse } from './jsonUtils';
import { shouldIncludeUsageCwd } from './TokenUsageScope';
import type { TokenUsageCollectionResult } from './TokenUsageTypes';

export interface CodexUsageAdapterOptions {
  sessionsRoot: string;
  readLines?: (filePath: string, onLine: (line: string) => void | Promise<void>) => Promise<void>;
  readFirstLine?: (filePath: string) => Promise<string | null>;
}

interface CodexSessionAccumulator {
  sessionId: string;
  projectPath: string;
  cwd: string;
  model?: string;
  startedAt: number;
  updatedAt: number;
  counts: TokenUsageCounts;
  hasTokenCount: boolean;
}

const CODEX_PROVIDER_STATUS = {
  providerId: 'codex-cli',
  agentFamily: 'codex',
  label: 'Codex CLI',
} as const;

function createCounts(): TokenUsageCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function getPayload(entry: Record<string, unknown>): Record<string, unknown> | null {
  const payload = entry.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function createAccumulatorFromMeta(meta: Record<string, unknown>): CodexSessionAccumulator | null {
  const sessionId = readString(meta.id);
  const cwd = readString(meta.cwd);
  if (!sessionId || !cwd) {
    return null;
  }

  return {
    sessionId,
    projectPath: cwd,
    cwd,
    startedAt: parseUsageTimestamp(meta.timestamp),
    updatedAt: parseUsageTimestamp(meta.timestamp),
    counts: createCounts(),
    hasTokenCount: false,
  };
}

function readCodexCounts(info: Record<string, unknown>): TokenUsageCounts | null {
  const usage = info.total_token_usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }
  const usageRecord = usage as Record<string, unknown>;

  const inputTokens = readNumber(usageRecord.input_tokens);
  const outputTokens = readNumber(usageRecord.output_tokens);
  const cachedInputTokens = readNumber(usageRecord.cached_input_tokens);
  const reasoningOutputTokens = readNumber(usageRecord.reasoning_output_tokens);
  const reportedTotalTokens = usageRecord.total_tokens;
  const totalTokens =
    typeof reportedTotalTokens === 'number' && Number.isFinite(reportedTotalTokens)
      ? reportedTotalTokens
      : inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens,
    reasoningOutputTokens,
    totalTokens,
  };
}

function applyTokenCount(
  accumulator: CodexSessionAccumulator,
  entry: Record<string, unknown>
): void {
  const payload = getPayload(entry);
  if (
    !payload ||
    payload.type !== 'token_count' ||
    !payload.info ||
    typeof payload.info !== 'object' ||
    Array.isArray(payload.info)
  ) {
    return;
  }

  const counts = readCodexCounts(payload.info as Record<string, unknown>);
  if (!counts) {
    return;
  }

  accumulator.counts = counts;
  accumulator.hasTokenCount = true;
  accumulator.updatedAt = Math.max(accumulator.updatedAt, parseUsageTimestamp(entry.timestamp));
}

function shouldParseCodexUsageLine(line: string, hasCurrentSession: boolean): boolean {
  if (!line) {
    return false;
  }

  if (line.includes('"session_meta"')) {
    return true;
  }

  if (!hasCurrentSession) {
    return false;
  }

  return (
    line.includes('"turn_context"') ||
    (line.includes('"event_msg"') && line.includes('"token_count"'))
  );
}

async function shouldReadCodexFile(
  filePath: string,
  request: NormalizedProjectTokenUsageRequest | undefined,
  readFirstLineFile: (filePath: string) => Promise<string | null>
): Promise<boolean> {
  if (!request?.projectPaths.length) {
    return true;
  }

  const firstLine = await readFirstLineFile(filePath);
  if (!firstLine) {
    return true;
  }

  const firstEntry = safeJsonParse(firstLine);
  if (!firstEntry || firstEntry.type !== 'session_meta') {
    return true;
  }

  const payload = getPayload(firstEntry);
  if (!payload) {
    return true;
  }

  const accumulator = createAccumulatorFromMeta(payload);
  return accumulator ? shouldIncludeUsageCwd(accumulator.cwd, request) : true;
}

export class CodexUsageAdapter {
  constructor(
    private readonly options: CodexUsageAdapterOptions = {
      sessionsRoot: path.join(os.homedir(), '.codex', 'sessions'),
    }
  ) {}

  async collect(request?: NormalizedProjectTokenUsageRequest): Promise<TokenUsageCollectionResult> {
    try {
      if (!(await pathExists(this.options.sessionsRoot))) {
        return {
          status: {
            ...CODEX_PROVIDER_STATUS,
            status: 'not-found',
            reason: 'Codex usage log directory was not found.',
          },
          sessions: [],
        };
      }

      const files = await collectJsonlFiles(this.options.sessionsRoot);
      if (files.length === 0) {
        return {
          status: {
            ...CODEX_PROVIDER_STATUS,
            status: 'not-found',
            reason: 'No Codex usage JSONL files were found.',
          },
          sessions: [],
        };
      }

      const sessionsById = new Map<string, CodexSessionAccumulator>();
      const readUsageLines = this.options.readLines ?? readLines;
      const readUsageFirstLine = this.options.readFirstLine ?? readFirstLine;

      for (const file of files) {
        if (!(await shouldReadCodexFile(file, request, readUsageFirstLine))) {
          continue;
        }

        let currentSession: CodexSessionAccumulator | null = null;
        await readUsageLines(file, async (line) => {
          if (!shouldParseCodexUsageLine(line, currentSession !== null)) {
            return;
          }

          const entry = safeJsonParse(line);
          if (!entry) {
            return;
          }

          if (entry.type === 'session_meta') {
            const payload = getPayload(entry);
            if (!payload) {
              return;
            }
            const accumulator = createAccumulatorFromMeta(payload);
            if (!accumulator) {
              return;
            }
            if (!shouldIncludeUsageCwd(accumulator.cwd, request)) {
              currentSession = null;
              return;
            }
            currentSession = sessionsById.get(accumulator.sessionId) ?? accumulator;
            sessionsById.set(accumulator.sessionId, currentSession);
            return;
          }

          if (!currentSession) {
            return;
          }

          if (entry.type === 'turn_context') {
            const payload = getPayload(entry);
            currentSession.model = payload
              ? (readString(payload.model) ?? currentSession.model)
              : currentSession.model;
            currentSession.updatedAt = Math.max(
              currentSession.updatedAt,
              parseUsageTimestamp(entry.timestamp)
            );
          } else if (entry.type === 'event_msg') {
            applyTokenCount(currentSession, entry);
          }
        });
      }

      return {
        status: {
          ...CODEX_PROVIDER_STATUS,
          status: 'available',
        },
        sessions: [...sessionsById.values()]
          .filter((session) => session.hasTokenCount)
          .map<TokenUsageSessionSummary>((session) => ({
            sessionId: session.sessionId,
            providerId: CODEX_PROVIDER_STATUS.providerId,
            agentFamily: CODEX_PROVIDER_STATUS.agentFamily,
            source: 'codex-jsonl',
            projectPath: session.projectPath,
            cwd: session.cwd,
            model: session.model,
            startedAt: session.startedAt,
            updatedAt: session.updatedAt,
            counts: session.counts,
          })),
      };
    } catch (error) {
      return {
        status: {
          ...CODEX_PROVIDER_STATUS,
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        },
        sessions: [],
      };
    }
  }
}
