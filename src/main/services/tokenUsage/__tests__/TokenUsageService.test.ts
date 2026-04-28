import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeUsageAdapter } from '../ClaudeUsageAdapter';
import { CodexUsageAdapter } from '../CodexUsageAdapter';
import { StaticUsageAdapter } from '../StaticUsageAdapter';
import { TokenUsageService } from '../TokenUsageService';

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
});
