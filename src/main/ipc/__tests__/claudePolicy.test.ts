import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const claudePolicyTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const listClaudeCapabilityCatalog = vi.fn();
  const resolveClaudePolicy = vi.fn();
  const prepareClaudeAgentLaunch = vi.fn();

  function reset() {
    handlers.clear();
    listClaudeCapabilityCatalog.mockReset();
    listClaudeCapabilityCatalog.mockResolvedValue({
      capabilities: [{ id: 'command:ship' }],
      sharedMcpServers: [],
      personalMcpServers: [],
      generatedAt: 1,
    });
    resolveClaudePolicy.mockReset();
    resolveClaudePolicy.mockReturnValue({
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
    });
    prepareClaudeAgentLaunch.mockReset();
    prepareClaudeAgentLaunch.mockResolvedValue({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      hash: 'hash-1',
      warnings: [],
      resolvedPolicy: resolveClaudePolicy.mock.results[0]?.value,
      projected: {
        hash: 'hash-1',
        materializationMode: 'copy',
        applied: true,
        updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
        warnings: [],
        errors: [],
      },
    });
  }

  return {
    handlers,
    listClaudeCapabilityCatalog,
    resolveClaudePolicy,
    prepareClaudeAgentLaunch,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      claudePolicyTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/claude/CapabilityCatalogService', () => ({
  listClaudeCapabilityCatalog: claudePolicyTestDoubles.listClaudeCapabilityCatalog,
}));

vi.mock('../../services/claude/ClaudePolicyResolver', () => ({
  resolveClaudePolicy: claudePolicyTestDoubles.resolveClaudePolicy,
}));

vi.mock('../../services/claude/ClaudeSessionLaunchPreparation', () => ({
  prepareClaudeAgentLaunch: claudePolicyTestDoubles.prepareClaudeAgentLaunch,
}));

function getHandler(channel: string) {
  const handler = claudePolicyTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('Claude policy IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    claudePolicyTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates catalog, preview, and launch preparation requests to the policy services', async () => {
    const { registerClaudePolicyHandlers } = await import('../claudePolicy');
    registerClaudePolicyHandlers();

    const catalogRequest = {
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
    };
    const previewRequest = {
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: {
        allowedCapabilityIds: ['command:ship'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        updatedAt: 1,
      },
      projectPolicy: null,
      worktreePolicy: null,
    };

    expect(await getHandler(IPC_CHANNELS.CLAUDE_POLICY_CATALOG_LIST)({}, catalogRequest)).toEqual({
      capabilities: [{ id: 'command:ship' }],
      sharedMcpServers: [],
      personalMcpServers: [],
      generatedAt: 1,
    });
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_POLICY_PREVIEW_RESOLVE)({}, previewRequest)
    ).toMatchObject({
      hash: 'hash-1',
      allowedCapabilityIds: ['command:ship'],
    });
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_POLICY_LAUNCH_PREPARE)({}, previewRequest)
    ).toMatchObject({
      hash: 'hash-1',
      projected: expect.objectContaining({
        applied: true,
      }),
    });

    expect(claudePolicyTestDoubles.listClaudeCapabilityCatalog).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
    });
    expect(claudePolicyTestDoubles.resolveClaudePolicy).toHaveBeenCalledWith({
      catalog: {
        capabilities: [{ id: 'command:ship' }],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      },
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: {
        allowedCapabilityIds: ['command:ship'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        updatedAt: 1,
      },
      projectPolicy: null,
      worktreePolicy: null,
    });
    expect(claudePolicyTestDoubles.prepareClaudeAgentLaunch).toHaveBeenCalledWith(previewRequest);
  });
});
