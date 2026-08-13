import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const claudePolicyTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const listClaudeCapabilityCatalog = vi.fn();
  const invalidateClaudeCapabilityCatalogWorkspace = vi.fn();
  const resolveClaudePolicy = vi.fn();
  const prepareClaudeAgentLaunch = vi.fn();
  const disableWorkspaceNativeClaudeSkill = vi.fn();
  const restoreWorkspaceNativeClaudeSkill = vi.fn();

  function reset() {
    handlers.clear();
    listClaudeCapabilityCatalog.mockReset();
    listClaudeCapabilityCatalog.mockResolvedValue({
      capabilities: [{ id: 'command:ship' }],
      sharedMcpServers: [],
      personalMcpServers: [],
      generatedAt: 1,
    });
    invalidateClaudeCapabilityCatalogWorkspace.mockReset();
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
    disableWorkspaceNativeClaudeSkill.mockReset();
    disableWorkspaceNativeClaudeSkill.mockResolvedValue({
      ok: true,
      sourcePath: '/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
      disabledPath: '/repo/worktrees/feature-a/.claude/skills.disabled/planner',
    });
    restoreWorkspaceNativeClaudeSkill.mockReset();
    restoreWorkspaceNativeClaudeSkill.mockResolvedValue({
      ok: true,
      sourcePath: '/repo/worktrees/feature-a/.claude/skills.disabled/planner/SKILL.md',
      restoredPath: '/repo/worktrees/feature-a/.claude/skills/planner',
    });
  }

  return {
    handlers,
    listClaudeCapabilityCatalog,
    invalidateClaudeCapabilityCatalogWorkspace,
    resolveClaudePolicy,
    prepareClaudeAgentLaunch,
    disableWorkspaceNativeClaudeSkill,
    restoreWorkspaceNativeClaudeSkill,
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
  invalidateClaudeCapabilityCatalogWorkspace:
    claudePolicyTestDoubles.invalidateClaudeCapabilityCatalogWorkspace,
}));

vi.mock('../../services/claude/ClaudePolicyResolver', () => ({
  resolveClaudePolicy: claudePolicyTestDoubles.resolveClaudePolicy,
}));

vi.mock('../../services/claude/ClaudeSessionLaunchPreparation', () => ({
  prepareClaudeAgentLaunch: claudePolicyTestDoubles.prepareClaudeAgentLaunch,
}));

vi.mock('../../services/claude/ClaudeNativeSkillService', () => ({
  disableWorkspaceNativeClaudeSkill: claudePolicyTestDoubles.disableWorkspaceNativeClaudeSkill,
  restoreWorkspaceNativeClaudeSkill: claudePolicyTestDoubles.restoreWorkspaceNativeClaudeSkill,
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

  it('resolves previews from a supplied catalog without scanning it again', async () => {
    const { registerClaudePolicyHandlers } = await import('../claudePolicy');
    registerClaudePolicyHandlers();

    const catalog = {
      capabilities: [{ id: 'legacy-skill:planner' }],
      sharedMcpServers: [],
      personalMcpServers: [],
      generatedAt: 1,
    };
    const request = {
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      catalog,
    };

    await getHandler(IPC_CHANNELS.CLAUDE_POLICY_PREVIEW_RESOLVE)({}, request);

    expect(claudePolicyTestDoubles.listClaudeCapabilityCatalog).not.toHaveBeenCalled();
    expect(claudePolicyTestDoubles.resolveClaudePolicy).toHaveBeenCalledWith({
      catalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
    });
  });

  it('delegates native skill disable requests to the native skill service', async () => {
    const { registerClaudePolicyHandlers } = await import('../claudePolicy');
    registerClaudePolicyHandlers();

    const request = {
      worktreePath: '/repo/worktrees/feature-a',
      sourcePath: '/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
    };

    await expect(
      getHandler(IPC_CHANNELS.CLAUDE_POLICY_NATIVE_SKILL_DISABLE)({}, request)
    ).resolves.toEqual({
      ok: true,
      sourcePath: '/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
      disabledPath: '/repo/worktrees/feature-a/.claude/skills.disabled/planner',
    });
    expect(claudePolicyTestDoubles.disableWorkspaceNativeClaudeSkill).toHaveBeenCalledWith(request);
    expect(claudePolicyTestDoubles.invalidateClaudeCapabilityCatalogWorkspace).toHaveBeenCalledWith(
      request.worktreePath
    );
  });

  it('delegates native skill restore requests to the native skill service', async () => {
    const { registerClaudePolicyHandlers } = await import('../claudePolicy');
    registerClaudePolicyHandlers();

    const request = {
      worktreePath: '/repo/worktrees/feature-a',
      sourcePath: '/repo/worktrees/feature-a/.claude/skills.disabled/planner/SKILL.md',
    };

    await expect(
      getHandler(IPC_CHANNELS.CLAUDE_POLICY_NATIVE_SKILL_RESTORE)({}, request)
    ).resolves.toEqual({
      ok: true,
      sourcePath: '/repo/worktrees/feature-a/.claude/skills.disabled/planner/SKILL.md',
      restoredPath: '/repo/worktrees/feature-a/.claude/skills/planner',
    });
    expect(claudePolicyTestDoubles.restoreWorkspaceNativeClaudeSkill).toHaveBeenCalledWith(request);
    expect(claudePolicyTestDoubles.invalidateClaudeCapabilityCatalogWorkspace).toHaveBeenCalledWith(
      request.worktreePath
    );
  });
});
