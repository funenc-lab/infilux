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
  it('returns null when renderer private memory is unavailable', () => {
    expect(
      getRendererMemoryPressureBucket(
        createMemorySnapshot({
          rendererMemory: null,
        })
      )
    ).toBeNull();
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
});
