import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TokenUsageCounts, TokenUsageSessionSummary } from '@shared/types/tokenUsage';
import { collectJsonlFiles, pathExists } from './fileUtils';
import { parseUsageTimestamp, readNumber, readString, safeJsonParse } from './jsonUtils';
import type { TokenUsageCollectionResult } from './TokenUsageTypes';

export interface ClaudeUsageAdapterOptions {
  projectsRoot: string;
}

interface ClaudeSessionAccumulator {
  sessionId: string;
  projectPath: string;
  cwd: string;
  model?: string;
  startedAt: number;
  updatedAt: number;
  counts: TokenUsageCounts;
}

const CLAUDE_PROVIDER_STATUS = {
  providerId: 'claude-code',
  agentFamily: 'claude',
  label: 'Claude Code',
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

function updateTotal(counts: TokenUsageCounts): void {
  counts.totalTokens =
    counts.inputTokens +
    counts.outputTokens +
    counts.cacheCreationInputTokens +
    counts.cacheReadInputTokens +
    counts.cachedInputTokens +
    counts.reasoningOutputTokens;
}

function getUsage(entry: Record<string, unknown>): Record<string, unknown> | null {
  const message = entry.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null;
  }
  const usage = (message as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }
  return usage as Record<string, unknown>;
}

function getModel(entry: Record<string, unknown>): string | undefined {
  const message = entry.message;
  return message && typeof message === 'object' && !Array.isArray(message)
    ? readString((message as Record<string, unknown>).model)
    : undefined;
}

function applyAssistantUsage(
  accumulator: ClaudeSessionAccumulator,
  entry: Record<string, unknown>
): void {
  const usage = getUsage(entry);
  if (!usage) {
    return;
  }

  accumulator.counts.inputTokens += readNumber(usage.input_tokens);
  accumulator.counts.outputTokens += readNumber(usage.output_tokens);
  accumulator.counts.cacheCreationInputTokens += readNumber(usage.cache_creation_input_tokens);
  accumulator.counts.cacheReadInputTokens += readNumber(usage.cache_read_input_tokens);
  accumulator.model = getModel(entry) ?? accumulator.model;
  accumulator.updatedAt = Math.max(accumulator.updatedAt, parseUsageTimestamp(entry.timestamp));
  updateTotal(accumulator.counts);
}

function createAccumulator(entry: Record<string, unknown>): ClaudeSessionAccumulator | null {
  const sessionId = readString(entry.sessionId);
  const cwd = readString(entry.cwd);
  if (!sessionId || !cwd) {
    return null;
  }

  return {
    sessionId,
    projectPath: cwd,
    cwd,
    startedAt: parseUsageTimestamp(entry.timestamp),
    updatedAt: parseUsageTimestamp(entry.timestamp),
    counts: createCounts(),
  };
}

export class ClaudeUsageAdapter {
  constructor(
    private readonly options: ClaudeUsageAdapterOptions = {
      projectsRoot: path.join(os.homedir(), '.claude', 'projects'),
    }
  ) {}

  async collect(): Promise<TokenUsageCollectionResult> {
    try {
      if (!(await pathExists(this.options.projectsRoot))) {
        return {
          status: {
            ...CLAUDE_PROVIDER_STATUS,
            status: 'not-found',
            reason: 'Claude usage log directory was not found.',
          },
          sessions: [],
        };
      }

      const files = await collectJsonlFiles(this.options.projectsRoot);
      if (files.length === 0) {
        return {
          status: {
            ...CLAUDE_PROVIDER_STATUS,
            status: 'not-found',
            reason: 'No Claude usage JSONL files were found.',
          },
          sessions: [],
        };
      }

      const sessionsById = new Map<string, ClaudeSessionAccumulator>();

      for (const file of files) {
        const content = await readFile(file, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const entry = safeJsonParse(line);
          if (!entry) {
            continue;
          }

          const sessionId = readString(entry.sessionId);
          if (!sessionId) {
            continue;
          }

          let accumulator: ClaudeSessionAccumulator | null | undefined =
            sessionsById.get(sessionId);
          if (!accumulator) {
            accumulator = createAccumulator(entry);
            if (!accumulator) {
              continue;
            }
            sessionsById.set(sessionId, accumulator);
          }

          if (entry.type === 'assistant') {
            applyAssistantUsage(accumulator, entry);
          }
        }
      }

      return {
        status: {
          ...CLAUDE_PROVIDER_STATUS,
          status: 'available',
        },
        sessions: [...sessionsById.values()]
          .filter((session) => session.counts.totalTokens > 0)
          .map<TokenUsageSessionSummary>((session) => ({
            sessionId: session.sessionId,
            providerId: CLAUDE_PROVIDER_STATUS.providerId,
            agentFamily: CLAUDE_PROVIDER_STATUS.agentFamily,
            source: 'claude-jsonl',
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
          ...CLAUDE_PROVIDER_STATUS,
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        },
        sessions: [],
      };
    }
  }
}
