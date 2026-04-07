import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggingTestDoubles = vi.hoisted(() => {
  const recordAgentStartup = vi.fn<(_: string) => Promise<void>>();
  const log = {
    transports: {
      ipc: {
        level: 'error' as 'error' | 'warn' | 'info' | 'debug',
      },
    },
  };

  function reset() {
    log.transports.ipc.level = 'error';
    recordAgentStartup.mockReset();
    recordAgentStartup.mockResolvedValue(undefined);
  }

  return {
    recordAgentStartup,
    log,
    reset,
  };
});

vi.mock('electron-log/renderer.js', () => ({
  default: loggingTestDoubles.log,
}));

async function loadLoggingModule() {
  return import('../logging');
}

describe('renderer logging utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loggingTestDoubles.reset();
    vi.stubGlobal('window', {
      electronAPI: {
        log: {
          recordAgentStartup: loggingTestDoubles.recordAgentStartup,
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updates the renderer IPC transport level from the logging settings', async () => {
    const { updateRendererLogging } = await loadLoggingModule();

    updateRendererLogging(true, 'debug');
    expect(loggingTestDoubles.log.transports.ipc.level).toBe('debug');

    updateRendererLogging(false, 'info');
    expect(loggingTestDoubles.log.transports.ipc.level).toBe('error');
  });

  it('records agent startup timeline messages through the preload bridge', async () => {
    const { recordAgentStartup } = await loadLoggingModule();

    recordAgentStartup('[agent-startup][renderer][pty-1] first-output');

    expect(loggingTestDoubles.recordAgentStartup).toHaveBeenCalledWith(
      '[agent-startup][renderer][pty-1] first-output'
    );
  });

  it('skips empty agent startup timeline messages', async () => {
    const { recordAgentStartup } = await loadLoggingModule();

    recordAgentStartup('   ');

    expect(loggingTestDoubles.recordAgentStartup).not.toHaveBeenCalled();
  });

  it('warns when recording the agent startup timeline fails', async () => {
    const { recordAgentStartup } = await loadLoggingModule();
    const error = new Error('bridge failed');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loggingTestDoubles.recordAgentStartup.mockRejectedValueOnce(error);

    recordAgentStartup('[agent-startup][renderer][pty-2] first-output');
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleWarn).toHaveBeenCalledWith(
      '[logging] Failed to record agent startup timeline',
      error
    );
  });
});
