import type { RuntimeMemoryProcessMetric, RuntimeMemorySnapshot } from '@shared/types';

function toRuntimeMemoryProcessMetric(
  metric: Electron.ProcessMetric | undefined
): RuntimeMemoryProcessMetric | null {
  if (!metric) {
    return null;
  }

  return {
    pid: metric.pid,
    type: metric.type,
    name: metric.name ?? null,
    serviceName: metric.serviceName ?? null,
    workingSetSizeKb: metric.memory.workingSetSize,
    peakWorkingSetSizeKb: metric.memory.peakWorkingSetSize,
    privateBytesKb: metric.memory.privateBytes ?? null,
  };
}

function sumWorkingSet(metrics: Electron.ProcessMetric[]): number {
  return metrics.reduce((total, metric) => total + metric.memory.workingSetSize, 0);
}

function sumPrivateBytes(metrics: Electron.ProcessMetric[]): number {
  return metrics.reduce((total, metric) => total + (metric.memory.privateBytes ?? 0), 0);
}

export function buildRuntimeMemorySnapshot(options: {
  appMetrics: Electron.ProcessMetric[];
  rendererMemory: Electron.ProcessMemoryInfo | null;
  rendererProcessId: number | null;
  capturedAt?: number;
}): RuntimeMemorySnapshot {
  const { appMetrics, rendererMemory, rendererProcessId, capturedAt = Date.now() } = options;
  const browserMetric = appMetrics.find((metric) => metric.type === 'Browser');
  const gpuMetric = appMetrics.find((metric) => metric.type === 'GPU');
  const rendererMetric =
    rendererProcessId === null
      ? undefined
      : appMetrics.find((metric) => metric.pid === rendererProcessId);

  return {
    capturedAt,
    processCount: appMetrics.length,
    rendererProcessId,
    rendererMemory: rendererMemory
      ? {
          privateKb: rendererMemory.private,
          sharedKb: rendererMemory.shared,
          residentSetKb: rendererMemory.residentSet ?? null,
        }
      : null,
    rendererMetric: toRuntimeMemoryProcessMetric(rendererMetric),
    browserMetric: toRuntimeMemoryProcessMetric(browserMetric),
    gpuMetric: toRuntimeMemoryProcessMetric(gpuMetric),
    totalAppWorkingSetSizeKb: sumWorkingSet(appMetrics),
    totalAppPrivateBytesKb: sumPrivateBytes(appMetrics),
  };
}
