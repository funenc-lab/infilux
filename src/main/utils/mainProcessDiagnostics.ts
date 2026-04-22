import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDiagnosticsDirectoryName, sanitizeDiagnosticsText } from '@shared/utils/diagnostics';
import { app } from 'electron';
import log, { getLogDiagnostics } from './logger';

type DiagnosticsLogLevel = 'error' | 'warn' | 'info';

type DiagnosticsCollector = () => unknown | Promise<unknown>;

interface ActiveResourceSnapshot {
  total: number;
  byType: Record<string, number>;
}

interface OpenFileDescriptorSnapshot {
  total: number | null;
  byType: Record<string, number>;
  command: string;
  timeoutMs: number;
  error?: string;
  errorCode?: string | null;
}

export interface MainProcessDiagnosticsSnapshot {
  capturedAt: number;
  pid: number;
  platform: NodeJS.Platform;
  uptimeSec: number;
  memoryUsage: {
    rssBytes: number;
    heapTotalBytes: number;
    heapUsedBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
  };
  activeResources: ActiveResourceSnapshot;
  openFileDescriptors: OpenFileDescriptorSnapshot | null;
  sources: Record<string, unknown>;
}

interface RequestMainProcessDiagnosticsCaptureOptions {
  event: string;
  context: Record<string, unknown>;
  error?: unknown;
  level?: DiagnosticsLogLevel;
  throttleKey?: string;
  cooldownMs?: number;
  fdTimeoutMs?: number;
  persistence?: 'auto' | 'always' | 'never';
}

interface ThrottleState {
  lastCapturedAt: number;
  suppressedCount: number;
}

interface SerializedError {
  name: string;
  message: string;
  code: string | null;
  stack?: string;
}

const DEFAULT_COOLDOWN_MS = 15_000;
const DEFAULT_FD_TIMEOUT_MS = 1_500;
const AUTO_DIAGNOSTICS_DIRNAME = 'auto-diagnostics';
const AUTO_PERSIST_FD_TOTAL_THRESHOLD = 4096;
const AUTO_PERSIST_KQUEUE_THRESHOLD = 2048;
const AUTO_PERSIST_ERROR_CODES = new Set(['EBADF', 'EMFILE', 'ENFILE', 'ENOTTY']);
const collectors = new Map<string, DiagnosticsCollector>();
const throttleStates = new Map<string, ThrottleState>();
let diagnosticsSequence = 0;

function getLogMethod(level: DiagnosticsLogLevel): typeof log.error {
  if (level === 'warn') {
    return log.warn.bind(log);
  }
  if (level === 'info') {
    return log.info.bind(log);
  }
  return log.error.bind(log);
}

function buildActiveResourceSnapshot(): ActiveResourceSnapshot {
  const resourceNames =
    typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo() : [];
  const byType: Record<string, number> = {};

  for (const resourceName of resourceNames) {
    byType[resourceName] = (byType[resourceName] ?? 0) + 1;
  }

  return {
    total: resourceNames.length,
    byType,
  };
}

function serializeError(error: unknown): SerializedError | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    return {
      name: error.name,
      message: error.message,
      code: typeof nodeError.code === 'string' ? nodeError.code : null,
      stack: error.stack,
    };
  }

  return {
    name: 'Error',
    message: String(error),
    code: null,
  };
}

function toErrorCode(error: unknown): string | null {
  return serializeError(error)?.code ?? null;
}

function execFileAsync(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const commandError = error as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
          };
          commandError.stdout = stdout;
          commandError.stderr = stderr;
          reject(commandError);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

async function captureOpenFileDescriptorSnapshot(
  pid: number,
  timeoutMs: number
): Promise<OpenFileDescriptorSnapshot | null> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return null;
  }

  const command = 'lsof';
  const args = ['-n', '-P', '-F', 'ft', '-p', String(pid)];

  try {
    const { stdout } = await execFileAsync(command, args, timeoutMs);
    const byType: Record<string, number> = {};
    let total = 0;

    for (const line of stdout.split(/\r?\n/)) {
      if (!line) {
        continue;
      }

      const prefix = line[0];
      if (prefix === 'f') {
        total += 1;
        continue;
      }

      if (prefix === 't') {
        const descriptorType = line.slice(1) || 'unknown';
        byType[descriptorType] = (byType[descriptorType] ?? 0) + 1;
      }
    }

    return {
      total,
      byType,
      command,
      timeoutMs,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    return {
      total: null,
      byType: {},
      command,
      timeoutMs,
      error: error instanceof Error ? error.message : String(error),
      errorCode: typeof nodeError.code === 'string' ? nodeError.code : null,
    };
  }
}

async function captureCollectorSnapshots(): Promise<Record<string, unknown>> {
  const entries = Array.from(collectors.entries());
  const settled = await Promise.allSettled(
    entries.map(async ([name, collector]) => {
      const value = await collector();
      return [name, value] as const;
    })
  );

  const sources: Record<string, unknown> = {};

  for (const [index, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      const [name, value] = result.value;
      sources[name] = value;
      continue;
    }

    const reason = serializeError(result.reason);
    const [name] = entries[index] ?? [`collector:${index}`];
    sources[name] = {
      error: reason?.message ?? String(result.reason),
      errorCode: reason?.code ?? null,
    };
  }

  return sources;
}

function buildOpenFileDescriptorSummary(
  openFileDescriptors: OpenFileDescriptorSnapshot | null
): Record<string, unknown> {
  if (!openFileDescriptors) {
    return {
      total: null,
      kqueueCount: null,
      errorCode: null,
    };
  }

  return {
    total: openFileDescriptors.total,
    kqueueCount: openFileDescriptors.byType.KQUEUE ?? 0,
    errorCode: openFileDescriptors.errorCode ?? null,
  };
}

function shouldPersistDiagnosticsSnapshot(
  snapshot: MainProcessDiagnosticsSnapshot,
  error: unknown,
  persistence: 'auto' | 'always' | 'never'
): boolean {
  if (persistence === 'always') {
    return true;
  }

  if (persistence === 'never') {
    return false;
  }

  const errorCode = toErrorCode(error);
  if (errorCode && AUTO_PERSIST_ERROR_CODES.has(errorCode)) {
    return true;
  }

  const openFileDescriptors = snapshot.openFileDescriptors;
  if (!openFileDescriptors) {
    return false;
  }

  if (
    typeof openFileDescriptors.total === 'number' &&
    openFileDescriptors.total >= AUTO_PERSIST_FD_TOTAL_THRESHOLD
  ) {
    return true;
  }

  return (openFileDescriptors.byType.KQUEUE ?? 0) >= AUTO_PERSIST_KQUEUE_THRESHOLD;
}

async function persistDiagnosticsSnapshot(options: {
  diagnosticsId: string;
  event: string;
  context: Record<string, unknown>;
  error: unknown;
  snapshot: MainProcessDiagnosticsSnapshot;
}): Promise<string> {
  const outputDir = join(
    app.getPath('logs'),
    AUTO_DIAGNOSTICS_DIRNAME,
    `${formatDiagnosticsDirectoryName(new Date(options.snapshot.capturedAt))}-${options.diagnosticsId}`
  );
  await mkdir(outputDir, { recursive: true });

  const logDiagnostics = await getLogDiagnostics(160);
  const manifest = {
    diagnosticsId: options.diagnosticsId,
    event: options.event,
    generatedAt: new Date(options.snapshot.capturedAt).toISOString(),
    pid: options.snapshot.pid,
    platform: options.snapshot.platform,
    openFileDescriptors: buildOpenFileDescriptorSummary(options.snapshot.openFileDescriptors),
    logPath: logDiagnostics.path,
    files: ['manifest.json', 'snapshot.json', 'log-tail.txt'],
  };

  await Promise.all([
    writeFile(
      join(outputDir, 'manifest.json'),
      `${sanitizeDiagnosticsText(JSON.stringify(manifest, null, 2))}\n`,
      'utf8'
    ),
    writeFile(
      join(outputDir, 'snapshot.json'),
      `${sanitizeDiagnosticsText(
        JSON.stringify(
          {
            diagnosticsId: options.diagnosticsId,
            event: options.event,
            context: options.context,
            error: serializeError(options.error),
            snapshot: options.snapshot,
          },
          null,
          2
        )
      )}\n`,
      'utf8'
    ),
    writeFile(
      join(outputDir, 'log-tail.txt'),
      sanitizeDiagnosticsText(logDiagnostics.lines.join('\n')),
      'utf8'
    ),
  ]);

  return outputDir;
}

function nextDiagnosticsId(): string {
  diagnosticsSequence += 1;
  return `mpd-${Date.now().toString(36)}-${diagnosticsSequence.toString(36)}`;
}

function getSuppressedCount(
  throttleKey: string,
  capturedAt: number,
  cooldownMs: number
): number | null {
  const existing = throttleStates.get(throttleKey);
  if (existing && capturedAt - existing.lastCapturedAt < cooldownMs) {
    existing.suppressedCount += 1;
    return null;
  }

  const suppressedCount = existing?.suppressedCount ?? 0;
  throttleStates.set(throttleKey, {
    lastCapturedAt: capturedAt,
    suppressedCount: 0,
  });
  return suppressedCount;
}

export function registerMainProcessDiagnosticsCollector(
  name: string,
  collector: DiagnosticsCollector
): () => void {
  collectors.set(name, collector);

  return () => {
    if (collectors.get(name) === collector) {
      collectors.delete(name);
    }
  };
}

export async function captureMainProcessDiagnosticsSnapshot(
  fdTimeoutMs: number = DEFAULT_FD_TIMEOUT_MS
): Promise<MainProcessDiagnosticsSnapshot> {
  const memoryUsage = process.memoryUsage();
  const [openFileDescriptors, sources] = await Promise.all([
    captureOpenFileDescriptorSnapshot(process.pid, fdTimeoutMs),
    captureCollectorSnapshots(),
  ]);

  return {
    capturedAt: Date.now(),
    pid: process.pid,
    platform: process.platform,
    uptimeSec: Number(process.uptime().toFixed(3)),
    memoryUsage: {
      rssBytes: memoryUsage.rss,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      externalBytes: memoryUsage.external,
      arrayBuffersBytes: memoryUsage.arrayBuffers,
    },
    activeResources: buildActiveResourceSnapshot(),
    openFileDescriptors,
    sources,
  };
}

export function requestMainProcessDiagnosticsCapture(
  options: RequestMainProcessDiagnosticsCaptureOptions
): string | null {
  const capturedAt = Date.now();
  const throttleKey = options.throttleKey ?? options.event;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const suppressedSinceLastCapture = getSuppressedCount(throttleKey, capturedAt, cooldownMs);

  if (suppressedSinceLastCapture === null) {
    return null;
  }

  const diagnosticsId = nextDiagnosticsId();
  const logMethod = getLogMethod(options.level ?? 'error');

  void captureMainProcessDiagnosticsSnapshot(options.fdTimeoutMs ?? DEFAULT_FD_TIMEOUT_MS)
    .then(async (snapshot) => {
      const persistence = options.persistence ?? 'auto';
      let persistedSnapshotDir: string | null = null;
      let persistenceError: SerializedError | null = null;

      if (shouldPersistDiagnosticsSnapshot(snapshot, options.error, persistence)) {
        try {
          persistedSnapshotDir = await persistDiagnosticsSnapshot({
            diagnosticsId,
            event: options.event,
            context: options.context,
            error: options.error,
            snapshot,
          });
        } catch (error) {
          persistenceError = serializeError(error);
        }
      }

      logMethod('Main process diagnostics snapshot', {
        diagnosticsId,
        event: options.event,
        throttleKey,
        suppressedSinceLastCapture,
        context: options.context,
        error: serializeError(options.error),
        snapshot,
        persistedSnapshotDir,
        persistenceError,
      });
    })
    .catch((error) => {
      logMethod('Main process diagnostics snapshot failed', {
        diagnosticsId,
        event: options.event,
        throttleKey,
        suppressedSinceLastCapture,
        context: options.context,
        error: serializeError(options.error),
        snapshotError: serializeError(error),
      });
    });

  return diagnosticsId;
}

export function resetMainProcessDiagnosticsForTests(): void {
  collectors.clear();
  throttleStates.clear();
  diagnosticsSequence = 0;
}
