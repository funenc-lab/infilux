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
  buildClaudeCodeProviderPreview,
  createAgentProviderProfileRegistryFacade,
  createClaudeCodeProviderProfileAdapter,
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

  it('builds Claude Code previews without leaking unrelated settings fields', () => {
    const settings: ClaudeSettings = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_AUTH_TOKEN: 'secret-token',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet',
        EXTRA_FIELD: 'ignored',
      },
      hooks: { Stop: [] },
    };

    expect(buildClaudeCodeProviderPreview(settings)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_AUTH_TOKEN: 'secret-token',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
      },
    });
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

    expect(codexAdapter.supportsProfiles).toBe(false);
    expect(codexAdapter.supportsSession({ agentId: 'codex', agentCommand: 'codex' })).toBe(false);
    await expect(codexAdapter.readCurrent('/repo')).resolves.toEqual({
      providerId: 'codex-cli',
      settings: null,
      extracted: null,
      supported: false,
    });
    await expect(codexAdapter.apply('/repo', codexProfile)).resolves.toBe(false);
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
    expect(geminiHarness.adapter.readCurrent).not.toHaveBeenCalled();
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
      supportsProfiles: false,
      snapshot: {
        settings: null,
        extracted: null,
        supported: false,
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
    expect(geminiHarness.adapter.subscribeToExternalChanges).not.toHaveBeenCalled();

    cleanup();

    expect(claudeHarness.cleanup).toHaveBeenCalledTimes(1);
    expect(codexHarness.cleanup).toHaveBeenCalledTimes(1);
    expect(geminiHarness.cleanup).not.toHaveBeenCalled();
  });
});
