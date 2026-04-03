import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const claudeConfigTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const resolveRepositoryRuntimeContext = vi.fn((repoPath?: string) =>
    repoPath?.startsWith('/__remote__/') ? { kind: 'remote' } : { kind: 'local' }
  );

  const readMcpServers = vi.fn();
  const syncMcpServers = vi.fn();
  const upsertMcpServer = vi.fn();
  const deleteMcpServer = vi.fn();
  const serverToConfig = vi.fn();

  const readClaudeMd = vi.fn();
  const writeClaudeMd = vi.fn();
  const backupClaudeMd = vi.fn();
  const ensureClaudeWorkspaceTrusted = vi.fn();

  const getPlugins = vi.fn();
  const setPluginEnabled = vi.fn();
  const getAvailablePlugins = vi.fn();
  const installPlugin = vi.fn();
  const uninstallPlugin = vi.fn();
  const getMarketplaces = vi.fn();
  const addMarketplace = vi.fn();
  const removeMarketplace = vi.fn();
  const refreshMarketplaces = vi.fn();

  const readRepositoryRemoteMcpServers = vi.fn();
  const writeRepositoryRemoteMcpServers = vi.fn();
  const readRepositoryClaudePrompt = vi.fn();
  const writeRepositoryClaudePrompt = vi.fn();
  const backupRepositoryClaudePrompt = vi.fn();
  const listRepositoryRemotePlugins = vi.fn();
  const setRepositoryRemotePluginEnabled = vi.fn();
  const listRepositoryRemoteAvailablePlugins = vi.fn();
  const installRepositoryRemotePlugin = vi.fn();
  const uninstallRepositoryRemotePlugin = vi.fn();
  const listRepositoryRemoteMarketplaces = vi.fn();
  const addRepositoryRemoteMarketplace = vi.fn();
  const removeRepositoryRemoteMarketplace = vi.fn();
  const refreshRepositoryRemoteMarketplaces = vi.fn();

  function reset() {
    handlers.clear();

    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockImplementation((repoPath?: string) =>
      repoPath?.startsWith('/__remote__/') ? { kind: 'remote' } : { kind: 'local' }
    );

    readMcpServers.mockReset();
    readMcpServers.mockReturnValue({ local: { command: 'npx' } });
    syncMcpServers.mockReset();
    syncMcpServers.mockResolvedValue(true);
    upsertMcpServer.mockReset();
    upsertMcpServer.mockResolvedValue(true);
    deleteMcpServer.mockReset();
    deleteMcpServer.mockResolvedValue(true);
    serverToConfig.mockReset();
    serverToConfig.mockImplementation((server: { id: string }) =>
      server.id === 'invalid' ? null : { command: `run-${server.id}` }
    );

    readClaudeMd.mockReset();
    readClaudeMd.mockResolvedValue('# Local prompt');
    writeClaudeMd.mockReset();
    writeClaudeMd.mockResolvedValue(true);
    backupClaudeMd.mockReset();
    backupClaudeMd.mockResolvedValue('/tmp/local-claude.md.bak');
    ensureClaudeWorkspaceTrusted.mockReset();
    ensureClaudeWorkspaceTrusted.mockResolvedValue(true);

    getPlugins.mockReset();
    getPlugins.mockResolvedValue([{ id: 'local-plugin' }]);
    setPluginEnabled.mockReset();
    setPluginEnabled.mockResolvedValue(true);
    getAvailablePlugins.mockReset();
    getAvailablePlugins.mockResolvedValue([{ name: 'available-plugin' }]);
    installPlugin.mockReset();
    installPlugin.mockResolvedValue(true);
    uninstallPlugin.mockReset();
    uninstallPlugin.mockResolvedValue(true);
    getMarketplaces.mockReset();
    getMarketplaces.mockResolvedValue([{ name: 'local-market' }]);
    addMarketplace.mockReset();
    addMarketplace.mockResolvedValue(true);
    removeMarketplace.mockReset();
    removeMarketplace.mockResolvedValue(true);
    refreshMarketplaces.mockReset();
    refreshMarketplaces.mockResolvedValue(true);

    readRepositoryRemoteMcpServers.mockReset();
    readRepositoryRemoteMcpServers.mockResolvedValue({ existing: { command: 'existing' } });
    writeRepositoryRemoteMcpServers.mockReset();
    writeRepositoryRemoteMcpServers.mockResolvedValue(true);
    readRepositoryClaudePrompt.mockReset();
    readRepositoryClaudePrompt.mockResolvedValue('# Remote prompt');
    writeRepositoryClaudePrompt.mockReset();
    writeRepositoryClaudePrompt.mockResolvedValue(true);
    backupRepositoryClaudePrompt.mockReset();
    backupRepositoryClaudePrompt.mockResolvedValue('/tmp/remote-claude.md.bak');
    listRepositoryRemotePlugins.mockReset();
    listRepositoryRemotePlugins.mockResolvedValue([{ id: 'remote-plugin' }]);
    setRepositoryRemotePluginEnabled.mockReset();
    setRepositoryRemotePluginEnabled.mockResolvedValue(true);
    listRepositoryRemoteAvailablePlugins.mockReset();
    listRepositoryRemoteAvailablePlugins.mockResolvedValue([{ name: 'remote-available' }]);
    installRepositoryRemotePlugin.mockReset();
    installRepositoryRemotePlugin.mockResolvedValue(true);
    uninstallRepositoryRemotePlugin.mockReset();
    uninstallRepositoryRemotePlugin.mockResolvedValue(true);
    listRepositoryRemoteMarketplaces.mockReset();
    listRepositoryRemoteMarketplaces.mockResolvedValue([{ name: 'remote-market' }]);
    addRepositoryRemoteMarketplace.mockReset();
    addRepositoryRemoteMarketplace.mockResolvedValue(true);
    removeRepositoryRemoteMarketplace.mockReset();
    removeRepositoryRemoteMarketplace.mockResolvedValue(true);
    refreshRepositoryRemoteMarketplaces.mockReset();
    refreshRepositoryRemoteMarketplaces.mockResolvedValue(true);
  }

  return {
    handlers,
    resolveRepositoryRuntimeContext,
    readMcpServers,
    syncMcpServers,
    upsertMcpServer,
    deleteMcpServer,
    serverToConfig,
    readClaudeMd,
    writeClaudeMd,
    backupClaudeMd,
    ensureClaudeWorkspaceTrusted,
    getPlugins,
    setPluginEnabled,
    getAvailablePlugins,
    installPlugin,
    uninstallPlugin,
    getMarketplaces,
    addMarketplace,
    removeMarketplace,
    refreshMarketplaces,
    readRepositoryRemoteMcpServers,
    writeRepositoryRemoteMcpServers,
    readRepositoryClaudePrompt,
    writeRepositoryClaudePrompt,
    backupRepositoryClaudePrompt,
    listRepositoryRemotePlugins,
    setRepositoryRemotePluginEnabled,
    listRepositoryRemoteAvailablePlugins,
    installRepositoryRemotePlugin,
    uninstallRepositoryRemotePlugin,
    listRepositoryRemoteMarketplaces,
    addRepositoryRemoteMarketplace,
    removeRepositoryRemoteMarketplace,
    refreshRepositoryRemoteMarketplaces,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      claudeConfigTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/claude/McpManager', () => ({
  deleteMcpServer: claudeConfigTestDoubles.deleteMcpServer,
  readMcpServers: claudeConfigTestDoubles.readMcpServers,
  serverToConfig: claudeConfigTestDoubles.serverToConfig,
  syncMcpServers: claudeConfigTestDoubles.syncMcpServers,
  upsertMcpServer: claudeConfigTestDoubles.upsertMcpServer,
}));

vi.mock('../../services/claude/PluginsManager', () => ({
  addMarketplace: claudeConfigTestDoubles.addMarketplace,
  getAvailablePlugins: claudeConfigTestDoubles.getAvailablePlugins,
  getMarketplaces: claudeConfigTestDoubles.getMarketplaces,
  getPlugins: claudeConfigTestDoubles.getPlugins,
  installPlugin: claudeConfigTestDoubles.installPlugin,
  refreshMarketplaces: claudeConfigTestDoubles.refreshMarketplaces,
  removeMarketplace: claudeConfigTestDoubles.removeMarketplace,
  setPluginEnabled: claudeConfigTestDoubles.setPluginEnabled,
  uninstallPlugin: claudeConfigTestDoubles.uninstallPlugin,
}));

vi.mock('../../services/claude/PromptsManager', () => ({
  backupClaudeMd: claudeConfigTestDoubles.backupClaudeMd,
  readClaudeMd: claudeConfigTestDoubles.readClaudeMd,
  writeClaudeMd: claudeConfigTestDoubles.writeClaudeMd,
}));

vi.mock('../../services/claude/ClaudeWorkspaceTrust', () => ({
  ensureClaudeWorkspaceTrusted: claudeConfigTestDoubles.ensureClaudeWorkspaceTrusted,
}));

vi.mock('../../services/remote/RemoteEnvironmentService', () => ({
  addRepositoryRemoteMarketplace: claudeConfigTestDoubles.addRepositoryRemoteMarketplace,
  backupRepositoryClaudePrompt: claudeConfigTestDoubles.backupRepositoryClaudePrompt,
  installRepositoryRemotePlugin: claudeConfigTestDoubles.installRepositoryRemotePlugin,
  listRepositoryRemoteAvailablePlugins:
    claudeConfigTestDoubles.listRepositoryRemoteAvailablePlugins,
  listRepositoryRemoteMarketplaces: claudeConfigTestDoubles.listRepositoryRemoteMarketplaces,
  listRepositoryRemotePlugins: claudeConfigTestDoubles.listRepositoryRemotePlugins,
  readRepositoryClaudePrompt: claudeConfigTestDoubles.readRepositoryClaudePrompt,
  readRepositoryRemoteMcpServers: claudeConfigTestDoubles.readRepositoryRemoteMcpServers,
  refreshRepositoryRemoteMarketplaces: claudeConfigTestDoubles.refreshRepositoryRemoteMarketplaces,
  removeRepositoryRemoteMarketplace: claudeConfigTestDoubles.removeRepositoryRemoteMarketplace,
  setRepositoryRemotePluginEnabled: claudeConfigTestDoubles.setRepositoryRemotePluginEnabled,
  uninstallRepositoryRemotePlugin: claudeConfigTestDoubles.uninstallRepositoryRemotePlugin,
  writeRepositoryClaudePrompt: claudeConfigTestDoubles.writeRepositoryClaudePrompt,
  writeRepositoryRemoteMcpServers: claudeConfigTestDoubles.writeRepositoryRemoteMcpServers,
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: claudeConfigTestDoubles.resolveRepositoryRuntimeContext,
}));

function getHandler(channel: string) {
  const handler = claudeConfigTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('Claude config IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    claudeConfigTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates local Claude config handlers to local services', async () => {
    const { registerClaudeConfigHandlers } = await import('../claudeConfig');
    registerClaudeConfigHandlers();

    const servers = [
      { id: 'alpha', enabled: true },
      { id: 'disabled', enabled: false },
    ];

    expect(await getHandler(IPC_CHANNELS.CLAUDE_MCP_READ)({})).toEqual({
      local: { command: 'npx' },
    });
    expect(await getHandler(IPC_CHANNELS.CLAUDE_MCP_SYNC)({}, undefined, servers)).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_MCP_UPSERT)({}, undefined, {
        id: 'alpha',
        enabled: true,
      })
    ).toBe(true);
    expect(await getHandler(IPC_CHANNELS.CLAUDE_MCP_DELETE)({}, undefined, 'alpha')).toBe(true);

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_READ)({})).toBe('# Local prompt');
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_WRITE)({}, undefined, '# next')).toBe(true);
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP)({})).toBe(
      '/tmp/local-claude.md.bak'
    );
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROJECT_TRUST_ENSURE)({}, '/repo/worktree')).toBe(
      true
    );

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_LIST)({})).toEqual([
      { id: 'local-plugin' },
    ]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_SET_ENABLED)({}, undefined, 'plugin-1', true)
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_AVAILABLE)({}, undefined, 'market')
    ).toEqual([{ name: 'available-plugin' }]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL)({}, undefined, 'plugin-name', 'market')
    ).toBe(true);
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL)({}, undefined, 'plugin-1')).toBe(
      true
    );

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_LIST)({})).toEqual([
      { name: 'local-market' },
    ]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_ADD)({}, undefined, 'owner/repo')
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REMOVE)({}, undefined, 'market')
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH)({}, undefined, 'market')
    ).toBe(true);

    expect(claudeConfigTestDoubles.readMcpServers).toHaveBeenCalledTimes(1);
    expect(claudeConfigTestDoubles.syncMcpServers).toHaveBeenCalledWith(servers);
    expect(claudeConfigTestDoubles.upsertMcpServer).toHaveBeenCalledWith({
      id: 'alpha',
      enabled: true,
    });
    expect(claudeConfigTestDoubles.deleteMcpServer).toHaveBeenCalledWith('alpha');
    expect(claudeConfigTestDoubles.readClaudeMd).toHaveBeenCalledTimes(1);
    expect(claudeConfigTestDoubles.writeClaudeMd).toHaveBeenCalledWith('# next');
    expect(claudeConfigTestDoubles.ensureClaudeWorkspaceTrusted).toHaveBeenCalledWith(
      '/repo/worktree'
    );
    expect(claudeConfigTestDoubles.getPlugins).toHaveBeenCalledTimes(1);
    expect(claudeConfigTestDoubles.setPluginEnabled).toHaveBeenCalledWith('plugin-1', true);
    expect(claudeConfigTestDoubles.getAvailablePlugins).toHaveBeenCalledWith('market');
    expect(claudeConfigTestDoubles.installPlugin).toHaveBeenCalledWith('plugin-name', 'market');
    expect(claudeConfigTestDoubles.uninstallPlugin).toHaveBeenCalledWith('plugin-1');
    expect(claudeConfigTestDoubles.addMarketplace).toHaveBeenCalledWith('owner/repo');
    expect(claudeConfigTestDoubles.removeMarketplace).toHaveBeenCalledWith('market');
    expect(claudeConfigTestDoubles.refreshMarketplaces).toHaveBeenCalledWith('market');
  });

  it('delegates remote Claude config handlers to remote services and transforms MCP payloads', async () => {
    claudeConfigTestDoubles.readRepositoryRemoteMcpServers
      .mockResolvedValueOnce({ remote: { command: 'npx remote' } })
      .mockResolvedValueOnce({ existing: { command: 'existing' } })
      .mockResolvedValueOnce({ existing: { command: 'existing' } });

    const { registerClaudeConfigHandlers } = await import('../claudeConfig');
    registerClaudeConfigHandlers();

    const syncServers = [
      { id: 'alpha', enabled: true },
      { id: 'disabled', enabled: false },
      { id: 'invalid', enabled: true },
    ];

    expect(await getHandler(IPC_CHANNELS.CLAUDE_MCP_READ)({}, '/__remote__/repo')).toEqual({
      remote: { command: 'npx remote' },
    });
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_MCP_SYNC)({}, '/__remote__/repo', syncServers)
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_MCP_UPSERT)({}, '/__remote__/repo', {
        id: 'alpha',
        enabled: true,
      })
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_MCP_UPSERT)({}, '/__remote__/repo', {
        id: 'existing',
        enabled: false,
      })
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_MCP_DELETE)({}, '/__remote__/repo', 'existing')
    ).toBe(true);

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_READ)({}, '/__remote__/repo')).toBe(
      '# Remote prompt'
    );
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_WRITE)({}, '/__remote__/repo', '# remote next')
    ).toBe(true);
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP)({}, '/__remote__/repo')).toBe(
      '/tmp/remote-claude.md.bak'
    );
    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROJECT_TRUST_ENSURE)({}, '/__remote__/repo')).toBe(
      false
    );

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_LIST)({}, '/__remote__/repo')).toEqual([
      { id: 'remote-plugin' },
    ]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_SET_ENABLED)(
        {},
        '/__remote__/repo',
        'plugin-1',
        false
      )
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_AVAILABLE)({}, '/__remote__/repo', 'market')
    ).toEqual([{ name: 'remote-available' }]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL)(
        {},
        '/__remote__/repo',
        'plugin-name',
        'market'
      )
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL)({}, '/__remote__/repo', 'plugin-1')
    ).toBe(true);

    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_LIST)({}, '/__remote__/repo')
    ).toEqual([{ name: 'remote-market' }]);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_ADD)(
        {},
        '/__remote__/repo',
        'owner/repo'
      )
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REMOVE)(
        {},
        '/__remote__/repo',
        'market'
      )
    ).toBe(true);
    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH)(
        {},
        '/__remote__/repo',
        'market'
      )
    ).toBe(true);

    expect(claudeConfigTestDoubles.serverToConfig).toHaveBeenCalledWith({
      id: 'alpha',
      enabled: true,
    });
    expect(claudeConfigTestDoubles.serverToConfig).toHaveBeenCalledWith({
      id: 'invalid',
      enabled: true,
    });
    expect(claudeConfigTestDoubles.writeRepositoryRemoteMcpServers).toHaveBeenNthCalledWith(
      1,
      '/__remote__/repo',
      { alpha: { command: 'run-alpha' } }
    );
    expect(claudeConfigTestDoubles.writeRepositoryRemoteMcpServers).toHaveBeenNthCalledWith(
      2,
      '/__remote__/repo',
      {
        existing: { command: 'existing' },
        alpha: { command: 'run-alpha' },
      }
    );
    expect(claudeConfigTestDoubles.writeRepositoryRemoteMcpServers).toHaveBeenNthCalledWith(
      3,
      '/__remote__/repo',
      {}
    );
    expect(claudeConfigTestDoubles.writeRepositoryRemoteMcpServers).toHaveBeenNthCalledWith(
      4,
      '/__remote__/repo',
      {}
    );
    expect(claudeConfigTestDoubles.writeRepositoryClaudePrompt).toHaveBeenCalledWith(
      '/__remote__/repo',
      '# remote next'
    );
    expect(claudeConfigTestDoubles.ensureClaudeWorkspaceTrusted).not.toHaveBeenCalled();
    expect(claudeConfigTestDoubles.setRepositoryRemotePluginEnabled).toHaveBeenCalledWith(
      '/__remote__/repo',
      'plugin-1',
      false
    );
    expect(claudeConfigTestDoubles.listRepositoryRemoteAvailablePlugins).toHaveBeenCalledWith(
      '/__remote__/repo',
      'market'
    );
    expect(claudeConfigTestDoubles.installRepositoryRemotePlugin).toHaveBeenCalledWith(
      '/__remote__/repo',
      'plugin-name',
      'market'
    );
    expect(claudeConfigTestDoubles.uninstallRepositoryRemotePlugin).toHaveBeenCalledWith(
      '/__remote__/repo',
      'plugin-1'
    );
    expect(claudeConfigTestDoubles.addRepositoryRemoteMarketplace).toHaveBeenCalledWith(
      '/__remote__/repo',
      'owner/repo'
    );
    expect(claudeConfigTestDoubles.removeRepositoryRemoteMarketplace).toHaveBeenCalledWith(
      '/__remote__/repo',
      'market'
    );
    expect(claudeConfigTestDoubles.refreshRepositoryRemoteMarketplaces).toHaveBeenCalledWith(
      '/__remote__/repo',
      'market'
    );
  });
});
