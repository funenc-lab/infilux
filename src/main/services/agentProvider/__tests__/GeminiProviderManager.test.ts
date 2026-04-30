import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProviderProfile } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyGeminiProvider,
  applyProviderToGeminiEnv,
  extractProviderFromGeminiEnv,
  readGeminiProviderSettings,
} from '../GeminiProviderManager';

const geminiProviderManagerTestDoubles = vi.hoisted(() => {
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
  getRepositoryEnvironmentContext: geminiProviderManagerTestDoubles.getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile: geminiProviderManagerTestDoubles.readRepositoryRemoteTextFile,
  writeRepositoryRemoteTextFile: geminiProviderManagerTestDoubles.writeRepositoryRemoteTextFile,
}));

const geminiProvider: AgentProviderProfile = {
  id: 'gemini-provider',
  name: 'Gemini Gateway',
  providerId: 'gemini-cli',
  baseUrl: 'https://gateway.example.com',
  authToken: 'gemini-token',
  model: 'gemini-3-pro-preview',
};

describe('GeminiProviderManager', () => {
  let configDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    geminiProviderManagerTestDoubles.reset();
    originalConfigDir = process.env.GEMINI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'infilux-gemini-provider-'));
    process.env.GEMINI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.GEMINI_CONFIG_DIR;
    } else {
      process.env.GEMINI_CONFIG_DIR = originalConfigDir;
    }
    rmSync(configDir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it('extracts the active Gemini provider profile from .env content', () => {
    const content = [
      'GEMINI_MODEL="gemini-3-pro-preview"',
      'GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"',
      'GEMINI_API_KEY="gemini-token"',
    ].join('\n');

    expect(extractProviderFromGeminiEnv(content)).toEqual({
      providerId: 'gemini-cli',
      baseUrl: 'https://gateway.example.com',
      authToken: 'gemini-token',
      model: 'gemini-3-pro-preview',
    });
  });

  it('falls back to GOOGLE_API_KEY when the Gemini API key is not present', () => {
    const content = [
      'GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com',
      'GOOGLE_API_KEY=google-token',
    ].join('\n');

    expect(extractProviderFromGeminiEnv(content)).toEqual({
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'google-token',
    });
  });

  it('uses the official Gemini API endpoint when only an API key is configured', () => {
    expect(extractProviderFromGeminiEnv('GEMINI_API_KEY=gemini-token')).toEqual({
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'gemini-token',
    });
  });

  it('applies a Gemini provider without dropping unrelated environment entries', () => {
    const existingEnv = [
      'SHELL=/bin/zsh',
      'GEMINI_API_KEY=old-token',
      'GOOGLE_GEMINI_BASE_URL=https://old.example.com',
      '',
      '# Infilux managed Agent Provider',
      'GEMINI_API_KEY=stale-token',
      'GEMINI_MODEL=gemini-old',
      '# End Infilux managed Agent Provider',
      '',
      'UNRELATED=value',
    ].join('\n');

    const nextEnv = applyProviderToGeminiEnv(existingEnv, geminiProvider);

    expect(nextEnv).toContain('SHELL=/bin/zsh');
    expect(nextEnv).toContain('UNRELATED=value');
    expect(nextEnv).not.toContain('old-token');
    expect(nextEnv).not.toContain('stale-token');
    expect(nextEnv).toContain('GEMINI_API_KEY="gemini-token"');
    expect(nextEnv).toContain('GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"');
    expect(nextEnv).toContain('GEMINI_MODEL="gemini-3-pro-preview"');
  });

  it('reads and writes the local Gemini .env through the configured Gemini config directory', async () => {
    writeFileSync(
      join(configDir, '.env'),
      [
        'GEMINI_MODEL="gemini-3-pro-preview"',
        'GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"',
        'GEMINI_API_KEY="gemini-token"',
      ].join('\n')
    );

    await expect(readGeminiProviderSettings('/repo')).resolves.toEqual({
      providerId: 'gemini-cli',
      settings: {
        envPath: join(configDir, '.env'),
        envText: expect.stringContaining('GEMINI_API_KEY="gemini-token"'),
      },
      extracted: {
        providerId: 'gemini-cli',
        baseUrl: 'https://gateway.example.com',
        authToken: 'gemini-token',
        model: 'gemini-3-pro-preview',
      },
      supported: true,
    });

    await expect(applyGeminiProvider('/repo', geminiProvider)).resolves.toBe(true);

    const nextEnv = readFileSync(join(configDir, '.env'), 'utf8');
    expect(nextEnv).toContain('GEMINI_API_KEY="gemini-token"');
    expect(nextEnv).toContain('GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"');
  });

  it('reads and writes remote Gemini .env through repository environment helpers', async () => {
    geminiProviderManagerTestDoubles.getRepositoryEnvironmentContext.mockResolvedValue({
      kind: 'remote',
      homeDir: '/home/dev',
    });
    geminiProviderManagerTestDoubles.readRepositoryRemoteTextFile.mockResolvedValue(
      ['GOOGLE_GEMINI_BASE_URL="https://remote.example.com"', 'GEMINI_API_KEY="remote-token"'].join(
        '\n'
      )
    );

    await expect(readGeminiProviderSettings('/__remote__/repo')).resolves.toEqual({
      providerId: 'gemini-cli',
      settings: {
        envPath: '/home/dev/.gemini/.env',
        envText: expect.stringContaining('https://remote.example.com'),
      },
      extracted: {
        providerId: 'gemini-cli',
        baseUrl: 'https://remote.example.com',
        authToken: 'remote-token',
      },
      supported: true,
    });

    await expect(applyGeminiProvider('/__remote__/repo', geminiProvider)).resolves.toBe(true);

    expect(geminiProviderManagerTestDoubles.readRepositoryRemoteTextFile).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/home/dev/.gemini/.env'
    );
    expect(geminiProviderManagerTestDoubles.writeRepositoryRemoteTextFile).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/home/dev/.gemini/.env',
      expect.stringContaining('GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"')
    );
  });

  it('rejects non-Gemini provider writes before touching repository config', async () => {
    await expect(
      applyGeminiProvider('/repo', {
        ...geminiProvider,
        providerId: 'claude-code',
      })
    ).resolves.toBe(false);

    expect(geminiProviderManagerTestDoubles.getRepositoryEnvironmentContext).not.toHaveBeenCalled();
  });
});
