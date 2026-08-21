#!/usr/bin/env npx tsx

import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

export const DEFAULT_RUNTIME_PERFORMANCE_DURATION_MS = 60_000;
export const DEFAULT_RUNTIME_PERFORMANCE_INTERVAL_MS = 5_000;
export const DEFAULT_RUNTIME_PERFORMANCE_INSPECTOR_URL = 'http://127.0.0.1:9222';

const MIN_RUNTIME_PERFORMANCE_DURATION_MS = 1_000;
const MIN_RUNTIME_PERFORMANCE_INTERVAL_MS = 250;
const MAIN_DIAGNOSTICS_FD_TIMEOUT_MS = 500;

const AGENT_SESSION_HANDLER_COUNTER_NAMES = [
  'listRecoverableCalls',
  'restoreWorktreeCalls',
  'reconcileCalls',
  'resolveProviderCalls',
  'readProviderTitleCalls',
  'markPersistentCalls',
  'abandonCalls',
] as const;

const FILE_WATCHER_COUNTER_NAMES = [
  'localWatcherCount',
  'remoteWatcherCount',
  'localWatcherOwnerCount',
  'remoteConnectionSubscriptionCount',
  'pendingRemoteConnectionSubscriptionCount',
] as const;

export interface RuntimePerformanceCliOptions {
  durationMs: number;
  intervalMs: number;
  inspectorUrl: string;
}

interface AggregateMemoryUsage {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

interface AggregateActiveResources {
  total: number;
  byType: Record<string, number>;
}

interface AggregateQueueCounts {
  pendingOutputBatches: number;
  pendingOutputChars: number;
  resyncSessions: number;
  deliveredOutputBatches: number;
  deliveredOutputChars: number;
  outputResyncCount: number;
  maxPendingOutputChars: number;
  transcriptPendingAppendBytes: number;
  outputSuspendedSessions: number;
}

interface AggregateIpcCounts {
  listRecoverableCalls: number;
  restoreWorktreeCalls: number;
  reconcileCalls: number;
  resolveProviderCalls: number;
  readProviderTitleCalls: number;
  markPersistentCalls: number;
  abandonCalls: number;
  total: number;
}

interface AggregateWatcherCounts {
  localWatcherCount: number;
  remoteWatcherCount: number;
  localWatcherOwnerCount: number;
  remoteConnectionSubscriptionCount: number;
  pendingRemoteConnectionSubscriptionCount: number;
}

export interface SanitizedMainProcessDiagnostics {
  memoryUsage: AggregateMemoryUsage;
  activeResources: AggregateActiveResources;
  queueCounts: AggregateQueueCounts;
  ipcCounts: AggregateIpcCounts;
  watcherCounts: AggregateWatcherCounts;
}

export interface RuntimePerformanceSample {
  capturedAt: number;
  renderer: {
    taskDurationSec: number | null;
    jsHeapUsedBytes: number | null;
    mountedTerminalCount: number;
    longTaskCount: number;
    longTaskDurationMs: number;
    longTaskSupported: boolean;
  };
  runtimeMemory: {
    processCount: number;
    rendererWorkingSetSizeKb: number | null;
    totalAppWorkingSetSizeKb: number;
    totalAppPrivateBytesKb: number;
  };
  mainProcess: SanitizedMainProcessDiagnostics;
}

interface NumericSummary {
  first: number | null;
  current: number | null;
  max: number | null;
  average: number | null;
  delta: number | null;
}

interface CounterSummary {
  first: number;
  current: number;
  delta: number;
}

export interface RuntimePerformanceReport {
  schemaVersion: 1;
  generatedAt: string;
  durationMs: number;
  intervalMs: number;
  sampleCount: number;
  renderer: {
    cpuPercent: NumericSummary;
    jsHeapUsedBytes: NumericSummary;
    mountedTerminalCount: NumericSummary;
    longTasks: {
      supported: boolean;
      count: number;
      durationMs: number;
    };
  };
  runtimeMemory: {
    processCount: NumericSummary;
    rendererWorkingSetSizeKb: NumericSummary;
    totalAppWorkingSetSizeKb: NumericSummary;
    totalAppPrivateBytesKb: NumericSummary;
  };
  mainProcess: {
    memoryUsage: {
      rssBytes: NumericSummary;
      heapUsedBytes: NumericSummary;
    };
    activeResources: {
      total: NumericSummary;
      currentByType: Record<string, number>;
    };
  };
  queueCounts: Record<keyof AggregateQueueCounts, NumericSummary>;
  ipcCounts: Record<keyof AggregateIpcCounts, CounterSummary>;
  watcherCounts: Record<keyof AggregateWatcherCounts, NumericSummary>;
}

interface CdpTarget {
  type?: unknown;
  webSocketDebuggerUrl?: unknown;
}

interface CdpResponse {
  id?: unknown;
  result?: unknown;
  error?: {
    message?: unknown;
  };
}

interface RendererProbeSnapshot {
  runtime: unknown;
  main: unknown;
  mountedTerminalCount: unknown;
  longTaskCount: unknown;
  longTaskDurationMs: unknown;
  longTaskSupported: unknown;
}

const RENDERER_PROBE_INSTALL_EXPRESSION = `(() => {
  const key = '__infiluxRuntimePerformanceProbe';
  const existing = window[key];
  if (existing) return existing.snapshot();
  let longTaskCount = 0;
  let longTaskDurationMs = 0;
  let longTaskSupported = false;
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTaskCount += 1;
          longTaskDurationMs += Number(entry.duration) || 0;
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
      longTaskSupported = true;
    } catch {}
  }
  const probe = {
    snapshot() {
      return {
        longTaskCount,
        longTaskDurationMs,
        longTaskSupported,
      };
    },
  };
  window[key] = probe;
  return probe.snapshot();
})()`;

const RENDERER_SAMPLE_EXPRESSION = `Promise.all([
  window.electronAPI?.app?.getRuntimeMetrics?.(),
  window.electronAPI?.log?.captureMainProcessDiagnostics?.({ fdTimeoutMs: ${MAIN_DIAGNOSTICS_FD_TIMEOUT_MS} }),
]).then(([runtime, main]) => {
  if (!runtime || !main) {
    throw new Error('Infilux runtime diagnostics APIs are unavailable');
  }
  const probe = window.__infiluxRuntimePerformanceProbe?.snapshot?.() ?? {
    longTaskCount: 0,
    longTaskDurationMs: 0,
    longTaskSupported: false,
  };
  return {
    runtime,
    main,
    mountedTerminalCount: document.querySelectorAll('.xterm').length,
    ...probe,
  };
})`;

export function parseRuntimePerformanceCliOptions(args: string[]): RuntimePerformanceCliOptions {
  const options: RuntimePerformanceCliOptions = {
    durationMs: DEFAULT_RUNTIME_PERFORMANCE_DURATION_MS,
    intervalMs: DEFAULT_RUNTIME_PERFORMANCE_INTERVAL_MS,
    inspectorUrl: DEFAULT_RUNTIME_PERFORMANCE_INSPECTOR_URL,
  };

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('--duration-ms=')) {
      options.durationMs = parsePositiveInteger(
        argument.slice('--duration-ms='.length),
        'duration-ms',
        MIN_RUNTIME_PERFORMANCE_DURATION_MS
      );
      continue;
    }
    if (argument.startsWith('--interval-ms=')) {
      options.intervalMs = parsePositiveInteger(
        argument.slice('--interval-ms='.length),
        'interval-ms',
        MIN_RUNTIME_PERFORMANCE_INTERVAL_MS
      );
      continue;
    }
    if (argument.startsWith('--inspector-url=')) {
      options.inspectorUrl = parseLoopbackInspectorUrl(argument.slice('--inspector-url='.length));
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.intervalMs > options.durationMs) {
    throw new Error('interval-ms cannot exceed duration-ms');
  }

  return options;
}

export function sanitizeMainProcessDiagnostics(value: unknown): SanitizedMainProcessDiagnostics {
  const root = asRecord(value);
  const memoryUsage = asRecord(root.memoryUsage);
  const activeResources = asRecord(root.activeResources);
  const sources = asRecord(root.sources);
  const sessions = asRecord(sources.sessions);
  const outputBatcher = asRecord(sessions.sessionOutputBatcher);
  const transcript = asRecord(sessions.transcript);
  const agentSessionHandlers = asRecord(sources.agentSessionHandlers);
  const fileWatchers = asRecord(sources.fileWatchers);

  const ipcCounts = Object.fromEntries(
    AGENT_SESSION_HANDLER_COUNTER_NAMES.map((name) => [
      name,
      readNonNegativeNumber(agentSessionHandlers[name]),
    ])
  ) as Omit<AggregateIpcCounts, 'total'>;
  const watcherCounts = Object.fromEntries(
    FILE_WATCHER_COUNTER_NAMES.map((name) => [name, readNonNegativeNumber(fileWatchers[name])])
  ) as AggregateWatcherCounts;

  return {
    memoryUsage: {
      rssBytes: readNonNegativeNumber(memoryUsage.rssBytes),
      heapTotalBytes: readNonNegativeNumber(memoryUsage.heapTotalBytes),
      heapUsedBytes: readNonNegativeNumber(memoryUsage.heapUsedBytes),
      externalBytes: readNonNegativeNumber(memoryUsage.externalBytes),
      arrayBuffersBytes: readNonNegativeNumber(memoryUsage.arrayBuffersBytes),
    },
    activeResources: {
      total: readNonNegativeNumber(activeResources.total),
      byType: readNonNegativeNumberRecord(activeResources.byType),
    },
    queueCounts: {
      pendingOutputBatches: readNonNegativeNumber(outputBatcher.pendingBatchCount),
      pendingOutputChars: readNonNegativeNumber(outputBatcher.pendingCharCount),
      resyncSessions: readNonNegativeNumber(outputBatcher.resyncSessionCount),
      deliveredOutputBatches: readNonNegativeNumber(outputBatcher.deliveredBatchCount),
      deliveredOutputChars: readNonNegativeNumber(outputBatcher.deliveredCharCount),
      outputResyncCount: readNonNegativeNumber(outputBatcher.resyncCount),
      maxPendingOutputChars: readNonNegativeNumber(outputBatcher.maxPendingCharCount),
      transcriptPendingAppendBytes: readNonNegativeNumber(transcript.pendingAppendBytes),
      outputSuspendedSessions: readNonNegativeNumber(sessions.outputSuspendedSessionCount),
    },
    ipcCounts: {
      ...ipcCounts,
      total: Object.values(ipcCounts).reduce((total, count) => total + count, 0),
    },
    watcherCounts,
  };
}

export function buildRuntimePerformanceReport(
  samples: RuntimePerformanceSample[],
  options: RuntimePerformanceCliOptions
): RuntimePerformanceReport {
  const latestSample = samples.at(-1) ?? null;
  const queueCounts = Object.fromEntries(
    Object.keys(emptyQueueCounts()).map((key) => [
      key,
      summarizeNumbers(
        samples.map((sample) => sample.mainProcess.queueCounts[key as keyof AggregateQueueCounts])
      ),
    ])
  ) as RuntimePerformanceReport['queueCounts'];
  const ipcCounts = Object.fromEntries(
    Object.keys(emptyIpcCounts()).map((key) => [
      key,
      summarizeCounter(
        samples.map((sample) => sample.mainProcess.ipcCounts[key as keyof AggregateIpcCounts])
      ),
    ])
  ) as RuntimePerformanceReport['ipcCounts'];
  const watcherCounts = Object.fromEntries(
    Object.keys(emptyWatcherCounts()).map((key) => [
      key,
      summarizeNumbers(
        samples.map(
          (sample) => sample.mainProcess.watcherCounts[key as keyof AggregateWatcherCounts]
        )
      ),
    ])
  ) as RuntimePerformanceReport['watcherCounts'];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationMs: options.durationMs,
    intervalMs: options.intervalMs,
    sampleCount: samples.length,
    renderer: {
      cpuPercent: summarizeNumbers(calculateRendererCpuPercents(samples)),
      jsHeapUsedBytes: summarizeNumbers(samples.map((sample) => sample.renderer.jsHeapUsedBytes)),
      mountedTerminalCount: summarizeNumbers(
        samples.map((sample) => sample.renderer.mountedTerminalCount)
      ),
      longTasks: {
        supported: samples.some((sample) => sample.renderer.longTaskSupported),
        count: latestSample?.renderer.longTaskCount ?? 0,
        durationMs: latestSample?.renderer.longTaskDurationMs ?? 0,
      },
    },
    runtimeMemory: {
      processCount: summarizeNumbers(samples.map((sample) => sample.runtimeMemory.processCount)),
      rendererWorkingSetSizeKb: summarizeNumbers(
        samples.map((sample) => sample.runtimeMemory.rendererWorkingSetSizeKb)
      ),
      totalAppWorkingSetSizeKb: summarizeNumbers(
        samples.map((sample) => sample.runtimeMemory.totalAppWorkingSetSizeKb)
      ),
      totalAppPrivateBytesKb: summarizeNumbers(
        samples.map((sample) => sample.runtimeMemory.totalAppPrivateBytesKb)
      ),
    },
    mainProcess: {
      memoryUsage: {
        rssBytes: summarizeNumbers(
          samples.map((sample) => sample.mainProcess.memoryUsage.rssBytes)
        ),
        heapUsedBytes: summarizeNumbers(
          samples.map((sample) => sample.mainProcess.memoryUsage.heapUsedBytes)
        ),
      },
      activeResources: {
        total: summarizeNumbers(samples.map((sample) => sample.mainProcess.activeResources.total)),
        currentByType: latestSample?.mainProcess.activeResources.byType ?? {},
      },
    },
    queueCounts,
    ipcCounts,
    watcherCounts,
  };
}

export async function collectRuntimePerformanceSamples(
  options: RuntimePerformanceCliOptions
): Promise<RuntimePerformanceSample[]> {
  const target = await resolveInspectorTarget(options.inspectorUrl);
  const connection = await CdpConnection.connect(target);
  try {
    await connection.command('Performance.enable');
    await evaluateCdpExpression(connection, RENDERER_PROBE_INSTALL_EXPRESSION);

    const samples: RuntimePerformanceSample[] = [];
    const deadline = Date.now() + options.durationMs;
    while (samples.length === 0 || Date.now() < deadline) {
      samples.push(await collectRuntimePerformanceSample(connection));
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      await delay(Math.min(options.intervalMs, remainingMs));
    }

    return samples;
  } finally {
    connection.close();
  }
}

async function collectRuntimePerformanceSample(
  connection: CdpConnection
): Promise<RuntimePerformanceSample> {
  const [performanceMetrics, probeValue] = await Promise.all([
    connection.command('Performance.getMetrics'),
    evaluateCdpExpression(connection, RENDERER_SAMPLE_EXPRESSION),
  ]);
  const probe = asRecord(probeValue) as RendererProbeSnapshot;
  const runtime = asRecord(probe.runtime);

  return {
    capturedAt: Date.now(),
    renderer: {
      taskDurationSec: getPerformanceMetric(performanceMetrics, 'TaskDuration'),
      jsHeapUsedBytes: getPerformanceMetric(performanceMetrics, 'JSHeapUsedSize'),
      mountedTerminalCount: readNonNegativeNumber(probe.mountedTerminalCount),
      longTaskCount: readNonNegativeNumber(probe.longTaskCount),
      longTaskDurationMs: readNonNegativeNumber(probe.longTaskDurationMs),
      longTaskSupported: probe.longTaskSupported === true,
    },
    runtimeMemory: {
      processCount: readNonNegativeNumber(runtime.processCount),
      rendererWorkingSetSizeKb: readOptionalNonNegativeNumber(
        asRecord(runtime.rendererMetric).workingSetSizeKb
      ),
      totalAppWorkingSetSizeKb: readNonNegativeNumber(runtime.totalAppWorkingSetSizeKb),
      totalAppPrivateBytesKb: readNonNegativeNumber(runtime.totalAppPrivateBytesKb),
    },
    mainProcess: sanitizeMainProcessDiagnostics(probe.main),
  };
}

function calculateRendererCpuPercents(samples: RuntimePerformanceSample[]): number[] {
  const cpuPercents: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedMs = current.capturedAt - previous.capturedAt;
    const taskDurationDelta =
      current.renderer.taskDurationSec !== null && previous.renderer.taskDurationSec !== null
        ? current.renderer.taskDurationSec - previous.renderer.taskDurationSec
        : null;
    if (elapsedMs <= 0 || taskDurationDelta === null || taskDurationDelta < 0) {
      continue;
    }
    cpuPercents.push(Number(((taskDurationDelta / (elapsedMs / 1000)) * 100).toFixed(3)));
  }
  return cpuPercents;
}

function summarizeNumbers(values: Array<number | null>): NumericSummary {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length === 0) {
    return { first: null, current: null, max: null, average: null, delta: null };
  }
  const first = numericValues[0] ?? null;
  const current = numericValues.at(-1) ?? null;
  return {
    first,
    current,
    max: Math.max(...numericValues),
    average: numericValues.reduce((total, value) => total + value, 0) / numericValues.length,
    delta: first === null || current === null ? null : current - first,
  };
}

function summarizeCounter(values: number[]): CounterSummary {
  const first = values[0] ?? 0;
  const current = values.at(-1) ?? 0;
  return {
    first,
    current,
    delta: Math.max(0, current - first),
  };
}

function emptyQueueCounts(): AggregateQueueCounts {
  return {
    pendingOutputBatches: 0,
    pendingOutputChars: 0,
    resyncSessions: 0,
    deliveredOutputBatches: 0,
    deliveredOutputChars: 0,
    outputResyncCount: 0,
    maxPendingOutputChars: 0,
    transcriptPendingAppendBytes: 0,
    outputSuspendedSessions: 0,
  };
}

function emptyIpcCounts(): AggregateIpcCounts {
  return {
    listRecoverableCalls: 0,
    restoreWorktreeCalls: 0,
    reconcileCalls: 0,
    resolveProviderCalls: 0,
    readProviderTitleCalls: 0,
    markPersistentCalls: 0,
    abandonCalls: 0,
    total: 0,
  };
}

function emptyWatcherCounts(): AggregateWatcherCounts {
  return {
    localWatcherCount: 0,
    remoteWatcherCount: 0,
    localWatcherOwnerCount: 0,
    remoteConnectionSubscriptionCount: 0,
    pendingRemoteConnectionSubscriptionCount: 0,
  };
}

function parsePositiveInteger(value: string, name: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function parseLoopbackInspectorUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('inspector-url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(url.hostname)) {
    throw new Error('inspector-url must use an HTTP loopback address');
  }
  return url.toString().replace(/\/$/, '');
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readOptionalNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function readNonNegativeNumberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).flatMap(([name, count]) => {
      const numericCount = readOptionalNonNegativeNumber(count);
      return numericCount === null ? [] : [[name, numericCount]];
    })
  );
}

function getPerformanceMetric(response: unknown, metricName: string): number | null {
  const metrics = asRecord(response).metrics;
  if (!Array.isArray(metrics)) {
    return null;
  }
  const metric = metrics.find((candidate) => asRecord(candidate).name === metricName);
  return readOptionalNonNegativeNumber(asRecord(metric).value);
}

async function resolveInspectorTarget(inspectorUrl: string): Promise<string> {
  const endpoint = new URL('/json/list', `${inspectorUrl}/`);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`Unable to read the CDP target list: HTTP ${response.status}`);
  }
  const targets = (await response.json()) as unknown;
  if (!Array.isArray(targets)) {
    throw new Error('The CDP target list is invalid');
  }
  const target = targets.find(
    (candidate): candidate is CdpTarget =>
      asRecord(candidate).type === 'page' &&
      typeof asRecord(candidate).webSocketDebuggerUrl === 'string'
  );
  if (!target || typeof target.webSocketDebuggerUrl !== 'string') {
    throw new Error('No renderer CDP target is available');
  }
  return target.webSocketDebuggerUrl;
}

async function evaluateCdpExpression(
  connection: CdpConnection,
  expression: string
): Promise<unknown> {
  const response = await connection.command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const evaluation = asRecord(response);
  const exceptionDetails = evaluation.exceptionDetails;
  if (exceptionDetails) {
    throw new Error(`Renderer diagnostics evaluation failed: ${JSON.stringify(exceptionDetails)}`);
  }
  return asRecord(evaluation.result).value;
}

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.handleMessage(data.toString()));
    socket.on('error', (error) => this.rejectPending(error));
    socket.on('close', () => this.rejectPending(new Error('CDP connection closed')));
  }

  static async connect(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new CdpConnection(socket);
  }

  command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(payload: string): void {
    let response: CdpResponse;
    try {
      response = JSON.parse(payload) as CdpResponse;
    } catch {
      return;
    }
    if (typeof response.id !== 'number') {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(String(response.error.message ?? 'Unknown CDP error')));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatUsage(): string {
  return `Usage: pnpm diagnostics:runtime-performance -- [options]

Connects to an explicitly enabled local Electron CDP endpoint and prints a sanitized aggregate report.
The report excludes terminal output, paths, session identifiers, and raw diagnostic sources.

Options:
  --duration-ms=<n>     Sampling duration in milliseconds (default: ${DEFAULT_RUNTIME_PERFORMANCE_DURATION_MS})
  --interval-ms=<n>     Sampling interval in milliseconds (default: ${DEFAULT_RUNTIME_PERFORMANCE_INTERVAL_MS})
  --inspector-url=<url> Local CDP endpoint (default: ${DEFAULT_RUNTIME_PERFORMANCE_INSPECTOR_URL})
`;
}

async function runCli(): Promise<void> {
  if (process.argv.slice(2).includes('--help')) {
    process.stdout.write(formatUsage());
    return;
  }
  const options = parseRuntimePerformanceCliOptions(process.argv.slice(2));
  const samples = await collectRuntimePerformanceSamples(options);
  process.stdout.write(
    `${JSON.stringify(buildRuntimePerformanceReport(samples, options), null, 2)}\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Runtime performance diagnostics failed: ${message}\n`);
    process.exitCode = 1;
  });
}
