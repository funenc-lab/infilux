import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
type PreparedLaunchResult = {
  launchResult: {
    provider: string;
    hash: string;
    warnings: unknown[];
    projected: null;
  };
  sessionOverrides: undefined;
};

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
  const getSessionRuntimeInfo = vi.fn();
  const getTranscriptPage = vi.fn();
  const acknowledgeOutputResync = vi.fn();
  const setOutputDelivery = vi.fn();
  const destroyAllLocal = vi.fn();
  const destroyAllLocalAndWait = vi.fn();
  const prepareAgentCapabilityLaunch = vi.fn();
  const prepareRuntimeHome = vi.fn();
  const runExclusive = vi.fn();
  const browserWindowFromWebContents = vi.fn();

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

    getSessionRuntimeInfo.mockReset();
    getSessionRuntimeInfo.mockResolvedValue({
      pid: 1234,
      isActive: false,
      isAlive: true,
    });

    getTranscriptPage.mockReset();
    getTranscriptPage.mockResolvedValue({
      text: 'latest archived output',
      totalBytes: 4096,
      health: 'complete',
    });

    acknowledgeOutputResync.mockReset();
    setOutputDelivery.mockReset();

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

    prepareRuntimeHome.mockReset();
    prepareRuntimeHome.mockResolvedValue({
      homePath: '/runtime/codex/session-1',
      sourceHomePath: '/Users/test/.codex',
    });

    runExclusive.mockReset();
    runExclusive.mockImplementation(async (_runtimeKey: string, operation: () => unknown) =>
      operation()
    );

    browserWindowFromWebContents.mockReset();
    browserWindowFromWebContents.mockReturnValue(null);
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
    getSessionRuntimeInfo,
    getTranscriptPage,
    acknowledgeOutputResync,
    setOutputDelivery,
    destroyAllLocal,
    destroyAllLocalAndWait,
    prepareAgentCapabilityLaunch,
    prepareRuntimeHome,
    runExclusive,
    browserWindowFromWebContents,
    reset,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: sessionTestDoubles.browserWindowFromWebContents,
  },
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
    getSessionRuntimeInfo: sessionTestDoubles.getSessionRuntimeInfo,
    getTranscriptPage: sessionTestDoubles.getTranscriptPage,
    acknowledgeOutputResync: sessionTestDoubles.acknowledgeOutputResync,
    setOutputDelivery: sessionTestDoubles.setOutputDelivery,
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

vi.mock('../../services/agent/CodexRuntimeHomeService', () => ({
  codexRuntimeHomeService: {
    prepareRuntimeHome: sessionTestDoubles.prepareRuntimeHome,
    runExclusive: sessionTestDoubles.runExclusive,
  },
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
    const runtimeInfoHandler = getHandler(IPC_CHANNELS.SESSION_GET_RUNTIME_INFO);
    const transcriptHandler = getHandler(IPC_CHANNELS.SESSION_GET_TRANSCRIPT_PAGE);
    const acknowledgeOutputResyncHandler = getHandler(
      IPC_CHANNELS.SESSION_ACKNOWLEDGE_OUTPUT_RESYNC
    );
    const setOutputDeliveryHandler = getHandler(IPC_CHANNELS.SESSION_SET_OUTPUT_DELIVERY);

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
    expect(await runtimeInfoHandler({}, 'session-1')).toEqual({
      pid: 1234,
      isActive: false,
      isAlive: true,
    });
    expect(
      await transcriptHandler(
        {},
        {
          sessionId: 'session-1',
          beforeByteOffset: 4096,
          maxBytes: 1024,
        }
      )
    ).toEqual({
      text: 'latest archived output',
      totalBytes: 4096,
      health: 'complete',
    });
    await acknowledgeOutputResyncHandler(event, 'session-1');
    await setOutputDeliveryHandler(event, 'session-1', false);

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
    expect(sessionTestDoubles.getSessionRuntimeInfo).toHaveBeenCalledWith('session-1');
    expect(sessionTestDoubles.getTranscriptPage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      beforeByteOffset: 4096,
      maxBytes: 1024,
    });
    expect(sessionTestDoubles.acknowledgeOutputResync).toHaveBeenCalledWith(
      event.sender,
      'session-1'
    );
    expect(sessionTestDoubles.setOutputDelivery).toHaveBeenCalledWith(
      event.sender,
      'session-1',
      false
    );

    destroyAllTerminals();
    await destroyAllTerminalsAndWait();

    expect(sessionTestDoubles.destroyAllLocal).toHaveBeenCalledTimes(1);
    expect(sessionTestDoubles.destroyAllLocalAndWait).toHaveBeenCalledTimes(1);
  });

  it('preserves shell-config launch options and scopes plain Codex history to its worktree', async () => {
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
      metadata: {
        uiSessionId: 'ui-session-plain-codex',
        agentId: 'codex',
        agentCommand: 'codex',
      },
    });

    expect(sessionTestDoubles.prepareRuntimeHome).toHaveBeenCalledWith('ui-session-plain-codex', {
      sessionHistoryPath: expect.stringContaining('codex-session-histories'),
      sessionHistoryScope: {
        repoPath: undefined,
        worktreePath: '/repo',
      },
      legacySessionPaths: [expect.stringMatching(/\.codex\/sessions$/)],
    });
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        cwd: '/repo',
        kind: 'agent',
        shellConfig: { shellType: 'zsh' },
        initialCommand: 'codex --dangerously-bypass-approvals-and-sandbox',
        persistOnDisconnect: true,
        env: {
          CODEX_HOME: '/runtime/codex/session-1',
          INFILUX_MANAGED_CODEX_RUNTIME_HOME: '/runtime/codex/session-1',
        },
        metadata: expect.objectContaining({
          uiSessionId: 'ui-session-plain-codex',
          agentId: 'codex',
          agentCommand: 'codex',
          codexRuntimeHome: {
            homePath: '/runtime/codex/session-1',
            sourceHomePath: '/Users/test/.codex',
          },
        }),
      })
    );
  });

  it('uses the same worktree-scoped Codex history for explicit resume launches', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: 'codex',
      args: ['resume', 'codex-session-1'],
      metadata: {
        uiSessionId: 'ui-session-resume-codex',
        agentId: 'codex',
        agentCommand: 'codex',
      },
    });

    expect(sessionTestDoubles.prepareRuntimeHome).toHaveBeenCalledWith('ui-session-resume-codex', {
      sessionHistoryPath: expect.stringContaining('codex-session-histories'),
      sessionHistoryScope: {
        repoPath: undefined,
        worktreePath: '/repo',
      },
      legacySessionPaths: [expect.stringMatching(/\.codex\/sessions$/)],
    });
  });

  it('serializes Codex agent creation by UI session id before starting the runtime process', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      initialCommand: 'codex',
      metadata: {
        uiSessionId: 'ui-session-lock',
        agentId: 'codex',
        agentCommand: 'codex',
      },
    });

    expect(sessionTestDoubles.runExclusive).toHaveBeenCalledWith(
      'ui-session-lock',
      expect.any(Function)
    );
    expect(sessionTestDoubles.create).toHaveBeenCalledTimes(1);
  });

  it('serializes Codex capability launches by UI session id before preparing launch metadata', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo/worktrees/feature-a',
      kind: 'agent',
      metadata: {
        uiSessionId: 'ui-session-capability-lock',
        agentCapabilityLaunch: {
          provider: 'codex',
          agentId: 'codex',
          agentCommand: 'codex',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          globalPolicy: null,
          projectPolicy: null,
          worktreePolicy: null,
          sessionPolicy: null,
          materializationMode: 'provider-native',
        },
      },
    });

    expect(sessionTestDoubles.runExclusive).toHaveBeenCalledWith(
      'ui-session-capability-lock',
      expect.any(Function)
    );
    expect(sessionTestDoubles.prepareAgentCapabilityLaunch).toHaveBeenCalledTimes(1);
    expect(sessionTestDoubles.create).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit Codex home overrides on Codex agent sessions', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      initialCommand: 'codex',
      env: {
        CODEX_HOME: '/custom/codex-home',
      },
      metadata: {
        agentCommand: 'codex',
      },
    });

    expect(sessionTestDoubles.prepareRuntimeHome).not.toHaveBeenCalled();
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(event.sender, {
      cwd: '/repo',
      kind: 'agent',
      initialCommand: 'codex',
      env: {
        CODEX_HOME: '/custom/codex-home',
      },
      metadata: {
        agentCommand: 'codex',
      },
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
          CODEX_HOME: '/runtime/codex/session-1',
          INFILUX_MANAGED_CODEX_RUNTIME_HOME: '/runtime/codex/session-1',
        },
        metadata: expect.objectContaining({
          providerLaunchStrategy: 'provider-native',
          codexRuntimeHome: {
            homePath: '/runtime/codex/session-1',
            sourceHomePath: '/Users/test/.codex',
          },
          agentCapability: expect.objectContaining({
            provider: 'claude',
            hash: 'hash-1',
          }),
        }),
      })
    );
  });

  it('captures the sender window id before async capability preparation resolves', async () => {
    const event = createEvent();
    const deferredPreparation: {
      resolve: ((value: PreparedLaunchResult) => void) | null;
    } = {
      resolve: null,
    };

    sessionTestDoubles.browserWindowFromWebContents.mockReturnValueOnce({ id: 41 });
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockReturnValueOnce(
      new Promise<PreparedLaunchResult>((resolve) => {
        deferredPreparation.resolve = resolve;
      })
    );

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const createPromise = createHandler(event, {
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
          sessionPolicy: null,
          materializationMode: 'copy',
        },
      },
    });

    sessionTestDoubles.browserWindowFromWebContents.mockImplementationOnce(() => {
      throw new Error('Object has been destroyed');
    });
    const finishPreparation = deferredPreparation.resolve;
    if (!finishPreparation) {
      throw new Error('Expected capability preparation resolver to be set');
    }

    finishPreparation({
      launchResult: {
        provider: 'claude',
        hash: 'hash-1',
        warnings: [],
        projected: null,
      },
      sessionOverrides: undefined,
    });

    await createPromise;

    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      41,
      expect.objectContaining({
        cwd: '/repo/worktrees/feature-a',
        kind: 'agent',
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
