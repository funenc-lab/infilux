import {
  type AgentProviderProfile,
  AI_PROVIDERS,
  type AIProvider,
  type ClaudeSettings,
} from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentProviderProfileAdapter,
  type AgentProviderProfileSnapshot,
  agentProviderProfileRegistry,
  createAgentProviderProfileRegistryFacade,
  createClaudeCodeProviderProfileAdapter,
  createCodexCliProviderProfileAdapter,
  createGeminiCliProviderProfileAdapter,
  getAgentProviderProfileAdapter,
} from '../agentProviderProfiles';

const provider: AgentProviderProfile = {
  id: 'provider-1',
  name: 'Primary',
  providerId: 'claude-code',
  baseUrl: 'https://api.example.com',
  authToken: 'secret-token',
  defaultSonnetModel: 'claude-sonnet',
  defaultOpusModel: 'claude-opus',
  defaultHaikuModel: 'claude-haiku',
};

type ClaudeProviderSnapshot = AgentProviderProfileSnapshot<AgentProviderProfile, ClaudeSettings>;
type TestProviderSnapshot = AgentProviderProfileSnapshot<AgentProviderProfile, unknown>;

interface TestAdapterHarness {
  adapter: AgentProviderProfileAdapter<AgentProviderProfile, unknown>;
  cleanup: ReturnType<typeof vi.fn>;
  emit: (snapshot: TestProviderSnapshot) => void;
}

function createTestAdapterHarness(options: {
  providerId: AIProvider;
  supportsProfiles: boolean;
  snapshot: TestProviderSnapshot;
}): TestAdapterHarness {
  const cleanup = vi.fn();
  let subscribedCallback: ((snapshot: TestProviderSnapshot) => void) | null = null;

  return {
    cleanup,
    emit: (snapshot) => {
      subscribedCallback?.(snapshot);
    },
    adapter: {
      id: options.providerId,
      providerId: options.providerId,
      label: options.providerId,
      supportsProfiles: options.supportsProfiles,
      queryKey: (repoPath?: string) =>
        ['test-agent-provider', options.providerId, repoPath] as const,
      readCurrent: vi.fn(async () => options.snapshot),
      subscribeToExternalChanges: vi.fn((_repoPath, callback) => {
        subscribedCallback = callback;
        return cleanup;
      }),
      apply: vi.fn(async () => true),
      isActiveProfile: vi.fn((candidate, current) => candidate.baseUrl === current?.baseUrl),
      supportsSession: vi.fn(() => options.supportsProfiles),
      markSwitch: vi.fn(),
      consumeSwitch: vi.fn(() => false),
      clearSwitch: vi.fn(),
      buildPreview: vi.fn((settings) => ({ providerId: options.providerId, settings })),
    },
  };
}

describe('agent provider profiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adapts Claude Code provider IO behind the generic adapter contract', async () => {
    const readSnapshot: ClaudeProviderSnapshot = {
      settings: { env: { ANTHROPIC_BASE_URL: provider.baseUrl } },
      extracted: { baseUrl: provider.baseUrl, authToken: provider.authToken },
    };
    const readSettings = vi.fn(async (): Promise<ClaudeProviderSnapshot> => readSnapshot);
    const apply = vi.fn(async (): Promise<boolean> => true);
    const settingsChangedCallbacks: Array<(snapshot: ClaudeProviderSnapshot) => void> = [];
    const onSettingsChanged = vi.fn((callback: (snapshot: ClaudeProviderSnapshot) => void) => {
      settingsChangedCallbacks.push(callback);
      return () => undefined;
    });
    const adapter = createClaudeCodeProviderProfileAdapter({
      readSettings,
      apply,
      onSettingsChanged,
    });
    const callback = vi.fn();
    const externalSnapshot: ClaudeProviderSnapshot = {
      settings: { env: { ANTHROPIC_BASE_URL: 'https://external.example.com' } },
      extracted: { baseUrl: 'https://external.example.com', authToken: 'external-token' },
    };

    await expect(adapter.readCurrent('/repo')).resolves.toEqual({
      providerId: 'claude-code',
      settings: { env: { ANTHROPIC_BASE_URL: provider.baseUrl } },
      extracted: {
        providerId: 'claude-code',
        baseUrl: provider.baseUrl,
        authToken: provider.authToken,
      },
      supported: true,
    });
    await expect(adapter.apply('/repo', provider)).resolves.toBe(true);
    adapter.subscribeToExternalChanges('/repo', callback);
    adapter.markSwitch(provider);

    expect(adapter.id).toBe('claude-code');
    expect(adapter.queryKey('/repo')).toEqual(['agent-provider-settings', 'claude-code', '/repo']);
    expect(readSettings).toHaveBeenCalledWith('/repo');
    expect(apply).toHaveBeenCalledWith('/repo', provider);
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);
    const settingsChangedCallback = settingsChangedCallbacks[0];
    if (!settingsChangedCallback) {
      throw new Error('Expected settings change callback to be registered');
    }
    settingsChangedCallback(externalSnapshot);
    expect(callback).toHaveBeenCalledWith({
      providerId: 'claude-code',
      settings: { env: { ANTHROPIC_BASE_URL: 'https://external.example.com' } },
      extracted: {
        providerId: 'claude-code',
        baseUrl: 'https://external.example.com',
        authToken: 'external-token',
      },
      supported: true,
    });
    expect(adapter.supportsSession(undefined)).toBe(true);
    expect(adapter.supportsSession({ agentId: 'claude', agentCommand: 'claude' })).toBe(true);
    expect(adapter.supportsSession({ agentId: 'claude-hapi', agentCommand: 'claude' })).toBe(true);
    expect(adapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(false);
    expect(adapter.consumeSwitch(provider)).toBe(true);
  });

  it('ignores non-Claude generic settings events in the Claude Code adapter', () => {
    const settingsChangedCallbacks: Array<(snapshot: ClaudeProviderSnapshot) => void> = [];
    const adapter = createClaudeCodeProviderProfileAdapter({
      readSettings: vi.fn(async () => ({
        settings: null,
        extracted: null,
      })),
      apply: vi.fn(async () => true),
      onSettingsChanged: vi.fn((callback: (snapshot: ClaudeProviderSnapshot) => void) => {
        settingsChangedCallbacks.push(callback);
        return () => undefined;
      }),
    });
    const callback = vi.fn();

    adapter.subscribeToExternalChanges('/repo', callback);
    const settingsChangedCallback = settingsChangedCallbacks[0];
    if (!settingsChangedCallback) {
      throw new Error('Expected settings change callback to be registered');
    }
    settingsChangedCallback({
      providerId: 'codex-cli',
      settings: null,
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
      supported: true,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('builds Claude Code previews without leaking secrets or unrelated settings fields', () => {
    const settings: ClaudeSettings = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_AUTH_TOKEN: '[redacted]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet',
        EXTRA_FIELD: 'ignored',
      },
      hooks: { Stop: [] },
    };

    expect(getAgentProviderProfileAdapter('claude-code').buildPreview(settings)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_AUTH_TOKEN: '[redacted]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
      },
    });
  });

  it('adapts Codex CLI provider IO behind the generic adapter contract', async () => {
    const readSnapshot: TestProviderSnapshot = {
      providerId: 'codex-cli',
      settings: { configToml: 'model_provider = "infilux_provider"' },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
      supported: true,
    };
    const readSettings = vi.fn(async (): Promise<TestProviderSnapshot> => readSnapshot);
    const apply = vi.fn(async (): Promise<boolean> => true);
    const settingsChangedCallbacks: Array<(snapshot: TestProviderSnapshot) => void> = [];
    const onSettingsChanged = vi.fn((callback: (snapshot: TestProviderSnapshot) => void) => {
      settingsChangedCallbacks.push(callback);
      return () => undefined;
    });
    const codexProfile: AgentProviderProfile = {
      id: 'codex-provider',
      name: 'Codex Provider',
      providerId: 'codex-cli',
      baseUrl: 'https://api.openai.com/v1',
      authToken: 'codex-token',
    };
    const adapter = createCodexCliProviderProfileAdapter({
      readSettings,
      apply,
      onSettingsChanged,
    });
    const callback = vi.fn();

    await expect(adapter.readCurrent('/repo')).resolves.toEqual(readSnapshot);
    await expect(adapter.apply('/repo', codexProfile)).resolves.toBe(true);
    adapter.subscribeToExternalChanges('/repo', callback);

    expect(adapter.id).toBe('codex-cli');
    expect(adapter.supportsProfiles).toBe(true);
    expect(adapter.queryKey('/repo')).toEqual(['agent-provider-settings', 'codex-cli', '/repo']);
    expect(adapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(true);
    expect(adapter.supportsSession({ agentId: 'claude', agentCommand: 'claude' })).toBe(false);
    expect(adapter.isActiveProfile(codexProfile, readSnapshot.extracted)).toBe(true);
    expect(readSettings).toHaveBeenCalledWith('/repo', 'codex-cli');
    expect(apply).toHaveBeenCalledWith('/repo', codexProfile);
    const settingsChangedCallback = settingsChangedCallbacks[0];
    if (!settingsChangedCallback) {
      throw new Error('Expected settings change callback to be registered');
    }
    settingsChangedCallback(readSnapshot);
    expect(callback).toHaveBeenCalledWith(readSnapshot);
  });

  it('adapts Gemini CLI provider IO behind the generic adapter contract', async () => {
    const readSnapshot: TestProviderSnapshot = {
      providerId: 'gemini-cli',
      settings: { envText: 'GEMINI_API_KEY="gemini-token"' },
      extracted: {
        providerId: 'gemini-cli',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authToken: 'gemini-token',
      },
      supported: true,
    };
    const readSettings = vi.fn(async (): Promise<TestProviderSnapshot> => readSnapshot);
    const apply = vi.fn(async (): Promise<boolean> => true);
    const settingsChangedCallbacks: Array<(snapshot: TestProviderSnapshot) => void> = [];
    const onSettingsChanged = vi.fn((callback: (snapshot: TestProviderSnapshot) => void) => {
      settingsChangedCallbacks.push(callback);
      return () => undefined;
    });
    const geminiProfile: AgentProviderProfile = {
      id: 'gemini-provider',
      name: 'Gemini Provider',
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'gemini-token',
    };
    const adapter = createGeminiCliProviderProfileAdapter({
      readSettings,
      apply,
      onSettingsChanged,
    });
    const callback = vi.fn();

    await expect(adapter.readCurrent('/repo')).resolves.toEqual(readSnapshot);
    await expect(adapter.apply('/repo', geminiProfile)).resolves.toBe(true);
    adapter.subscribeToExternalChanges('/repo', callback);

    expect(adapter.id).toBe('gemini-cli');
    expect(adapter.supportsProfiles).toBe(true);
    expect(adapter.queryKey('/repo')).toEqual(['agent-provider-settings', 'gemini-cli', '/repo']);
    expect(adapter.supportsSession({ agentId: 'gemini', agentCommand: 'gemini' })).toBe(true);
    expect(adapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(false);
    expect(adapter.isActiveProfile(geminiProfile, readSnapshot.extracted)).toBe(true);
    expect(readSettings).toHaveBeenCalledWith('/repo', 'gemini-cli');
    expect(apply).toHaveBeenCalledWith('/repo', geminiProfile);
    const settingsChangedCallback = settingsChangedCallbacks[0];
    if (!settingsChangedCallback) {
      throw new Error('Expected settings change callback to be registered');
    }
    settingsChangedCallback(readSnapshot);
    expect(callback).toHaveBeenCalledWith(readSnapshot);
  });

  it('registers every catalog provider behind an explicit adapter contract', async () => {
    expect(agentProviderProfileRegistry.map((adapter) => adapter.providerId)).toEqual([
      ...AI_PROVIDERS,
    ]);

    const claudeAdapter = getAgentProviderProfileAdapter('claude-code');
    expect(claudeAdapter.id).toBe('claude-code');
    expect(claudeAdapter.supportsProfiles).toBe(true);
    expect(claudeAdapter.supportsSession(undefined)).toBe(true);
    expect(claudeAdapter.supportsSession({ agentId: 'claude', agentCommand: 'claude' })).toBe(true);

    const codexProfile: AgentProviderProfile = {
      id: 'codex-provider',
      name: 'Codex Provider',
      providerId: 'codex-cli',
      baseUrl: 'https://api.openai.com/v1',
      authToken: 'token',
    };
    const codexAdapter = getAgentProviderProfileAdapter('codex-cli');

    expect(codexAdapter.supportsProfiles).toBe(true);
    expect(codexAdapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(true);
    expect(codexAdapter.supportsSession({ agentId: 'gemini', agentCommand: 'gemini' })).toBe(false);
    expect(codexAdapter.isActiveProfile(codexProfile, codexProfile)).toBe(true);

    const geminiProfile: AgentProviderProfile = {
      id: 'gemini-provider',
      name: 'Gemini Provider',
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'token',
    };
    const geminiAdapter = getAgentProviderProfileAdapter('gemini-cli');

    expect(geminiAdapter.supportsProfiles).toBe(true);
    expect(geminiAdapter.supportsSession({ agentId: 'gemini', agentCommand: 'gemini' })).toBe(true);
    expect(geminiAdapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(false);
    expect(geminiAdapter.isActiveProfile(geminiProfile, geminiProfile)).toBe(true);
  });

  it('uses the registry facade to detect the current config across supported provider adapters', async () => {
    const claudeHarness = createTestAdapterHarness({
      providerId: 'claude-code',
      supportsProfiles: true,
      snapshot: {
        settings: { env: {} },
        extracted: null,
      },
    });
    const codexHarness = createTestAdapterHarness({
      providerId: 'codex-cli',
      supportsProfiles: true,
      snapshot: {
        settings: { provider: 'codex' },
        extracted: {
          baseUrl: 'https://api.openai.com/v1',
          authToken: 'codex-token',
        },
      },
    });
    const geminiHarness = createTestAdapterHarness({
      providerId: 'gemini-cli',
      supportsProfiles: true,
      snapshot: {
        settings: { provider: 'gemini' },
        extracted: {
          baseUrl: 'https://generativelanguage.googleapis.com',
          authToken: 'gemini-token',
        },
      },
    });
    const facade = createAgentProviderProfileRegistryFacade([
      claudeHarness.adapter,
      codexHarness.adapter,
      geminiHarness.adapter,
    ]);

    await expect(facade.readCurrent('/repo')).resolves.toEqual({
      providerId: 'codex-cli',
      supported: true,
      settings: { provider: 'codex' },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
    });

    expect(facade.queryKey('/repo')).toEqual(['agent-provider-settings', 'registry', '/repo']);
    expect(facade.queryKey('/repo', 'codex-cli')).toEqual([
      'test-agent-provider',
      'codex-cli',
      '/repo',
    ]);
    expect(claudeHarness.adapter.readCurrent).toHaveBeenCalledWith('/repo');
    expect(codexHarness.adapter.readCurrent).toHaveBeenCalledWith('/repo');
    expect(geminiHarness.adapter.readCurrent).toHaveBeenCalledWith('/repo');
  });

  it('lists every supported provider config instead of collapsing detection to the first hit', async () => {
    const claudeHarness = createTestAdapterHarness({
      providerId: 'claude-code',
      supportsProfiles: true,
      snapshot: {
        settings: { provider: 'claude' },
        extracted: {
          baseUrl: 'https://api.anthropic.com',
          authToken: 'claude-token',
        },
      },
    });
    const codexHarness = createTestAdapterHarness({
      providerId: 'codex-cli',
      supportsProfiles: true,
      snapshot: {
        settings: { provider: 'codex' },
        extracted: {
          baseUrl: 'https://api.openai.com/v1',
          authToken: 'codex-token',
        },
      },
    });
    const cursorHarness = createTestAdapterHarness({
      providerId: 'cursor-cli',
      supportsProfiles: false,
      snapshot: {
        settings: null,
        extracted: null,
        supported: false,
      },
    });
    const facade = createAgentProviderProfileRegistryFacade([
      claudeHarness.adapter,
      codexHarness.adapter,
      cursorHarness.adapter,
    ]);

    await expect(facade.readAllCurrent('/repo')).resolves.toEqual([
      {
        providerId: 'claude-code',
        supported: true,
        settings: { provider: 'claude' },
        extracted: {
          providerId: 'claude-code',
          baseUrl: 'https://api.anthropic.com',
          authToken: 'claude-token',
        },
      },
      {
        providerId: 'codex-cli',
        supported: true,
        settings: { provider: 'codex' },
        extracted: {
          providerId: 'codex-cli',
          baseUrl: 'https://api.openai.com/v1',
          authToken: 'codex-token',
        },
      },
    ]);
    expect(cursorHarness.adapter.readCurrent).not.toHaveBeenCalled();
  });

  it('redacts generic provider preview secrets', () => {
    const codexAdapter = getAgentProviderProfileAdapter('codex-cli');
    const geminiAdapter = getAgentProviderProfileAdapter('gemini-cli');

    expect(
      codexAdapter.buildPreview({
        configToml: [
          'model_provider = "infilux_provider"',
          'experimental_bearer_token = "codex-token"',
        ].join('\n'),
      })
    ).toEqual({
      configToml: [
        'model_provider = "infilux_provider"',
        'experimental_bearer_token = "[redacted]"',
      ].join('\n'),
    });
    expect(
      geminiAdapter.buildPreview({
        envText: [
          'GEMINI_API_KEY="gemini-token"',
          'GOOGLE_GEMINI_BASE_URL="https://api.example.com"',
        ].join('\n'),
      })
    ).toEqual({
      envText: [
        'GEMINI_API_KEY="[redacted]"',
        'GOOGLE_GEMINI_BASE_URL="https://api.example.com"',
      ].join('\n'),
    });
  });

  it('normalizes registry change events and only subscribes supported provider adapters', () => {
    const claudeHarness = createTestAdapterHarness({
      providerId: 'claude-code',
      supportsProfiles: true,
      snapshot: {
        settings: null,
        extracted: null,
      },
    });
    const codexHarness = createTestAdapterHarness({
      providerId: 'codex-cli',
      supportsProfiles: true,
      snapshot: {
        settings: null,
        extracted: null,
      },
    });
    const geminiHarness = createTestAdapterHarness({
      providerId: 'gemini-cli',
      supportsProfiles: true,
      snapshot: {
        settings: null,
        extracted: null,
      },
    });
    const callback = vi.fn();
    const facade = createAgentProviderProfileRegistryFacade([
      claudeHarness.adapter,
      codexHarness.adapter,
      geminiHarness.adapter,
    ]);

    const cleanup = facade.subscribeToExternalChanges('/repo', callback);
    codexHarness.emit({
      settings: { provider: 'codex' },
      extracted: {
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
    });

    expect(callback).toHaveBeenCalledWith({
      providerId: 'codex-cli',
      supported: true,
      settings: { provider: 'codex' },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://api.openai.com/v1',
        authToken: 'codex-token',
      },
    });
    expect(claudeHarness.adapter.subscribeToExternalChanges).toHaveBeenCalledWith(
      '/repo',
      expect.any(Function)
    );
    expect(codexHarness.adapter.subscribeToExternalChanges).toHaveBeenCalledWith(
      '/repo',
      expect.any(Function)
    );
    expect(geminiHarness.adapter.subscribeToExternalChanges).toHaveBeenCalledWith(
      '/repo',
      expect.any(Function)
    );

    cleanup();

    expect(claudeHarness.cleanup).toHaveBeenCalledTimes(1);
    expect(codexHarness.cleanup).toHaveBeenCalledTimes(1);
    expect(geminiHarness.cleanup).toHaveBeenCalledTimes(1);
  });
});
