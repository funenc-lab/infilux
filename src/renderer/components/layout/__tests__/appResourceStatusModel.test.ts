import type { RuntimeMemorySnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildAppResourceStatusSections,
  formatMemoryFromKb,
  formatProcessMetric,
  formatTimestamp,
} from '../appResourceStatusModel';

const t = (key: string, params?: Record<string, string | number>): string => {
  if (!params) {
    return key;
  }

  return key.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
};

describe('appResourceStatusModel', () => {
  it('formats kilobytes into readable memory units', () => {
    expect(formatMemoryFromKb(512, 'Unavailable')).toBe('0.5 MB');
    expect(formatMemoryFromKb(1536, 'Unavailable')).toBe('1.5 MB');
    expect(formatMemoryFromKb(3 * 1024 * 1024, 'Unavailable')).toBe('3.00 GB');
  });

  it('returns the unavailable marker for missing values', () => {
    expect(formatMemoryFromKb(null, 'Unavailable')).toBe('Unavailable');
    expect(formatTimestamp(null, 'Unavailable')).toBe('Unavailable');
    expect(formatProcessMetric(null, 'Unavailable', t)).toBe('Unavailable');
  });

  it('formats timestamps and process metrics for popover display', () => {
    expect(formatTimestamp(1711612800000, 'Unavailable')).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(
      formatProcessMetric(
        {
          pid: 422,
          type: 'Browser',
          name: 'browser',
          serviceName: null,
          workingSetSizeKb: 2048,
          peakWorkingSetSizeKb: 4096,
          privateBytesKb: 1024,
        },
        'Unavailable',
        t
      )
    ).toBe('2.0 MB · PID 422');
  });

  it('builds the three runtime sections with stable labels and values', () => {
    const snapshot: RuntimeMemorySnapshot = {
      capturedAt: 1711612800000,
      processCount: 4,
      rendererProcessId: 123,
      rendererMemory: {
        privateKb: 8192,
        sharedKb: 2048,
        residentSetKb: 12288,
      },
      rendererMetric: {
        pid: 123,
        type: 'Tab',
        name: 'renderer',
        serviceName: null,
        workingSetSizeKb: 14336,
        peakWorkingSetSizeKb: 16384,
        privateBytesKb: 8192,
      },
      browserMetric: {
        pid: 321,
        type: 'Browser',
        name: 'browser',
        serviceName: null,
        workingSetSizeKb: 10240,
        peakWorkingSetSizeKb: 11264,
        privateBytesKb: 4096,
      },
      gpuMetric: {
        pid: 456,
        type: 'GPU',
        name: 'gpu',
        serviceName: null,
        workingSetSizeKb: 6144,
        peakWorkingSetSizeKb: 7168,
        privateBytesKb: 2048,
      },
      totalAppWorkingSetSizeKb: 30720,
      totalAppPrivateBytesKb: 12288,
    };

    const sections = buildAppResourceStatusSections(snapshot, t);

    expect(sections.map((section) => section.title)).toEqual([
      'App overview',
      'Renderer',
      'Core processes',
    ]);
    expect(sections[0]?.metrics.map((metric) => metric.label)).toEqual([
      'App memory',
      'App private memory',
      'Processes',
      'Updated at',
    ]);
    expect(sections[1]?.metrics[0]?.value).toBe('14.0 MB');
    expect(sections[2]?.metrics[0]?.value).toBe('10.0 MB · PID 321');
    expect(sections[2]?.metrics[1]?.value).toBe('6.0 MB · PID 456');
  });
});
