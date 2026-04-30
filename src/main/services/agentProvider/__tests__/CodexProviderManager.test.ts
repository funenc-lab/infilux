import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProviderProfile } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCodexProvider,
  applyProviderToCodexConfig,
  extractProviderFromCodexConfig,
  readCodexProviderSettings,
} from '../CodexProviderManager';

const codexProviderManagerTestDoubles = vi.hoisted(() => {
  const getRepositoryEnvironmentContext = vi.fn();
  const readRepositoryRemoteTextFile = vi.fn();
  const writeRepositoryRemoteTextFile = vi.fn();

  function reset() {
    getRepositoryEnvironmentContext.mockReset();
    getRepositoryEnvironmentContext.mockResolvedValue({ kind: 'local' });
    readRepositoryRemoteTextFile.mockReset();
    readRepositoryRemoteTextFile.mockResolvedValue(null);
    writeRepositoryRemoteTextFile.mockReset();
    writeRepositoryRemoteTextFile.mockResolvedValue(true);
  }

  return {
    getRepositoryEnvironmentContext,
    readRepositoryRemoteTextFile,
    reset,
    writeRepositoryRemoteTextFile,
  };
});

vi.mock('../../remote/RemoteEnvironmentService', () => ({
  getRepositoryEnvironmentContext: codexProviderManagerTestDoubles.getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile: codexProviderManagerTestDoubles.readRepositoryRemoteTextFile,
  writeRepositoryRemoteTextFile: codexProviderManagerTestDoubles.writeRepositoryRemoteTextFile,
}));

const codexProvider: AgentProviderProfile = {
  id: 'codex-provider',
  name: 'Codex Gateway',
  providerId: 'codex-cli',
  baseUrl: 'https://gateway.example.com/v1',
  authToken: 'codex-token',
  model: 'gpt-5.2-codex',
};

describe('CodexProviderManager', () => {
  let configDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    codexProviderManagerTestDoubles.reset();
    originalConfigDir = process.env.CODEX_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'infilux-codex-provider-'));
    process.env.CODEX_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.CODEX_CONFIG_DIR;
    } else {
      process.env.CODEX_CONFIG_DIR = originalConfigDir;
    }
    rmSync(configDir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it('extracts the active Codex provider profile from config.toml', () => {
    const content = [
      'model = "gpt-5.2-codex"',
      'model_provider = "infilux_provider"',
      '',
      '[model_providers.infilux_provider]',
      'name = "Infilux Provider"',
      'base_url = "https://gateway.example.com/v1"',
      'env_key = "OPENAI_API_KEY"',
      'experimental_bearer_token = "codex-token"',
      'wire_api = "responses"',
    ].join('\n');

    expect(extractProviderFromCodexConfig(content)).toEqual({
      providerId: 'codex-cli',
      baseUrl: 'https://gateway.example.com/v1',
      authToken: 'codex-token',
      model: 'gpt-5.2-codex',
    });
  });

  it('falls back to the configured env key when the Codex provider omits an inline token', () => {
    const content = [
      'model_provider = "custom"',
      '',
      '[model_providers.custom]',
      'base_url = "https://api.openai.com/v1"',
      'env_key = "CUSTOM_OPENAI_KEY"',
    ].join('\n');

    expect(
      extractProviderFromCodexConfig(content, {
        CUSTOM_OPENAI_KEY: 'env-token',
      })
    ).toEqual({
      providerId: 'codex-cli',
      baseUrl: 'https://api.openai.com/v1',
      authToken: 'env-token',
    });
  });

  it('applies a Codex provider without dropping unrelated config sections', () => {
    const existingConfig = [
      'approval_policy = "on-request"',
      'model = "gpt-5.2"',
      'model_provider = "old_provider"',
      '',
      '[model_providers.old_provider]',
      'name = "Old Provider"',
      'base_url = "https://old.example.com/v1"',
      '',
      '[model_providers.infilux_provider]',
      'name = "Stale Managed Provider"',
      'base_url = "https://stale.example.com/v1"',
      'experimental_bearer_token = "stale-token"',
      '',
      '[mcp_servers.demo]',
      'command = "uvx"',
      'args = ["demo"]',
    ].join('\n');

    const nextConfig = applyProviderToCodexConfig(existingConfig, codexProvider);

    expect(nextConfig).toContain('approval_policy = "on-request"');
    expect(nextConfig).toContain('[mcp_servers.demo]');
    expect(nextConfig).toContain('command = "uvx"');
    expect(nextConfig).not.toContain('model_provider = "old_provider"');
    expect(nextConfig).toContain('[model_providers.old_provider]');
    expect(nextConfig).toContain('base_url = "https://old.example.com/v1"');
    expect(nextConfig).not.toContain('https://stale.example.com/v1');
    expect(nextConfig).toContain('model = "gpt-5.2-codex"');
    expect(nextConfig).toContain('model_provider = "infilux_provider"');
    expect(nextConfig).toContain('[model_providers.infilux_provider]');
    expect(nextConfig).toContain('name = "Codex Gateway"');
    expect(nextConfig).toContain('base_url = "https://gateway.example.com/v1"');
    expect(nextConfig).toContain('env_key = "INFILUX_CODEX_API_KEY"');
    expect(nextConfig).toContain('experimental_bearer_token = "codex-token"');
    expect(nextConfig).toContain('wire_api = "responses"');
  });

  it('reads and writes the local Codex config through the configured Codex config directory', async () => {
    writeFileSync(
      join(configDir, 'config.toml'),
      [
        'model = "gpt-5.2-codex"',
        'model_provider = "infilux_provider"',
        '',
        '[model_providers.infilux_provider]',
        'base_url = "https://gateway.example.com/v1"',
        'experimental_bearer_token = "codex-token"',
      ].join('\n')
    );

    await expect(readCodexProviderSettings('/repo')).resolves.toEqual({
      providerId: 'codex-cli',
      settings: {
        configPath: join(configDir, 'config.toml'),
        configToml: expect.stringContaining('model_provider = "infilux_provider"'),
      },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://gateway.example.com/v1',
        authToken: 'codex-token',
        model: 'gpt-5.2-codex',
      },
      supported: true,
    });

    await expect(applyCodexProvider('/repo', codexProvider)).resolves.toBe(true);

    const nextConfig = readFileSync(join(configDir, 'config.toml'), 'utf8');
    expect(nextConfig).toContain('model_provider = "infilux_provider"');
    expect(nextConfig).toContain('base_url = "https://gateway.example.com/v1"');
    expect(nextConfig).toContain('experimental_bearer_token = "codex-token"');
  });

  it('reads and writes remote Codex config through repository environment helpers', async () => {
    codexProviderManagerTestDoubles.getRepositoryEnvironmentContext.mockResolvedValue({
      kind: 'remote',
      homeDir: '/home/dev',
    });
    codexProviderManagerTestDoubles.readRepositoryRemoteTextFile.mockResolvedValue(
      [
        'model_provider = "infilux_provider"',
        '',
        '[model_providers.infilux_provider]',
        'base_url = "https://remote.example.com/v1"',
        'experimental_bearer_token = "remote-token"',
      ].join('\n')
    );

    await expect(readCodexProviderSettings('/__remote__/repo')).resolves.toEqual({
      providerId: 'codex-cli',
      settings: {
        configPath: '/home/dev/.codex/config.toml',
        configToml: expect.stringContaining('https://remote.example.com/v1'),
      },
      extracted: {
        providerId: 'codex-cli',
        baseUrl: 'https://remote.example.com/v1',
        authToken: 'remote-token',
      },
      supported: true,
    });

    await expect(applyCodexProvider('/__remote__/repo', codexProvider)).resolves.toBe(true);

    expect(codexProviderManagerTestDoubles.readRepositoryRemoteTextFile).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/home/dev/.codex/config.toml'
    );
    expect(codexProviderManagerTestDoubles.writeRepositoryRemoteTextFile).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/home/dev/.codex/config.toml',
      expect.stringContaining('base_url = "https://gateway.example.com/v1"')
    );
  });

  it('rejects non-Codex provider writes before touching repository config', async () => {
    await expect(
      applyCodexProvider('/repo', {
        ...codexProvider,
        providerId: 'claude-code',
      })
    ).resolves.toBe(false);

    expect(codexProviderManagerTestDoubles.getRepositoryEnvironmentContext).not.toHaveBeenCalled();
  });
});
