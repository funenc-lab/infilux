import { describe, expect, it } from 'vitest';
import { buildRuntimeMemorySnapshot } from '../runtimeMemory';

describe('runtimeMemory', () => {
  it('builds a runtime memory snapshot from app metrics and renderer memory', () => {
    const snapshot = buildRuntimeMemorySnapshot({
      capturedAt: 123,
      rendererProcessId: 202,
      rendererMemory: {
        private: 32000,
        shared: 8000,
        residentSet: 48000,
      },
      appMetrics: [
        {
          pid: 101,
          type: 'Browser',
          creationTime: 1,
          cpu: {
            percentCPUUsage: 1.2,
            idleWakeupsPerSecond: 0,
          },
          memory: {
            workingSetSize: 64000,
            peakWorkingSetSize: 65000,
            privateBytes: 30000,
          },
        },
        {
          pid: 202,
          type: 'Tab',
          creationTime: 2,
          cpu: {
            percentCPUUsage: 2.4,
            idleWakeupsPerSecond: 0,
          },
          memory: {
            workingSetSize: 52000,
            peakWorkingSetSize: 70000,
            privateBytes: 28000,
          },
        },
      ] as Electron.ProcessMetric[],
    });

    expect(snapshot).toEqual({
      capturedAt: 123,
      processCount: 2,
      rendererProcessId: 202,
      rendererMemory: {
        privateKb: 32000,
        sharedKb: 8000,
        residentSetKb: 48000,
      },
      rendererMetric: {
        pid: 202,
        type: 'Tab',
        name: null,
        serviceName: null,
        workingSetSizeKb: 52000,
        peakWorkingSetSizeKb: 70000,
        privateBytesKb: 28000,
      },
      browserMetric: {
        pid: 101,
        type: 'Browser',
        name: null,
        serviceName: null,
        workingSetSizeKb: 64000,
        peakWorkingSetSizeKb: 65000,
        privateBytesKb: 30000,
      },
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 116000,
      totalAppPrivateBytesKb: 58000,
    });
  });
});
