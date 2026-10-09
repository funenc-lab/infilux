import { IPC_CHANNELS, type SessionCreateOptions } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentLaunchPlan } from '../../../renderer/components/chat/agentLaunchPlan';

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
      sqliteHomePath: '/runtime/codex/worktree-shared/sqlite',
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
    writeInput: sessionTestDoubles.write,
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

  it('keeps input IPC pending until transport acceptance', async () => {
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    let accept: (() => void) | undefined;
    sessionTestDoubles.write.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        accept = resolve;
      })
    );
    let completed = false;
    const request = Promise.resolve(
      getHandler(IPC_CHANNELS.SESSION_WRITE)({}, 'session-1', 'a')
    ).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    accept?.();
    await request;
    expect(completed).toBe(true);
  });

  it('propagates input transport rejection through IPC', async () => {
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const failure = Promise.reject(new Error('transport rejected'));
    void failure.catch(() => undefined);
    sessionTestDoubles.write.mockReturnValueOnce(failure);
    await expect(getHandler(IPC_CHANNELS.SESSION_WRITE)({}, 'session-1', 'a')).rejects.toThrow(
      'transport rejected'
    );
  });

  it('preserves shell-config launch options and scopes plain Codex history to its worktree', async () => {
    const event = createEvent();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: '--dangerously-bypass-approvals-and-sandbox',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shellConfig: { shellType: 'zsh' },
      initialCommand: plan.initialCommand,
      codexLaunch: plan.codexLaunch,
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
    });
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        cwd: '/repo',
        kind: 'agent',
        shellConfig: { shellType: 'zsh' },
        initialCommand: expect.stringContaining(
          'codex -c "sqlite_home=\\"/runtime/codex/worktree-shared/sqlite\\"" --no-daemon --dangerously-bypass-approvals-and-sandbox'
        ),
        persistOnDisconnect: true,
        env: {
          CODEX_HOME: '/runtime/codex/session-1',
          CODEX_SQLITE_HOME: '/runtime/codex/worktree-shared/sqlite',
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

  it('honors a renderer-generated native Codex launch with a quoted custom path and prompt', async () => {
    const event = createEvent();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: "/opt/OpenAI's Codex tools/codex",
      customArgs: '--profile codex',
      initialPrompt: 'read codex logs',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    await getHandler(IPC_CHANNELS.SESSION_CREATE)(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      codexLaunch: plan.codexLaunch,
      metadata: { uiSessionId: 'ui-native', agentId: 'codex', agentCommand: 'codex' },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.initialCommand).toContain("'/opt/OpenAI'\\''s Codex tools/codex' -c ");
    expect(created.initialCommand).toContain('--profile codex');
    expect(created.initialCommand).toContain('read codex logs');
    expect(created.env?.CODEX_SQLITE_HOME).toBe('/runtime/codex/worktree-shared/sqlite');
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
    });
    expect(sessionTestDoubles.create).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        args: [
          '-c',
          'sqlite_home="/runtime/codex/worktree-shared/sqlite"',
          'resume',
          'codex-session-1',
        ],
        env: expect.objectContaining({
          CODEX_SQLITE_HOME: '/runtime/codex/worktree-shared/sqlite',
        }),
      })
    );
  });

  it('uses the same SQLite home across managed UI sessions and keeps sibling worktrees isolated', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    for (const [uiSessionId, worktree] of [
      ['ui-a', '/repo/worktrees/a'],
      ['ui-b', '/repo/worktrees/a'],
      ['ui-c', '/repo/worktrees/b'],
    ] as const) {
      sessionTestDoubles.prepareRuntimeHome.mockResolvedValueOnce({
        homePath: `/runtime/${uiSessionId}`,
        sourceHomePath: '/Users/test/.codex',
        sqliteHomePath: `/history/${worktree.endsWith('/a') ? 'a' : 'b'}/sqlite`,
      });
      await createHandler(event, {
        cwd: worktree,
        kind: 'agent',
        shell: 'codex',
        metadata: { agentId: 'codex', uiSessionId },
      });
    }

    const created = sessionTestDoubles.create.mock.calls.map(
      ([, options]) =>
        options as {
          env: Record<string, string>;
        }
    );
    expect(created[0]?.env.CODEX_HOME).not.toBe(created[1]?.env.CODEX_HOME);
    expect(created[0]?.env.CODEX_SQLITE_HOME).toBe(created[1]?.env.CODEX_SQLITE_HOME);
    expect(created[0]?.env.CODEX_SQLITE_HOME).not.toBe(created[2]?.env.CODEX_SQLITE_HOME);
  });

  it.each([
    { withCapabilities: false, withPriorWarning: false },
    { withCapabilities: true, withPriorWarning: false },
    { withCapabilities: true, withPriorWarning: true },
  ])('warns when a managed native Codex tmux attach cannot change its SQLite index (capabilities: $withCapabilities, previous warning: $withPriorWarning)', async ({
    withCapabilities,
    withPriorWarning,
  }) => {
    const warning =
      'An existing Codex process keeps its original resume index. If the history list differs, restart this session to apply the worktree-scoped index.';
    const legacyWarning =
      'Restart this Codex session to use the worktree-scoped resume index; an existing tmux process cannot change it.';
    const otherWarning = 'A separate runtime warning is still relevant.';
    const event = createEvent();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-reconnected',
      persistentHostSessionKey: 'infilux-ui-reconnected',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    expect(plan.codexLaunch).toEqual(expect.objectContaining({ layout: 'tmux-attach' }));
    if (withCapabilities) {
      sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
        launchResult: {
          provider: 'codex',
          hash: 'hash-1',
          warnings: [
            'Codex capability configuration was not applied to an existing tmux session. Restart this Codex session to apply MCP and skill changes.',
          ],
          projected: { applied: false, warnings: [] },
        },
        sessionOverrides: undefined,
      });
    }
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    await getHandler(IPC_CHANNELS.SESSION_CREATE)(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
      metadata: {
        uiSessionId: 'ui-reconnected',
        agentId: 'codex',
        agentCommand: 'codex',
        ...(withPriorWarning
          ? { codexRuntimeWarnings: [legacyWarning, otherWarning, warning] }
          : {}),
        ...(withCapabilities
          ? {
              agentCapabilityLaunch: {
                provider: 'codex',
                repoPath: '/repo',
                worktreePath: '/repo/worktrees/a',
              },
            }
          : {}),
      },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.initialCommand).toBe(plan.initialCommand);
    expect(created.args).toBeUndefined();
    expect(created.hostSession).toEqual(plan.hostSession);
    expect(created.env).toEqual(
      expect.objectContaining({
        CODEX_HOME: '/runtime/codex/session-1',
        CODEX_SQLITE_HOME: '/runtime/codex/worktree-shared/sqlite',
      })
    );
    expect(created.metadata?.codexRuntimeWarnings).toEqual(
      withPriorWarning ? [otherWarning, warning] : [warning]
    );
    if (withCapabilities) {
      expect(created.metadata?.agentCapability).toEqual(
        expect.objectContaining({ warnings: [expect.stringContaining('MCP and skill changes')] })
      );
    } else {
      expect(created.metadata?.agentCapability).toBeUndefined();
    }
  });

  it('warns when an older managed Codex tmux attach lacks a launch descriptor', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    await getHandler(IPC_CHANNELS.SESSION_CREATE)(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: 'tmux attach-session -t infilux-ui-reconnected',
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'infilux-ui-reconnected',
        mode: 'attach-existing',
      },
      metadata: { agentId: 'codex', agentCommand: 'codex' },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.initialCommand).toBe('tmux attach-session -t infilux-ui-reconnected');
    expect(created.metadata?.codexRuntimeWarnings).toEqual([
      expect.stringContaining('worktree-scoped index'),
    ]);
  });

  it('does not apply local resume-index warnings to remote Codex or non-Codex tmux attaches', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const hostSession = {
      kind: 'tmux' as const,
      serverName: 'infilux',
      sessionName: 'infilux-ui-reconnected',
      mode: 'attach-existing' as const,
    };
    await createHandler(event, {
      cwd: toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a'),
      kind: 'agent',
      shell: '/bin/zsh',
      hostSession,
      metadata: { agentId: 'codex', agentCommand: 'codex' },
    });
    await createHandler(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      hostSession,
      metadata: { agentId: 'claude', agentCommand: 'claude' },
    });

    const [remoteCodex, localClaude] = sessionTestDoubles.create.mock.calls.map(
      ([, options]) => options as SessionCreateOptions
    );
    expect(remoteCodex?.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(remoteCodex?.metadata?.codexRuntimeWarnings).toBeUndefined();
    expect(localClaude?.metadata?.codexRuntimeWarnings).toBeUndefined();
    expect(sessionTestDoubles.prepareRuntimeHome).toHaveBeenCalledTimes(1);
  });

  it('does not warn about a changed SQLite index for a new Codex tmux process or an explicit user-owned Codex home', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-new',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const attachPlan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-user-owned',
      persistentHostSessionKey: 'infilux-ui-user-owned',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    await createHandler(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
      metadata: { agentId: 'codex', agentCommand: 'codex' },
    });
    await createHandler(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: attachPlan.initialCommand,
      hostSession: attachPlan.hostSession,
      codexLaunch: attachPlan.codexLaunch,
      env: { CODEX_HOME: '/user/codex' },
      metadata: { agentId: 'codex', agentCommand: 'codex' },
    });

    const [newProcess, userOwned] = sessionTestDoubles.create.mock.calls.map(
      ([, options]) => options as SessionCreateOptions
    );
    expect(newProcess?.metadata?.codexRuntimeWarnings).toBeUndefined();
    expect(userOwned?.metadata?.codexRuntimeWarnings).toBeUndefined();
    expect(userOwned?.env?.CODEX_HOME).toBe('/user/codex');
    expect(userOwned?.env).not.toHaveProperty('CODEX_SQLITE_HOME');
  });

  it('preserves remote Codex home handling without forwarding a local SQLite path or CLI flag', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const remotePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a');

    await createHandler(event, {
      cwd: remotePath,
      kind: 'agent',
      initialCommand: 'codex',
      metadata: { agentId: 'codex', uiSessionId: 'ui-remote', worktreePath: remotePath },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(created.initialCommand).toBe('codex');
    expect(created.metadata?.codexRuntimeWarnings).toBeUndefined();
  });

  it('drops a capability-projected local SQLite path when the actual session cwd is remote', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    const remotePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a');
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: { provider: 'codex', hash: 'hash-1', warnings: [], projected: null },
      sessionOverrides: {
        env: {
          CODEX_HOME: '/runtime/codex/session-1',
          CODEX_SQLITE_HOME: '/history/local/sqlite',
          INFILUX_MANAGED_CODEX_RUNTIME_HOME: '/runtime/codex/session-1',
        },
      },
    });

    await createHandler(event, {
      cwd: remotePath,
      kind: 'agent',
      initialCommand: 'codex',
      metadata: {
        agentId: 'codex',
        uiSessionId: 'ui-remote',
        agentCapabilityLaunch: { provider: 'codex', repoPath: '/repo', worktreePath: '/repo' },
      },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(created.initialCommand).toBe('codex');
  });

  it.each([
    'hapi',
    'happy',
  ] as const)('does not break the local %s Codex wrapper by injecting unverified SQLite flags', async (environment) => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: {
        provider: 'codex',
        hash: 'hash-1',
        warnings: [],
        projected: { warnings: [] },
      },
      sessionOverrides: undefined,
    });
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment,
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    expect(plan.command?.shell).toBe('/bin/zsh');

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      codexLaunch: plan.codexLaunch,
      metadata: {
        agentId: 'codex',
        agentCommand: 'codex',
        ...(environment === 'happy' ? { environment } : {}),
        uiSessionId: `ui-${environment}`,
        agentCapabilityLaunch: { provider: 'codex', repoPath: '/repo', worktreePath: '/repo' },
      },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(created.args).toEqual(plan.command?.args);
    expect(created.args?.join(' ')).not.toContain('sqlite_home');
    expect(created.metadata?.agentCapability).toEqual(
      expect.objectContaining({ warnings: [expect.stringContaining('SQLite index isolation')] })
    );
    expect(created.metadata?.codexRuntimeWarnings).toBeUndefined();
  });

  it.each([
    { environment: 'hapi', hapiGlobalInstalled: true },
    { environment: 'hapi', hapiGlobalInstalled: false },
    { environment: 'happy', hapiGlobalInstalled: true },
  ] as const)('starts a built-in local $environment Codex tmux plan without wrapper metadata (hapi global: $hapiGlobalInstalled)', async ({
    environment,
    hapiGlobalInstalled,
  }) => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: {
        provider: 'codex',
        hash: 'hash-1',
        warnings: [],
        projected: { warnings: [] },
      },
      sessionOverrides: undefined,
    });
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment,
      hapiGlobalInstalled,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-1',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    expect(plan.hostSession?.mode).toBe('create-if-missing');
    expect(plan.command?.shell).toBe('/bin/zsh');

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
      metadata: {
        agentCapabilityLaunch: { provider: 'codex', repoPath: '/repo', worktreePath: '/repo' },
      },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.args).toEqual(plan.command?.args);
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(created.metadata?.agentCapability).toEqual(
      expect.objectContaining({ warnings: [expect.stringContaining('SQLite index isolation')] })
    );
  });

  it.each([
    { environment: 'hapi', hapiGlobalInstalled: true, customPath: '/opt/tools/codex' },
    { environment: 'hapi', hapiGlobalInstalled: false, customPath: '/opt/tools/codex' },
    { environment: 'happy', hapiGlobalInstalled: true, customPath: '/opt/tools with spaces/codex' },
    { environment: 'happy', hapiGlobalInstalled: true, customPath: "/opt/quote's tools/codex" },
  ] as const)('preserves built-in local $environment tmux wrapper launches with a custom Codex path', async ({
    environment,
    hapiGlobalInstalled,
    customPath,
  }) => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: {
        provider: 'codex',
        hash: 'hash-1',
        warnings: [],
        projected: { warnings: [] },
      },
      sessionOverrides: undefined,
    });
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath,
      environment,
      hapiGlobalInstalled,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-custom-path',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    expect(plan.hostSession?.mode).toBe('create-if-missing');

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
      metadata: {
        agentCapabilityLaunch: { provider: 'codex', repoPath: '/repo', worktreePath: '/repo' },
      },
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.args).toEqual(plan.command?.args);
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(created.metadata?.agentCapability).toEqual(
      expect.objectContaining({ warnings: [expect.stringContaining('SQLite index isolation')] })
    );
  });

  it.each([
    'hapi',
    'happy',
  ] as const)('persists a visible %s Codex runtime warning without an agent capability launch request', async (environment) => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment,
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    await getHandler(IPC_CHANNELS.SESSION_CREATE)(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      codexLaunch: plan.codexLaunch,
      metadata: { agentId: 'codex', agentCommand: 'codex', environment },
    });

    expect(sessionTestDoubles.prepareAgentCapabilityLaunch).not.toHaveBeenCalled();
    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.metadata?.agentCapability).toBeUndefined();
    expect(created.metadata?.codexRuntimeWarnings).toEqual([
      expect.stringContaining('SQLite index isolation'),
    ]);
  });

  it('recognizes an app-generated Happy Codex wrapper without capability or agent metadata', async () => {
    const event = createEvent();
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'happy',
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    await getHandler(IPC_CHANNELS.SESSION_CREATE)(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      codexLaunch: plan.codexLaunch,
    });

    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.env?.CODEX_HOME).toBe('/runtime/codex/session-1');
    expect(created.metadata?.codexRuntimeWarnings).toEqual([
      expect.stringContaining('SQLite index isolation'),
    ]);
  });

  it('applies the SQLite override once after a zero-assignment Codex capability projection', async () => {
    const event = createEvent();
    sessionTestDoubles.prepareAgentCapabilityLaunch.mockResolvedValueOnce({
      launchResult: { provider: 'codex', hash: 'hash-1', warnings: [], projected: null },
      sessionOverrides: {
        env: {
          CODEX_HOME: '/runtime/codex/session-1',
          CODEX_SQLITE_HOME: '/runtime/codex/worktree-shared/sqlite',
          INFILUX_MANAGED_CODEX_RUNTIME_HOME: '/runtime/codex/session-1',
        },
      },
    });
    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();
    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);
    await createHandler(event, {
      cwd: '/repo/worktrees/a',
      kind: 'agent',
      shell: 'codex',
      args: ['resume', 'thread-id'],
      metadata: {
        agentCapabilityLaunch: {
          provider: 'codex',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/a',
        },
      },
    });

    expect(sessionTestDoubles.prepareRuntimeHome).not.toHaveBeenCalled();
    const created = sessionTestDoubles.create.mock.calls[0]?.[1] as SessionCreateOptions;
    expect(created.args).toEqual([
      '-c',
      'sqlite_home="/runtime/codex/worktree-shared/sqlite"',
      'resume',
      'thread-id',
    ]);
  });

  it('serializes Codex agent creation by UI session id before starting the runtime process', async () => {
    const event = createEvent();

    const { registerSessionHandlers } = await import('../session');
    registerSessionHandlers();

    const createHandler = getHandler(IPC_CHANNELS.SESSION_CREATE);

    await createHandler(event, {
      cwd: '/repo',
      kind: 'agent',
      shell: 'codex',
      args: [],
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
      shell: 'codex',
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
        initialCommand: 'claude --profile strict',
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
      initialCommand: 'claude --profile default',
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
        initialCommand: 'claude --profile strict',
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
