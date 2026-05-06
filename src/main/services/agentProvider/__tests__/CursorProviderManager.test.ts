import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractProviderFromCursorConfig,
  readCursorProviderSettings,
} from '../CursorProviderManager';

const cursorProviderManagerTestDoubles = vi.hoisted(() => {
  const getRepositoryEnvironmentContext = vi.fn();
  const readRepositoryRemoteTextFile = vi.fn();

  function reset() {
    getRepositoryEnvironmentContext.mockReset();
    getRepositoryEnvironmentContext.mockResolvedValue({ kind: 'local' });
    readRepositoryRemoteTextFile.mockReset();
    readRepositoryRemoteTextFile.mockResolvedValue(null);
  }

  return {
    getRepositoryEnvironmentContext,
    readRepositoryRemoteTextFile,
    reset,
  };
});

vi.mock('../../remote/RemoteEnvironmentService', () => ({
  getRepositoryEnvironmentContext: cursorProviderManagerTestDoubles.getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile: cursorProviderManagerTestDoubles.readRepositoryRemoteTextFile,
}));

describe('CursorProviderManager', () => {
  let configDir: string;
  let originalConfigDir: string | undefined;
  let originalCursorApiKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    cursorProviderManagerTestDoubles.reset();
    originalConfigDir = process.env.CURSOR_CONFIG_DIR;
    originalCursorApiKey = process.env.CURSOR_API_KEY;
    configDir = mkdtempSync(join(tmpdir(), 'infilux-cursor-provider-'));
    process.env.CURSOR_CONFIG_DIR = configDir;
    process.env.CURSOR_API_KEY = 'cursor-token';
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.CURSOR_CONFIG_DIR;
    } else {
      process.env.CURSOR_CONFIG_DIR = originalConfigDir;
    }
    if (originalCursorApiKey === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = originalCursorApiKey;
    }
    rmSync(configDir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it('extracts the detected Cursor CLI config from cli-config.json', () => {
    expect(
      extractProviderFromCursorConfig(
        JSON.stringify({
          model: 'gpt-5.2',
          permissions: {
            bash: 'ask',
          },
        }),
        {
          CURSOR_API_KEY: 'cursor-token',
        }
      )
    ).toEqual({
      providerId: 'cursor-cli',
      authToken: 'cursor-token',
      model: 'gpt-5.2',
    });
  });

  it('extracts object-shaped Cursor model config', () => {
    expect(
      extractProviderFromCursorConfig(
        JSON.stringify({
          model: {
            id: 'sonnet-4.5',
            source: 'manual',
          },
        }),
        {
          CURSOR_API_KEY: 'cursor-token',
        }
      )
    ).toEqual({
      providerId: 'cursor-cli',
      authToken: 'cursor-token',
      model: 'sonnet-4.5',
    });
  });

  it('reads the local Cursor config through the configured Cursor config directory', async () => {
    writeFileSync(
      join(configDir, 'cli-config.json'),
      JSON.stringify({
        model: 'sonnet-4.5',
        permissions: {
          edit: 'allow',
        },
      })
    );

    await expect(readCursorProviderSettings('/repo')).resolves.toEqual({
      providerId: 'cursor-cli',
      settings: {
        configPath: join(configDir, 'cli-config.json'),
        configJson: expect.stringContaining('"sonnet-4.5"'),
      },
      extracted: {
        providerId: 'cursor-cli',
        authToken: 'cursor-token',
        model: 'sonnet-4.5',
      },
      detected: true,
      supported: true,
    });
  });

  it('reads remote Cursor config through repository environment helpers', async () => {
    cursorProviderManagerTestDoubles.getRepositoryEnvironmentContext.mockResolvedValue({
      kind: 'remote',
      homeDir: '/home/dev',
    });
    cursorProviderManagerTestDoubles.readRepositoryRemoteTextFile.mockResolvedValue(
      JSON.stringify({
        model: 'auto',
      })
    );

    await expect(readCursorProviderSettings('/__remote__/repo')).resolves.toEqual({
      providerId: 'cursor-cli',
      settings: {
        configPath: '/home/dev/.cursor/cli-config.json',
        configJson: expect.stringContaining('"auto"'),
      },
      extracted: {
        providerId: 'cursor-cli',
        authToken: 'cursor-token',
        model: 'auto',
      },
      detected: true,
      supported: true,
    });

    expect(cursorProviderManagerTestDoubles.readRepositoryRemoteTextFile).toHaveBeenCalledWith(
      '/__remote__/repo',
      '/home/dev/.cursor/cli-config.json'
    );
  });
});
