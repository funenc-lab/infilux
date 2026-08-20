import { describe, expect, it } from 'vitest';

import {
  buildRuntimePerformanceReport,
  parseRuntimePerformanceCliOptions,
  type RuntimePerformanceSample,
  sanitizeMainProcessDiagnostics,
} from '../runtime-performance-diagnostics';

describe('runtime performance diagnostics', () => {
  it('accepts only bounded local inspector sampling options', () => {
    expect(
      parseRuntimePerformanceCliOptions([
        '--duration-ms=60000',
        '--interval-ms=5000',
        '--inspector-url=http://127.0.0.1:9333',
      ])
    ).toEqual({
      durationMs: 60000,
      intervalMs: 5000,
      inspectorUrl: 'http://127.0.0.1:9333',
    });

    expect(() =>
      parseRuntimePerformanceCliOptions(['--inspector-url=https://diagnostics.example.com'])
    ).toThrow('loopback');
    expect(() => parseRuntimePerformanceCliOptions(['--duration-ms=0'])).toThrow('duration-ms');
    expect(() => parseRuntimePerformanceCliOptions(['--unknown'])).toThrow('Unknown option');
  });

  it('whitelists aggregate main-process diagnostics and removes sensitive source values', () => {
    expect(
      sanitizeMainProcessDiagnostics({
        memoryUsage: {
          rssBytes: 500,
          heapTotalBytes: 300,
          heapUsedBytes: 200,
          externalBytes: 100,
          arrayBuffersBytes: 50,
        },
        activeResources: {
          total: 3,
          byType: { PipeWrap: 2, Timeout: 1 },
        },
        sources: {
          sessions: {
            sessionCount: 4,
            attachedWindowCount: 3,
            outputSuspendedSessionCount: 1,
            sessionOutputBatcher: {
              pendingBatchCount: 2,
              pendingCharCount: 1024,
              resyncSessionCount: 1,
            },
            transcript: { pendingAppendBytes: 128 },
            sessionIds: ['secret-session-id'],
            cwd: '/secret/path',
            terminalOutput: 'secret terminal output',
          },
          agentSessionHandlers: {
            listRecoverableCalls: 2,
            restoreWorktreeCalls: 3,
            lastMarkedPersistentSessionId: 'secret-session-id',
          },
          fileWatchers: {
            localWatcherCount: 6,
            localWatchersByState: { running: 6 },
            sampleLocalWatchers: [{ dirPath: '/secret/path' }],
          },
        },
      })
    ).toEqual({
      memoryUsage: {
        rssBytes: 500,
        heapTotalBytes: 300,
        heapUsedBytes: 200,
        externalBytes: 100,
        arrayBuffersBytes: 50,
      },
      activeResources: {
        total: 3,
        byType: { PipeWrap: 2, Timeout: 1 },
      },
      queueCounts: {
        pendingOutputBatches: 2,
        pendingOutputChars: 1024,
        resyncSessions: 1,
        transcriptPendingAppendBytes: 128,
        outputSuspendedSessions: 1,
      },
      ipcCounts: {
        listRecoverableCalls: 2,
        restoreWorktreeCalls: 3,
        reconcileCalls: 0,
        resolveProviderCalls: 0,
        readProviderTitleCalls: 0,
        markPersistentCalls: 0,
        abandonCalls: 0,
        total: 5,
      },
      watcherCounts: {
        localWatcherCount: 6,
        remoteWatcherCount: 0,
        localWatcherOwnerCount: 0,
        remoteConnectionSubscriptionCount: 0,
        pendingRemoteConnectionSubscriptionCount: 0,
      },
    });
  });

  it('builds a report from aggregate metrics without preserving terminal payloads', () => {
    const samples: RuntimePerformanceSample[] = [
      createSample({
        capturedAt: 1000,
        taskDurationSec: 1,
        jsHeapUsedBytes: 100,
        mountedTerminalCount: 1,
        longTaskCount: 2,
        longTaskDurationMs: 80,
        pendingOutputChars: 10,
        listRecoverableCalls: 1,
      }),
      createSample({
        capturedAt: 2000,
        taskDurationSec: 1.2,
        jsHeapUsedBytes: 140,
        mountedTerminalCount: 4,
        longTaskCount: 3,
        longTaskDurationMs: 130,
        pendingOutputChars: 20,
        listRecoverableCalls: 4,
      }),
    ];

    const report = buildRuntimePerformanceReport(samples, {
      durationMs: 1000,
      intervalMs: 500,
      inspectorUrl: 'http://127.0.0.1:9222',
    });

    expect(report).toMatchObject({
      sampleCount: 2,
      renderer: {
        mountedTerminalCount: { current: 4, max: 4 },
        longTasks: { count: 3, durationMs: 130 },
        cpuPercent: { average: 20, max: 20 },
      },
      queueCounts: {
        pendingOutputChars: { current: 20, max: 20 },
      },
      ipcCounts: {
        total: { first: 1, current: 4, delta: 3 },
      },
    });
    expect(JSON.stringify(report)).not.toContain('terminalOutput');
    expect(JSON.stringify(report)).not.toContain('secret-session-id');
  });
});

function createSample(overrides: {
  capturedAt: number;
  taskDurationSec: number;
  jsHeapUsedBytes: number;
  mountedTerminalCount: number;
  longTaskCount: number;
  longTaskDurationMs: number;
  pendingOutputChars: number;
  listRecoverableCalls: number;
}): RuntimePerformanceSample {
  return {
    capturedAt: overrides.capturedAt,
    renderer: {
      taskDurationSec: overrides.taskDurationSec,
      jsHeapUsedBytes: overrides.jsHeapUsedBytes,
      mountedTerminalCount: overrides.mountedTerminalCount,
      longTaskCount: overrides.longTaskCount,
      longTaskDurationMs: overrides.longTaskDurationMs,
      longTaskSupported: true,
    },
    runtimeMemory: {
      processCount: 3,
      rendererWorkingSetSizeKb: 1000,
      totalAppWorkingSetSizeKb: 2000,
      totalAppPrivateBytesKb: 1500,
    },
    mainProcess: {
      memoryUsage: {
        rssBytes: 1000,
        heapTotalBytes: 800,
        heapUsedBytes: 600,
        externalBytes: 100,
        arrayBuffersBytes: 50,
      },
      activeResources: { total: 2, byType: { Timeout: 2 } },
      queueCounts: {
        pendingOutputBatches: 1,
        pendingOutputChars: overrides.pendingOutputChars,
        resyncSessions: 0,
        transcriptPendingAppendBytes: 0,
        outputSuspendedSessions: 0,
      },
      ipcCounts: {
        listRecoverableCalls: overrides.listRecoverableCalls,
        restoreWorktreeCalls: 0,
        reconcileCalls: 0,
        resolveProviderCalls: 0,
        readProviderTitleCalls: 0,
        markPersistentCalls: 0,
        abandonCalls: 0,
        total: overrides.listRecoverableCalls,
      },
      watcherCounts: {
        localWatcherCount: 0,
        remoteWatcherCount: 0,
        localWatcherOwnerCount: 0,
        remoteConnectionSubscriptionCount: 0,
        pendingRemoteConnectionSubscriptionCount: 0,
      },
    },
  };
}
