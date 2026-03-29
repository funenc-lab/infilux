import type { RuntimeMemoryProcessMetric, RuntimeMemorySnapshot } from '@shared/types';

export interface AppResourceStatusMetric {
  key: string;
  label: string;
  value: string;
}

export interface AppResourceStatusSection {
  key: string;
  title: string;
  metrics: AppResourceStatusMetric[];
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const KILOBYTES_PER_MEGABYTE = 1024;
const KILOBYTES_PER_GIGABYTE = 1024 * 1024;

export function formatMemoryFromKb(
  kilobytes: number | null | undefined,
  unavailable: string
): string {
  if (
    kilobytes === null ||
    kilobytes === undefined ||
    !Number.isFinite(kilobytes) ||
    kilobytes < 0
  ) {
    return unavailable;
  }

  if (kilobytes >= KILOBYTES_PER_GIGABYTE) {
    return `${(kilobytes / KILOBYTES_PER_GIGABYTE).toFixed(2)} GB`;
  }

  return `${(kilobytes / KILOBYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

export function formatTimestamp(timestamp: number | null | undefined, unavailable: string): string {
  if (
    timestamp === null ||
    timestamp === undefined ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return unavailable;
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatProcessMetric(
  metric: RuntimeMemoryProcessMetric | null | undefined,
  unavailable: string,
  translate: Translate
): string {
  if (!metric) {
    return unavailable;
  }

  return translate('{{memory}} · PID {{pid}}', {
    memory: formatMemoryFromKb(metric.workingSetSizeKb, unavailable),
    pid: metric.pid,
  });
}

export function buildAppResourceStatusSections(
  snapshot: RuntimeMemorySnapshot,
  translate: Translate
): AppResourceStatusSection[] {
  const unavailable = translate('Unavailable');

  return [
    {
      key: 'overview',
      title: translate('App overview'),
      metrics: [
        {
          key: 'app-memory',
          label: translate('App memory'),
          value: formatMemoryFromKb(snapshot.totalAppWorkingSetSizeKb, unavailable),
        },
        {
          key: 'app-private-memory',
          label: translate('App private memory'),
          value: formatMemoryFromKb(snapshot.totalAppPrivateBytesKb, unavailable),
        },
        {
          key: 'process-count',
          label: translate('Processes'),
          value: String(snapshot.processCount),
        },
        {
          key: 'updated-at',
          label: translate('Updated at'),
          value: formatTimestamp(snapshot.capturedAt, unavailable),
        },
      ],
    },
    {
      key: 'renderer',
      title: translate('Renderer'),
      metrics: [
        {
          key: 'renderer-working-set',
          label: translate('Renderer working set'),
          value: formatMemoryFromKb(snapshot.rendererMetric?.workingSetSizeKb, unavailable),
        },
        {
          key: 'renderer-private',
          label: translate('Renderer private memory'),
          value: formatMemoryFromKb(snapshot.rendererMemory?.privateKb, unavailable),
        },
        {
          key: 'renderer-shared',
          label: translate('Renderer shared memory'),
          value: formatMemoryFromKb(snapshot.rendererMemory?.sharedKb, unavailable),
        },
        {
          key: 'renderer-resident-set',
          label: translate('Renderer resident set'),
          value: formatMemoryFromKb(snapshot.rendererMemory?.residentSetKb, unavailable),
        },
      ],
    },
    {
      key: 'core-processes',
      title: translate('Core processes'),
      metrics: [
        {
          key: 'browser-process',
          label: translate('Browser process'),
          value: formatProcessMetric(snapshot.browserMetric, unavailable, translate),
        },
        {
          key: 'gpu-process',
          label: translate('GPU process'),
          value: formatProcessMetric(snapshot.gpuMetric, unavailable, translate),
        },
      ],
    },
  ];
}
