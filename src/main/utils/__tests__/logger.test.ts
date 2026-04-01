import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerTestDoubles = vi.hoisted(() => {
  const readdir = vi.fn();
  const stat = vi.fn();
  const unlink = vi.fn();
  const open = vi.fn();
  const appGetPath = vi.fn();
  const logInfo = vi.fn();
  const logError = vi.fn();
  const initialize = vi.fn();
  const consoleWriteFn = vi.fn();

  const log = {
    info: logInfo,
    error: logError,
    initialize,
    functions: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    transports: {
      file: {
        resolvePathFn: undefined as undefined | (() => string),
        maxSize: 0,
        format: '',
        level: 'error',
        getFile: vi.fn(() => ({ path: '/tmp/logs/infilux-2026-03-25.log' })),
      },
      console: {
        format: '',
        level: 'error',
        writeFn: consoleWriteFn,
        __infiluxOriginalWriteFn: undefined as undefined | ((...args: unknown[]) => unknown),
      },
      ipc: {
        level: 'silly',
      },
    },
  };

  function reset() {
    readdir.mockReset();
    readdir.mockResolvedValue([]);
    stat.mockReset();
    stat.mockResolvedValue({ mtime: new Date() });
    unlink.mockReset();
    unlink.mockResolvedValue(undefined);
    open.mockReset();
    open.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({ size: 0 }),
      read: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    });
    appGetPath.mockReset();
    appGetPath.mockReturnValue('/tmp/logs');
    logInfo.mockReset();
    logError.mockReset();
    initialize.mockReset();
    log.functions.log.mockReset();
    log.functions.warn.mockReset();
    log.functions.error.mockReset();
    log.functions.info.mockReset();
    log.transports.file.resolvePathFn = undefined;
    log.transports.file.maxSize = 0;
    log.transports.file.format = '';
    log.transports.file.level = 'error';
    log.transports.file.getFile.mockReset();
    log.transports.file.getFile.mockReturnValue({ path: '/tmp/logs/infilux-2026-03-25.log' });
    log.transports.console.format = '';
    log.transports.console.level = 'error';
    consoleWriteFn.mockReset();
    log.transports.console.writeFn = consoleWriteFn;
    log.transports.console.__infiluxOriginalWriteFn = undefined;
    log.transports.ipc.level = 'silly';
  }

  return {
    readdir,
    stat,
    unlink,
    open,
    appGetPath,
    logInfo,
    logError,
    initialize,
    consoleWriteFn,
    log,
    reset,
  };
});

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: loggerTestDoubles.readdir,
    stat: loggerTestDoubles.stat,
    unlink: loggerTestDoubles.unlink,
    open: loggerTestDoubles.open,
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: loggerTestDoubles.appGetPath,
  },
}));

vi.mock('electron-log/main.js', () => ({
  default: loggerTestDoubles.log,
}));

describe('logger utilities', () => {
  const originalConsoleLogEnv = process.env.INFILUX_ENABLE_CONSOLE_LOG;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loggerTestDoubles.reset();
    delete process.env.INFILUX_ENABLE_CONSOLE_LOG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalConsoleLogEnv === 'string') {
      process.env.INFILUX_ENABLE_CONSOLE_LOG = originalConsoleLogEnv;
    } else {
      delete process.env.INFILUX_ENABLE_CONSOLE_LOG;
    }
  });

  it('initializes logger once, rotates daily files, and cleans old logs', async () => {
    const now = new Date('2026-03-25T08:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    loggerTestDoubles.readdir.mockResolvedValue([
      'infilux-old.log',
      'infilux-fresh.log',
      'other.log',
    ]);
    loggerTestDoubles.stat.mockImplementation(async (filePath: string) => ({
      mtime: filePath.endsWith('old.log')
        ? new Date('2025-01-01T00:00:00.000Z')
        : new Date('2026-03-24T00:00:00.000Z'),
    }));

    const { default: log, initLogger } = await import('../logger');
    initLogger(true, 'debug', 30);
    await vi.runAllTimersAsync();

    expect(log).toBe(loggerTestDoubles.log);
    expect(loggerTestDoubles.initialize).toHaveBeenCalledWith({ preload: true });
    expect(loggerTestDoubles.log.transports.file.maxSize).toBe(10 * 1024 * 1024);
    expect(loggerTestDoubles.log.transports.file.format).toContain('[{y}-{m}-{d}');
    expect(loggerTestDoubles.log.transports.console.format).toContain('[{h}:{i}:{s}.{ms}]');
    expect(loggerTestDoubles.log.transports.ipc.level).toBe(false);
    expect(loggerTestDoubles.log.transports.file.level).toBe('debug');
    expect(loggerTestDoubles.log.transports.console.level).toBe(false);
    expect(loggerTestDoubles.log.transports.file.resolvePathFn?.()).toBe(
      '/tmp/logs/infilux-2026-03-25.log'
    );
    expect(loggerTestDoubles.unlink).toHaveBeenCalledWith('/tmp/logs/infilux-old.log');
    expect(loggerTestDoubles.logInfo).toHaveBeenCalledWith(
      'Cleaned up old log file: infilux-old.log'
    );
    expect(loggerTestDoubles.unlink).not.toHaveBeenCalledWith('/tmp/logs/infilux-fresh.log');

    initLogger(false, 'info', 30);
    expect(loggerTestDoubles.initialize).toHaveBeenCalledTimes(1);
    expect(loggerTestDoubles.log.transports.file.level).toBe('error');
    expect(loggerTestDoubles.log.transports.console.level).toBe(false);

    initLogger(true, 'warn', 14);
    await vi.runAllTimersAsync();
    expect(loggerTestDoubles.readdir).toHaveBeenCalledTimes(2);
    expect(loggerTestDoubles.log.transports.file.level).toBe('warn');
    expect(loggerTestDoubles.log.transports.console.level).toBe(false);

    vi.useRealTimers();
  });

  it('enables console transport only when the opt-in environment variable is set', async () => {
    process.env.INFILUX_ENABLE_CONSOLE_LOG = '1';

    const { initLogger } = await import('../logger');
    initLogger(true, 'debug', 30);

    expect(loggerTestDoubles.log.transports.file.level).toBe('debug');
    expect(loggerTestDoubles.log.transports.console.level).toBe('debug');

    initLogger(false, 'info', 30);
    expect(loggerTestDoubles.log.transports.file.level).toBe('error');
    expect(loggerTestDoubles.log.transports.console.level).toBe('error');
  });

  it('logs cleanup failures without crashing initialization', async () => {
    vi.useFakeTimers();
    loggerTestDoubles.readdir.mockRejectedValueOnce(new Error('permission denied'));

    const { initLogger } = await import('../logger');
    initLogger();
    await vi.runAllTimersAsync();

    expect(loggerTestDoubles.logError).toHaveBeenCalledWith(
      'Failed to clean up old logs:',
      expect.any(Error)
    );

    vi.useRealTimers();
  });

  it('swallows console transport EIO failures during logger initialization', async () => {
    loggerTestDoubles.consoleWriteFn.mockImplementation(() => {
      const error = new Error('broken pipe') as NodeJS.ErrnoException;
      error.code = 'EIO';
      throw error;
    });

    const { initLogger } = await import('../logger');
    initLogger();

    const wrappedWrite = loggerTestDoubles.log.transports.console.writeFn as unknown as (
      message: unknown
    ) => void;

    expect(() => wrappedWrite('message')).not.toThrow();
    expect(loggerTestDoubles.consoleWriteFn).not.toHaveBeenCalled();
  });

  it('applies the safe console transport policy before initLogger runs', async () => {
    const { default: log } = await import('../logger');
    const wrappedWrite = log.transports.console.writeFn as unknown as (message: unknown) => void;

    wrappedWrite('message');
    expect(loggerTestDoubles.consoleWriteFn).not.toHaveBeenCalled();
  });

  it('keeps console transport writable when the opt-in environment variable is set', async () => {
    process.env.INFILUX_ENABLE_CONSOLE_LOG = '1';

    const { initLogger } = await import('../logger');
    initLogger();

    const wrappedWrite = loggerTestDoubles.log.transports.console.writeFn as unknown as (
      message: unknown
    ) => void;

    wrappedWrite('message');
    expect(loggerTestDoubles.consoleWriteFn).toHaveBeenCalledWith('message');
  });

  it('returns current log diagnostics from the active log file', async () => {
    const source = Buffer.from(
      'first line\nAuthorization: Bearer secret-token\npassword=hunter2\n',
      'utf8'
    );
    const read = vi.fn(
      async (buffer: Buffer, _offset: number, length: number, position: number) => {
        source.copy(buffer, 0, position, position + length);
        return { bytesRead: length, buffer };
      }
    );
    const close = vi.fn().mockResolvedValue(undefined);

    loggerTestDoubles.open.mockResolvedValueOnce({
      stat: vi.fn().mockResolvedValue({ size: source.length }),
      read,
      close,
    });

    const { getLogDiagnostics } = await import('../logger');
    const diagnostics = await getLogDiagnostics(2);

    expect(diagnostics.path).toBe('/tmp/logs/infilux-2026-03-25.log');
    expect(diagnostics.lines).toEqual(['Authorization: Bearer [REDACTED]', 'password=[REDACTED]']);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
