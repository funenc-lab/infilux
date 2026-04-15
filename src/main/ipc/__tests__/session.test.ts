import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const sessionTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const create = vi.fn();
  const attach = vi.fn();
  const detach = vi.fn();
  const kill = vi.fn();
  const write = vi.fn();
  const resize = vi.fn();
  const list = vi.fn();
  const getActivity = vi.fn();
  const destroyAllLocal = vi.fn();
  const destroyAllLocalAndWait = vi.fn();
  const prepareAgentCapabilityLaunch = vi.fn();

  function reset() {
    handlers.clear();

    create.mockReset();
    create.mockResolvedValue({
      session: {
        sessionId: 'session-1',
      },
    });

    attach.mockReset();
    attach.mockResolvedValue({
      replay: 'buffered output',
    });

    detach.mockReset();
    detach.mockResolvedValue(undefined);

    kill.mockReset();
    kill.mockResolvedValue(undefined);

    write.mockReset();
    resize.mockReset();

    list.mockReset();
    list.mockResolvedValue([{ sessionId: 'session-1' }]);

    getActivity.mockReset();
    getActivity.mockResolvedValue({ active: true });

    destroyAllLocal.mockReset();
    destroyAllLocalAndWait.mockReset();
    destroyAllLocalAndWait.mockResolvedValue(undefined);

    prepareAgentCapabilityLaunch.mockReset();
    prepareAgentCapabilityLaunch.mockResolvedValue({
      launchResult: {
        provider: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature-a',
        hash: 'hash-1',
        warnings: [],
        resolvedPolicy: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          allowedCapabilityIds: ['command:ship'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: [],
          blockedSharedMcpIds: [],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: [],
          capabilityProvenance: {},
          sharedMcpProvenance: {},
          personalMcpProvenance: {},
          hash: 'hash-1',
          policyHash: 'hash-1',
        },
        projected: {
          hash: 'hash-1',
          materializationMode: 'copy',
          applied: true,
          updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
          warnings: [],
          errors: [],
        },
      },
      sessionOverrides: undefined,
    });
  }

  return {
    handlers,
    create,
    attach,
    detach,
    kill,
    write,
    resize,
    list,
    getActivity,
    destroyAllLocal,
    destroyAllLocalAndWait,
    prepareAgentCapabilityLaunch,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      sessionTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/session/SessionManager', () => ({
  sessionManager: {
    create: sessionTestDoubles.create,
    attach: sessionTestDoubles.attach,
    detach: sessionTestDoubles.detach,
    kill: sessionTestDoubles.kill,
    write: sessionTestDoubles.write,
    resize: sessionTestDoubles.resize,
    list: sessionTestDoubles.list,
    getActivity: sessionTestDoubles.getActivity,
    destroyAllLocal: sessionTestDoubles.destroyAllLocal,
    destroyAllLocalAndWait: sessionTestDoubles.destroyAllLocalAndWait,
  },
}));

vi.mock('../../services/agent/AgentCapabilityLaunchService', () => ({
  prepareAgentCapabilityLaunch: sessionTestDoubles.prepareAgentCapabilityLaunch,
  resolveAgentCapabilityLaunchRequest: vi.fn((metadata?: Record<string, unknown>) => {
    const genericCandidate = metadata?.agentCapabilityLaunch;
    if (
      genericCandidate &&
      typeof genericCandidate === 'object' &&
      !Array.isArray(genericCandidate)
    ) {
      return genericCandidate;
    }

    const legacyClaudeCandidate = metadata?.claudePolicyLaunch;
    if (
      legacyClaudeCandidate &&
      typeof legacyClaudeCandidate === 'object' &&
      !Array.isArray(legacyClaudeCandidate)
    ) {
      return {
        provider: 'claude',
        ...legacyClaudeCandidate,
      };
    }

    return null;
  }),
}));

function getHandler(channel: string) {
  const handler = sessionTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

function createEvent() {
  return {
    sender: {
      send: vi.fn(),
    },
  };
}

describe('session IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sessionTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates session lifecycle handlers to the session manager', async () => {
    const event = createEvent();

    const { destroyAllTerminals, destroyAllTerminalsAndWait, registerSessionHandlers } =
      await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const attachHandler = getHandler(IPC_CHANNELS.SESSION_ATTACH);
    const detachHandler = getHandler(IPC_CHANNELS.SESSION_DETACH);
    const killHandler = getHandler(IPC_CHANNELS.SESSION_KILL);
    const writeHandler = getHandler(IPC_CHANNELS.SESSION_WRITE);
    const resizeHandler = getHandler(IPC_CHANNELS.SESSION_RESIZE);
    const listHandler = getHandler(IPC_CHANNELS.SESSION_LIST);
    const activityHandler = getHandler(IPC_CHANNELS.SESSION_GET_ACTIVITY);

    expect(await createHandler(event, { cwd: '/repo', shell: '/bin/zsh' })).toEqual({
      session: {
        sessionId: 'session-1',
      },
    });
    expect(await attachHandler(event, { sessionId: 'session-1', cwd: '/repo' })).toEqual({
      replay: 'buffered output',
    });
    await detachHandler(event, 'session-1');
    await killHandler({}, 'session-1');
    await writeHandler({}, 'session-1', 'pwd\n');
    await resizeHandler({}, 'session-1', { cols: 120, rows: 40 });
    expect(await listHandler(event)).toEqual([{ sessionId: 'session-1' }]);
    expect(await activityHandler({}, 'session-1')).toEqual({ active: true });

    expect(sessionTestDoubles.create).toHaveBeenCalledWith(event.sender, {
      cwd: '/repo',
      shell: '/bin/zsh',
    });
    expect(sessionTestDoubles.attach).toHaveBeenCalledWith(event.sender, {
      sessionId: 'session-1',
      cwd: '/repo',
    });
    expect(sessionTestDoubles.detach).toHaveBeenCalledWith(event.sender, 'session-1');
    expect(sessionTestDoubles.kill).toHaveBeenCalledWith('session-1');
    expect(sessionTestDoubles.write).toHaveBeenCalledWith('session-1', 'pwd\n');
    expect(sessionTestDoubles.resize).toHaveBeenCalledWith('session-1', 120, 40);
    expect(sessionTestDoubles.list).toHaveBeenCalledWith(event.sender);
    expect(sessionTestDoubles.getActivity).toHaveBeenCalledWith('session-1');

    destroyAllTerminals();
    await destroyAllTerminalsAndWait();

    expect(sessionTestDoubles.destroyAllLocal).toHaveBeenCalledTimes(1);
    expect(sessionTestDoubles.destroyAllLocalAndWait).toHaveBeenCalledTimes(1);
  });

  it('preserves shell-config launch options for agent startup sessions', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shellConfig: { shellType: 'zsh' },
      initialCommand: 'codex --dangerously-bypass-approvals-and-sandbox',
      persistOnDisconnect: true,
    });

    expect(sessionTestDoubles.create).toHaveBeenCalledWith(event.sender, {
      cwd: '/repo',
      kind: 'agent',
      shellConfig: { shellType: 'zsh' },
      initialCommand: 'codex --dangerously-bypass-approvals-and-sandbox',
      persistOnDisconnect: true,
    });
  });

  it('runs capability launch preparation before creating agent sessions when generic launch metadata is provided', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo/worktrees/feature-a',
      kind: 'agent',
      metadata: {
        agentCapabilityLaunch: {
          provider: 'claude',
          agentId: 'claude',
          agentCommand: 'claude',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          globalPolicy: null,
          projectPolicy: null,
          worktreePolicy: null,
          sessionPolicy: {
            allowedCapabilityIds: ['legacy-skill:ship'],
            blockedCapabilityIds: [],
            allowedSharedMcpIds: [],
            blockedSharedMcpIds: [],
            allowedPersonalMcpIds: [],
            blockedPersonalMcpIds: [],
            updatedAt: 10,
          },
          materializationMode: 'symlink',
        },
      },
    });

    expect(sessionTestDoubles.prepareAgentCapabilityLaunch).toHaveBeenCalledWith(
      {
        provider: 'claude',
        agentId: 'claude',
        agentCommand: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature-a',
        globalPolicy: null,
        projectPolicy: null,
        worktreePolicy: null,
        sessionPolicy: {
          allowedCapabilityIds: ['legacy-skill:ship'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: [],
          blockedSharedMcpIds: [],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: [],
          updatedAt: 10,
        },
        materializationMode: 'symlink',
      },
      {
        cwd: '/repo/worktrees/feature-a',
        kind: 'agent',
        metadata: {
          agentCapabilityLaunch: {
            provider: 'claude',
            agentId: 'claude',
            agentCommand: 'claude',
            repoPath: '/repo',
            worktreePath: '/repo/worktrees/feature-a',
            globalPolicy: null,
            projectPolicy: null,
            worktreePolicy: null,
            sessionPolicy: {
              allowedCapabilityIds: ['legacy-skill:ship'],
              blockedCapabilityIds: [],
              allowedSharedMcpIds: [],
              blockedSharedMcpIds: [],
              allowedPersonalMcpIds: [],
              blockedPersonalMcpIds: [],
              updatedAt: 10,
            },
            materializationMode: 'symlink',
          },
        },
      }
    );
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        metadata: {
          agentCapabilityLaunch: {
            provider: 'claude',
            agentId: 'claude',
            agentCommand: 'claude',
            repoPath: '/repo',
            worktreePath: '/repo/worktrees/feature-a',
            globalPolicy: null,
            projectPolicy: null,
            worktreePolicy: null,
            sessionPolicy: {
              allowedCapabilityIds: ['legacy-skill:ship'],
              blockedCapabilityIds: [],
              allowedSharedMcpIds: [],
              blockedSharedMcpIds: [],
              allowedPersonalMcpIds: [],
              blockedPersonalMcpIds: [],
              updatedAt: 10,
            },
            materializationMode: 'symlink',
          },
          agentCapability: {
            provider: 'claude',
            hash: 'hash-1',
            warnings: [],
            projected: {
              hash: 'hash-1',
              materializationMode: 'copy',
              applied: true,
              updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
              warnings: [],
              errors: [],
            },
          },
          claudePolicy: {
            hash: 'hash-1',
            warnings: [],
            projected: {
              hash: 'hash-1',
              materializationMode: 'copy',
              applied: true,
              updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
              warnings: [],
              errors: [],
            },
          },
        },
      })
    );
  });

  it('applies session option overrides returned by the capability adapter before session creation', async () => {
    const event = createEvent();

    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: {
        provider: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature-a',
        hash: 'hash-1',
        warnings: [],
        resolvedPolicy: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          allowedCapabilityIds: ['command:ship'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: [],
          blockedSharedMcpIds: [],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: [],
          capabilityProvenance: {},
          sharedMcpProvenance: {},
          personalMcpProvenance: {},
          hash: 'hash-1',
          policyHash: 'hash-1',
        },
        projected: {
          hash: 'hash-1',
          materializationMode: 'copy',
          applied: true,
          updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
          warnings: [],
          errors: [],
        },
      },
      sessionOverrides: {
        env: {
          AGENT_CAPABILITY_PROFILE: 'strict',
        },
        initialCommand: 'codex --profile strict',
        spawnCwd: '/tmp/infilux/capability-session',
        metadata: {
          providerLaunchStrategy: 'provider-native',
        },
      },
    });

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo/worktrees/feature-a',
      kind: 'agent',
      env: {
        BASE_ENV: '1',
      },
      initialCommand: 'codex --profile default',
      metadata: {
        agentCapabilityLaunch: {
          provider: 'claude',
          agentId: 'claude',
          agentCommand: 'claude',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          globalPolicy: null,
          projectPolicy: null,
          worktreePolicy: null,
          sessionPolicy: null,
          materializationMode: 'copy',
        },
      },
    });

    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        cwd: '/repo/worktrees/feature-a',
        kind: 'agent',
        spawnCwd: '/tmp/infilux/capability-session',
        initialCommand: 'codex --profile strict',
        env: {
          BASE_ENV: '1',
          AGENT_CAPABILITY_PROFILE: 'strict',
        },
        metadata: expect.objectContaining({
          providerLaunchStrategy: 'provider-native',
          agentCapability: expect.objectContaining({
            provider: 'claude',
            hash: 'hash-1',
          }),
        }),
      })
    );
  });

  it('keeps legacy Claude launch metadata compatible while routing through the generic service', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo/worktrees/feature-a',
      kind: 'agent',
      metadata: {
        claudePolicyLaunch: {
          agentId: 'claude',
          agentCommand: 'claude',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          globalPolicy: null,
          projectPolicy: null,
          worktreePolicy: null,
          sessionPolicy: null,
          materializationMode: 'copy',
        },
      },
    });

    expect(sessionTestDoubles.prepareAgentCapabilityLaunch).toHaveBeenCalledWith(
      {
        provider: 'claude',
        agentId: 'claude',
        agentCommand: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature-a',
        globalPolicy: null,
        projectPolicy: null,
        worktreePolicy: null,
        sessionPolicy: null,
        materializationMode: 'copy',
      },
      {
        cwd: '/repo/worktrees/feature-a',
        kind: 'agent',
        metadata: {
          claudePolicyLaunch: {
            agentId: 'claude',
            agentCommand: 'claude',
            repoPath: '/repo',
            worktreePath: '/repo/worktrees/feature-a',
            globalPolicy: null,
            projectPolicy: null,
            worktreePolicy: null,
            sessionPolicy: null,
            materializationMode: 'copy',
          },
        },
      }
    );
  });

  it('bridges legacy terminal handlers through session creation and attach replay', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const terminalCreateHandler = getHandler(IPC_CHANNELS.TERMINAL_CREATE);
    const terminalWriteHandler = getHandler(IPC_CHANNELS.TERMINAL_WRITE);
    const terminalResizeHandler = getHandler(IPC_CHANNELS.TERMINAL_RESIZE);
    const terminalDestroyHandler = getHandler(IPC_CHANNELS.TERMINAL_DESTROY);
    const terminalActivityHandler = getHandler(IPC_CHANNELS.TERMINAL_GET_ACTIVITY);

    expect(await terminalCreateHandler(event, { cwd: '/repo', shell: '/bin/bash' })).toBe(
      'session-1'
    );

    expect(sessionTestDoubles.create).toHaveBeenCalledWith(event.sender, {
      cwd: '/repo',
      shell: '/bin/bash',
      kind: 'terminal',
    });
    expect(sessionTestDoubles.attach).toHaveBeenCalledWith(event.sender, {
      sessionId: 'session-1',
      cwd: '/repo',
    });
    expect(event.sender.send).toHaveBeenCalledWith(IPC_CHANNELS.SESSION_DATA, {
      sessionId: 'session-1',
      data: 'buffered output',
    });

    await terminalWriteHandler({}, 'terminal-1', 'ls\n');
    await terminalResizeHandler({}, 'terminal-1', { cols: 80, rows: 24 });
    await terminalDestroyHandler({}, 'terminal-1');
    expect(await terminalActivityHandler({}, 'terminal-1')).toEqual({ active: true });

    expect(sessionTestDoubles.write).toHaveBeenCalledWith('terminal-1', 'ls\n');
    expect(sessionTestDoubles.resize).toHaveBeenCalledWith('terminal-1', 80, 24);
    expect(sessionTestDoubles.kill).toHaveBeenCalledWith('terminal-1');
    expect(sessionTestDoubles.getActivity).toHaveBeenCalledWith('terminal-1');
  });

  it('skips replay delivery for legacy terminal callers when attach returns no buffered data', async () => {
    const event = createEvent();
    sessionTestDoubles.attach.mockResolvedValueOnce({});

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const terminalCreateHandler = getHandler(IPC_CHANNELS.TERMINAL_CREATE);

    expect(await terminalCreateHandler(event, {})).toBe('session-1');
    expect(event.sender.send).not.toHaveBeenCalled();
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(event.sender, {
      kind: 'terminal',
    });
    expect(sessionTestDoubles.attach).toHaveBeenCalledWith(event.sender, {
      sessionId: 'session-1',
      cwd: undefined,
    });
  });
});
