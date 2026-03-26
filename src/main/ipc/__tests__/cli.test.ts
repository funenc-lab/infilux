import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const cliTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const detectOne = vi.fn();
  const checkInstalled = vi.fn();
  const install = vi.fn();
  const uninstall = vi.fn();
  const remoteCall = vi.fn();
  const resolveRepositoryRuntimeContext = vi.fn((repoPath?: string) =>
    repoPath?.startsWith('/__remote__/')
      ? { kind: 'remote', connectionId: 'conn-1' }
      : { kind: 'local' }
  );

  function reset() {
    handlers.clear();

    detectOne.mockReset();
    detectOne.mockResolvedValue({ installed: true, path: '/usr/local/bin/claude' });
    checkInstalled.mockReset();
    checkInstalled.mockResolvedValue({ installed: true, path: '/usr/local/bin/claude' });
    install.mockReset();
    install.mockResolvedValue({ installed: true, path: '/usr/local/bin/claude' });
    uninstall.mockReset();
    uninstall.mockResolvedValue({ installed: false, path: null });
    remoteCall.mockReset();
    remoteCall.mockResolvedValue({ remote: true });
    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockImplementation((repoPath?: string) =>
      repoPath?.startsWith('/__remote__/')
        ? { kind: 'remote', connectionId: 'conn-1' }
        : { kind: 'local' }
    );
  }

  return {
    handlers,
    detectOne,
    checkInstalled,
    install,
    uninstall,
    remoteCall,
    resolveRepositoryRuntimeContext,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      cliTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/cli/CliDetector', () => ({
  cliDetector: {
    detectOne: cliTestDoubles.detectOne,
  },
}));

vi.mock('../../services/cli/CliInstaller', () => ({
  cliInstaller: {
    checkInstalled: cliTestDoubles.checkInstalled,
    install: cliTestDoubles.install,
    uninstall: cliTestDoubles.uninstall,
  },
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    call: cliTestDoubles.remoteCall,
  },
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: cliTestDoubles.resolveRepositoryRuntimeContext,
}));

function getHandler(channel: string) {
  const handler = cliTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('CLI IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cliTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles local CLI detection and installer actions', async () => {
    const { registerCliHandlers } = await import('../cli');
    registerCliHandlers();

    expect(
      await getHandler(IPC_CHANNELS.CLI_DETECT_ONE)(
        {},
        '/repo',
        'claude',
        {
          id: 'custom',
        },
        '/custom/bin/claude'
      )
    ).toEqual({
      installed: true,
      path: '/usr/local/bin/claude',
    });
    expect(await getHandler(IPC_CHANNELS.CLI_INSTALL_STATUS)({})).toEqual({
      installed: true,
      path: '/usr/local/bin/claude',
    });
    expect(await getHandler(IPC_CHANNELS.CLI_INSTALL)({})).toEqual({
      installed: true,
      path: '/usr/local/bin/claude',
    });
    expect(await getHandler(IPC_CHANNELS.CLI_UNINSTALL)({})).toEqual({
      installed: false,
      path: null,
    });

    expect(cliTestDoubles.detectOne).toHaveBeenCalledWith(
      'claude',
      { id: 'custom' },
      '/custom/bin/claude'
    );
    expect(cliTestDoubles.checkInstalled).toHaveBeenCalledTimes(1);
    expect(cliTestDoubles.install).toHaveBeenCalledTimes(1);
    expect(cliTestDoubles.uninstall).toHaveBeenCalledTimes(1);
    expect(cliTestDoubles.remoteCall).not.toHaveBeenCalled();
  });

  it('routes CLI detection to the remote connection manager for remote repositories', async () => {
    const { registerCliHandlers } = await import('../cli');
    registerCliHandlers();

    expect(
      await getHandler(IPC_CHANNELS.CLI_DETECT_ONE)(
        {},
        '/__remote__/repo',
        'claude',
        undefined,
        '/remote/bin/claude'
      )
    ).toEqual({
      remote: true,
    });

    expect(cliTestDoubles.remoteCall).toHaveBeenCalledWith('conn-1', 'cli:detectOne', {
      agentId: 'claude',
      customAgent: undefined,
      customPath: '/remote/bin/claude',
    });
    expect(cliTestDoubles.detectOne).not.toHaveBeenCalled();
  });
});
