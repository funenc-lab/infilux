import type { ReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentProviderSessionService } from '../AgentProviderSessionService';

const TEMP_DIRECTORIES: string[] = [];

afterEach(async () => {
  vi.doUnmock('node:fs');
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

  it('normalizes and bounds provider transcript titles before returning them over IPC', async () => {
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
    ).resolves.toEqual({ title: `${'a'.repeat(159)}…` });
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

  it('resolves codex sessions from the current CODEX_HOME when no sessions directory is injected', async () => {
    const originalCodexHome = process.env.CODEX_HOME;
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);
    const codexHome = path.join(tempRoot, 'codex-home');

    await writeCodexSessionFile({
      rootDir: path.join(codexHome, 'sessions'),
      dayPath: '2026/05/01',
      threadId: 'codex-scoped-home-session',
      cwd: '/repo/worktree-scoped-home',
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
          cwd: '/repo/worktree-scoped-home',
          createdAt: Date.parse('2026-05-01T08:12:10.000Z'),
          observedAt: Date.parse('2026-05-01T08:12:18.000Z'),
        })
      ).resolves.toEqual({
        providerSessionId: 'codex-scoped-home-session',
      });
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
