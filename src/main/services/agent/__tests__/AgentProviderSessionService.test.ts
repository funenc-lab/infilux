import { accessSync, type ReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentProviderSessionService } from '../AgentProviderSessionService';

const TEMP_DIRECTORIES: string[] = [];

afterEach(async () => {
  vi.doUnmock('node:fs');
  vi.doUnmock('node:fs/promises');
  vi.resetModules();

  await Promise.all(
    TEMP_DIRECTORIES.splice(0).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    })
  );
});

async function writeCodexSessionFile(params: {
  rootDir: string;
  dayPath: string;
  threadId: string;
  cwd: string;
  timestamp: string;
}): Promise<void> {
  const targetDir = path.join(params.rootDir, params.dayPath);
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, `rollout-${params.dayPath.replaceAll('/', '-')}-${params.threadId}.jsonl`),
    `${JSON.stringify({
      timestamp: params.timestamp,
      type: 'session_meta',
      payload: {
        id: params.threadId,
        cwd: params.cwd,
        timestamp: params.timestamp,
      },
    })}\n`,
    'utf8'
  );
}

async function writeCodexTranscriptFile(params: {
  rootDir: string;
  dayPath: string;
  threadId: string;
  lines: Array<Record<string, unknown>>;
}): Promise<void> {
  const targetDir = path.join(params.rootDir, params.dayPath);
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, `rollout-${params.dayPath.replaceAll('/', '-')}-${params.threadId}.jsonl`),
    `${params.lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    'utf8'
  );
}

describe('AgentProviderSessionService', () => {
  it('recovers a delayed provider session and its title from the isolated runtime history', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-runtime-history-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const historyPath = path.join(tempRoot, 'history.jsonl');
    const providerSessionId = 'delayed-provider-session';
    await writeCodexTranscriptFile({
      rootDir: tempRoot,
      dayPath: '2026/10/09',
      threadId: providerSessionId,
      lines: [
        {
          type: 'session_meta',
          payload: {
            id: providerSessionId,
            cwd: '/repo/worktree-a',
            timestamp: '2026-10-09T03:25:59.000Z',
          },
        },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Restore the original session title' }],
          },
        },
      ],
    });
    await writeFile(
      historyPath,
      `${JSON.stringify({
        session_id: providerSessionId,
        ts: Date.parse('2026-10-09T03:26:00.000Z') / 1000,
        text: 'Restore the original session title',
      })}\n`,
      'utf8'
    );
    const service = new AgentProviderSessionService(tempRoot, () => historyPath);

    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      uiSessionId: 'ui-delayed-session',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
      observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
    });

    expect(result.providerSessionId).toBe(providerSessionId);
    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        cwd: '/repo/worktree-a',
        providerSessionId: result.providerSessionId!,
      })
    ).resolves.toEqual({ title: 'Restore the original session title' });
  });

  it('prefers the latest isolated history association when an older conversation was resumed', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-resumed-history-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const historyPath = path.join(tempRoot, 'history.jsonl');
    for (const [threadId, timestamp] of [
      ['startup-neighbor', '2026-10-09T03:22:40.000Z'],
      ['resumed-session', '2026-10-08T01:00:00.000Z'],
    ]) {
      await writeCodexSessionFile({
        rootDir: tempRoot,
        dayPath: timestamp.startsWith('2026-10-08') ? '2026/10/08' : '2026/10/09',
        threadId,
        cwd: '/repo/worktree-a',
        timestamp,
      });
    }
    await writeFile(
      historyPath,
      [
        JSON.stringify({ session_id: 'startup-neighbor', ts: 1791516160 }),
        JSON.stringify({ session_id: 'resumed-session', ts: 1791516500 }),
        '{"session_id":',
        '',
      ].join('\n'),
      'utf8'
    );
    const service = new AgentProviderSessionService(tempRoot, () => historyPath);

    await expect(
      service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'ui-resumed-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
        observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
      })
    ).resolves.toEqual({ providerSessionId: 'resumed-session' });
  });

  it.each([
    'other-worktree',
    'missing-transcript',
    'already-claimed',
  ])('does not guess another session when the runtime history points to %s', async (scenario) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-history-guard-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const historyPath = path.join(tempRoot, 'history.jsonl');
    const providerSessionId = 'recorded-provider-session';
    if (scenario !== 'missing-transcript') {
      await writeCodexSessionFile({
        rootDir: tempRoot,
        dayPath: '2026/10/09',
        threadId: providerSessionId,
        cwd: scenario === 'other-worktree' ? '/repo/worktree-b' : '/repo/worktree-a',
        timestamp: '2026-10-09T03:30:00.000Z',
      });
    }
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/10/09',
      threadId: 'unrelated-startup-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-10-09T03:22:40.000Z',
    });
    await writeFile(
      historyPath,
      `${JSON.stringify({ session_id: providerSessionId, ts: 1791516600 })}\n`,
      'utf8'
    );
    const service = new AgentProviderSessionService(tempRoot, () => historyPath);
    if (scenario === 'already-claimed') {
      await service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'other-ui-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
        observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
        providerSessionId,
      });
    }

    await expect(
      service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'ui-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
        observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
      })
    ).resolves.toEqual({ providerSessionId: null });
  });

  it('reads the bounded history tail and skips partial, expired, and future entries', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-history-tail-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const historyPath = path.join(tempRoot, 'history.jsonl');
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/10/09',
      threadId: 'recorded-provider-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-10-09T03:30:00.000Z',
    });
    await writeFile(
      historyPath,
      [
        JSON.stringify({ text: 'x'.repeat(300 * 1024) }),
        JSON.stringify({ session_id: 'recorded-provider-session', ts: 1791516600 }),
        JSON.stringify({ session_id: 'expired-session', ts: 1 }),
        JSON.stringify({ session_id: 'future-session', ts: 9999999999 }),
        '{"session_id":',
        '',
      ].join('\n'),
      'utf8'
    );
    const service = new AgentProviderSessionService(tempRoot, () => historyPath);

    await expect(
      service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'ui-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
        observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
      })
    ).resolves.toEqual({ providerSessionId: 'recorded-provider-session' });
  });

  it.each([
    { recordedProviderSessionId: null, laterCreatedAt: '2026-10-09T03:22:39.000Z' },
    { recordedProviderSessionId: 'resumed-session', laterCreatedAt: '2026-10-09T03:22:39.000Z' },
    { recordedProviderSessionId: 'startup-later', laterCreatedAt: '2026-10-09T03:22:39.000Z' },
    { recordedProviderSessionId: 'startup-earlier', laterCreatedAt: '2026-10-09T08:30:00.000Z' },
  ])('keeps concurrent identities correct while private history is pending ($recordedProviderSessionId, $laterCreatedAt)', async ({
    recordedProviderSessionId,
    laterCreatedAt,
  }) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-history-concurrent-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const historyPath = path.join(tempRoot, 'history.jsonl');
    for (const [threadId, timestamp] of [
      ['startup-earlier', '2026-10-09T03:22:40.000Z'],
      ['startup-later', '2026-10-09T03:22:42.000Z'],
      ['resumed-session', '2026-10-09T03:30:00.000Z'],
    ]) {
      await writeCodexSessionFile({
        rootDir: tempRoot,
        dayPath: '2026/10/09',
        threadId,
        cwd: '/repo/worktree-a',
        timestamp,
      });
    }
    if (recordedProviderSessionId) {
      await writeFile(
        historyPath,
        `${JSON.stringify({
          session_id: recordedProviderSessionId,
          ts: Math.max(1791516600, Date.parse(laterCreatedAt) / 1000 + 1),
        })}\n`,
        'utf8'
      );
    }
    let releaseHistoryRead: () => void = () => undefined;
    const historyReadGate = new Promise<void>((resolve) => {
      releaseHistoryRead = resolve;
    });
    let markHistoryReadStarted: () => void = () => undefined;
    const historyReadStarted = new Promise<void>((resolve) => {
      markHistoryReadStarted = resolve;
    });
    let releaseValidation: () => void = () => undefined;
    const validationGate = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    let markValidationStarted: () => void = () => undefined;
    const validationStarted = new Promise<void>((resolve) => {
      markValidationStarted = resolve;
    });
    const absentHistoryPath = path.join(tempRoot, 'absent-history.jsonl');
    let fallbackScanStarted = false;
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      return {
        ...actual,
        access: async (...args: Parameters<typeof actual.access>) => accessSync(...args),
        open: async (...args: Parameters<typeof actual.open>) => {
          if (args[0] === historyPath) {
            markHistoryReadStarted();
            await historyReadGate;
          }
          if (args[0] === absentHistoryPath) {
            throw new Error('No isolated history');
          }
          return actual.open(...args);
        },
        readdir: async (...args: Parameters<typeof actual.readdir>) => {
          fallbackScanStarted = true;
          if (recordedProviderSessionId && args[0] === tempRoot) {
            markValidationStarted();
            await validationGate;
          }
          return actual.readdir(...args);
        },
      };
    });
    vi.resetModules();
    const { AgentProviderSessionService: ConcurrentService } = await import(
      '../AgentProviderSessionService'
    );
    const service = new ConcurrentService(tempRoot, (uiSessionId) =>
      uiSessionId === 'ui-later' ? historyPath : absentHistoryPath
    );
    const request = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      observedAt: Date.parse('2026-10-14T01:00:00.000Z'),
    };
    const laterRequest = {
      ...request,
      uiSessionId: 'ui-later',
      createdAt: Date.parse(laterCreatedAt),
    };
    const earlierRequest = {
      ...request,
      uiSessionId: 'ui-earlier',
      createdAt: Date.parse('2026-10-09T03:22:38.000Z'),
    };
    const laterLookup = service.resolveProviderSession(laterRequest);
    await historyReadStarted;
    const earlierLookup = service.resolveProviderSession(earlierRequest);
    // Drain the fallback preflight while the other request's history remains blocked.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const scannedBeforeHistoryResolved = fallbackScanStarted;
    releaseHistoryRead();
    if (recordedProviderSessionId) {
      await validationStarted;
    }
    const earlierResult = await earlierLookup;
    releaseValidation();
    const laterResult = await laterLookup;

    expect(scannedBeforeHistoryResolved).toBe(false);
    expect(laterResult.providerSessionId).toBe(recordedProviderSessionId ?? 'startup-later');
    await expect(service.resolveProviderSession(laterRequest)).resolves.toEqual(laterResult);
    expect(earlierResult.providerSessionId).toBe(
      recordedProviderSessionId === 'startup-earlier' ? 'startup-later' : 'startup-earlier'
    );
  });

  it('discovers Codex sessions from the current worktree history', async () => {
    const worktreeAHistory = await mkdtemp(
      path.join(os.tmpdir(), 'agent-provider-worktree-a-test-')
    );
    const worktreeBHistory = await mkdtemp(
      path.join(os.tmpdir(), 'agent-provider-worktree-b-test-')
    );
    TEMP_DIRECTORIES.push(worktreeAHistory, worktreeBHistory);

    await writeCodexSessionFile({
      rootDir: worktreeAHistory,
      dayPath: '2026/08/20',
      threadId: 'worktree-a-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-08-20T01:14:40.000Z',
    });

    const service = new AgentProviderSessionService((cwd?: string) =>
      cwd === '/repo/worktree-a' ? worktreeAHistory : worktreeBHistory
    );
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-08-20T01:14:30.000Z'),
      observedAt: Date.parse('2026-08-20T01:14:45.000Z'),
    });

    expect(result).toEqual({ providerSessionId: 'worktree-a-session' });
  });

  it('reads a provider title from the current worktree history', async () => {
    const worktreeAHistory = await mkdtemp(
      path.join(os.tmpdir(), 'agent-provider-worktree-title-a-test-')
    );
    const worktreeBHistory = await mkdtemp(
      path.join(os.tmpdir(), 'agent-provider-worktree-title-b-test-')
    );
    TEMP_DIRECTORIES.push(worktreeAHistory, worktreeBHistory);
    const providerSessionId = 'shared-provider-session-id';

    await writeCodexTranscriptFile({
      rootDir: worktreeAHistory,
      dayPath: '2026/08/20',
      threadId: providerSessionId,
      lines: [
        { type: 'session_meta', payload: { id: providerSessionId, cwd: '/repo/worktree-a' } },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Title from worktree A' }],
          },
        },
      ],
    });
    await writeCodexTranscriptFile({
      rootDir: worktreeBHistory,
      dayPath: '2026/08/20',
      threadId: providerSessionId,
      lines: [
        { type: 'session_meta', payload: { id: providerSessionId, cwd: '/repo/worktree-b' } },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Title from worktree B' }],
          },
        },
      ],
    });

    const service = new AgentProviderSessionService((cwd?: string) =>
      cwd === '/repo/worktree-a' ? worktreeAHistory : worktreeBHistory
    );

    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        providerSessionId,
        cwd: '/repo/worktree-a',
      })
    ).resolves.toEqual({ title: 'Title from worktree A' });
  });

  it('resolves the nearest codex provider session id for the same cwd inside the startup window', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-stale-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:10:00.000Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-wrong-cwd',
      cwd: '/repo/worktree-b',
      timestamp: '2026-04-07T02:28:19.000Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-07T02:28:10.000Z'),
      observedAt: Date.parse('2026-04-07T02:28:18.000Z'),
    });

    expect(result).toEqual({
      providerSessionId: 'codex-current-session',
    });
  });

  it('resolves the original codex provider session id during delayed recovery after the startup window', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-original-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:28:16.200Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-later-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T05:10:00.000Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-07T02:28:10.000Z'),
      observedAt: Date.parse('2026-04-07T08:30:00.000Z'),
    });

    expect(result).toEqual({
      providerSessionId: 'codex-original-session',
    });
  });

  it('validates an existing codex provider session id outside the discovery window', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-resumed-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T05:10:00.000Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-07T02:28:10.000Z'),
      observedAt: Date.parse('2026-04-07T08:30:00.000Z'),
      providerSessionId: 'codex-resumed-session',
    });

    expect(result).toEqual({
      providerSessionId: 'codex-resumed-session',
    });
  });

  it('does not lose the matching codex session when a recovery day has more than sixty-four session files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    for (let index = 0; index < 70; index += 1) {
      await writeCodexSessionFile({
        rootDir: tempRoot,
        dayPath: '2026/04/30',
        threadId: `zzzz-session-${String(index).padStart(3, '0')}`,
        cwd: '/repo/worktree-b',
        timestamp: `2026-04-30T02:${String(index % 60).padStart(2, '0')}:00.000Z`,
      });
    }

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/30',
      threadId: 'aaaa-target-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-30T14:37:07.000Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-30T14:37:05.000Z'),
      observedAt: Date.parse('2026-05-07T11:18:45.000Z'),
    });

    expect(result).toEqual({
      providerSessionId: 'aaaa-target-session',
    });
  });

  it('returns null when the agent command does not support provider session discovery', async () => {
    const service = new AgentProviderSessionService('/tmp/non-existent-agent-provider-sessions');

    await expect(
      service.resolveProviderSession({
        agentCommand: 'claude',
        cwd: '/repo/worktree-a',
        createdAt: Date.now(),
        observedAt: Date.now(),
      })
    ).resolves.toEqual({
      providerSessionId: null,
    });
  });

  it('reads the first real Codex user message from the resolved provider transcript', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexTranscriptFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-title-session',
      lines: [
        {
          type: 'session_meta',
          payload: { id: 'codex-title-session', cwd: '/repo/worktree-a' },
        },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: '<environment_context>bootstrap</environment_context>' },
            ],
          },
        },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Investigate worktree canvas session recovery',
              },
            ],
          },
        },
      ],
    });

    const service = new AgentProviderSessionService(tempRoot);

    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        providerSessionId: 'codex-title-session',
      })
    ).resolves.toEqual({ title: 'Investigate worktree canvas session recovery' });
  });

  it('keeps a real user request that references bootstrap marker text', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexTranscriptFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-marker-title-session',
      lines: [
        {
          type: 'session_meta',
          payload: { id: 'codex-marker-title-session', cwd: '/repo/worktree-a' },
        },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Explain why <environment_context> appears in the transcript',
              },
            ],
          },
        },
      ],
    });

    const service = new AgentProviderSessionService(tempRoot);

    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        providerSessionId: 'codex-marker-title-session',
      })
    ).resolves.toEqual({
      title: 'Explain why <environment_context> appears in the transcript',
    });
  });

  it('keeps a real user request that starts with bootstrap marker text', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexTranscriptFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-leading-marker-title-session',
      lines: [
        {
          type: 'session_meta',
          payload: { id: 'codex-leading-marker-title-session', cwd: '/repo/worktree-a' },
        },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: '# AGENTS.md instructions should explain the <INSTRUCTIONS> marker',
              },
            ],
          },
        },
      ],
    });

    const service = new AgentProviderSessionService(tempRoot);

    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        providerSessionId: 'codex-leading-marker-title-session',
      })
    ).resolves.toEqual({
      title: '# AGENTS.md instructions should explain the <INSTRUCTIONS> marker',
    });
  });

  it('normalizes provider transcript titles without truncating them before returning them over IPC', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexTranscriptFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-bounded-title-session',
      lines: [
        {
          type: 'session_meta',
          payload: { id: 'codex-bounded-title-session', cwd: '/repo/worktree-a' },
        },
        { type: 'event_msg', payload: { type: 'task_started' } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `\u200B${'a'.repeat(200)}\u202E`,
              },
            ],
          },
        },
      ],
    });

    const service = new AgentProviderSessionService(tempRoot);

    await expect(
      service.readProviderSessionTitle({
        agentCommand: 'codex',
        providerSessionId: 'codex-bounded-title-session',
      })
    ).resolves.toEqual({ title: 'a'.repeat(200) });
  });

  it('assigns concurrent sessions in the same cwd to distinct provider transcripts', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-a',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.100Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-b',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };
    const [second, first] = await Promise.all([
      service.resolveProviderSession({
        ...request,
        uiSessionId: 'ui-session-b',
        createdAt: Date.parse('2026-07-21T02:28:10.100Z'),
      }),
      service.resolveProviderSession({
        ...request,
        uiSessionId: 'ui-session-a',
        createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      }),
    ]);

    expect(first).toEqual({ providerSessionId: 'codex-session-a' });
    expect(second).toEqual({ providerSessionId: 'codex-session-b' });

    const forwardService = new AgentProviderSessionService(tempRoot);
    const [forwardFirst, forwardSecond] = await Promise.all([
      forwardService.resolveProviderSession({
        ...request,
        uiSessionId: 'ui-session-a',
        createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      }),
      forwardService.resolveProviderSession({
        ...request,
        uiSessionId: 'ui-session-b',
        createdAt: Date.parse('2026-07-21T02:28:10.100Z'),
      }),
    ]);

    expect(forwardFirst).toEqual({ providerSessionId: 'codex-session-a' });
    expect(forwardSecond).toEqual({ providerSessionId: 'codex-session-b' });
  });

  it('does not remap an existing ui session claim to another provider transcript', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-a',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.100Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-b',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      uiSessionId: 'ui-session-a',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };

    await expect(
      service.resolveProviderSession({ ...request, providerSessionId: 'codex-session-a' })
    ).resolves.toEqual({ providerSessionId: 'codex-session-a' });
    await expect(
      service.resolveProviderSession({ ...request, providerSessionId: 'codex-session-b' })
    ).resolves.toEqual({ providerSessionId: null });
    await expect(service.resolveProviderSession(request)).resolves.toEqual({
      providerSessionId: 'codex-session-a',
    });
  });

  it('waits for every concurrent provider transcript before committing batch claims', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-b',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const baseRequest = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };
    const requestA = {
      ...baseRequest,
      uiSessionId: 'ui-session-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
    };
    const requestB = {
      ...baseRequest,
      uiSessionId: 'ui-session-b',
      createdAt: Date.parse('2026-07-21T02:28:10.100Z'),
    };

    await expect(
      Promise.all([
        service.resolveProviderSession(requestA),
        service.resolveProviderSession(requestB),
      ])
    ).resolves.toEqual([{ providerSessionId: null }, { providerSessionId: null }]);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-a',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.100Z',
    });

    await expect(
      Promise.all([
        service.resolveProviderSession(requestA),
        service.resolveProviderSession(requestB),
      ])
    ).resolves.toEqual([
      { providerSessionId: 'codex-session-a' },
      { providerSessionId: 'codex-session-b' },
    ]);
  });

  it('does not batch delayed recovery with a new discovery outside its time window', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-recovery-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.100Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-recovery-neighbor',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-new-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T08:30:06.100Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const [recovery, current] = await Promise.all([
      service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'ui-recovery-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
        observedAt: Date.parse('2026-07-21T08:30:08.000Z'),
      }),
      service.resolveProviderSession({
        agentCommand: 'codex',
        uiSessionId: 'ui-new-session',
        cwd: '/repo/worktree-a',
        createdAt: Date.parse('2026-07-21T08:30:00.000Z'),
        observedAt: Date.parse('2026-07-21T08:30:08.000Z'),
      }),
    ]);

    expect(recovery).toEqual({ providerSessionId: 'codex-recovery-session' });
    expect(current).toEqual({ providerSessionId: 'codex-new-session' });
  });

  it('keeps legacy discovery isolated from active ui discovery claims', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-legacy-session-a',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.100Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-legacy-session-b',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const currentRequest = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T08:30:00.000Z'),
      observedAt: Date.parse('2026-07-21T08:30:08.000Z'),
    };
    const legacyRequest = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T08:30:08.000Z'),
    };

    const [firstUi, secondUi, legacy] = await Promise.all([
      service.resolveProviderSession({ ...currentRequest, uiSessionId: 'ui-session-a' }),
      service.resolveProviderSession({ ...currentRequest, uiSessionId: 'ui-session-b' }),
      service.resolveProviderSession(legacyRequest),
    ]);

    expect(firstUi).toEqual({ providerSessionId: null });
    expect(secondUi).toEqual({ providerSessionId: null });
    expect(legacy).toEqual({ providerSessionId: 'codex-legacy-session-a' });
  });

  it('releases a provider transcript claim when its ui session is abandoned', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-session-a',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };
    await service.resolveProviderSession({ ...request, uiSessionId: 'ui-session-a' });
    service.releaseProviderSession('ui-session-a');

    await expect(
      service.resolveProviderSession({ ...request, uiSessionId: 'ui-session-b' })
    ).resolves.toEqual({ providerSessionId: 'codex-session-a' });
  });

  it('does not retain an unresolved discovery after its request completes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };

    await expect(
      service.resolveProviderSession({ ...request, uiSessionId: 'a-stale-ui-session' })
    ).resolves.toEqual({ providerSessionId: null });

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    await expect(
      service.resolveProviderSession({
        ...request,
        uiSessionId: 'z-current-ui-session',
        createdAt: Date.parse('2026-07-21T02:28:10.100Z'),
      })
    ).resolves.toEqual({ providerSessionId: 'codex-current-session' });
  });

  it('does not recreate a provider claim after an in-flight discovery is abandoned', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      uiSessionId: 'abandoned-ui-session',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };
    const resolution = service.resolveProviderSession(request);
    service.releaseProviderSession('abandoned-ui-session');

    await expect(resolution).resolves.toEqual({ providerSessionId: null });
    await expect(
      service.resolveProviderSession({ ...request, uiSessionId: 'replacement-ui-session' })
    ).resolves.toEqual({ providerSessionId: 'codex-current-session' });
  });

  it('does not recreate a provider claim after an in-flight validation is abandoned', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/07/21',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-07-21T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      uiSessionId: 'abandoned-ui-session',
      providerSessionId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-07-21T02:28:10.000Z'),
      observedAt: Date.parse('2026-07-21T02:28:18.000Z'),
    };
    const resolution = service.resolveProviderSession(request);
    service.releaseProviderSession('abandoned-ui-session');

    await expect(resolution).resolves.toEqual({ providerSessionId: null });
    await expect(
      service.resolveProviderSession({ ...request, uiSessionId: 'replacement-ui-session' })
    ).resolves.toEqual({ providerSessionId: 'codex-current-session' });
  });

  it('does not discover worktree sessions from the app-scoped CODEX_HOME', async () => {
    const originalCodexHome = process.env.CODEX_HOME;
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const codexHome = path.join(tempRoot, 'codex-home');
    const worktreePath = path.join(tempRoot, 'worktree');

    await writeCodexSessionFile({
      rootDir: path.join(codexHome, 'sessions'),
      dayPath: '2026/05/01',
      threadId: 'codex-scoped-home-session',
      cwd: worktreePath,
      timestamp: '2026-05-01T08:12:16.200Z',
    });

    process.env.CODEX_HOME = codexHome;
    vi.resetModules();
    const { AgentProviderSessionService: IsolatedAgentProviderSessionService } = await import(
      '../AgentProviderSessionService'
    );
    const service = new IsolatedAgentProviderSessionService();

    try {
      await expect(
        service.resolveProviderSession({
          agentCommand: 'codex',
          cwd: worktreePath,
          createdAt: Date.parse('2026-05-01T08:12:10.000Z'),
          observedAt: Date.parse('2026-05-01T08:12:18.000Z'),
        })
      ).resolves.toEqual({ providerSessionId: null });
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
      vi.resetModules();
    }
  });

  it('deduplicates concurrent codex session meta reads for the same candidate file', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:28:16.200Z',
    });

    const trackedStreams: ReadStream[] = [];
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        createReadStream: vi.fn(
          (filePath: string, options?: Parameters<typeof actual.createReadStream>[1]) => {
            const stream = actual.createReadStream(filePath, options);
            trackedStreams.push(stream);
            return stream;
          }
        ),
      };
    });
    vi.resetModules();
    const { AgentProviderSessionService: IsolatedAgentProviderSessionService } = await import(
      '../AgentProviderSessionService'
    );
    const service = new IsolatedAgentProviderSessionService(tempRoot);
    const request = {
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-07T02:28:10.000Z'),
      observedAt: Date.parse('2026-04-07T02:28:18.000Z'),
    };

    const results = await Promise.all([
      service.resolveProviderSession(request),
      service.resolveProviderSession(request),
      service.resolveProviderSession(request),
    ]);

    expect(results).toEqual([
      { providerSessionId: 'codex-current-session' },
      { providerSessionId: 'codex-current-session' },
      { providerSessionId: 'codex-current-session' },
    ]);
    expect(trackedStreams).toHaveLength(1);
    expect(trackedStreams.every((stream) => stream.closed || stream.destroyed)).toBe(true);

    vi.doUnmock('node:fs');
    vi.resetModules();
  });
});
