import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const claudeProviderTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const resolveRepositoryRuntimeContext = vi.fn((repoPath?: string) =>
    repoPath?.startsWith('/__remote__/') ? { kind: 'remote' } : { kind: 'local' }
  );

  const readClaudeSettings = vi.fn();
  const extractProviderFromSettings = vi.fn();
  const extractProviderFromClaudeSettings = vi.fn();
  const applyProvider = vi.fn();
  const applyProviderToClaudeSettings = vi.fn();
  const watchClaudeSettings = vi.fn();
  const unwatchClaudeSettings = vi.fn();
  const readCodexProviderSettings = vi.fn();
  const applyCodexProvider = vi.fn();
  const watchCodexProviderSettings = vi.fn();
  const unwatchCodexProviderSettings = vi.fn();
  const readGeminiProviderSettings = vi.fn();
  const applyGeminiProvider = vi.fn();
  const watchGeminiProviderSettings = vi.fn();
  const unwatchGeminiProviderSettings = vi.fn();

  const readRepositoryClaudeSettings = vi.fn();
  const writeRepositoryClaudeSettings = vi.fn();

  function reset() {
    handlers.clear();

    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockImplementation((repoPath?: string) =>
      repoPath?.startsWith('/__remote__/') ? { kind: 'remote' } : { kind: 'local' }
    );

    readClaudeSettings.mockReset();
    readClaudeSettings.mockReturnValue({ env: { provider: 'local-provider' } });
    extractProviderFromSettings.mockReset();
    extractProviderFromSettings.mockReturnValue({ provider: 'local-provider' });
    extractProviderFromClaudeSettings.mockReset();
    extractProviderFromClaudeSettings.mockReturnValue({ provider: 'remote-provider' });
    applyProvider.mockReset();
    applyProvider.mockResolvedValue(true);
    applyProviderToClaudeSettings.mockReset();
    applyProviderToClaudeSettings.mockReturnValue({ env: { provider: 'remote-provider' } });
    watchClaudeSettings.mockReset();
    unwatchClaudeSettings.mockReset();
    readCodexProviderSettings.mockReset();
    readCodexProviderSettings.mockResolvedValue({
      providerId: 'codex-cli',
      settings: { configToml: 'model_provider = "infilux_provider"' },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
      supported: true,
    });
    applyCodexProvider.mockReset();
    applyCodexProvider.mockResolvedValue(true);
    watchCodexProviderSettings.mockReset();
    unwatchCodexProviderSettings.mockReset();
    readGeminiProviderSettings.mockReset();
    readGeminiProviderSettings.mockResolvedValue({
      providerId: 'gemini-cli',
      settings: { envText: 'GEMINI_API_KEY="gemini-token"' },
      extracted: {
        providerId: 'gemini-cli',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authToken: 'gemini-token',
      },
      supported: true,
    });
    applyGeminiProvider.mockReset();
    applyGeminiProvider.mockResolvedValue(true);
    watchGeminiProviderSettings.mockReset();
    unwatchGeminiProviderSettings.mockReset();

    readRepositoryClaudeSettings.mockReset();
    readRepositoryClaudeSettings.mockResolvedValue({ env: { provider: 'remote-provider' } });
    writeRepositoryClaudeSettings.mockReset();
    writeRepositoryClaudeSettings.mockResolvedValue(true);
  }

  return {
    handlers,
    resolveRepositoryRuntimeContext,
    readClaudeSettings,
    extractProviderFromSettings,
    extractProviderFromClaudeSettings,
    applyProvider,
    applyProviderToClaudeSettings,
    watchClaudeSettings,
    unwatchClaudeSettings,
    readCodexProviderSettings,
    applyCodexProvider,
    watchCodexProviderSettings,
    unwatchCodexProviderSettings,
    readGeminiProviderSettings,
    applyGeminiProvider,
    watchGeminiProviderSettings,
    unwatchGeminiProviderSettings,
    readRepositoryClaudeSettings,
    writeRepositoryClaudeSettings,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      claudeProviderTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/claude/ClaudeProviderManager', () => ({
  applyProvider: claudeProviderTestDoubles.applyProvider,
  applyProviderToClaudeSettings: claudeProviderTestDoubles.applyProviderToClaudeSettings,
  extractProviderFromClaudeSettings: claudeProviderTestDoubles.extractProviderFromClaudeSettings,
  extractProviderFromSettings: claudeProviderTestDoubles.extractProviderFromSettings,
  readClaudeSettings: claudeProviderTestDoubles.readClaudeSettings,
  unwatchClaudeSettings: claudeProviderTestDoubles.unwatchClaudeSettings,
  watchClaudeSettings: claudeProviderTestDoubles.watchClaudeSettings,
}));

vi.mock('../../services/agentProvider/CodexProviderManager', () => ({
  applyCodexProvider: claudeProviderTestDoubles.applyCodexProvider,
  readCodexProviderSettings: claudeProviderTestDoubles.readCodexProviderSettings,
  unwatchCodexProviderSettings: claudeProviderTestDoubles.unwatchCodexProviderSettings,
  watchCodexProviderSettings: claudeProviderTestDoubles.watchCodexProviderSettings,
}));

vi.mock('../../services/agentProvider/GeminiProviderManager', () => ({
  applyGeminiProvider: claudeProviderTestDoubles.applyGeminiProvider,
  readGeminiProviderSettings: claudeProviderTestDoubles.readGeminiProviderSettings,
  unwatchGeminiProviderSettings: claudeProviderTestDoubles.unwatchGeminiProviderSettings,
  watchGeminiProviderSettings: claudeProviderTestDoubles.watchGeminiProviderSettings,
}));

vi.mock('../../services/remote/RemoteEnvironmentService', () => ({
  readRepositoryClaudeSettings: claudeProviderTestDoubles.readRepositoryClaudeSettings,
  writeRepositoryClaudeSettings: claudeProviderTestDoubles.writeRepositoryClaudeSettings,
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: claudeProviderTestDoubles.resolveRepositoryRuntimeContext,
}));

function getHandler(channel: string) {
  const handler = claudeProviderTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('Claude provider IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    claudeProviderTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers generic agent provider channels against the provider implementation', async () => {
    const { registerClaudeProviderHandlers } = await import('../claudeProvider');
    registerClaudeProviderHandlers();

    expect(
      await getHandler(IPC_CHANNELS.AGENT_PROVIDER_READ_SETTINGS)({}, undefined, 'claude-code')
    ).toEqual({
      settings: { env: { provider: 'local-provider' } },
      extracted: { provider: 'local-provider' },
    });

    expect(
      await getHandler(IPC_CHANNELS.AGENT_PROVIDER_APPLY)({}, undefined, {
        provider: 'openai',
      })
    ).toBe(true);

    expect(claudeProviderTestDoubles.applyProvider).toHaveBeenCalledWith({
      provider: 'openai',
    });
  });

  it('routes generic Codex provider channels through the Codex provider implementation', async () => {
    const { registerClaudeProviderHandlers } = await import('../claudeProvider');
    registerClaudeProviderHandlers();

    await expect(
      getHandler(IPC_CHANNELS.AGENT_PROVIDER_READ_SETTINGS)({}, '/repo', 'codex-cli')
    ).resolves.toEqual({
      providerId: 'codex-cli',
      settings: { configToml: 'model_provider = "infilux_provider"' },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
      supported: true,
    });

    await expect(
      getHandler(IPC_CHANNELS.AGENT_PROVIDER_APPLY)({}, '/repo', {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      })
    ).resolves.toBe(true);

    expect(claudeProviderTestDoubles.readCodexProviderSettings).toHaveBeenCalledWith('/repo');
    expect(claudeProviderTestDoubles.applyCodexProvider).toHaveBeenCalledWith('/repo', {
      providerId: 'codex-cli',
      baseUrl: 'https://api.openai.com/v1',
      authToken: 'codex-token',
    });
    expect(claudeProviderTestDoubles.applyProvider).not.toHaveBeenCalled();
  });

  it('routes generic Gemini provider channels through the Gemini provider implementation', async () => {
    const { registerClaudeProviderHandlers } = await import('../claudeProvider');
    registerClaudeProviderHandlers();

    await expect(
      getHandler(IPC_CHANNELS.AGENT_PROVIDER_READ_SETTINGS)({}, '/repo', 'gemini-cli')
    ).resolves.toEqual({
      providerId: 'gemini-cli',
      settings: { envText: 'GEMINI_API_KEY="gemini-token"' },
      extracted: {
        providerId: 'gemini-cli',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authToken: 'gemini-token',
      },
      supported: true,
    });

    await expect(
      getHandler(IPC_CHANNELS.AGENT_PROVIDER_APPLY)({}, '/repo', {
        providerId: 'gemini-cli',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authToken: 'gemini-token',
      })
    ).resolves.toBe(true);

    expect(claudeProviderTestDoubles.readGeminiProviderSettings).toHaveBeenCalledWith('/repo');
    expect(claudeProviderTestDoubles.applyGeminiProvider).toHaveBeenCalledWith('/repo', {
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'gemini-token',
    });
    expect(claudeProviderTestDoubles.applyProvider).not.toHaveBeenCalled();
  });

  it('reads and applies local Claude provider settings', async () => {
    const { registerClaudeProviderHandlers } = await import('../claudeProvider');
    registerClaudeProviderHandlers();

    expect(await getHandler(IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS)({})).toEqual({
      settings: { env: { provider: 'local-provider' } },
      extracted: { provider: 'local-provider' },
    });

    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PROVIDER_APPLY)({}, undefined, {
        provider: 'openai',
      })
    ).toBe(true);

    expect(claudeProviderTestDoubles.readClaudeSettings).toHaveBeenCalledTimes(1);
    expect(claudeProviderTestDoubles.extractProviderFromSettings).toHaveBeenCalledTimes(1);
    expect(claudeProviderTestDoubles.applyProvider).toHaveBeenCalledWith({
      provider: 'openai',
    });
    expect(claudeProviderTestDoubles.writeRepositoryClaudeSettings).not.toHaveBeenCalled();
  });

  it('reads and applies remote Claude provider settings', async () => {
    claudeProviderTestDoubles.readRepositoryClaudeSettings.mockResolvedValueOnce({
      env: { provider: 'remote-provider' },
    });
    claudeProviderTestDoubles.readRepositoryClaudeSettings.mockResolvedValueOnce(null);
    claudeProviderTestDoubles.applyProviderToClaudeSettings.mockReturnValue({
      env: { provider: 'remote-next' },
    });

    const { registerClaudeProviderHandlers } = await import('../claudeProvider');
    registerClaudeProviderHandlers();

    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS)({}, '/__remote__/repo')
    ).toEqual({
      settings: { env: { provider: 'remote-provider' } },
      extracted: { provider: 'remote-provider' },
    });

    expect(
      await getHandler(IPC_CHANNELS.CLAUDE_PROVIDER_APPLY)({}, '/__remote__/repo', {
        provider: 'anthropic',
      })
    ).toBe(true);

    expect(claudeProviderTestDoubles.readRepositoryClaudeSettings).toHaveBeenNthCalledWith(
      1,
      '/__remote__/repo'
    );
    expect(claudeProviderTestDoubles.readRepositoryClaudeSettings).toHaveBeenNthCalledWith(
      2,
      '/__remote__/repo'
    );
    expect(claudeProviderTestDoubles.extractProviderFromClaudeSettings).toHaveBeenCalledWith({
      env: { provider: 'remote-provider' },
    });
    expect(claudeProviderTestDoubles.applyProviderToClaudeSettings).toHaveBeenCalledWith(
      {},
      {
        provider: 'anthropic',
      }
    );
    expect(claudeProviderTestDoubles.writeRepositoryClaudeSettings).toHaveBeenCalledWith(
      '/__remote__/repo',
      { env: { provider: 'remote-next' } }
    );
    expect(claudeProviderTestDoubles.applyProvider).not.toHaveBeenCalled();
  });

  it('initializes and toggles the provider watcher based on window state', async () => {
    const { initClaudeProviderWatcher, toggleClaudeProviderWatcher } = await import(
      '../claudeProvider'
    );

    const aliveWindow = {
      isDestroyed: vi.fn(() => false),
    };
    const destroyedWindow = {
      isDestroyed: vi.fn(() => true),
    };

    initClaudeProviderWatcher(aliveWindow as never, true);
    expect(claudeProviderTestDoubles.watchClaudeSettings).toHaveBeenCalledWith(aliveWindow);
    expect(claudeProviderTestDoubles.watchCodexProviderSettings).toHaveBeenCalledWith(aliveWindow);
    expect(claudeProviderTestDoubles.watchGeminiProviderSettings).toHaveBeenCalledWith(aliveWindow);

    initClaudeProviderWatcher(destroyedWindow as never, false);
    toggleClaudeProviderWatcher(true);
    expect(claudeProviderTestDoubles.watchClaudeSettings).toHaveBeenCalledTimes(1);
    expect(claudeProviderTestDoubles.unwatchClaudeSettings).toHaveBeenCalledTimes(1);
    expect(claudeProviderTestDoubles.unwatchCodexProviderSettings).toHaveBeenCalledTimes(1);
    expect(claudeProviderTestDoubles.unwatchGeminiProviderSettings).toHaveBeenCalledTimes(1);

    toggleClaudeProviderWatcher(false);
    expect(claudeProviderTestDoubles.unwatchClaudeSettings).toHaveBeenCalledTimes(2);
    expect(claudeProviderTestDoubles.unwatchCodexProviderSettings).toHaveBeenCalledTimes(2);
    expect(claudeProviderTestDoubles.unwatchGeminiProviderSettings).toHaveBeenCalledTimes(2);

    initClaudeProviderWatcher(aliveWindow as never, false);
    toggleClaudeProviderWatcher(true);
    expect(claudeProviderTestDoubles.watchClaudeSettings).toHaveBeenCalledTimes(2);
    expect(claudeProviderTestDoubles.watchCodexProviderSettings).toHaveBeenCalledTimes(2);
    expect(claudeProviderTestDoubles.watchGeminiProviderSettings).toHaveBeenCalledTimes(2);
  });
});
