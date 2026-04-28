import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TokenUsageCounts, TokenUsageSessionSummary } from '@shared/types/tokenUsage';
import { collectJsonlFiles, pathExists } from './fileUtils';
import { parseUsageTimestamp, readNumber, readString, safeJsonParse } from './jsonUtils';
import type { TokenUsageCollectionResult } from './TokenUsageTypes';

export interface CodexUsageAdapterOptions {
  sessionsRoot: string;
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
  const totalTokens =
    readNumber(usageRecord.total_tokens) ||
    inputTokens + outputTokens + cachedInputTokens + reasoningOutputTokens;

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

export class CodexUsageAdapter {
  constructor(
    private readonly options: CodexUsageAdapterOptions = {
      sessionsRoot: path.join(os.homedir(), '.codex', 'sessions'),
    }
  ) {}

  async collect(): Promise<TokenUsageCollectionResult> {
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

      for (const file of files) {
        let currentSession: CodexSessionAccumulator | null = null;
        const content = await readFile(file, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const entry = safeJsonParse(line);
          if (!entry) {
            continue;
          }

          if (entry.type === 'session_meta') {
            const payload = getPayload(entry);
            if (!payload) {
              continue;
            }
            const accumulator = createAccumulatorFromMeta(payload);
            if (!accumulator) {
              continue;
            }
            currentSession = sessionsById.get(accumulator.sessionId) ?? accumulator;
            sessionsById.set(accumulator.sessionId, currentSession);
            continue;
          }

          if (!currentSession) {
            continue;
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
        }
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
