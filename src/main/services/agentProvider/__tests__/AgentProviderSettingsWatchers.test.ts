import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unwatchCodexProviderSettings, watchCodexProviderSettings } from '../CodexProviderManager';
import {
  unwatchGeminiProviderSettings,
  watchGeminiProviderSettings,
} from '../GeminiProviderManager';

type WatchListener = (eventType: string, filename: string | null) => void;

const watcherTestDoubles = vi.hoisted(() => {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const watcher = {
    close: vi.fn(),
    on: vi.fn(),
  };
  let watchListener: WatchListener | null = null;
  let mtimeMs = 1;

  function setFile(filePath: string, content: string) {
    files.set(filePath, content);
    mtimeMs += 1;
  }

  function reset() {
    files.clear();
    directories.clear();
    watcher.close.mockReset();
    watcher.on.mockReset();
    watchListener = null;
    mtimeMs = 1;
  }

  return {
    existsSync: vi.fn((target: string) => files.has(target) || directories.has(target)),
    mkdirSync: vi.fn((target: string) => {
      directories.add(target);
      return undefined;
    }),
    readFileSync: vi.fn((target: string) => {
      const content = files.get(target);
      if (content === undefined) {
        throw new Error(`Missing file: ${target}`);
      }
      return content;
    }),
    statSync: vi.fn((target: string) => {
      const content = files.get(target);
      if (content === undefined) {
        throw new Error(`Missing file: ${target}`);
      }
      return {
        mtimeMs,
        size: Buffer.byteLength(content),
      };
    }),
    watch: vi.fn((_target: string, listener: WatchListener) => {
      watchListener = listener;
      return watcher;
    }),
    writeFileSync: vi.fn((target: string, content: string) => {
      setFile(target, content);
    }),
    emitWatchedFileChange(filename: string) {
      watchListener?.('change', filename);
    },
    reset,
    setFile,
    watcher,
  };
});

vi.mock('node:fs', () => ({
  existsSync: watcherTestDoubles.existsSync,
  mkdirSync: watcherTestDoubles.mkdirSync,
  readFileSync: watcherTestDoubles.readFileSync,
  statSync: watcherTestDoubles.statSync,
  watch: watcherTestDoubles.watch,
  writeFileSync: watcherTestDoubles.writeFileSync,
}));

vi.mock('../../remote/RemoteEnvironmentService', () => ({
  getRepositoryEnvironmentContext: vi.fn(async () => ({ kind: 'local' })),
  readRepositoryRemoteTextFile: vi.fn(async () => null),
  writeRepositoryRemoteTextFile: vi.fn(async () => true),
}));

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  };
}

describe('agent provider settings watchers', () => {
  const originalCodexConfigDir = process.env.CODEX_CONFIG_DIR;
  const originalGeminiConfigDir = process.env.GEMINI_CONFIG_DIR;

  beforeEach(() => {
    vi.useFakeTimers();
    watcherTestDoubles.reset();
    process.env.CODEX_CONFIG_DIR = '/tmp/infilux-codex';
    process.env.GEMINI_CONFIG_DIR = '/tmp/infilux-gemini';
  });

  afterEach(() => {
    unwatchCodexProviderSettings();
    unwatchGeminiProviderSettings();
    vi.useRealTimers();
    vi.restoreAllMocks();
    watcherTestDoubles.reset();
    if (originalCodexConfigDir === undefined) {
      delete process.env.CODEX_CONFIG_DIR;
    } else {
      process.env.CODEX_CONFIG_DIR = originalCodexConfigDir;
    }
    if (originalGeminiConfigDir === undefined) {
      delete process.env.GEMINI_CONFIG_DIR;
    } else {
      process.env.GEMINI_CONFIG_DIR = originalGeminiConfigDir;
    }
  });

  it('notifies generic provider listeners when the local Codex config changes', () => {
    const window = createWindow();
    watcherTestDoubles.setFile(
      '/tmp/infilux-codex/config.toml',
      [
        'model_provider = "infilux_provider"',
        '',
        '[model_providers.infilux_provider]',
        'base_url = "https://old.example.com/v1"',
        'experimental_bearer_token = "old-token"',
      ].join('\n')
    );

    watchCodexProviderSettings(window as never);
    watcherTestDoubles.setFile(
      '/tmp/infilux-codex/config.toml',
      [
        'model = "gpt-5.2-codex"',
        'model_provider = "infilux_provider"',
        '',
        '[model_providers.infilux_provider]',
        'base_url = "https://next.example.com/v1"',
        'experimental_bearer_token = "next-token"',
      ].join('\n')
    );
    watcherTestDoubles.emitWatchedFileChange('config.toml');
    vi.advanceTimersByTime(400);

    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_PROVIDER_SETTINGS_CHANGED,
      {
        providerId: 'codex-cli',
        settings: {
          configPath: '/tmp/infilux-codex/config.toml',
          configToml: expect.stringContaining('https://next.example.com/v1'),
        },
        extracted: {
          providerId: 'codex-cli',
          baseUrl: 'https://next.example.com/v1',
          authToken: 'next-token',
          model: 'gpt-5.2-codex',
        },
        supported: true,
      }
    );

    unwatchCodexProviderSettings();
    expect(watcherTestDoubles.watcher.close).toHaveBeenCalledTimes(1);
  });

  it('notifies generic provider listeners when the local Gemini env changes', () => {
    const window = createWindow();
    watcherTestDoubles.setFile(
      '/tmp/infilux-gemini/.env',
      ['GOOGLE_GEMINI_BASE_URL="https://old.example.com"', 'GEMINI_API_KEY="old-token"'].join('\n')
    );

    watchGeminiProviderSettings(window as never);
    watcherTestDoubles.setFile(
      '/tmp/infilux-gemini/.env',
      [
        'GEMINI_MODEL="gemini-3-pro-preview"',
        'GOOGLE_GEMINI_BASE_URL="https://next.example.com"',
        'GEMINI_API_KEY="next-token"',
      ].join('\n')
    );
    watcherTestDoubles.emitWatchedFileChange('.env');
    vi.advanceTimersByTime(400);

    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_PROVIDER_SETTINGS_CHANGED,
      {
        providerId: 'gemini-cli',
        settings: {
          envPath: '/tmp/infilux-gemini/.env',
          envText: expect.stringContaining('https://next.example.com'),
        },
        extracted: {
          providerId: 'gemini-cli',
          baseUrl: 'https://next.example.com',
          authToken: 'next-token',
          model: 'gemini-3-pro-preview',
        },
        supported: true,
      }
    );

    unwatchGeminiProviderSettings();
    expect(watcherTestDoubles.watcher.close).toHaveBeenCalledTimes(1);
  });
});
