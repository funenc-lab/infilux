import type { RuntimeMemorySnapshot } from '@shared/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRendererDiagnosticsSnapshot,
  recordBulkReloadEvent,
  recordRuntimeMemorySample,
  resetRendererDiagnostics,
  updateRendererDiagnostics,
} from '../runtimeDiagnostics';

describe('runtimeDiagnostics', () => {
  beforeEach(() => {
    resetRendererDiagnostics();
  });

  it('starts with a reset snapshot and returns defensive copies', () => {
    const first = getRendererDiagnosticsSnapshot();
    const emptySnapshot = {
      agentSessionCount: 0,
      terminalSessionCount: 0,
      configuredTerminalScrollback: 0,
      estimatedTerminalScrollbackLineCapacity: 0,
      editorTabCount: 0,
      activeEditorPath: null,
      monacoModelCount: 0,
      monacoFileModelCount: 0,
      bulkReloadCount: 0,
      lastBulkReloadAt: null,
      lastBulkReloadPath: null,
      lastMemorySampleAt: null,
      rendererMemoryPrivateKb: null,
      rendererMemorySharedKb: null,
      rendererMemoryResidentSetKb: null,
      rendererWorkingSetSizeKb: null,
      rendererPeakWorkingSetSizeKb: null,
      appProcessCount: null,
      appTotalWorkingSetSizeKb: null,
      peakAppTotalWorkingSetSizeKb: null,
    };

    expect(first).toEqual(emptySnapshot);

    first.agentSessionCount = 99;
    expect(getRendererDiagnosticsSnapshot().agentSessionCount).toBe(0);

    updateRendererDiagnostics({ agentSessionCount: 2, activeEditorPath: '/repo/App.tsx' });
    resetRendererDiagnostics();

    expect(getRendererDiagnosticsSnapshot()).toEqual(emptySnapshot);
  });

  it('tracks renderer counters and bulk reload metadata', () => {
    updateRendererDiagnostics({
      agentSessionCount: 3,
      terminalSessionCount: 2,
      editorTabCount: 5,
      configuredTerminalScrollback: 5000,
      estimatedTerminalScrollbackLineCapacity: 10000,
      monacoModelCount: 6,
      monacoFileModelCount: 3,
    });

    recordBulkReloadEvent('/repo/main.ts');
    recordBulkReloadEvent('/repo/secondary.ts');

    expect(getRendererDiagnosticsSnapshot()).toMatchObject({
      agentSessionCount: 3,
      terminalSessionCount: 2,
      editorTabCount: 5,
      configuredTerminalScrollback: 5000,
      estimatedTerminalScrollbackLineCapacity: 10000,
      monacoModelCount: 6,
      monacoFileModelCount: 3,
      bulkReloadCount: 2,
      lastBulkReloadPath: '/repo/secondary.ts',
    });
  });

  it('tracks runtime memory samples and keeps peak app working set', () => {
    const sampleA: RuntimeMemorySnapshot = {
      capturedAt: 100,
      processCount: 3,
      rendererProcessId: 42,
      rendererMemory: {
        privateKb: 32000,
        sharedKb: 8000,
        residentSetKb: 45000,
      },
      rendererMetric: {
        pid: 42,
        type: 'Tab',
        name: null,
        serviceName: null,
        workingSetSizeKb: 51000,
        peakWorkingSetSizeKb: 53000,
        privateBytesKb: 30000,
      },
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 120000,
      totalAppPrivateBytesKb: 60000,
    };
    const sampleB: RuntimeMemorySnapshot = {
      ...sampleA,
      capturedAt: 200,
      totalAppWorkingSetSizeKb: 118000,
    };

    recordRuntimeMemorySample(sampleA);
    recordRuntimeMemorySample(sampleB);

    expect(getRendererDiagnosticsSnapshot()).toMatchObject({
      lastMemorySampleAt: 200,
      rendererMemoryPrivateKb: 32000,
      rendererMemorySharedKb: 8000,
      rendererMemoryResidentSetKb: 45000,
      rendererWorkingSetSizeKb: 51000,
      rendererPeakWorkingSetSizeKb: 53000,
      appProcessCount: 3,
      appTotalWorkingSetSizeKb: 118000,
      peakAppTotalWorkingSetSizeKb: 120000,
    });
  });

  it('falls back to renderer metric memory when process memory info is unavailable and initializes the peak', () => {
    const sample: RuntimeMemorySnapshot = {
      capturedAt: 300,
      processCount: 1,
      rendererProcessId: 42,
      rendererMemory: null,
      rendererMetric: {
        pid: 42,
        type: 'Tab',
        name: null,
        serviceName: null,
        workingSetSizeKb: 65536,
        peakWorkingSetSizeKb: 70000,
        privateBytesKb: 49152,
      },
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 64000,
      totalAppPrivateBytesKb: 32000,
    };

    const result = recordRuntimeMemorySample(sample);

    expect(result).toMatchObject({
      lastMemorySampleAt: 300,
      rendererMemoryPrivateKb: 49152,
      rendererMemorySharedKb: null,
      rendererMemoryResidentSetKb: 65536,
      rendererWorkingSetSizeKb: 65536,
      rendererPeakWorkingSetSizeKb: 70000,
      appProcessCount: 1,
      appTotalWorkingSetSizeKb: 64000,
      peakAppTotalWorkingSetSizeKb: 64000,
    });
  });

  it('replaces fallback renderer memory with explicit process memory when later samples recover', () => {
    recordRuntimeMemorySample({
      capturedAt: 400,
      processCount: 2,
      rendererProcessId: 7,
      rendererMemory: null,
      rendererMetric: {
        pid: 7,
        type: 'Tab',
        name: null,
        serviceName: null,
        workingSetSizeKb: 70000,
        peakWorkingSetSizeKb: 71000,
        privateBytesKb: 50000,
      },
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 100000,
      totalAppPrivateBytesKb: 50000,
    });

    recordRuntimeMemorySample({
      capturedAt: 500,
      processCount: 2,
      rendererProcessId: 7,
      rendererMemory: {
        privateKb: 52000,
        sharedKb: 6000,
        residentSetKb: 76000,
      },
      rendererMetric: {
        pid: 7,
        type: 'Tab',
        name: null,
        serviceName: null,
        workingSetSizeKb: 73000,
        peakWorkingSetSizeKb: 74000,
        privateBytesKb: 51000,
      },
      browserMetric: null,
      gpuMetric: null,
      totalAppWorkingSetSizeKb: 110000,
      totalAppPrivateBytesKb: 56000,
    });

    expect(getRendererDiagnosticsSnapshot()).toMatchObject({
      lastMemorySampleAt: 500,
      rendererMemoryPrivateKb: 52000,
      rendererMemorySharedKb: 6000,
      rendererMemoryResidentSetKb: 76000,
      rendererWorkingSetSizeKb: 73000,
      rendererPeakWorkingSetSizeKb: 74000,
      appTotalWorkingSetSizeKb: 110000,
      peakAppTotalWorkingSetSizeKb: 110000,
    });
  });
});
