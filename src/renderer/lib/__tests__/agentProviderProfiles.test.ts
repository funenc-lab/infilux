import type { ClaudeProvider, ClaudeSettings } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentProviderProfileSnapshot,
  buildClaudeCodeProviderPreview,
  createClaudeCodeProviderProfileAdapter,
} from '../agentProviderProfiles';

const provider: ClaudeProvider = {
  id: 'provider-1',
  name: 'Primary',
  baseUrl: 'https://api.example.com',
  authToken: 'secret-token',
  defaultSonnetModel: 'claude-sonnet',
  defaultOpusModel: 'claude-opus',
  defaultHaikuModel: 'claude-haiku',
};

type ClaudeProviderSnapshot = AgentProviderProfileSnapshot<ClaudeProvider, ClaudeSettings>;

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
      settings: { env: { ANTHROPIC_BASE_URL: provider.baseUrl } },
      extracted: { baseUrl: provider.baseUrl, authToken: provider.authToken },
    });
    await expect(adapter.apply('/repo', provider)).resolves.toBe(true);
    adapter.subscribeToExternalChanges('/repo', callback);
    adapter.markSwitch(provider);

    expect(adapter.id).toBe('claude-code');
    expect(adapter.queryKey('/repo')).toEqual(['agent-provider-settings', 'claude-code', '/repo']);
    expect(readSettings).toHaveBeenCalledWith('/repo');
    expect(apply).toHaveBeenCalledWith('/repo', provider);
    expect(onSettingsChanged).toHaveBeenCalledWith(callback);
    const settingsChangedCallback = settingsChangedCallbacks[0];
    if (!settingsChangedCallback) {
      throw new Error('Expected settings change callback to be registered');
    }
    settingsChangedCallback(externalSnapshot);
    expect(callback).toHaveBeenCalledWith(externalSnapshot);
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
});
