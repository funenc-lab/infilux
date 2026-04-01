import fsp from 'node:fs/promises';
import path from 'node:path';
import { LOG_FILE_PREFIX } from '@shared/paths';
import type { LogDiagnostics } from '@shared/types';
import { sanitizeDiagnosticsLines } from '@shared/utils/diagnostics';
import { app } from 'electron';
import log from 'electron-log/main.js';

// Guard to ensure initialization happens only once
let initialized = false;
let lastRetentionDays: number | undefined;
const CONSOLE_LOG_ENV = 'INFILUX_ENABLE_CONSOLE_LOG';

interface ConsoleTransportLike {
  (...args: unknown[]): unknown;
  format: string;
  level: unknown;
  writeFn?: (...args: unknown[]) => unknown;
  __infiluxOriginalWriteFn?: (...args: unknown[]) => unknown;
  __infiluxOriginalTransport?: (...args: unknown[]) => unknown;
}

type ConsoleTransportRuntime = typeof log.transports.console & ConsoleTransportLike;

interface ConsoleWriteStreamLike {
  write: (...args: unknown[]) => unknown;
  __infiluxOriginalWrite?: (...args: unknown[]) => unknown;
}

function isConsoleLoggingEnabled(): boolean {
  return process.env[CONSOLE_LOG_ENV] === '1';
}

function isElectronMainProcess(): boolean {
  return Boolean(process.versions.electron);
}

function isIgnorableConsoleWriteError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  return nodeError.code === 'EIO' || nodeError.code === 'ERR_STREAM_DESTROYED';
}

function createSafeConsoleTransportWrite(
  originalWrite: (...args: unknown[]) => unknown
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    try {
      return originalWrite(...args);
    } catch (error) {
      if (isIgnorableConsoleWriteError(error)) {
        return;
      }
      throw error;
    }
  };
}

function applyConsoleStreamWritePolicy(stream: ConsoleWriteStreamLike): void {
  const originalWrite = stream.__infiluxOriginalWrite ?? stream.write.bind(stream);
  stream.__infiluxOriginalWrite = originalWrite;
  stream.write = isConsoleLoggingEnabled()
    ? (...args: unknown[]) => {
        try {
          return originalWrite(...args);
        } catch (error) {
          if (isIgnorableConsoleWriteError(error)) {
            return true;
          }
          throw error;
        }
      }
    : () => true;
}

function applyConsoleTransportWritePolicy(): void {
  const consoleTransport = log.transports.console as ConsoleTransportRuntime;
  const originalTransport = consoleTransport.__infiluxOriginalTransport ?? consoleTransport;
  const originalWrite = consoleTransport.__infiluxOriginalWriteFn ?? consoleTransport.writeFn;
  const invokeOriginalTransport =
    typeof originalTransport === 'function' ? originalTransport : () => undefined;

  if (typeof originalWrite !== 'function') {
    return;
  }

  consoleTransport.__infiluxOriginalTransport = originalTransport;
  consoleTransport.__infiluxOriginalWriteFn = originalWrite;

  const nextTransport = Object.assign((...args: unknown[]) => {
    if (!isConsoleLoggingEnabled()) {
      return undefined;
    }

    try {
      return invokeOriginalTransport(...args);
    } catch (error) {
      if (isIgnorableConsoleWriteError(error)) {
        return undefined;
      }
      throw error;
    }
  }, consoleTransport) as ConsoleTransportRuntime;

  nextTransport.__infiluxOriginalTransport = originalTransport;
  nextTransport.__infiluxOriginalWriteFn = originalWrite;
  nextTransport.writeFn = isConsoleLoggingEnabled()
    ? createSafeConsoleTransportWrite(originalWrite)
    : () => undefined;

  log.transports.console = nextTransport;
}

if (isElectronMainProcess()) {
  applyConsoleStreamWritePolicy(process.stdout as ConsoleWriteStreamLike);
  applyConsoleStreamWritePolicy(process.stderr as ConsoleWriteStreamLike);
}
applyConsoleTransportWritePolicy();

function getCurrentLogFilePath(): string {
  const fileTransport = log.transports.file as {
    getFile?: () => { path?: string } | undefined;
  };
  const activePath = fileTransport.getFile?.()?.path;
  if (activePath) {
    return activePath;
  }

  return path.join(app.getPath('logs'), 'app.log');
}

/**
 * Clean up old log files (async, non-blocking)
 * Removes log files older than the specified number of days
 */
async function cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
  try {
    const logDir = app.getPath('logs');
    const files = await fsp.readdir(logDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    for (const file of files) {
      // Only process managed log files (including .old.log from size rotation)
      if (file.startsWith(LOG_FILE_PREFIX) && file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = await fsp.stat(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          await fsp.unlink(filePath);
          log.info(`Cleaned up old log file: ${file}`);
        }
      }
    }
  } catch (error) {
    // Silently fail - don't break app if log cleanup fails
    log.error('Failed to clean up old logs:', error);
  }
}

async function readTailLines(filePath: string, lineCount: number): Promise<string[]> {
  const chunkSize = 8 * 1024;
  const handle = await fsp.open(filePath, 'r');

  try {
    const stat = await handle.stat();
    if (stat.size === 0) {
      return [];
    }

    let position = stat.size;
    let collected = '';

    while (position > 0) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;

      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, position);
      collected = buffer.toString('utf8') + collected;

      const lines = collected.split('\n').filter((line) => line.trim());
      if (lines.length >= lineCount) {
        return lines.slice(-lineCount);
      }
    }

    return collected.split('\n').filter((line) => line.trim());
  } finally {
    await handle.close();
  }
}

/**
 * Initialize logger with configuration
 * @param enabled - Whether logging is enabled (defaults to false, only errors logged)
 * @param level - Log level to use when enabled
 * @param retentionDays - Number of days to keep log files (optional, only used on first init)
 */
export function initLogger(
  enabled: boolean = false,
  level: 'error' | 'warn' | 'info' | 'debug' = 'info',
  retentionDays?: number
): void {
  const nextRetentionDays = retentionDays ?? lastRetentionDays ?? 7;

  // One-time initialization: setup log file path, format, and hijack console
  if (!initialized) {
    // Set log file path with daily rotation (YYYY-MM-DD format)
    log.transports.file.resolvePathFn = () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const fileName = `${LOG_FILE_PREFIX}${year}-${month}-${day}.log`;
      return path.join(app.getPath('logs'), fileName);
    };

    // Configure log file rotation (backup mechanism if daily log exceeds 10MB)
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

    // Configure log format
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
    // Keep main-process logs local to file/terminal output.
    // Forwarding them into renderer devtools via IPC is noisy during window teardown
    // and can emit disposed-frame errors after the renderer has already gone away.
    log.transports.ipc.level = false;
    applyConsoleTransportWritePolicy();

    // Initialize and hijack console methods - all console.log/warn/error become log
    log.initialize({ preload: true });
    Object.assign(console, log.functions);

    // Clean up old log files asynchronously (non-blocking)
    // Use void to explicitly ignore the promise (fire-and-forget)
    void cleanupOldLogs(nextRetentionDays);
    lastRetentionDays = nextRetentionDays;

    initialized = true;
  } else if (lastRetentionDays !== nextRetentionDays) {
    void cleanupOldLogs(nextRetentionDays);
    lastRetentionDays = nextRetentionDays;
  }

  // Configure log levels based on settings (can be called multiple times)
  const consoleLoggingEnabled = isConsoleLoggingEnabled();
  applyConsoleTransportWritePolicy();
  if (enabled) {
    log.transports.file.level = level;
    log.transports.console.level = consoleLoggingEnabled ? level : false;
  } else {
    // When disabled, only log errors
    log.transports.file.level = 'error';
    log.transports.console.level = consoleLoggingEnabled ? 'error' : false;
  }
}

export async function getLogDiagnostics(lineCount: number = 100): Promise<LogDiagnostics> {
  const filePath = getCurrentLogFilePath();
  if (!filePath) {
    return { path: '', lines: [] };
  }

  try {
    const lines = sanitizeDiagnosticsLines(
      await readTailLines(filePath, Math.max(1, Math.floor(lineCount)))
    );
    return {
      path: filePath,
      lines,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      log.error('Failed to read log diagnostics:', error);
    }

    return {
      path: filePath,
      lines: [],
    };
  }
}

export default log;
