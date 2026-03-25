import type { RuntimeMemorySnapshot } from '@shared/types';

export interface RendererDiagnosticsSnapshot {
  agentSessionCount: number;
  terminalSessionCount: number;
  configuredTerminalScrollback: number;
  estimatedTerminalScrollbackLineCapacity: number;
  editorTabCount: number;
  activeEditorPath: string | null;
  monacoModelCount: number;
  monacoFileModelCount: number;
  bulkReloadCount: number;
  lastBulkReloadAt: number | null;
  lastBulkReloadPath: string | null;
  lastMemorySampleAt: number | null;
  rendererMemoryPrivateKb: number | null;
  rendererMemorySharedKb: number | null;
  rendererMemoryResidentSetKb: number | null;
  rendererWorkingSetSizeKb: number | null;
  rendererPeakWorkingSetSizeKb: number | null;
  appProcessCount: number | null;
  appTotalWorkingSetSizeKb: number | null;
  peakAppTotalWorkingSetSizeKb: number | null;
}

const initialSnapshot = (): RendererDiagnosticsSnapshot => ({
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
});

let snapshot = initialSnapshot();

export function updateRendererDiagnostics(
  partial: Partial<RendererDiagnosticsSnapshot>
): RendererDiagnosticsSnapshot {
  snapshot = {
    ...snapshot,
    ...partial,
  };
  return snapshot;
}

export function recordBulkReloadEvent(path: string | null): RendererDiagnosticsSnapshot {
  snapshot = {
    ...snapshot,
    bulkReloadCount: snapshot.bulkReloadCount + 1,
    lastBulkReloadAt: Date.now(),
    lastBulkReloadPath: path,
  };
  return snapshot;
}

export function recordRuntimeMemorySample(
  memorySnapshot: RuntimeMemorySnapshot
): RendererDiagnosticsSnapshot {
  const rendererWorkingSetSizeKb = memorySnapshot.rendererMetric?.workingSetSizeKb ?? null;
  const rendererPeakWorkingSetSizeKb = memorySnapshot.rendererMetric?.peakWorkingSetSizeKb ?? null;
  const appTotalWorkingSetSizeKb = memorySnapshot.totalAppWorkingSetSizeKb;

  snapshot = {
    ...snapshot,
    lastMemorySampleAt: memorySnapshot.capturedAt,
    rendererMemoryPrivateKb: memorySnapshot.rendererMemory?.privateKb ?? null,
    rendererMemorySharedKb: memorySnapshot.rendererMemory?.sharedKb ?? null,
    rendererMemoryResidentSetKb: memorySnapshot.rendererMemory?.residentSetKb ?? null,
    rendererWorkingSetSizeKb,
    rendererPeakWorkingSetSizeKb,
    appProcessCount: memorySnapshot.processCount,
    appTotalWorkingSetSizeKb,
    peakAppTotalWorkingSetSizeKb:
      snapshot.peakAppTotalWorkingSetSizeKb === null
        ? appTotalWorkingSetSizeKb
        : Math.max(snapshot.peakAppTotalWorkingSetSizeKb, appTotalWorkingSetSizeKb),
  };

  return snapshot;
}

export function getRendererDiagnosticsSnapshot(): RendererDiagnosticsSnapshot {
  return { ...snapshot };
}

export function resetRendererDiagnostics(): void {
  snapshot = initialSnapshot();
}
