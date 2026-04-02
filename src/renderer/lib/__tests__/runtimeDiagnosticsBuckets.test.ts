import type { RuntimeMemorySnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { getAppMemoryPressureBucket, getRendererMemoryPressureBucket } from '../runtimeDiagnostics';

function createMemorySnapshot(
  overrides: Partial<RuntimeMemorySnapshot> = {}
): RuntimeMemorySnapshot {
  return {
    capturedAt: 1_764_319_200_000,
    processCount: 4,
    rendererProcessId: 123,
    rendererMemory: {
      privateKb: 0,
      sharedKb: 0,
      residentSetKb: 0,
    },
    rendererMetric: null,
    browserMetric: null,
    gpuMetric: null,
    totalAppWorkingSetSizeKb: 0,
    totalAppPrivateBytesKb: 0,
    ...overrides,
  };
}

describe('runtimeDiagnostics memory pressure buckets', () => {
  it('falls back to renderer metric private bytes when process memory info is unavailable', () => {
    expect(
      getRendererMemoryPressureBucket(
        createMemorySnapshot({
          rendererMemory: null,
          rendererMetric: {
            pid: 123,
            type: 'Tab',
            name: null,
            serviceName: null,
            workingSetSizeKb: 420 * 1024,
            peakWorkingSetSizeKb: 480 * 1024,
            privateBytesKb: 300 * 1024,
          },
        })
      )
    ).toBe(1);
  });

  it('buckets renderer private memory in 256 MB increments', () => {
    expect(
      getRendererMemoryPressureBucket(
        createMemorySnapshot({
          rendererMemory: {
            privateKb: 300 * 1024,
            sharedKb: 0,
            residentSetKb: 0,
          },
        })
      )
    ).toBe(1);

    expect(
      getRendererMemoryPressureBucket(
        createMemorySnapshot({
          rendererMemory: {
            privateKb: 780 * 1024,
            sharedKb: 0,
            residentSetKb: 0,
          },
        })
      )
    ).toBe(3);
  });

  it('buckets total app working set in 256 MB increments', () => {
    expect(
      getAppMemoryPressureBucket(
        createMemorySnapshot({
          totalAppWorkingSetSizeKb: 520 * 1024,
        })
      )
    ).toBe(2);
  });

  it('returns null when both process memory info and renderer metric private bytes are unavailable', () => {
    expect(
      getRendererMemoryPressureBucket(
        createMemorySnapshot({
          rendererMemory: null,
          rendererMetric: {
            pid: 123,
            type: 'Tab',
            name: null,
            serviceName: null,
            workingSetSizeKb: 420 * 1024,
            peakWorkingSetSizeKb: 480 * 1024,
            privateBytesKb: null,
          },
        })
      )
    ).toBeNull();
  });
});
