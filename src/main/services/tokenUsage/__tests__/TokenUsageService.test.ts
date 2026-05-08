import { mkdir, mkdtemp, readFile as readTextFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeUsageAdapter } from '../ClaudeUsageAdapter';
import { CodexUsageAdapter } from '../CodexUsageAdapter';
import { StaticUsageAdapter } from '../StaticUsageAdapter';
import { buildTokenUsageCounts } from '../TokenUsageAccumulator';
import { TokenUsageService } from '../TokenUsageService';
import type { TokenUsageCollectionResult } from '../TokenUsageTypes';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true }))
  );
});

async function createTempDirectory(prefix: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(tempDir);
  return tempDir;
}

async function writeJsonl(filePath: string, entries: unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8'
  );
}

function createTestCollectionResult(totalTokens: number): TokenUsageCollectionResult {
  return {
    status: {
      providerId: 'custom',
      agentFamily: 'custom',
      label: 'Custom',
      status: 'available',
    },
    sessions: [
      {
        sessionId: `session-${totalTokens}`,
        providerId: 'custom',
        agentFamily: 'custom',
        source: 'codex-jsonl',
        projectPath: '/repo/app',
        cwd: '/repo/app',
        startedAt: totalTokens,
        updatedAt: totalTokens,
        counts: {
          inputTokens: totalTokens,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens,
        },
      },
    ],
  };
}

describe('TokenUsageService provider adapters', () => {
  it('reports supported providers as not found when their usage roots are missing', async () => {
    const missingRoot = path.join(os.tmpdir(), 'infilux-token-usage-missing-root');

    await expect(new ClaudeUsageAdapter({ projectsRoot: missingRoot }).collect()).resolves.toEqual({
      status: expect.objectContaining({
        providerId: 'claude-code',
        status: 'not-found',
      }),
      sessions: [],
    });
    await expect(new CodexUsageAdapter({ sessionsRoot: missingRoot }).collect()).resolves.toEqual({
      status: expect.objectContaining({
        providerId: 'codex-cli',
        status: 'not-found',
      }),
      sessions: [],
    });
  });

  it('reuses cached project usage for repeated matching requests', async () => {
    const collect = vi
      .fn<() => Promise<TokenUsageCollectionResult>>()
      .mockResolvedValueOnce(createTestCollectionResult(10))
      .mockResolvedValueOnce(createTestCollectionResult(20));
    const service = new TokenUsageService([{ collect }], {
      cacheTtlMs: 60_000,
      now: () => 1_000,
    });

    const firstSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });
    const secondSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(firstSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(secondSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(firstSnapshot.freshness).toEqual({
      source: 'scan',
      cachedAt: 1_000,
      cacheTtlMs: 60_000,
      isStale: false,
      backgroundRefresh: false,
    });
    expect(secondSnapshot.freshness).toEqual({
      source: 'cache',
      cachedAt: 1_000,
      cacheTtlMs: 60_000,
      isStale: false,
      backgroundRefresh: false,
    });
  });

  it('forces a fresh project usage scan when requested', async () => {
    let now = 1_000;
    const collect = vi
      .fn<() => Promise<TokenUsageCollectionResult>>()
      .mockResolvedValueOnce(createTestCollectionResult(10))
      .mockResolvedValueOnce(createTestCollectionResult(20));
    const service = new TokenUsageService([{ collect }], {
      cacheTtlMs: 60_000,
      now: () => now,
    });

    const firstSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });
    now = 2_000;
    const refreshedSnapshot = await service.getProjectUsage({
      projectPaths: ['/repo/app'],
      forceRefresh: true,
    });

    expect(collect).toHaveBeenCalledTimes(2);
    expect(firstSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(refreshedSnapshot.projects[0].totals.totalTokens).toBe(20);
    expect(refreshedSnapshot.freshness).toEqual({
      source: 'scan',
      cachedAt: 2_000,
      cacheTtlMs: 60_000,
      isStale: false,
      backgroundRefresh: false,
    });
  });

  it('deduplicates concurrent uncached scans for the same request', async () => {
    let resolveScan: ((result: TokenUsageCollectionResult) => void) | undefined;
    const collect = vi.fn<() => Promise<TokenUsageCollectionResult>>(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        })
    );
    const service = new TokenUsageService([{ collect }], {
      cacheTtlMs: 60_000,
      now: () => 1_000,
    });

    const firstRequest = service.getProjectUsage({ projectPaths: ['/repo/app'] });
    const secondRequest = service.getProjectUsage({ projectPaths: ['/repo/app'] });
    resolveScan?.(createTestCollectionResult(10));

    const [firstSnapshot, secondSnapshot] = await Promise.all([firstRequest, secondRequest]);

    expect(collect).toHaveBeenCalledTimes(1);
    expect(firstSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(secondSnapshot.projects[0].totals.totalTokens).toBe(10);
  });

  it('returns stale cached project usage immediately while refreshing in the background', async () => {
    let now = 1_000;
    let resolveBackgroundScan: ((result: TokenUsageCollectionResult) => void) | undefined;
    const collect = vi
      .fn<() => Promise<TokenUsageCollectionResult>>()
      .mockResolvedValueOnce(createTestCollectionResult(10))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveBackgroundScan = resolve;
          })
      );
    const service = new TokenUsageService([{ collect }], {
      cacheTtlMs: 1,
      now: () => now,
    });

    const firstSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });
    now = 2_000;
    const staleSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });

    expect(collect).toHaveBeenCalledTimes(2);
    expect(firstSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(staleSnapshot.projects[0].totals.totalTokens).toBe(10);
    expect(staleSnapshot.freshness).toEqual({
      source: 'cache',
      cachedAt: 1_000,
      cacheTtlMs: 1,
      isStale: true,
      backgroundRefresh: true,
    });

    resolveBackgroundScan?.(createTestCollectionResult(20));
    await Promise.resolve();
    await Promise.resolve();

    const refreshedSnapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });
    expect(collect).toHaveBeenCalledTimes(2);
    expect(refreshedSnapshot.projects[0].totals.totalTokens).toBe(20);
  });

  it('aggregates Claude assistant usage from project JSONL files', async () => {
    const claudeRoot = await createTempDirectory('infilux-claude-usage-');
    const sessionFile = path.join(claudeRoot, '-repo-app', 'claude-session-1.jsonl');

    await writeJsonl(sessionFile, [
      {
        type: 'user',
        cwd: '/repo/app',
        sessionId: 'claude-session-1',
        timestamp: '2026-04-28T01:00:00.000Z',
      },
      {
        type: 'assistant',
        cwd: '/repo/app',
        sessionId: 'claude-session-1',
        timestamp: '2026-04-28T01:01:00.000Z',
        message: {
          model: 'claude-sonnet',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 5,
          },
        },
      },
      {
        type: 'assistant',
        cwd: '/repo/app',
        sessionId: 'claude-session-1',
        timestamp: '2026-04-28T01:02:00.000Z',
        message: {
          model: 'claude-sonnet',
          usage: {
            input_tokens: 50,
            output_tokens: 10,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 2,
          },
        },
      },
    ]);

    const adapter = new ClaudeUsageAdapter({ projectsRoot: claudeRoot });
    const result = await adapter.collect();

    expect(result.status).toEqual(
      expect.objectContaining({
        providerId: 'claude-code',
        status: 'available',
      })
    );
    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'claude-session-1',
        projectPath: '/repo/app',
        cwd: '/repo/app',
        model: 'claude-sonnet',
        providerId: 'claude-code',
        source: 'claude-jsonl',
        counts: {
          inputTokens: 150,
          outputTokens: 30,
          cacheCreationInputTokens: 10,
          cacheReadInputTokens: 7,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 197,
        },
      }),
    ]);
  });

  it('uses the latest Codex token_count total for each session', async () => {
    const codexRoot = await createTempDirectory('infilux-codex-usage-');
    const sessionFile = path.join(
      codexRoot,
      '2026',
      '04',
      '28',
      'rollout-2026-04-28T01-00-00-codex-session-1.jsonl'
    );

    await writeJsonl(sessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-1',
          cwd: '/repo/app',
          timestamp: '2026-04-28T01:00:00.000Z',
          model_provider: 'openai',
        },
      },
      {
        timestamp: '2026-04-28T01:01:00.000Z',
        type: 'turn_context',
        payload: {
          model: 'gpt-5.2',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 20,
              output_tokens: 10,
              reasoning_output_tokens: 4,
              total_tokens: 110,
            },
            model_context_window: 258400,
          },
        },
      },
      {
        timestamp: '2026-04-28T01:03:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 150,
              cached_input_tokens: 40,
              output_tokens: 30,
              reasoning_output_tokens: 12,
              total_tokens: 180,
            },
            model_context_window: 258400,
          },
        },
      },
    ]);

    const adapter = new CodexUsageAdapter({ sessionsRoot: codexRoot });
    const result = await adapter.collect();

    expect(result.status.status).toBe('available');
    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'codex-session-1',
        projectPath: '/repo/app',
        cwd: '/repo/app',
        model: 'gpt-5.2',
        providerId: 'codex-cli',
        source: 'codex-jsonl',
        counts: {
          inputTokens: 150,
          outputTokens: 30,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          cachedInputTokens: 40,
          reasoningOutputTokens: 12,
          totalTokens: 180,
        },
      }),
    ]);
  });

  it('falls back to Codex input plus output totals when total_tokens is missing', async () => {
    const codexRoot = await createTempDirectory('infilux-codex-usage-');
    const sessionFile = path.join(
      codexRoot,
      '2026',
      '04',
      '28',
      'rollout-2026-04-28T01-00-00-codex-session-fallback.jsonl'
    );

    await writeJsonl(sessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-fallback',
          cwd: '/repo/app',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 150,
              cached_input_tokens: 40,
              output_tokens: 30,
              reasoning_output_tokens: 12,
            },
          },
        },
      },
    ]);

    const adapter = new CodexUsageAdapter({ sessionsRoot: codexRoot });
    const result = await adapter.collect();

    expect(result.sessions[0].counts).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cachedInputTokens: 40,
      reasoningOutputTokens: 12,
      totalTokens: 180,
    });
  });

  it('returns project summaries and unsupported provider states without estimating usage', async () => {
    const codexRoot = await createTempDirectory('infilux-token-service-');
    const sessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-session.jsonl');

    await writeJsonl(sessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-1',
          cwd: '/repo/app/worktree-a',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 5,
              output_tokens: 3,
              reasoning_output_tokens: 1,
              total_tokens: 23,
            },
          },
        },
      },
    ]);

    const service = new TokenUsageService([
      new CodexUsageAdapter({ sessionsRoot: codexRoot }),
      new StaticUsageAdapter({
        providerId: 'gemini-cli',
        agentFamily: 'gemini',
        label: 'Gemini CLI',
        status: 'unsupported',
        reason: 'No stable token usage log was found for this provider.',
      }),
    ]);

    const snapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });

    expect(snapshot.providerStatuses).toEqual([
      expect.objectContaining({ providerId: 'codex-cli', status: 'available' }),
      expect.objectContaining({ providerId: 'gemini-cli', status: 'unsupported' }),
    ]);
    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        projectPath: '/repo/app',
        sessionCount: 1,
        totals: {
          inputTokens: 20,
          outputTokens: 3,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          cachedInputTokens: 5,
          reasoningOutputTokens: 1,
          totalTokens: 23,
        },
        providers: [
          expect.objectContaining({
            providerId: 'codex-cli',
            sessionCount: 1,
          }),
        ],
      }),
    ]);
  });

  it('assigns sessions to the most specific requested project path', async () => {
    const codexRoot = await createTempDirectory('infilux-token-service-');
    const sessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-session.jsonl');

    await writeJsonl(sessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-1',
          cwd: '/repo/app/worktree-a',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 5,
              output_tokens: 3,
              reasoning_output_tokens: 1,
              total_tokens: 23,
            },
          },
        },
      },
    ]);

    const service = new TokenUsageService([new CodexUsageAdapter({ sessionsRoot: codexRoot })]);

    const snapshot = await service.getProjectUsage({
      projectPaths: ['/repo', '/repo/app'],
    });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        projectPath: '/repo/app',
        sessionCount: 1,
        totals: expect.objectContaining({ totalTokens: 23 }),
      }),
      expect.objectContaining({
        projectPath: '/repo',
        sessionCount: 0,
        totals: expect.objectContaining({ totalTokens: 0 }),
      }),
    ]);
  });

  it('matches session cwd aliases to their owning project path', async () => {
    const codexRoot = await createTempDirectory('infilux-token-service-');
    const sessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-session.jsonl');

    await writeJsonl(sessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-1',
          cwd: '/workspaces/app-feature-a',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              output_tokens: 3,
              total_tokens: 23,
            },
          },
        },
      },
    ]);

    const service = new TokenUsageService([new CodexUsageAdapter({ sessionsRoot: codexRoot })]);

    const snapshot = await service.getProjectUsage({
      projectPaths: ['/repo/app'],
      projectPathAliases: {
        '/repo/app': ['/workspaces/app-feature-a'],
      },
    });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        projectPath: '/repo/app',
        sessionCount: 1,
        totals: expect.objectContaining({ totalTokens: 23 }),
      }),
    ]);
  });

  it('skips Codex session files outside the requested project scope', async () => {
    const codexRoot = await createTempDirectory('infilux-token-service-');
    const scopedSessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-scoped.jsonl');
    const unrelatedSessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-other.jsonl');

    await writeJsonl(scopedSessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-scoped',
          cwd: '/repo/app',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              output_tokens: 3,
              total_tokens: 23,
            },
          },
        },
      },
    ]);
    await writeJsonl(unrelatedSessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-other',
          cwd: '/repo/other',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 99,
              output_tokens: 1,
              total_tokens: 100,
            },
          },
        },
      },
    ]);

    const service = new TokenUsageService([new CodexUsageAdapter({ sessionsRoot: codexRoot })]);

    const snapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        projectPath: '/repo/app',
        sessionCount: 1,
        totals: expect.objectContaining({ totalTokens: 23 }),
      }),
    ]);
  });

  it('streams only Codex files inside the requested project scope', async () => {
    const codexRoot = await createTempDirectory('infilux-token-service-');
    const scopedSessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-scoped.jsonl');
    const unrelatedSessionFile = path.join(codexRoot, '2026', '04', '28', 'rollout-other.jsonl');

    await writeJsonl(scopedSessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-scoped',
          cwd: '/repo/app',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              output_tokens: 3,
              total_tokens: 23,
            },
          },
        },
      },
    ]);
    await writeJsonl(unrelatedSessionFile, [
      {
        timestamp: '2026-04-28T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-other',
          cwd: '/repo/other',
          timestamp: '2026-04-28T01:00:00.000Z',
        },
      },
      {
        timestamp: '2026-04-28T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 99,
              output_tokens: 1,
              total_tokens: 100,
            },
          },
        },
      },
    ]);

    const readLinesSpy = vi.fn(
      async (filePath: string, onLine: (line: string) => void | Promise<void>) => {
        const content = await readTextFile(filePath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          if (line) {
            await onLine(line);
          }
        }
      }
    );
    const adapter = new CodexUsageAdapter({
      sessionsRoot: codexRoot,
      readLines: readLinesSpy,
    });

    await adapter.collect({
      includeSessions: false,
      projectPathAliases: {},
      projectPaths: ['/repo/app'],
    });

    expect(readLinesSpy).toHaveBeenCalledWith(scopedSessionFile, expect.any(Function));
    expect(readLinesSpy).not.toHaveBeenCalledWith(unrelatedSessionFile, expect.any(Function));
  });

  it('skips Claude project directories outside the requested project scope', async () => {
    const claudeRoot = await createTempDirectory('infilux-claude-usage-');
    const scopedSessionFile = path.join(claudeRoot, '-repo-app', 'claude-session-scoped.jsonl');
    const unrelatedSessionFile = path.join(claudeRoot, '-repo-other', 'claude-session-other.jsonl');

    await writeJsonl(scopedSessionFile, [
      {
        type: 'assistant',
        cwd: '/repo/app',
        sessionId: 'claude-session-scoped',
        timestamp: '2026-04-28T01:01:00.000Z',
        message: {
          model: 'claude-sonnet',
          usage: {
            input_tokens: 20,
            output_tokens: 3,
          },
        },
      },
    ]);
    await writeJsonl(unrelatedSessionFile, [
      {
        type: 'assistant',
        cwd: '/repo/other',
        sessionId: 'claude-session-other',
        timestamp: '2026-04-28T01:01:00.000Z',
        message: {
          model: 'claude-sonnet',
          usage: {
            input_tokens: 99,
            output_tokens: 1,
          },
        },
      },
    ]);

    const service = new TokenUsageService([new ClaudeUsageAdapter({ projectsRoot: claudeRoot })]);

    const snapshot = await service.getProjectUsage({ projectPaths: ['/repo/app'] });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        projectPath: '/repo/app',
        sessionCount: 1,
        totals: expect.objectContaining({ totalTokens: 23 }),
      }),
    ]);
  });

  it('includes requested projects that have no recorded token usage', async () => {
    const service = new TokenUsageService([
      new StaticUsageAdapter({
        providerId: 'gemini-cli',
        agentFamily: 'gemini',
        label: 'Gemini CLI',
        status: 'unsupported',
        reason: 'No stable token usage log was found for this provider.',
      }),
    ]);

    const snapshot = await service.getProjectUsage({
      projectPaths: ['/repo/empty-app', '/repo/empty-app/'],
    });

    expect(snapshot.projects).toEqual([
      {
        projectPath: '/repo/empty-app',
        sessionCount: 0,
        updatedAt: 0,
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
        },
        providers: [],
      },
    ]);
  });

  it('uses only additive token categories in generic fallback totals', () => {
    expect(
      buildTokenUsageCounts({
        inputTokens: 10,
        outputTokens: 2,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 1,
        cachedInputTokens: 4,
        reasoningOutputTokens: 1,
      })
    ).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cacheCreationInputTokens: 3,
      cacheReadInputTokens: 1,
      cachedInputTokens: 4,
      reasoningOutputTokens: 1,
      totalTokens: 16,
    });
  });
});
